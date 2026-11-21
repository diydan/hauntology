import { FORBIDDEN_WORDS } from "@hauntology/shared/songs/stock";
import type { SongTicket } from "../../songs/spend";

/**
 * Guarded Song Service adapter (Mureka, game-songs 3.1, Requirements 3.2, 3.3, 6.3).
 *
 * Requires a granted `SongTicket` (`meter: "song"`). Sends ONLY `{ lyrics, style }` upstream
 * (never a photo, voice clip, or Room token), blocks `FORBIDDEN_WORDS` before any call, enforces
 * a per-request timeout, a bounded overall wait, and downloads MP3 audio.
 *
 * The real API is ASYNC (spike songs-1): `POST /v1/song/generate` returns a task id, then
 * `GET /v1/song/query/{id}` is polled every 5 s until it is ready (44 to 51 s in the spike), and
 * the finished task lists `choices` (two versions), each with an audio `url`.
 *
 * UNVERIFIED: the spike notes record the endpoints, the 5 s polling, `model: "auto"` and two
 * versions, but not the JSON field names. `id`, `status`, `choices[].url`, `choices[].duration` and
 * the `prompt` request field follow Mureka's public docs and are covered here only over a fake.
 */
export class NoSongTicketError extends Error {
  constructor() {
    super("a paid Song Service call needs a SongTicket for the song meter");
  }
}

export function assertSongTicket(ticket: SongTicket): void {
  if (
    ticket === null ||
    typeof ticket !== "object" ||
    ticket.meter !== "song" ||
    typeof ticket.id !== "string" ||
    ticket.id === ""
  ) {
    throw new NoSongTicketError();
  }
}

export type SongGenRequest = {
  lyrics: string;
  style: string;
};

export type SongGenAnswer =
  | { ok: true; audio: Uint8Array; contentType: "audio/mpeg"; elapsedMs: number }
  | { ok: false; kind: "failed" | "rate_limited" | "slow" | "invalid"; elapsedMs: number };

/** One HTTP call (submit, poll or download) must answer within this. */
export const SONG_REQUEST_TIMEOUT_MS = 15_000;
/** The whole make (submit + polling + download) gives up after this; the game never waits for a song anyway. */
export const SONG_TIMEOUT_MS = 120_000;
/** Poll interval measured in the spike. */
export const SONG_POLL_MS = 5_000;
export const SONG_MIN_BYTES = 1_000;
export const SONG_MAX_BYTES = 8_000_000;
const MAX_POLL_ERRORS = 3;

export const songWasCharged = (a: SongGenAnswer): boolean => a.ok;

export interface SongMaker {
  make(ticket: SongTicket, req: SongGenRequest): Promise<SongGenAnswer>;
}

