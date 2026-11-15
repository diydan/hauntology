import { dealCase, type Deal, type Solution } from "./deal";
import type { Pool } from "./pool";
import { placeResidue } from "./residue";

/**
 * The end of a game (party-mode 6.6, 6.8, 11.6): the ending payload, the recap built from the public log only, the
 * Most Haunting award, and Play again. Nothing here changes a rule.
 */

// ---------------------------------------------------------------- the public log the recap reads
export type RecapEvent =
  | Readonly<{ id: number; kind: "turn-start"; seat: number }>
  | Readonly<{ id: number; kind: "suggest"; seat: number; zone: string; suspect: string; relic: string; passed: readonly number[]; refuter: number | null }>
  | Readonly<{ id: number; kind: "inspect"; seat: number; zone: string }>
  | Readonly<{ id: number; kind: "seal"; seat: number }>
  | Readonly<{ id: number; kind: "accuse"; seat: number; right: boolean }>
  | Readonly<{ id: number; kind: "timeout"; seat: number; turn: number }>
  | Readonly<{ id: number; kind: "nudge"; seat: number; nudge: "help" | "spook"; target: number; turn: number }>
  | Readonly<{ id: number; kind: "phone-cue"; target: number }>
  | Readonly<{ id: number; kind: "rattle"; target: number; turn: number }>
  | Readonly<{ id: number; kind: "haunt"; level: number }>
  /** Only that someone Eavesdropped, never what they heard. */
  | Readonly<{ id: number; kind: "eavesdrop"; seat: number }>;

/** Who sent each Frame, House Cue, Rattle and solved Haunting puzzle. Secret until the ending. */
export type Source = Readonly<{ eventId: number; kind: "house-cue" | "frame" | "rattle" | "haunting-puzzle"; from: number | null; turn?: number }>;

export type PlayerStats = Readonly<{ seat: number; nickname: string; bot: boolean; poltergeist: boolean; suggestions: number; turnMsUsed: number }>;

// ---------------------------------------------------------------- awards
/** Winners ranked for First Detective: fewest Suggestions, then least Turn time, then seat. */
export function rankWinners(winners: readonly number[], players: readonly PlayerStats[]): number[] {
  const stat = (s: number): PlayerStats | undefined => players.find((p) => p.seat === s);
  return [...winners].sort((a, b) => (stat(a)?.suggestions ?? 0) - (stat(b)?.suggestions ?? 0) || (stat(a)?.turnMsUsed ?? 0) - (stat(b)?.turnMsUsed ?? 0) || a - b);
}

/**
 * Scare points (11.6), from the log and the source list only: 1 per Frame sent, 1 per Rattle, 1 per Haunting puzzle
 * solved, 2 per Spook applied, and 3 for each Turn that ended by the clock while that Poltergeist had Spooked or
 * Rattled in it.
 */
export function scarePoints(log: readonly RecapEvent[], sources: readonly Source[], poltergeists: readonly number[]): Record<number, number> {
  const pts: Record<number, number> = Object.fromEntries(poltergeists.map((s) => [s, 0]));
  const add = (s: number | null, n: number): void => { if (s !== null && s in pts) pts[s] = (pts[s] ?? 0) + n; };
  for (const src of sources) if (src.kind !== "house-cue") add(src.from, 1);
  const spooks = log.filter((e): e is Extract<RecapEvent, { kind: "nudge" }> => e.kind === "nudge" && e.nudge === "spook");
  for (const e of spooks) add(e.seat, 2);
  const timedOut = new Set(log.flatMap((e) => (e.kind === "timeout" ? [e.turn] : [])));
  for (const s of poltergeists) {
    const turns = new Set([
      ...spooks.filter((e) => e.seat === s).map((e) => e.turn),
      ...sources.filter((x) => x.kind === "rattle" && x.from === s && x.turn !== undefined).map((x) => x.turn as number),
    ]);
    for (const t of turns) if (timedOut.has(t)) add(s, 3);
  }
  return pts;
}

