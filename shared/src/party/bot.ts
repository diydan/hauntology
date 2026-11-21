import { hash, mulberry32, randInt } from "../puzzles/rng";

/**
 * The Bot's mind (party-mode 9.2): what one Bot knows from its own views only. It places a card only when every deal
 * consistent with what it saw puts the card there, so a Standard Bot never seals a wrong Accusation.
 *
 * Facts it takes in: its Hand; each card shown to it; each Residue card it found; each pass (that Player lacks all
 * three named cards); each public "X showed a card" (X holds at least one of the three); its own Eavesdrop hint
 * (the named card heard was not the one shown, so X holds one of the other two). Then it propagates until nothing
 * changes.
 */
export type Kind3 = "suspect" | "zone" | "relic";
export type MindCard = Readonly<{ id: string; kind: Kind3 }>;
export type Place = number | "residue" | "solution";

export type Mind = {
  me: number;
  players: readonly number[];
  handSizes: Readonly<Record<number, number>>;
  cards: readonly MindCard[];
  residueCount: number;
  place: Map<string, Place>;
  lacks: Map<number, Set<string>>;
  clues: { seat: number; cards: string[] }[];
};

export function newMind(me: number, players: readonly number[], handSizes: Readonly<Record<number, number>>, cards: readonly MindCard[], residueCount: number): Mind {
  return { me, players: [...players], handSizes, cards: [...cards], residueCount, place: new Map(), lacks: new Map(players.map((p) => [p, new Set<string>()])), clues: [] };
}

export type Fact =
  | Readonly<{ kind: "hand"; cards: readonly string[] }>
  | Readonly<{ kind: "shown"; card: string; by: number }>
  | Readonly<{ kind: "found"; card: string }>
  | Readonly<{ kind: "pass"; seat: number; cards: readonly string[] }>
  | Readonly<{ kind: "showed"; seat: number; cards: readonly string[] }>
  | Readonly<{ kind: "heard"; seat: number; cards: readonly string[]; heard: string }>;

const lacks = (m: Mind, s: number): Set<string> => { let x = m.lacks.get(s); if (!x) { x = new Set(); m.lacks.set(s, x); } return x; };

export function observe(m: Mind, f: Fact): void {
  switch (f.kind) {
    case "hand":
      for (const c of f.cards) m.place.set(c, m.me);
      for (const c of m.cards) if (!f.cards.includes(c.id)) lacks(m, m.me).add(c.id);
      break;
    case "shown": m.place.set(f.card, f.by); break;
    case "found": m.place.set(f.card, "residue"); break;
    case "pass": for (const c of f.cards) lacks(m, f.seat).add(c); break;
    case "showed": m.clues.push({ seat: f.seat, cards: [...f.cards] }); break;
    case "heard": m.clues.push({ seat: f.seat, cards: f.cards.filter((c) => c !== f.heard) }); break;
  }
  propagate(m);
}

const placedAt = (m: Mind, s: Place): string[] => [...m.place].filter(([, p]) => p === s).map(([c]) => c);

/** Apply the sound rules until nothing changes. */
export function propagate(m: Mind): void {
  for (let changed = true, guard = 0; changed && guard < 200; guard++) {
    changed = false;
    const set = (c: string, p: Place): void => { if (!m.place.has(c)) { m.place.set(c, p); changed = true; } };
    const lack = (s: number, c: string): void => { const l = lacks(m, s); if (!l.has(c)) { l.add(c); changed = true; } };
    // a placed card is lacked by every other Player
    for (const [c, p] of m.place) for (const s of m.players) if (s !== p) lack(s, c);
    // a clue whose other cards are ruled out places its last card
    for (const cl of m.clues) {
      if (cl.cards.some((c) => m.place.get(c) === cl.seat)) continue;
      const left = cl.cards.filter((c) => !lacks(m, cl.seat).has(c) && (!m.place.has(c) || m.place.get(c) === cl.seat));
      if (left.length === 1) set(left[0] as string, cl.seat);
    }
    for (const s of m.players) {
      const size = m.handSizes[s] ?? 0;
      const mine = placedAt(m, s);
      // a full Hand lacks everything else
      if (mine.length >= size) for (const c of m.cards) if (m.place.get(c.id) !== s) lack(s, c.id);
      // a Player who can only hold exactly as many unplaced cards as they have free slots holds them all
      const possible = m.cards.map((c) => c.id).filter((c) => !m.place.has(c) && !lacks(m, s).has(c));
      if (possible.length > 0 && possible.length === size - mine.length) for (const c of possible) set(c, s);
    }
    // with the Residue all known, a card every Player lacks is the Solution
    if (placedAt(m, "residue").length === m.residueCount) {
      for (const c of m.cards) if (!m.place.has(c.id) && m.players.every((s) => lacks(m, s).has(c.id))) set(c.id, "solution");
    }
    // one unplaced card left in a category is the Solution
    for (const k of ["suspect", "zone", "relic"] as const) {
      const open = m.cards.filter((c) => c.kind === k && (!m.place.has(c.id) || m.place.get(c.id) === "solution"));
      if (open.length === 1) set((open[0] as MindCard).id, "solution");
    }
  }
}

