/**
 * Controller input (party-mode 2.2, 2.3): what a phone's stick and look area send, made safe on both ends.
 * The phone sends at most 30 messages a second; the Room clamps everything again and moves only the active Detective.
 */
export const INPUT_HZ = 30;
export const INPUT_MIN_GAP_MS = Math.ceil(1000 / INPUT_HZ); // 34 ms: never more than 30 in any second
/** The largest look (or gyro aim) change one message may carry, in look units (about pixels of drag). */
export const LOOK_MAX = 60;

export type Vec2 = readonly [number, number];
export type Input = Readonly<{ seq: number; move: Vec2; look: Vec2; aim?: Vec2 }>;
/** What the phone holds down right now. Released all at once when the page hides or the connection drops (2.3). */
export type Held = Readonly<{ move: Vec2; look: Vec2; buttons: readonly string[] }>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pair = (v: unknown): [number, number] => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [0, 0]);

/** The stick inside the unit disc: a longer vector is scaled back to length 1, never cut per axis. */
export function clampStick([x, y]: Vec2): Vec2 {
  const len = Math.hypot(x, y);
  return len > 1 ? [x / len, y / len] : [x, y];
}
const clampLook = ([x, y]: Vec2): Vec2 => [clamp(x, -LOOK_MAX, LOOK_MAX), clamp(y, -LOOK_MAX, LOOK_MAX)];

/** Anything a client sent, made into a safe Input. NaN, infinities, strings and huge values all become safe numbers. */
export function sanitizeInput(raw: unknown): Input {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const seq = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(num(r.seq))));
  const out: Input = { seq, move: clampStick(pair(r.move)), look: clampLook(pair(r.look)) };
  return r.aim === undefined ? out : { ...out, aim: clampLook(pair(r.aim)) };
}

/**
 * Fold a new reading into what is waiting to be sent: the newest stick wins, look changes add up (and stay clamped),
 * so nothing is lost by sending less often.
 */
export function coalesceInput(pending: Input | null, next: Input): Input {
  if (pending === null) return next;
  const look = clampLook([pending.look[0] + next.look[0], pending.look[1] + next.look[1]]);
  const aim = pending.aim || next.aim ? clampLook([(pending.aim?.[0] ?? 0) + (next.aim?.[0] ?? 0), (pending.aim?.[1] ?? 0) + (next.aim?.[1] ?? 0)]) : undefined;
  return aim === undefined ? { seq: next.seq, move: next.move, look } : { seq: next.seq, move: next.move, look, aim };
}

/** May the phone send now? Keeps it at or under 30 messages in every second. */
export const maySend = (lastSentMs: number | null, nowMs: number): boolean => lastSentMs === null || nowMs - lastSentMs >= INPUT_MIN_GAP_MS;

/** The Room's own check: only the active Detective moves or looks; anyone else's input is dropped (2.2). */
export function acceptMovement(input: Input, seat: number, activeSeat: number | null, poltergeists: readonly number[]): Input | null {
  if (activeSeat === null || seat !== activeSeat || poltergeists.includes(seat)) return null;
  return sanitizeInput(input);
}

/** Let go of everything: a zero stick, no look, no held buttons (2.3). */
export const releaseAll = (): Held => ({ move: [0, 0], look: [0, 0], buttons: [] });
