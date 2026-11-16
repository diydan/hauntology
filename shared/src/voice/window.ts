/**
 * The voice window: speech that costs money is off until the operator opens it for a limited time, and it closes by itself.
 *
 * Pure, over the same tiny key-value interface the spend ledger uses, so it lives in the `SpendGuard` Durable Object beside the ledger (one object, one
 * single-threaded storage: a slot is taken atomically). It does not count money; it counts LINES, the paid speech calls one window may make, on top of
 * the ledger's own caps (a visitor's lines, the day's lines).
 *
 * - `open` starts a window for some minutes (at most 8 hours) with a line cap (at most 1000). Opening again starts a new window with a count of none.
 * - `take` is asked before every paid call: it needs an open window with a line left, and spends the line. `give` returns it when the call cost nothing.
 *   A `give` carries the id of the window it took from, so a call that outlives its window cannot hand a line back to a newer one.
 * - Everything is against a clock the caller passes. Nothing here sets a timer: a window that has run out is simply closed the next time anyone looks.
 * - Cached and Library audio costs nothing and is not counted; a window whose lines are spent is still open for those.
 */
import type { Kv } from "../world/spend-ledger";

export const VOICE_WINDOW_DEFAULT_MINUTES = 60;
export const VOICE_WINDOW_MAX_MINUTES = 8 * 60;
export const VOICE_WINDOW_DEFAULT_LINES = 200;
export const VOICE_WINDOW_MAX_LINES = 1000;

const KEY = "voice-window";

type Stored = { id: number; until: number; cap: number; used: number };

export type VoiceWindowStatus = {
  /** The window has not run out. A window whose lines are spent is still open (cached audio plays); `remainingLines` is then 0. */
  open: boolean;
  /** When it closes, as a time in milliseconds, or `null` when none was ever opened or it was closed. */
  until: number | null;
  remainingMs: number;
  cap: number;
  used: number;
  remainingLines: number;
};

export type TakeResult = { ok: true; id: number } | { ok: false; reason: "closed" | "cap" };

const CLOSED: VoiceWindowStatus = { open: false, until: null, remainingMs: 0, cap: 0, used: 0, remainingLines: 0 };

const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * A request to open or close the window, as it may be trusted. `minutes: 0` closes. Absent `minutes` and `cap` are the defaults, so `{}` opens a window of an
 * hour and 200 lines. The body is STRICT: a field that is not listed (a typo such as `minute`) is refused, never read as the default, because a window costs money.
 */
export type WindowRequest = { kind: "open"; minutes: number; cap: number } | { kind: "close" } | { kind: "bad"; error: string };

export function readWindowRequest(body: unknown): WindowRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { kind: "bad", error: "the body must be a JSON object" };
  const o = body as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => k !== "minutes" && k !== "cap");
  if (extra.length > 0) return { kind: "bad", error: `unknown field: ${extra[0]?.slice(0, 20)}` };
  const minutes = o["minutes"] === undefined ? VOICE_WINDOW_DEFAULT_MINUTES : o["minutes"];
  if (!isWhole(minutes, 0, VOICE_WINDOW_MAX_MINUTES)) return { kind: "bad", error: `minutes must be a whole number from 0 (close) to ${VOICE_WINDOW_MAX_MINUTES}` };
  if (minutes === 0) return o["cap"] === undefined ? { kind: "close" } : { kind: "bad", error: "closing takes no cap" };
  const cap = o["cap"] === undefined ? VOICE_WINDOW_DEFAULT_LINES : o["cap"];
  if (!isWhole(cap, 1, VOICE_WINDOW_MAX_LINES)) return { kind: "bad", error: `cap must be a whole number of lines from 1 to ${VOICE_WINDOW_MAX_LINES}` };
  return { kind: "open", minutes, cap };
}

function statusOf(s: Stored | undefined, now: number): VoiceWindowStatus {
  if (s === undefined || !(now < s.until)) return CLOSED;
  return { open: true, until: s.until, remainingMs: s.until - now, cap: s.cap, used: s.used, remainingLines: Math.max(0, s.cap - s.used) };
}

export class VoiceWindowStore {
  constructor(private readonly kv: Kv) {}

  private load(): Promise<Stored | undefined> {
    return this.kv.get<Stored>(KEY).then((s) => (isStored(s) ? s : undefined));
  }

  async status(now: number): Promise<VoiceWindowStatus> {
    return statusOf(await this.load(), now);
  }

  /** Starts a new window, with a count of none, replacing any other. Throws a `RangeError` for numbers that are not allowed (the caller checks with `readWindowRequest`). */
  async open(req: { minutes: number; cap: number }, now: number): Promise<VoiceWindowStatus> {
    if (!isWhole(req.minutes, 1, VOICE_WINDOW_MAX_MINUTES) || !isWhole(req.cap, 1, VOICE_WINDOW_MAX_LINES)) throw new RangeError("a window of 1 to 480 minutes and 1 to 1000 lines");
    const prev = await this.load();
    const next: Stored = { id: (prev?.id ?? 0) + 1, until: now + req.minutes * 60_000, cap: req.cap, used: 0 };
    await this.kv.put(KEY, next);
    return statusOf(next, now);
  }

  /** Closes it now. The id is kept, so the next window's id is still new. */
  async close(now: number): Promise<VoiceWindowStatus> {
    const prev = await this.load();
    if (prev !== undefined) await this.kv.put(KEY, { ...prev, until: 0 });
    return statusOf(undefined, now);
  }

  /** Spends one line of the open window, or says why not. */
  async take(now: number): Promise<TakeResult> {
    const s = await this.load();
    if (s === undefined || !(now < s.until)) return { ok: false, reason: "closed" };
    if (s.used >= s.cap) return { ok: false, reason: "cap" };
    await this.kv.put(KEY, { ...s, used: s.used + 1 });
    return { ok: true, id: s.id };
  }

  /** Returns a line to the window it was taken from; nothing at all for another window, a window already closed, or a count that is none. */
  async give(id: number, now: number): Promise<void> {
    const s = await this.load();
    if (s === undefined || s.id !== id || !(now < s.until) || s.used <= 0) return;
    await this.kv.put(KEY, { ...s, used: s.used - 1 });
  }
}

function isStored(v: unknown): v is Stored {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return Number.isSafeInteger(o["id"]) && Number.isFinite(o["until"]) && Number.isSafeInteger(o["cap"]) && Number.isSafeInteger(o["used"]) && (o["cap"] as number) >= 0 && (o["used"] as number) >= 0;
}
