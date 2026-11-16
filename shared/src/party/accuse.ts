import type { Solution } from "./deal";

/**
 * Accusations and the end of a Round (party-mode 6.3, 6.5, 11.1). A Player seals one Accusation per game; it stays
 * secret until the Round ends, when every sealed Accusation is revealed together. A right one wins; a wrong one makes
 * its Player join the haunting and raises the Haunt. The game ends only at a Round end.
 */
export type AccusePlayer = Readonly<{ seat: number; poltergeist: boolean; sealed: Solution | null; hasSealed: boolean; joinedRound: number | null }>;
export type HauntLevel = Readonly<{ level: number; max: number }>;
export type AccuseState = Readonly<{
  round: number;
  phase: "playing" | "ended";
  players: readonly AccusePlayer[];
  haunt: HauntLevel;
  winners: readonly number[];
  houseWins: boolean;
}>;

export type SealRefusal = "already_sealed" | "not_a_detective" | "game_over";

/** Seal an Accusation: once per Player per game, only by a Detective (6.3). It ends that Player's Turn (the caller does that). */
export function sealAccusation(s: AccuseState, seat: number, triple: Solution): { ok: true; state: AccuseState } | { ok: false; code: SealRefusal } {
  if (s.phase === "ended") return { ok: false, code: "game_over" };
  const p = s.players.find((x) => x.seat === seat);
  if (!p || p.poltergeist) return { ok: false, code: "not_a_detective" };
  if (p.hasSealed) return { ok: false, code: "already_sealed" };
  return { ok: true, state: { ...s, players: s.players.map((x) => (x.seat === seat ? { ...x, sealed: { ...triple }, hasSealed: true } : x)) } };
}

/** What everyone may know about Accusations before the reveal: only who has sealed one, never what it says. */
export const publicSealed = (s: AccuseState): number[] => s.players.filter((p) => p.sealed !== null).map((p) => p.seat);
/** What one Player may know: their own sealed Accusation. */
export const ownSealed = (s: AccuseState, seat: number): Solution | null => s.players.find((p) => p.seat === seat)?.sealed ?? null;

/** One Haunt level up, never past the maximum. A lost Turn on which a Spook was used raises nothing. */
export function hauntRise(h: HauntLevel, cause: "round-end" | "timeout" | "wrong-accusation", spookUsed = false): HauntLevel {
  if (cause === "timeout" && spookUsed) return h;
  return { ...h, level: Math.min(h.max, h.level + 1) };
}

const same = (a: Solution, b: Solution): boolean => a.suspect === b.suspect && a.zone === b.zone && a.relic === b.relic;

export type Reveal = Readonly<{ seat: number; right: boolean }>;

/**
 * The end of a Round, in the order of 6.5: (a) reveal every sealed Accusation together; right ones win and end the
 * game; wrong ones join the haunting, each raising the Haunt; (b) all Players haunting: the house wins; (c) the
 * Round's own rise; (d) the caller fires Haunt Events for `crossed`; (e) the Haunt at its maximum: the house wins.
 * An ended game does not change.
 */
export function roundEnd(s: AccuseState, solution: Solution): { state: AccuseState; reveals: readonly Reveal[]; crossed: readonly number[] } {
  if (s.phase === "ended") return { state: s, reveals: [], crossed: [] };
  const startLevel = s.haunt.level;
  const reveals: Reveal[] = s.players.filter((p) => p.sealed !== null).map((p) => ({ seat: p.seat, right: same(p.sealed as Solution, solution) }));
  let haunt = s.haunt;
  const players = s.players.map((p) => {
    const r = reveals.find((x) => x.seat === p.seat);
    if (!r) return p;
    if (r.right) return { ...p, sealed: null };
    haunt = hauntRise(haunt, "wrong-accusation");
    return { ...p, sealed: null, poltergeist: true, joinedRound: s.round };
  });
  const winners = reveals.filter((r) => r.right).map((r) => r.seat).sort((a, b) => a - b);
  const crossedFrom = (to: number): number[] => [3, 6, 9].filter((t) => startLevel < t && to >= t && t < s.haunt.max);
  if (winners.length > 0) {
    return { state: { ...s, players, haunt, phase: "ended", winners, houseWins: false }, reveals, crossed: [] };
  }
  if (players.every((p) => p.poltergeist)) {
    return { state: { ...s, players, haunt, phase: "ended", winners: [], houseWins: true }, reveals, crossed: [] };
  }
  haunt = hauntRise(haunt, "round-end");
  const crossed = crossedFrom(haunt.level);
  if (haunt.level >= haunt.max) {
    return { state: { ...s, players, haunt, phase: "ended", winners: [], houseWins: true }, reveals, crossed };
  }
  return { state: { ...s, players, haunt, round: s.round + 1 }, reveals, crossed };
}

/** True once the game is over: a right reveal, everyone haunting, or the Haunt at its maximum at a Round end. */
export const gameOver = (s: AccuseState): boolean => s.phase === "ended";
