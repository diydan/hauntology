/**
 * Haunting puzzles (puzzles 12.3, requirement 17): a human Poltergeist may start one puzzle per Round on their own phone, of a Kind
 * with no Sight. A solved one is worth one Scare point (counted by the party `sources`, not here) and changes nothing else. It is
 * not a Zone's Lock: its seed comes from the room seed, the seat and the Round. Pure reducers over a small state kept in `PartyLocks`.
 */
import { ErrorCode, fail, ok, type Result } from "../errors";
import { hash, mulberry32, randInt } from "./rng";
import { makeLock } from "./make";
import { ATTEMPTS, DEFAULT_KINDS, isMemoryKind, type Kind, type Level, type LockView } from "./types";
import { verify } from "./verify";
import type { SeatId } from "./inspect";


/** The Kinds a Haunting puzzle may be: every default Kind that needs no Sight. */
export const HAUNTING_KINDS: readonly Kind[] = DEFAULT_KINDS.filter((k) => !isMemoryKind(k));
export const MIN_HAUNTING_GAP_MS = 1000;

export type HauntingLock = Readonly<{ lockId: string; kind: Kind; level: Level; seed: number; round: number; openedAt: number; attemptsUsed: number; lastAttemptAt: number | null }>;
export type HauntingState = Readonly<{
  /** The puzzle each Poltergeist has open, if any. */
  open: Readonly<Record<SeatId, HauntingLock | null>>;
  /** The Round in which each seat last started one: at most one per Round. */
  used: Readonly<Record<SeatId, number>>;
}>;
export const EMPTY_HAUNTING: HauntingState = { open: {}, used: {} };

export const hauntingKind = (roomSeed: number, seat: SeatId, round: number): Kind => HAUNTING_KINDS[randInt(mulberry32(hash("haunting-kind", roomSeed, seat, round)), HAUNTING_KINDS.length)] as Kind;

const put = <T>(rec: Readonly<Record<string, T>>, key: string, value: T): Record<string, T> => ({ ...rec, [key]: value });

export type OpenedHaunting = Readonly<{ state: HauntingState; lockId: string; view: LockView; level: Level; attempts: typeof ATTEMPTS; deadlineAt: number }>;

/** Starts a Haunting puzzle at `level` (the caller works it out from the Puzzle setting and the Haunt). One per Round, one at a time. */
export function openHaunting(state: HauntingState, seat: SeatId, round: number, roomSeed: number, level: Level, now: number, capMs: number): Result<OpenedHaunting> {
  if (state.open[seat]) return fail(ErrorCode.puzzle_already_open);
  if ((state.used[seat] ?? -1) === round) return fail(ErrorCode.puzzle_attempts_spent);
  const kind = hauntingKind(roomSeed, seat, round);
  const seed = hash("haunting", roomSeed, seat, round);
  const lockId = `H${hash("haunting-id", roomSeed, seat, round).toString(16).padStart(8, "0")}`;
  const lock = makeLock(kind, level, seed);
  const opened: HauntingLock = { lockId, kind, level, seed, round, openedAt: now, attemptsUsed: 0, lastAttemptAt: null };
  return ok({ state: { open: put(state.open, seat, opened), used: put(state.used, seat, round) }, lockId, view: lock.view, level, attempts: ATTEMPTS, deadlineAt: now + capMs });
}

export type HauntingOutcome =
  | Readonly<{ outcome: "solved"; state: HauntingState; kind: Kind; attempts: number }>
  | Readonly<{ outcome: "wrong"; state: HauntingState; attemptsLeft: number }>
  | Readonly<{ outcome: "failed"; state: HauntingState; kind: Kind; attempts: number }>;

const closed = (state: HauntingState, seat: SeatId): HauntingState => ({ ...state, open: put(state.open, seat, null) });

/** An Attempt: solved, wrong (with the Attempts left, no partial count) or failed (three wrong, or the Cap passed). */
export function attemptHaunting(state: HauntingState, seat: SeatId, lockId: string, transcript: unknown, now: number, capMs: number): Result<HauntingOutcome> {
  const open = state.open[seat];
  if (!open || open.lockId !== lockId) return fail(ErrorCode.puzzle_not_open);
  if (open.attemptsUsed >= ATTEMPTS) return fail(ErrorCode.puzzle_attempts_spent);
  if (open.lastAttemptAt !== null && now - open.lastAttemptAt < MIN_HAUNTING_GAP_MS) return fail(ErrorCode.puzzle_rate_limited);
  if (now >= open.openedAt + capMs) return ok({ outcome: "failed", state: closed(state, seat), kind: open.kind, attempts: open.attemptsUsed });
  if (verify(makeLock(open.kind, open.level, open.seed), transcript).ok) return ok({ outcome: "solved", state: closed(state, seat), kind: open.kind, attempts: open.attemptsUsed + 1 });
  const used = open.attemptsUsed + 1;
  if (used >= ATTEMPTS) return ok({ outcome: "failed", state: closed(state, seat), kind: open.kind, attempts: used });
  return ok({ outcome: "wrong", state: { ...state, open: put(state.open, seat, { ...open, attemptsUsed: used, lastAttemptAt: now }) }, attemptsLeft: ATTEMPTS - used });
}

/** A give-up, the end of the Round or the end of the game: closed with no point. */
export function closeHaunting(state: HauntingState, seat: SeatId): Result<Readonly<{ state: HauntingState; kind: Kind; attempts: number }>> {
  const open = state.open[seat];
  if (!open) return fail(ErrorCode.puzzle_not_open);
  return ok({ state: closed(state, seat), kind: open.kind, attempts: open.attemptsUsed });
}
