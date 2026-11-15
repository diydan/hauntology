/**
 * The Party Mode side of the puzzles: a Lock on Inspect. Pure reducers over a small state held by `PartyRoom`.
 * Nothing here touches a Hand, a Residue position, the Solution, the Haunt, Resolve or Bonus Seconds: the one thing a
 * solved Lock does is call the party-mode `inspect()`, which is handed in, exactly once.
 */
import { ErrorCode, fail, ok, type Result } from "../errors";
import { PLAIN_INSPECT_MS, lockCharge, plainInspectCharge } from "./charge";
import { makeLock } from "./make";
import type { PlacedLock } from "./place";
import { fadedFor, sightFor } from "./sight";
import { ATTEMPTS, isMemoryKind, type LockView, type PuzzleSetting, type Sight } from "./types";
import { verify } from "./verify";

export type SeatId = string;
export type OpenLock = Readonly<{ lockId: string; zone: string; openedAt: number; attemptsUsed: number; lastAttemptAt: number | null }>;

export type PartyLocks = Readonly<{
  /** One Lock per Zone, fixed at the start of the game. */
  placed: readonly PlacedLock[];
  /** The Lock each seat has open, if any. */
  open: Readonly<Record<SeatId, OpenLock | null>>;
  /** Sights a seat has acknowledged: never shown again. */
  seen: Readonly<Record<SeatId, readonly string[]>>;
  /** Sights sent but not yet acknowledged: sent again after a reconnect. */
  sent: Readonly<Record<SeatId, readonly string[]>>;
  /** Plain Inspect on for a seat (an access setting). */
  plain: Readonly<Record<SeatId, boolean>>;
}>;

export const MIN_ATTEMPT_GAP_MS = 1000;
export type CloseReason = "attempts" | "cap" | "gave_up" | "turn_ended";

export const initPartyLocks = (placed: readonly PlacedLock[]): PartyLocks => ({ placed, open: {}, seen: {}, sent: {}, plain: {} });
const lockAt = (s: PartyLocks, zone: string): PlacedLock | undefined => s.placed.find((p) => p.zone === zone);
const put = <T>(rec: Readonly<Record<string, T>>, key: string, value: T): Record<string, T> => ({ ...rec, [key]: value });

/** Sight ids are stable, derived from the Lock they belong to. */
export const sightIdOf = (lockId: string): string => `S${lockId}`;

/** What the Public View may say about puzzles: the setting and nothing else. */
export const publicLockView = (setting: PuzzleSetting): Readonly<{ puzzleSetting: PuzzleSetting }> => ({ puzzleSetting: setting });

// ---------------------------------------------------------------- Plain Inspect and the choice between it and a Lock
export type InspectPlan = Readonly<{ mode: "lock" }> | Readonly<{ mode: "plain"; chargeMs: number }>;

/**
 * How an Inspect runs. With puzzles off, for a Bot, and for a Player on Plain Inspect it is plain: 10 seconds (the
 * whole Cap for a Player who chose Plain Inspect), and it always shows what is in the Zone.
 */
export function inspectPlan(setting: PuzzleSetting, state: PartyLocks, seat: SeatId, isBot: boolean, capMs: number): InspectPlan {
  if (setting === "off" || isBot) return { mode: "plain", chargeMs: PLAIN_INSPECT_MS };
  if (state.plain[seat] === true) return { mode: "plain", chargeMs: plainInspectCharge(capMs) };
  return { mode: "lock" };
}
export const setPlain = (state: PartyLocks, seat: SeatId, on: boolean): PartyLocks => ({ ...state, plain: put(state.plain, seat, on) });

// ---------------------------------------------------------------- Sights
export type SightDelivery = Readonly<{ sightId: string; sight: Sight }>;

/**
 * The Sight a seat should be shown on moving into `zone`, if that Zone holds one it has not already acknowledged.
 * A Sight sent but not acknowledged is sent again (after a reconnect), and one acknowledged is never sent again.
 */
