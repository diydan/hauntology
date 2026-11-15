import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32, randInt, shuffle, type Rng } from "../puzzles/rng";
import { botAct, candidates, newMind, observe, type Fact, type MindCard, type Place } from "./bot";
import { dealCase } from "./deal";
import { buildRecap, endingPayload, mostHaunting, playAgain, rankWinners, scarePoints, type PlayerStats, type RecapEvent, type Replayable, type Source } from "./ending";
import { buildPool } from "./pool";
import { placeResidue } from "./residue";
import { BOT_NAMES, soloOffers, soloSetup, SOLO_PRESETS } from "./solo";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

// ---------------------------------------------------------------- Property 57: Bot inference is sound
const SMALL: MindCard[] = (["suspect", "zone", "relic"] as const).flatMap((k) => [1, 2, 3].map((i) => ({ id: `${k[0]}${i}`, kind: k })));
type Truth = { solution: string[]; residue: string[]; hands: Record<number, string[]> };

function randomTruth(r: Rng, players: number[], residueCount: number): Truth {
  const solution = (["suspect", "zone", "relic"] as const).map((k) => (shuffle(r, SMALL.filter((c) => c.kind === k))[0] as MindCard).id);
  const rest = shuffle(r, SMALL.map((c) => c.id).filter((c) => !solution.includes(c)));
  const residue = rest.slice(0, residueCount);
  const hands: Record<number, string[]> = Object.fromEntries(players.map((p) => [p, []]));
  rest.slice(residueCount).forEach((c, i) => (hands[players[i % players.length] as number] as string[]).push(c));
  return { solution, residue, hands };
}

/** Facts the Bot (seat 1) could see in a game with this truth. */
function randomFacts(r: Rng, t: Truth, players: number[]): Fact[] {
  const facts: Fact[] = [{ kind: "hand", cards: t.hands[1] ?? [] }];
  for (const c of t.residue) if (r() < 0.5) facts.push({ kind: "found", card: c });
  for (let k = 0; k < 6; k++) {
    const suggester = players[randInt(r, players.length)] as number;
    const named = (["suspect", "zone", "relic"] as const).map((kind) => (shuffle(r, SMALL.filter((c) => c.kind === kind))[0] as MindCard).id);
    const order = [...players.filter((p) => p > suggester), ...players.filter((p) => p < suggester)];
    for (const p of order) {
      const held = (t.hands[p] ?? []).filter((c) => named.includes(c));
      if (held.length === 0) { facts.push({ kind: "pass", seat: p, cards: named }); continue; }
      const shown = held[randInt(r, held.length)] as string;
      if (suggester === 1) facts.push({ kind: "shown", card: shown, by: p });
      else if (p !== 1) {
        facts.push({ kind: "showed", seat: p, cards: named });
        const notShown = named.filter((c) => c !== shown);
        if (r() < 0.4) facts.push({ kind: "heard", seat: p, cards: named, heard: notShown[randInt(r, notShown.length)] as string });
      }
      break;
    }
  }
  return facts;
}

function consistent(d: Truth, facts: readonly Fact[]): boolean {
  const where = (c: string): Place => (d.solution.includes(c) ? "solution" : d.residue.includes(c) ? "residue" : Number(Object.keys(d.hands).find((p) => d.hands[Number(p)]?.includes(c))));
  return facts.every((f) => {
    switch (f.kind) {
      case "hand": return [...(d.hands[1] ?? [])].sort().join() === [...f.cards].sort().join();
      case "shown": return where(f.card) === f.by;
      case "found": return where(f.card) === "residue";
      case "pass": return f.cards.every((c) => where(c) !== f.seat);
      case "showed": return f.cards.some((c) => where(c) === f.seat);
      case "heard": return f.cards.some((c) => c !== f.heard && where(c) === f.seat);
    }
  });
}

