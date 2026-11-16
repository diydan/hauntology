/**
 * The Turn Clock, Bonus Seconds and Achievements (party-mode 5.2 to 5.6). All pure: the Durable Object keeps one
 * alarm, set to `nextWake`, and recomputes it on every change.
 */

// ---------------------------------------------------------------- achievements (5.4)
export const ACHIEVEMENTS = {
  wanderer: { seconds: 10, label: "Wanderer: visited three rooms" },
  cartographer: { seconds: 15, label: "Cartographer: visited all six rooms" },
  quickFeet: { seconds: 5, label: "Quick feet: reached a room within 20 seconds" },
  persistent: { seconds: 10, label: "Persistent: made three Suggestions" },
  secondWind: { seconds: 10, label: "Second wind: lost two Turns to the clock" },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;
export const QUICK_FEET_MS = 20_000;

/** The log events the detectors read. Other events may be in the log; they are ignored. */
export type ClockEvent =
  | Readonly<{ kind: "visit"; seat: number; zone: string; sinceTurnMs: number }>
  | Readonly<{ kind: "suggest"; seat: number }>
  | Readonly<{ kind: "timeout"; seat: number }>
  | Readonly<{ kind: string; seat?: number }>;

/** The Achievements a seat has earned, from the event log only. A set: the same log in any order gives the same set. */
export function earned(log: readonly ClockEvent[], seat: number, zoneCount = 6): ReadonlySet<AchievementId> {
  const mine = log.filter((e) => e.seat === seat);
  const zones = new Set(mine.flatMap((e) => (e.kind === "visit" && "zone" in e ? [e.zone] : [])));
  const out = new Set<AchievementId>();
  if (zones.size >= 3) out.add("wanderer");
  if (zones.size >= zoneCount) out.add("cartographer");
  if (mine.some((e) => e.kind === "visit" && "sinceTurnMs" in e && e.sinceTurnMs <= QUICK_FEET_MS)) out.add("quickFeet");
  if (mine.filter((e) => e.kind === "suggest").length >= 3) out.add("persistent");
  if (mine.filter((e) => e.kind === "timeout").length >= 2) out.add("secondWind");
  return out;
}

/** The Bonus Seconds a set of Achievements gives, each counted once. */
export const bonusSeconds = (ids: Iterable<AchievementId>): number => [...new Set(ids)].reduce((sum, id) => sum + ACHIEVEMENTS[id].seconds, 0);

// ---------------------------------------------------------------- the budget (5.2, 5.6)
export const BASE_SECONDS = [30, 45, 60, 90] as const;
export type BaseSeconds = (typeof BASE_SECONDS)[number];
export const CAP_SECONDS = 120;
export const BLACKOUT_CUT = 15;
export const BLACKOUT_FLOOR = 15;

/**
 * Seconds for one Turn: min(cap, base' + bonus), where base' = max(15, base - 15) under a Blackout. Null when the
 * Master chose no clock: then there is no Turn Clock at all (5.6).
 */
export function turnBudget(o: Readonly<{ baseSeconds: BaseSeconds | null; bonusSeconds: number; capSeconds?: number; blackout: boolean }>): number | null {
  if (o.baseSeconds === null) return null;
  const base = o.blackout ? Math.max(BLACKOUT_FLOOR, o.baseSeconds - BLACKOUT_CUT) : o.baseSeconds;
  return Math.min(o.capSeconds ?? CAP_SECONDS, base + Math.max(0, o.bonusSeconds));
}

// ---------------------------------------------------------------- the running clock (5.3, 5.5)
export const WARNING_MS = 10_000;
export const DISCONNECT_GRACE_MS = 20_000;
export const MISSED_TO_SKIP = 2;

export type TurnClock = Readonly<{
  startedMs: number;
  /** Null with no clock. */
  budgetMs: number | null;
  /** Time spent paused so far, not counting a pause still running. */
  pausedMs: number;
  /** When the current pause began (a Suggestion, a Master pause, a disconnect), or null while running. */
  pausedSinceMs: number | null;
  /** True once the Turn has ended; it never ends twice. */
  ended: boolean;
}>;

/** When the Turn runs out, or null with no clock. A running pause pushes it back as it goes. */
export function deadlineOf(t: TurnClock, nowMs: number): number | null {
  if (t.budgetMs === null) return null;
  const pausing = t.pausedSinceMs === null ? 0 : Math.max(0, nowMs - t.pausedSinceMs);
  return t.startedMs + t.pausedMs + pausing + t.budgetMs;
}

export type ClockStatus = "none" | "running" | "warning" | "expired";
/** `warning` in the last 10 seconds, `expired` at or after the deadline (5.3). */
export function clockStatus(t: TurnClock, nowMs: number): ClockStatus {
  const d = deadlineOf(t, nowMs);
  if (d === null) return "none";
  if (nowMs >= d) return "expired";
  return d - nowMs <= WARNING_MS ? "warning" : "running";
}

export const pause = (t: TurnClock, nowMs: number): TurnClock => (t.pausedSinceMs === null ? { ...t, pausedSinceMs: nowMs } : t);
export const resume = (t: TurnClock, nowMs: number): TurnClock =>
  t.pausedSinceMs === null ? t : { ...t, pausedMs: t.pausedMs + Math.max(0, nowMs - t.pausedSinceMs), pausedSinceMs: null };

/**
 * End the Turn because the clock ran out. It ends exactly once: a second call changes nothing. The only cost is the
 * lost Turn and one Haunt level, and no Haunt level when a Spook was used on this Turn (5.3).
 */
export function expire(t: TurnClock, nowMs: number, spookUsed: boolean): { clock: TurnClock; ended: boolean; hauntRise: number } {
  if (t.ended || clockStatus(t, nowMs) !== "expired") return { clock: t, ended: false, hauntRise: 0 };
  return { clock: { ...t, ended: true }, ended: true, hauntRise: spookUsed ? 0 : 1 };
}

/**
 * The active Player's phone dropped (5.5): the clock pauses, and the Turn ends 20 seconds later if they are not back.
 * Returns the paused clock and the time the Turn ends if nobody comes back.
 */
export function onDisconnect(t: TurnClock, nowMs: number): { clock: TurnClock; endsAtMs: number } {
  return { clock: pause(t, nowMs), endsAtMs: nowMs + DISCONNECT_GRACE_MS };
}

/** Two missed Turns in a row and a seat is skipped until it reconnects (5.5). */
export const skippedAfter = (consecutiveMissed: number, connected: boolean): boolean => !connected && consecutiveMissed >= MISSED_TO_SKIP;

// ---------------------------------------------------------------- the one alarm
/** Every deadline the Room may be waiting on. Absent or null means none. */
export type Deadlines = Readonly<{
  turn?: TurnClock | null;
  disconnectEndsMs?: number | null;
  inspectUntilMs?: number | null;
  hauntChoiceMs?: number | null;
  eavesdropUntilMs?: number | null;
  answeringUntilMs?: number | null;
  windowUntilMs?: number | null;
  masterTimeoutMs?: number | null;
  botThinkUntilMs?: number | null;
  roomExpiresMs?: number | null;
}>;

/**
 * The earliest time the Room must wake: the Turn's expiry and its 10 second warning, and every other pending deadline.
 * A deadline already past still counts (the alarm fires at once). Null when nothing is pending.
 */
export function nextWake(d: Deadlines, nowMs: number): number | null {
  const times: number[] = [];
  if (d.turn && !d.turn.ended && d.turn.pausedSinceMs === null) {
    const end = deadlineOf(d.turn, nowMs);
    if (end !== null) {
      times.push(end);
      if (end - WARNING_MS > nowMs) times.push(end - WARNING_MS);
    }
  }
  for (const v of [d.disconnectEndsMs, d.inspectUntilMs, d.hauntChoiceMs, d.eavesdropUntilMs, d.answeringUntilMs, d.windowUntilMs, d.masterTimeoutMs, d.botThinkUntilMs, d.roomExpiresMs]) {
    if (typeof v === "number" && Number.isFinite(v)) times.push(v);
  }
  return times.length === 0 ? null : Math.min(...times);
}