export function sightsOnEntry(state: PartyLocks, seat: SeatId, zone: string, assist = false): Readonly<{ state: PartyLocks; delivery: SightDelivery | null }> {
  const placed = state.placed.find((p) => p.sightZone === zone && isMemoryKind(p.kind));
  if (placed === undefined) return { state, delivery: null };
  const sightId = sightIdOf(placed.lockId);
  if ((state.seen[seat] ?? []).includes(sightId)) return { state, delivery: null };
  const sight = sightFor(makeLock(placed.kind, placed.level, placed.seed), assist);
  if (sight === null) return { state, delivery: null };
  const sent = state.sent[seat] ?? [];
  const next = sent.includes(sightId) ? state : { ...state, sent: put(state.sent, seat, [...sent, sightId]) };
  return { state: next, delivery: { sightId, sight } };
}

/** The phone showed the Sight: it is now seen, and will not come again. */
export function ackSight(state: PartyLocks, seat: SeatId, sightId: string): Result<PartyLocks> {
  const sent = state.sent[seat] ?? [];
  const seen = state.seen[seat] ?? [];
  if (seen.includes(sightId)) return ok(state);
  if (!sent.includes(sightId)) return fail(ErrorCode.sight_unknown);
  return ok({ ...state, sent: put(state.sent, seat, sent.filter((s) => s !== sightId)), seen: put(state.seen, seat, [...seen, sightId]) });
}

// ---------------------------------------------------------------- opening a Lock
export type OpenedLock = Readonly<{
  state: PartyLocks;
  lockId: string;
  view: LockView;
  attempts: typeof ATTEMPTS;
  capMs: number;
  deadlineAt: number;
  /** The clue to show at the Lock when the seat never saw the Sight (a missed Sight never blocks a Lock). */
  faded: Sight | null;
  /** The one public log line: the Zone, exactly as a plain Inspect logs it. Nothing is logged when the Lock closes. */
  publicLine: Readonly<{ type: "inspect"; seat: SeatId; zone: string }>;
}>;

export type OpenContext = Readonly<{ setting: PuzzleSetting; capMs: number; isBot: boolean; assist?: boolean; turnDeadline?: number }>;

export function openLock(state: PartyLocks, seat: SeatId, zone: string, now: number, ctx: OpenContext): Result<OpenedLock> {
  if (ctx.setting === "off" || ctx.isBot) return fail(ErrorCode.puzzle_disabled);
  if (state.open[seat]) return fail(ErrorCode.puzzle_already_open);
  const placed = lockAt(state, zone);
  if (placed === undefined) return fail(ErrorCode.puzzle_not_open);
  const lock = makeLock(placed.kind, placed.level, placed.seed);
  const unseen = isMemoryKind(placed.kind) && !(state.seen[seat] ?? []).includes(sightIdOf(placed.lockId));
  const opened: OpenLock = { lockId: placed.lockId, zone, openedAt: now, attemptsUsed: 0, lastAttemptAt: null };
  return ok({
    state: { ...state, open: put(state.open, seat, opened) },
    lockId: placed.lockId,
    view: lock.view,
    attempts: ATTEMPTS,
    capMs: ctx.capMs,
    deadlineAt: Math.min(now + ctx.capMs, ctx.turnDeadline ?? Number.POSITIVE_INFINITY),
    faded: unseen ? fadedFor(lock, ctx.assist === true) : null,
    publicLine: { type: "inspect", seat, zone },
  });
}

/** The same Lock again for a seat that reconnected: rebuilt from the seed, progress inside an Attempt lost. */
export function restoreLock(state: PartyLocks, seat: SeatId, ctx: Pick<OpenContext, "assist">): Result<Readonly<{ lockId: string; view: LockView; faded: Sight | null; attemptsUsed: number }>> {
  const open = state.open[seat];
  if (!open) return fail(ErrorCode.puzzle_not_open);
  const placed = lockAt(state, open.zone);
  if (placed === undefined) return fail(ErrorCode.puzzle_not_open);
  const lock = makeLock(placed.kind, placed.level, placed.seed);
  const unseen = isMemoryKind(placed.kind) && !(state.seen[seat] ?? []).includes(sightIdOf(placed.lockId));
  return ok({ lockId: placed.lockId, view: lock.view, faded: unseen ? fadedFor(lock, ctx.assist === true) : null, attemptsUsed: open.attemptsUsed });
}