export type MurekaOptions = {
  apiKey: string;
  /** Base of the song API, default `https://api.mureka.ai/v1/song`. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Overall limit for one `make`. */
  timeoutMs?: number;
  /** Limit for each HTTP call. */
  requestTimeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  /** Injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_BASE = "https://api.mureka.ai/v1/song";

function hasForbidden(req: SongGenRequest): boolean {
  const combined = `${req.style}\n${req.lyrics}`.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => combined.includes(w));
}

function isAudioPayload(bytes: Uint8Array): boolean {
  return bytes.byteLength >= SONG_MIN_BYTES && bytes.byteLength <= SONG_MAX_BYTES;
}

type Choice = { url: string; duration: number };

/** Picks the shortest version that has an https audio url (the spike: "pick the first, or the shorter"). */
function pickChoice(data: unknown): Choice | null {
  const raw = (data as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(raw)) return null;
  const list: Choice[] = [];
  for (const c of raw) {
    const url = (c as { url?: unknown } | null)?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    const d = (c as { duration?: unknown }).duration;
    // Mureka's duration may be seconds or ms; only the ordering matters. Missing = last.
    list.push({ url, duration: typeof d === "number" && d > 0 ? d : Number.POSITIVE_INFINITY });
  }
  if (list.length === 0) return null;
  return list.reduce((best, c) => (c.duration < best.duration ? c : best));
}

const TERMINAL_FAIL = new Set(["failed", "timeouted", "cancelled", "canceled"]);

class Deadline extends Error {}

export class MurekaSongMaker implements SongMaker {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly pollMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: MurekaOptions) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? SONG_TIMEOUT_MS;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? SONG_REQUEST_TIMEOUT_MS;
    this.pollMs = opts.pollMs ?? SONG_POLL_MS;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** One HTTP call with its own timeout, never longer than what is left of the overall wait. */
  private async call(url: string, init: RequestInit, deadlineAt: number): Promise<Response> {
    const left = deadlineAt - this.now();
    if (left <= 0) throw new Deadline();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.requestTimeoutMs, left));
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async make(ticket: SongTicket, req: SongGenRequest): Promise<SongGenAnswer> {
    assertSongTicket(ticket);
    const began = this.now();
    const elapsed = (): number => Math.max(0, this.now() - began);
    const lyrics = typeof req.lyrics === "string" ? req.lyrics.trim() : "";
    const style = typeof req.style === "string" ? req.style.trim() : "";
    if (lyrics === "" || style === "" || hasForbidden({ lyrics, style }) || this.opts.apiKey.trim() === "") {
      return { ok: false, kind: "invalid", elapsedMs: 0 };
    }

    const deadlineAt = began + this.timeoutMs;
    const auth = { Authorization: `Bearer ${this.opts.apiKey}` };
    // Strict outbound payload: ONLY lyrics and style (+ the fixed model) - never a photo, clip, or Room token.
    const body = JSON.stringify({ lyrics, prompt: style, model: "auto" });

    try {
      // 1. Submit. Retry once on a 5xx or a network error; a 429 stops at once.
      let taskId: string | null = null;
      let lastKind: "failed" | "rate_limited" = "failed";
      for (let attempt = 0; attempt < 2 && taskId === null; attempt++) {
        try {
          const res = await this.call(
            `${this.base}/generate`,
            { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body },
            deadlineAt,
          );
          if (res.status === 429) {
            return { ok: false, kind: "rate_limited", elapsedMs: elapsed() };
          }
          if (!res.ok) {
            lastKind = "failed";
            if (res.status >= 400 && res.status < 500) break;
            continue;
          }
          const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
          const id = data?.id;
          if (typeof id === "string" && id !== "") taskId = id;
          else if (typeof id === "number") taskId = String(id);
          else lastKind = "failed";
        } catch (e) {
          if (e instanceof Deadline) throw e;
          lastKind = "failed";
        }
      }
      if (taskId === null) return { ok: false, kind: lastKind, elapsedMs: elapsed() };

      // 2. Poll every `pollMs` until the task is ready, failed, or the overall wait is used up.
      let choice: Choice | null = null;
      let pollErrors = 0;
      for (;;) {
        await this.sleep(Math.min(this.pollMs, Math.max(0, deadlineAt - this.now())));
        try {
          const res = await this.call(`${this.base}/query/${encodeURIComponent(taskId)}`, { method: "GET", headers: auth }, deadlineAt);
          if (res.status === 429) {
            pollErrors++;
          } else if (!res.ok) {
            if (res.status >= 400 && res.status < 500) return { ok: false, kind: "failed", elapsedMs: elapsed() };
            pollErrors++;
          } else {
            pollErrors = 0;
            const data = (await res.json().catch(() => null)) as { status?: unknown } | null;
            const status = typeof data?.status === "string" ? data.status.toLowerCase() : "";
            if (status === "succeeded") {
              choice = pickChoice(data);
              if (choice === null) return { ok: false, kind: "failed", elapsedMs: elapsed() };
              break;
            }
            if (TERMINAL_FAIL.has(status)) return { ok: false, kind: "failed", elapsedMs: elapsed() };
            // preparing / queued / running / reviewing: keep polling.
          }
        } catch (e) {
          if (e instanceof Deadline) throw e;
          pollErrors++;
        }
        if (pollErrors >= MAX_POLL_ERRORS) return { ok: false, kind: "failed", elapsedMs: elapsed() };
        if (this.now() >= deadlineAt) throw new Deadline();
      }

      // 3. Download the chosen version.
      const dl = await this.call(choice.url, { method: "GET" }, deadlineAt);
      if (!dl.ok) return { ok: false, kind: "failed", elapsedMs: elapsed() };
      const buf = new Uint8Array(await dl.arrayBuffer());
      if (!isAudioPayload(buf)) return { ok: false, kind: "failed", elapsedMs: elapsed() };
      return { ok: true, audio: buf, contentType: "audio/mpeg", elapsedMs: elapsed() };
    } catch {
      // Deadline, or the overall wait ended during a call (abort): too slow.
      return { ok: false, kind: "slow", elapsedMs: elapsed() };
    }
  }
}