/** The Poltergeist with the most Scare points (ties: the lower seat), or null when nobody scored. */
export function mostHaunting(points: Readonly<Record<number, number>>): number | null {
  const best = Object.entries(points).map(([s, n]) => [Number(s), n] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? best[0] : null;
}

// ---------------------------------------------------------------- the recap (6.8)
export type RecapEntry = RecapEvent & Readonly<{ bluff?: boolean }>;
export type Recap = Readonly<{
  entries: readonly RecapEntry[];
  counts: Readonly<Record<number, Readonly<{ suggestions: number; inspects: number; nudges: number; timeouts: number }>>>;
  solution: Solution;
  reveal: readonly Source[];
}>;

/** The recap from the redacted public log and the Bluff ids only. It cannot see a Hand, a shown card or a Residue it was not given. */
export function buildRecap(publicLog: readonly RecapEvent[], seats: readonly number[], solution: Solution, reveal: readonly Source[], bluffs: ReadonlySet<number>): Recap {
  const entries = publicLog.map((e) => (e.kind === "suggest" ? { ...e, bluff: bluffs.has(e.id) } : { ...e }));
  const counts = Object.fromEntries(seats.map((s) => [s, {
    suggestions: publicLog.filter((e) => e.kind === "suggest" && e.seat === s).length,
    inspects: publicLog.filter((e) => e.kind === "inspect" && e.seat === s).length,
    nudges: publicLog.filter((e) => e.kind === "nudge" && e.seat === s).length,
    timeouts: publicLog.filter((e) => e.kind === "timeout" && e.seat === s).length,
  }]));
  return { entries, counts, solution: { ...solution }, reveal: reveal.map((r) => ({ ...r })) };
}

// ---------------------------------------------------------------- the payload
export type EndingPayload = Readonly<{
  solution: Solution;
  residueAt: Readonly<Record<string, string>>;
  winners: readonly number[];
  houseWins: boolean;
  mostHaunting: number | null;
  scare: Readonly<Record<number, number>>;
  nudges: Readonly<{ help: number; spook: number }>;
  recap: Recap;
}>;

export function endingPayload(o: Readonly<{
  solution: Solution; residueAt: Readonly<Record<string, string>>; winners: readonly number[]; houseWins: boolean;
  players: readonly PlayerStats[]; log: readonly RecapEvent[]; sources: readonly Source[]; bluffs: ReadonlySet<number>;
}>): EndingPayload {
  const polts = o.players.filter((p) => p.poltergeist).map((p) => p.seat);
  const scare = scarePoints(o.log, o.sources, polts);
  const nudges = o.log.filter((e): e is Extract<RecapEvent, { kind: "nudge" }> => e.kind === "nudge");
  return {
    solution: { ...o.solution },
    residueAt: { ...o.residueAt },
    winners: o.houseWins ? [] : rankWinners(o.winners, o.players),
    houseWins: o.houseWins,
    mostHaunting: mostHaunting(scare),
    scare,
    nudges: { help: nudges.filter((n) => n.nudge === "help").length, spook: nudges.filter((n) => n.nudge === "spook").length },
    recap: buildRecap(o.log, o.players.map((p) => p.seat), o.solution, o.sources, o.bluffs),
  };
}

// ---------------------------------------------------------------- Play again (6.6)
export type ReplaySeat = Readonly<{ seat: number; nickname: string; bot: boolean; poltergeist: boolean; resolve: number; sealed: Solution | null; hasSealed: boolean }>;
export type Replayable = Readonly<{
  seed: number; worldId: string; pool: Pool; seats: readonly ReplaySeat[];
  deal: Deal; residueAt: Readonly<Record<string, string>>; hauntLevel: number; round: number;
  log: readonly RecapEvent[]; sources: readonly Source[]; bluffs: readonly number[];
}>;

/**
 * A new game with a new seed in the same world, with the same Players and contributions (the same pool): a fresh deal
 * and Residue, and the Haunt, Resolve, Poltergeists, sealed Accusations, logs, sources and Bluffs all reset.
 */
export function playAgain(g: Replayable, newSeed: number): Replayable {
  const seatIds = g.seats.map((s) => s.seat);
  const deal = dealCase(g.pool, seatIds, newSeed);
  return {
    seed: newSeed, worldId: g.worldId, pool: g.pool,
    seats: g.seats.map((s) => ({ seat: s.seat, nickname: s.nickname, bot: s.bot, poltergeist: false, resolve: 0, sealed: null, hasSealed: false })),
    deal, residueAt: placeResidue(g.pool.zones.map((z) => z.id), deal.residue, newSeed), hauntLevel: 0, round: 1,
    log: [], sources: [], bluffs: [],
  };
}