/** Every deal with the same hand sizes and Residue count. */
function* allDeals(players: number[], sizes: Record<number, number>, residueCount: number): Generator<Truth> {
  const kinds = ["suspect", "zone", "relic"] as const;
  const per = kinds.map((k) => SMALL.filter((c) => c.kind === k).map((c) => c.id));
  for (const a of per[0]!) for (const b of per[1]!) for (const c of per[2]!) {
    const solution = [a, b, c];
    const rest = SMALL.map((x) => x.id).filter((x) => !solution.includes(x));
    const residues = residueCount === 0 ? [[]] : rest.map((x) => [x]);
    for (const residue of residues) {
      const left = rest.filter((x) => !residue.includes(x));
      const assign = function* (i: number, hands: Record<number, string[]>): Generator<Record<number, string[]>> {
        if (i === left.length) { yield hands; return; }
        for (const p of players) {
          if ((hands[p]?.length ?? 0) >= (sizes[p] ?? 0)) continue;
          yield* assign(i + 1, { ...hands, [p]: [...(hands[p] ?? []), left[i] as string] });
        }
      };
      for (const hands of assign(0, Object.fromEntries(players.map((p) => [p, []])))) yield { solution, residue, hands };
    }
  }
}

describe("Property 57: Bot inference is sound", () => {
  it("places a card only where every deal consistent with what it saw puts it (brute force, 9 cards, 2 or 3 Players)", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom(2, 3), fc.constantFrom(0, 1), (seed, n, residueCount) => {
      const r = mulberry32(seed);
      const players = Array.from({ length: n }, (_, i) => i + 1);
      const truth = randomTruth(r, players, residueCount);
      const facts = randomFacts(r, truth, players);
      const sizes = Object.fromEntries(players.map((p) => [p, truth.hands[p]?.length ?? 0]));
      const m = newMind(1, players, sizes, SMALL, residueCount);
      for (const f of facts) observe(m, f);
      const worlds = [...allDeals(players, sizes, residueCount)].filter((d) => consistent(d, facts));
      expect(worlds.length).toBeGreaterThan(0);
      expect(worlds.some((d) => JSON.stringify(d.solution) === JSON.stringify(truth.solution) && consistent(truth, facts))).toBe(true);
      for (const [card, place] of m.place) {
        for (const d of worlds) {
          const at: Place = d.solution.includes(card) ? "solution" : d.residue.includes(card) ? "residue" : Number(Object.keys(d.hands).find((p) => d.hands[Number(p)]?.includes(card)));
          expect(at, `${card} placed at ${String(place)}`).toBe(place);
        }
      }
      // a Standard Bot never seals a wrong Accusation
      const act = botAct(m, "standard", { inZone: null, inspected: [], suggested: false, canSuggestHere: false, residueFound: 0, seed, turn: 1 });
      if (act.kind === "seal") expect([act.suspect, act.zone, act.relic]).toEqual(truth.solution);
    }), { numRuns: 300 });
  });

  it("works it out in the end: with every Hand known it names the Solution and seals", () => {
    const r = mulberry32(5);
    const players = [1, 2, 3];
    const truth = randomTruth(r, players, 0);
    const m = newMind(1, players, { 1: 2, 2: 2, 3: 2 }, SMALL, 0);
    observe(m, { kind: "hand", cards: truth.hands[1] ?? [] });
    for (const p of [2, 3]) for (const c of truth.hands[p] ?? []) observe(m, { kind: "shown", card: c, by: p });
    const c = candidates(m);
    expect([c.suspect, c.zone, c.relic].map((x) => x[0])).toEqual(truth.solution);
    const act = botAct(m, "standard", { inZone: null, inspected: [], suggested: false, canSuggestHere: false, residueFound: 0, seed: 1, turn: 1 });
    expect(act).toEqual({ kind: "seal", suspect: truth.solution[0], zone: truth.solution[1], relic: truth.solution[2] });
  });
});