/** For each category, the cards that may still be the Solution. */
export function candidates(m: Mind): Record<Kind3, string[]> {
  const of = (k: Kind3): string[] => m.cards.filter((c) => c.kind === k && (!m.place.has(c.id) || m.place.get(c.id) === "solution")).map((c) => c.id);
  return { suspect: of("suspect"), zone: of("zone"), relic: of("relic") };
}
/** One over the number of possible Solutions. */
export const chance = (m: Mind): number => { const c = candidates(m); return 1 / Math.max(1, c.suspect.length * c.zone.length * c.relic.length); };

export type BotAction =
  | Readonly<{ kind: "seal"; suspect: string; zone: string; relic: string }>
  | Readonly<{ kind: "inspect" }>
  | Readonly<{ kind: "suggest"; suspect: string; relic: string }>
  | Readonly<{ kind: "walk"; zone: string }>
  | Readonly<{ kind: "pass" }>;

/** `open` is the Zones a Bot may walk to when some are closed behind a shut door (knock-door 2.3); left out, every Zone is open. */
export type BotTurn = Readonly<{ inZone: string | null; inspected: readonly string[]; suggested: boolean; canSuggestHere: boolean; residueFound: number; seed: number; turn: number; open?: readonly string[] }>;

/**
 * One action for the Bot's Turn, from its mind and its own Turn only. A Standard Bot seals only when each category
 * has one candidate; a Gentle Bot seals at a chance of one half or better. It never sends a Cue, a Nudge, a Frame or a
 * Rattle and never chooses a Haunt Event.
 */
export function botAct(m: Mind, level: "standard" | "gentle", t: BotTurn): BotAction {
  const c = candidates(m);
  const r = mulberry32(hash("bot", t.seed, m.me, t.turn));
  const pick = (xs: readonly string[]): string => xs[randInt(r, xs.length)] as string;
  const sure = c.suspect.length === 1 && c.zone.length === 1 && c.relic.length === 1;
  if (sure || (level === "gentle" && chance(m) >= 0.5)) return { kind: "seal", suspect: pick(c.suspect), zone: pick(c.zone), relic: pick(c.relic) };
  const zones = m.cards.filter((x) => x.kind === "zone" && (t.open === undefined || t.open.includes(x.id))).map((x) => x.id);
  const score = (z: string): number => (t.residueFound < m.residueCount && !t.inspected.includes(z) ? 3 : 0) + (c.zone.includes(z) ? 2 : 0) + r() * 0.5;
  if (t.inZone !== null && !t.inspected.includes(t.inZone) && t.residueFound < m.residueCount) return { kind: "inspect" };
  if (t.inZone !== null && t.canSuggestHere && !t.suggested) {
    const own = (k: Kind3): string | undefined => m.cards.find((x) => x.kind === k && m.place.get(x.id) === m.me)?.id;
    const suspect = c.suspect.length === 1 ? own("suspect") ?? pick(c.suspect) : pick(c.suspect);
    const relic = c.relic.length === 1 ? own("relic") ?? pick(c.relic) : pick(c.relic);
    return { kind: "suggest", suspect, relic };
  }
  if (t.suggested) return { kind: "pass" };
  const best = [...zones].sort((a, b) => score(b) - score(a))[0];
  return best === undefined || best === t.inZone ? { kind: "pass" } : { kind: "walk", zone: best };
}
