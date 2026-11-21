/**
 * The Wander side of the puzzles: an optional Lock in front of each memory that can always be skipped. Pure
 * reducers over a small state held by `PlaySession`. With Locks off, `gateReveal` changes nothing at all.
 */
import { ErrorCode, fail, ok, type Result } from "../errors";
import { makeLock } from "./make";
import { kindForDiscovery } from "./place";
import { fadedFor, sightFor } from "./sight";
import { isMemoryKind, type Kind, type Level, type LockView, type Sight } from "./types";
import { verify } from "./verify";
import { wanderDoorFor } from "./wander-door";

/** Skip is offered after 20 seconds or two wrong Attempts, whichever comes first. A door's Skip is offered at once (knock-door 6.2). */
export const SKIP_AFTER_MS = 20_000;
export const SKIP_AFTER_WRONG = 2;

/** `door` marks the one memory with a Wander door (knock-door 6): its Lock is the ghost's knock, and Skip is there from the start. */
export type WanderOpen = Readonly<{ anchorId: string; index: number; kind: Kind; level: Level; seed: number; openedAt: number; wrong: number; door?: true }>;
export type WanderLocks = Readonly<{
  on: boolean;
  /** Whether the walk has a door (knock-door 6.1). Absent means no; set by the Room switch `WANDER_DOORS_ENABLED`. */
  doors?: true;
  /** Anchors whose memory has been let through (solved or skipped), in the order they were found. */
  revealed: readonly string[];
  open: WanderOpen | null;
  /** Sights already shown, kept so a reload within 24 hours does not show them twice. */
  seen: readonly string[];
}>;

export const initWander = (on: boolean, doors = false): WanderLocks => ({ on, ...(on && doors ? { doors: true as const } : {}), revealed: [], open: null, seen: [] });
export const skipAvailable = (open: WanderOpen, now: number): boolean => open.door === true || now - open.openedAt >= SKIP_AFTER_MS || open.wrong >= SKIP_AFTER_WRONG;

/** The walk's door for memory `index`: a knock door only, until the heavy door has a screen. Null when the walk has no doors or this is not the door's memory. */
const doorFor = (state: WanderLocks, sessionSeed: number, index: number, level: Level) => (state.doors === true ? wanderDoorFor(sessionSeed, index, true, level, ["knock"]) : null);

export type Gate =
  | Readonly<{ gate: "pass"; state: WanderLocks }>
  /** A Lock is open for this Anchor (newly, or already): the reveal waits. */
  | Readonly<{ gate: "open"; state: WanderLocks; view: LockView; faded: Sight | null; kind: Kind }>;

export type GateInput = Readonly<{ anchorId: string; sessionSeed: number; level?: Level; enabled?: readonly Kind[]; assist?: boolean }>;

/**
 * Called when the visitor engages an unfound Anchor inside its radius. Off, or an Anchor already let through: the
 * reveal goes ahead untouched. Otherwise the Anchor's Lock opens and the reveal waits for a solve or a skip.
 */
export function gateReveal(state: WanderLocks, input: GateInput, now: number): Gate {
  if (!state.on || state.revealed.includes(input.anchorId)) return { gate: "pass", state };
  const level = input.level ?? "easy";
  if (state.open && state.open.anchorId === input.anchorId) {
    const lock = makeLock(state.open.kind, state.open.level, state.open.seed);
    return { gate: "open", state, view: lock.view, faded: faded(lock, state, state.open.index, input.assist === true), kind: lock.kind };
  }
  const index = state.revealed.length;
  const door = doorFor(state, input.sessionSeed, index, level);
  const kind = door !== null ? "knock" : kindForDiscovery(input.sessionSeed, index, input.enabled);
  if (kind === null) return { gate: "pass", state };
  const seed = door !== null ? door.seed : lockSeed(input.sessionSeed, index);
  const lock = makeLock(kind, level, seed);
  const open: WanderOpen = { anchorId: input.anchorId, index, kind, level, seed, openedAt: now, wrong: 0, ...(door !== null ? { door: true as const } : {}) };
  return { gate: "open", state: { ...state, open }, view: lock.view, faded: faded(lock, state, index, input.assist === true), kind };
}

const lockSeed = (sessionSeed: number, index: number): number => ((sessionSeed >>> 0) * 31 + index * 7919 + 17) >>> 0;
const sightKey = (index: number): string => `W${index}`;
function faded(lock: ReturnType<typeof makeLock>, state: WanderLocks, index: number, assist: boolean): Sight | null {
  return isMemoryKind(lock.kind) && !state.seen.includes(sightKey(index)) ? fadedFor(lock, assist) : null;
}

export type WanderOutcome =
  | Readonly<{ outcome: "solved"; state: WanderLocks; anchorId: string }>
  | Readonly<{ outcome: "wrong"; state: WanderLocks; skipAvailable: boolean }>;

/** Check an Attempt. A solve lets the memory through; a wrong one only says whether Skip is available now. */
export function submitWanderAttempt(state: WanderLocks, transcript: unknown, now: number): Result<WanderOutcome> {
  const open = state.open;
  if (!open) return fail(ErrorCode.puzzle_not_open);
  const lock = makeLock(open.kind, open.level, open.seed);
  if (verify(lock, transcript).ok) return ok({ outcome: "solved", state: letThrough(state, open), anchorId: open.anchorId });
  const next: WanderOpen = { ...open, wrong: open.wrong + 1 };
  return ok({ outcome: "wrong", state: { ...state, open: next }, skipAvailable: skipAvailable(next, now) });
}

/** "Let the ghost open it": always works once it is offered, and reveals exactly what a solve would. */
export function skipWanderLock(state: WanderLocks, now: number): Result<Readonly<{ state: WanderLocks; anchorId: string }>> {
  const open = state.open;
  if (!open) return fail(ErrorCode.puzzle_not_open);
  if (!skipAvailable(open, now)) return fail(ErrorCode.puzzle_rate_limited);
  return ok({ state: letThrough(state, open), anchorId: open.anchorId });
}

const letThrough = (state: WanderLocks, open: WanderOpen): WanderLocks => ({ ...state, open: null, revealed: [...state.revealed, open.anchorId] });

export type SightAfter = Readonly<{ state: WanderLocks; delivery: Readonly<{ sightId: string; sight: Sight }> | null }>;

/**
 * After a memory is revealed (and its text shown), the Sight for the next Lock, if that Lock is a Memory Kind and
 * its Sight has not been shown. Remembered in the state so a reload keeps it.
 */
export function sightAfterReveal(state: WanderLocks, sessionSeed: number, level: Level = "easy", enabled?: readonly Kind[], assist = false): SightAfter {
  if (!state.on) return { state, delivery: null };
  const index = state.revealed.length;
  const door = doorFor(state, sessionSeed, index, level);
  const kind = door !== null ? "knock" : kindForDiscovery(sessionSeed, index, enabled);
  if (kind === null || !isMemoryKind(kind) || state.seen.includes(sightKey(index))) return { state, delivery: null };
  const sight = sightFor(makeLock(kind, level, door !== null ? door.seed : lockSeed(sessionSeed, index)), assist);
  if (sight === null) return { state, delivery: null };
  return { state: { ...state, seen: [...state.seen, sightKey(index)] }, delivery: { sightId: sightKey(index), sight } };
}