describe("Property 22: Bots are legal and blind to other hands", () => {
  it("acts from its own mind only: the same mind gives the same action, and it never sends a Cue, Nudge, Frame or Rattle", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom("standard" as const, "gentle" as const), fc.option(fc.constantFrom("z1", "z2", "z3"), { nil: null }), fc.boolean(), fc.boolean(), (seed, level, inZone, suggested, canHere) => {
      const r = mulberry32(seed);
      const truth = randomTruth(r, [1, 2, 3], 0);
      const facts = randomFacts(r, truth, [1, 2, 3]);
      const m1 = newMind(1, [1, 2, 3], { 1: 2, 2: 2, 3: 2 }, SMALL, 0);
      for (const f of facts) observe(m1, f);
      const t = { inZone, inspected: [], suggested, canSuggestHere: canHere, residueFound: 0, seed, turn: 2 };
      const a = botAct(m1, level, t);
      expect(botAct(m1, level, t)).toEqual(a);
      expect(["seal", "inspect", "suggest", "walk", "pass"]).toContain(a.kind);
      if (a.kind === "suggest") { expect(inZone).not.toBeNull(); expect(canHere && !suggested).toBe(true); }
      if (a.kind === "inspect") expect(inZone).not.toBeNull();
    }), { numRuns: 300 });
  });
});

// ---------------------------------------------------------------- Property 17: Endings and replays
const logArb: fc.Arbitrary<RecapEvent[]> = fc.array(fc.oneof(
  fc.record({ kind: fc.constant("suggest" as const), seat: fc.integer({ min: 1, max: 4 }), zone: fc.constant("z1"), suspect: fc.constant("s2"), relic: fc.constant("r3"), passed: fc.constant([] as number[]), refuter: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }) }),
  fc.record({ kind: fc.constant("inspect" as const), seat: fc.integer({ min: 1, max: 4 }), zone: fc.constant("z2") }),
  fc.record({ kind: fc.constant("timeout" as const), seat: fc.integer({ min: 1, max: 4 }), turn: fc.nat(5) }),
  fc.record({ kind: fc.constant("nudge" as const), seat: fc.integer({ min: 1, max: 4 }), nudge: fc.constantFrom("help" as const, "spook" as const), target: fc.integer({ min: 1, max: 4 }), turn: fc.nat(5) }),
), { maxLength: 30 }).map((xs) => xs.map((x, id) => ({ ...x, id }) as RecapEvent));