/** A Master pause freezes every open Lock's timer: its start moves later by the time paused. */
export function freezeFor(state: PartyLocks, pausedMs: number): PartyLocks {
  const open: Record<string, OpenLock | null> = {};
  for (const [seat, o] of Object.entries(state.open)) open[seat] = o ? { ...o, openedAt: o.openedAt + Math.max(0, pausedMs) } : null;
  return { ...state, open };
}

// ---------------------------------------------------------------- attempts and closing
export type AttemptContext<R> = Readonly<{
  /** The party-mode `inspect()` for this seat and Zone. Called once, and only when the Lock is solved. */
  inspect: () => R;
  capMs: number;
  turnDeadline?: number;
}>;

export type AttemptOutcome<R> =
  | Readonly<{ outcome: "solved"; state: PartyLocks; chargeMs: number; inspectResult: R }>
  | Readonly<{ outcome: "wrong"; state: PartyLocks; attemptsLeft: number }>
  | Readonly<{ outcome: "failed"; state: PartyLocks; chargeMs: number; reason: CloseReason }>;

function closed(state: PartyLocks, seat: SeatId): PartyLocks { return { ...state, open: put(state.open, seat, null) }; }

/**
 * Check an Attempt. Solved: the party-mode `inspect()` result, and the time charged. Wrong: how many Attempts are left
 * and nothing more (no count of right parts). Failed: three wrong, or the Cap or the Turn ran out; nothing is shown
 * about the Zone and the Zone stays un-inspected.
 */
export function submitAttempt<R>(state: PartyLocks, seat: SeatId, lockId: string, transcript: unknown, now: number, ctx: AttemptContext<R>): Result<AttemptOutcome<R>> {
  const open = state.open[seat];
  if (!open || open.lockId !== lockId) return fail(ErrorCode.puzzle_not_open);
  if (open.attemptsUsed >= ATTEMPTS) return fail(ErrorCode.puzzle_attempts_spent);
  if (open.lastAttemptAt !== null && now - open.lastAttemptAt < MIN_ATTEMPT_GAP_MS) return fail(ErrorCode.puzzle_rate_limited);
  const charge = lockCharge(now - open.openedAt, ctx.capMs);
  if (now >= Math.min(open.openedAt + ctx.capMs, ctx.turnDeadline ?? Number.POSITIVE_INFINITY)) {
    return ok({ outcome: "failed", state: closed(state, seat), chargeMs: charge, reason: ctx.turnDeadline !== undefined && ctx.turnDeadline <= open.openedAt + ctx.capMs ? "turn_ended" : "cap" });
  }
  const placed = lockAt(state, open.zone);
  if (placed === undefined) return fail(ErrorCode.puzzle_not_open);
  const verdict = verify(makeLock(placed.kind, placed.level, placed.seed), transcript);
  if (verdict.ok) return ok({ outcome: "solved", state: closed(state, seat), chargeMs: charge, inspectResult: ctx.inspect() });
  const used = open.attemptsUsed + 1;
  if (used >= ATTEMPTS) return ok({ outcome: "failed", state: closed(state, seat), chargeMs: charge, reason: "attempts" });
  return ok({ outcome: "wrong", state: { ...state, open: put(state.open, seat, { ...open, attemptsUsed: used, lastAttemptAt: now }) }, attemptsLeft: ATTEMPTS - used });
}

/** A give-up, the Cap, or the end of the Turn closes the Lock as failed: no Zone result, the Zone not inspected. */
export function closeLock(state: PartyLocks, seat: SeatId, reason: Exclude<CloseReason, "attempts">, now: number, capMs: number): Result<Readonly<{ state: PartyLocks; chargeMs: number; reason: CloseReason }>> {
  const open = state.open[seat];
  if (!open) return fail(ErrorCode.puzzle_not_open);
  return ok({ state: closed(state, seat), chargeMs: lockCharge(now - open.openedAt, capMs), reason });
}