describe("Property 17: Endings and replays preserve what they should", () => {
  it("counts equal the public events, Bluff marks only on the Bluff ids, no secret in the recap, winners ranked, none when the house wins", () => {
    fc.assert(fc.property(logArb, fc.subarray([1, 2, 3, 4]), fc.boolean(), fc.array(fc.nat(30)), (log, winners, house, bluffIds) => {
      const players: PlayerStats[] = [1, 2, 3, 4].map((seat) => ({ seat, nickname: `P${seat}`, bot: false, poltergeist: seat === 4, suggestions: log.filter((e) => e.kind === "suggest" && e.seat === seat).length, turnMsUsed: seat * 1000 }));
      const bluffs = new Set(bluffIds);
      const sources: Source[] = [{ eventId: 99, kind: "frame", from: 4 }];
      const p = endingPayload({ solution: { suspect: "s1", zone: "z1", relic: "r1" }, residueAt: { z3: "s5" }, winners, houseWins: house, players, log, sources, bluffs });
      for (const s of [1, 2, 3, 4]) expect(p.recap.counts[s]?.suggestions).toBe(log.filter((e) => e.kind === "suggest" && e.seat === s).length);
      for (const e of p.recap.entries) if (e.kind === "suggest") expect(e.bluff).toBe(bluffs.has(e.id));
      expect(JSON.stringify(p.recap.entries)).not.toMatch(/"(shown|held|card|hand|found)"/);
      expect(p.winners).toEqual(house ? [] : rankWinners(winners, players));
      expect(p.nudges.help + p.nudges.spook).toBe(log.filter((e) => e.kind === "nudge").length);
      expect(p.scare[4]).toBeGreaterThanOrEqual(1); // the Frame
    }));
  });

  it("ranks First Detective by fewest Suggestions, then least time; Most Haunting is the top scorer", () => {
    const players: PlayerStats[] = [
      { seat: 1, nickname: "a", bot: false, poltergeist: false, suggestions: 3, turnMsUsed: 10 },
      { seat: 2, nickname: "b", bot: false, poltergeist: false, suggestions: 2, turnMsUsed: 90 },
      { seat: 3, nickname: "c", bot: false, poltergeist: false, suggestions: 2, turnMsUsed: 50 },
    ];
    expect(rankWinners([1, 2, 3], players)).toEqual([3, 2, 1]);
    expect(mostHaunting({ 4: 2, 5: 5, 6: 5 })).toBe(5);
    expect(mostHaunting({ 4: 0 })).toBeNull();
    const log: RecapEvent[] = [{ id: 1, kind: "nudge", seat: 4, nudge: "spook", target: 1, turn: 3 }, { id: 2, kind: "timeout", seat: 1, turn: 3 }];
    expect(scarePoints(log, [{ eventId: 3, kind: "haunting-puzzle", from: 4 }, { eventId: 4, kind: "house-cue", from: null }], [4])).toEqual({ 4: 2 + 3 + 1 });
    expect(buildRecap([], [1], { suspect: "s1", zone: "z1", relic: "r1" }, [], new Set()).entries).toEqual([]);
  });

  it("Play again keeps the world, Players and pool, and resets everything else with a fresh deal", () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, seed2, n) => {
      fc.pre(seed !== seed2);
      const pool = buildPool([], PRESETS, seed);
      const seats = Array.from({ length: n }, (_, i) => i + 1);
      const deal = dealCase(pool, seats, seed);
      const g: Replayable = {
        seed, worldId: "w1", pool, deal, residueAt: placeResidue(pool.zones.map((z) => z.id), deal.residue, seed), hauntLevel: 7, round: 9,
        seats: seats.map((s) => ({ seat: s, nickname: `P${s}`, bot: s > 1, poltergeist: s === 2, resolve: 3, sealed: s === 2 ? deal.solution : null, hasSealed: s === 2 })),
        log: [{ id: 1, kind: "inspect", seat: 1, zone: "z1" }], sources: [{ eventId: 1, kind: "frame", from: 2 }], bluffs: [1],
      };
      const again = playAgain(g, seed2);
      expect(again.worldId).toBe("w1");
      expect(again.pool).toBe(pool);
      expect(again.seats.map((s) => [s.seat, s.nickname, s.bot])).toEqual(g.seats.map((s) => [s.seat, s.nickname, s.bot]));
      expect(again.seats.every((s) => !s.poltergeist && s.resolve === 0 && s.sealed === null && !s.hasSealed)).toBe(true);
      expect([again.hauntLevel, again.round, again.log.length, again.sources.length, again.bluffs.length]).toEqual([0, 1, 0, 0, 0]);
      expect(again.deal).toEqual(dealCase(pool, seats, seed2));
    }));
  });
});

describe("Property 59: A solo case is an ordinary Room", () => {
  it("seats one human Master and 2 to 5 Bots at the preset's level, with the preset's settings and speech off", () => {
    fc.assert(fc.property(fc.constantFrom(...SOLO_PRESETS), fc.integer({ min: -1, max: 7 }), fc.double({ min: 3, max: 20, noNaN: true }), fc.boolean(), (preset, bots, radius, authored) => {
      const res = soloSetup({ world: { id: "w", walkRadius: radius, authoredZones: authored }, preset, bots });
      if (bots < 2 || bots > 5) { expect(res).toEqual({ ok: false, code: "bad_bot_count" }); return; }
      if (radius < 7 && !authored) { expect(res).toEqual({ ok: false, code: "world_too_small" }); return; }
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.seats.length).toBe(bots + 1);
      expect(res.seats.filter((s) => !s.bot)).toEqual([{ seat: 1, nickname: "You", bot: false, master: true, botLevel: null }]);
      for (const b of res.seats.filter((s) => s.bot)) { expect(b.botLevel).toBe(preset === "gentle" ? "gentle" : "standard"); expect(BOT_NAMES as readonly string[]).toContain(b.nickname); }
      expect(res.settings.speech).toBe(false);
      expect(res.settings.puzzles).toBe({ classic: "medium", gentle: "easy", quick: "off" }[preset]);
      expect(res.settings.baseSeconds).toBe({ classic: 60, gentle: 90, quick: 45 }[preset]);
    }));
    expect(soloSetup({ world: { id: "w", walkRadius: 9, authoredZones: false }, preset: "classic" }).ok).toBe(true); // two Bots by default
    expect(soloOffers).toEqual({ nudges: false, frames: false, rattles: false });
  });
});
