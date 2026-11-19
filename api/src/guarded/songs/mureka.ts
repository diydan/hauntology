import { FORBIDDEN_WORDS } from "@hauntology/shared/songs/stock";
import type { SongTicket } from "../../songs/spend";

/**
 * Guarded Song Service adapter (Mureka, game-songs 3.1, Requirements 3.2, 3.3, 6.3).
 *
 * Requires a granted `SongTicket` (`meter: "song"`). Sends ONLY `{ lyrics, style }` upstream
 * (never a photo, voice clip, or Room token), blocks `FORBIDDEN_WORDS` before any call, enforces
 * a strict timeout with a single retry on transient failure, and downloads MP3 audio.
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

export const SONG_TIMEOUT_MS = 25_000;
export const SONG_MIN_BYTES = 1_000;
export const SONG_MAX_BYTES = 8_000_000;

export const songWasCharged = (a: SongGenAnswer): boolean => a.ok;

export interface SongMaker {
  make(ticket: SongTicket, req: SongGenRequest): Promise<SongGenAnswer>;
}

export type MurekaOptions = {
  apiKey: string;
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

const DEFAULT_ENDPOINT = "https://api.mureka.ai/v1/song/generate";

function hasForbidden(req: SongGenRequest): boolean {
  const combined = `${req.style}\n${req.lyrics}`.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => combined.includes(w));
}

function isAudioPayload(bytes: Uint8Array): boolean {
  return bytes.byteLength >= SONG_MIN_BYTES && bytes.byteLength <= SONG_MAX_BYTES;
}

export class MurekaSongMaker implements SongMaker {
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: MurekaOptions) {
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? SONG_TIMEOUT_MS;
    this.now = opts.now ?? Date.now;
  }

  async make(ticket: SongTicket, req: SongGenRequest): Promise<SongGenAnswer> {
    assertSongTicket(ticket);
    const began = this.now();
    const lyrics = typeof req.lyrics === "string" ? req.lyrics.trim() : "";
    const style = typeof req.style === "string" ? req.style.trim() : "";
    if (lyrics === "" || style === "" || hasForbidden({ lyrics, style }) || this.opts.apiKey.trim() === "") {
      return { ok: false, kind: "invalid", elapsedMs: 0 };
    }

    // Strict outbound payload: ONLY lyrics and style — never a photo, clip, or Room token.
    const body = JSON.stringify({ lyrics, style });
    let lastKind: "failed" | "rate_limited" | "slow" = "failed";

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);

      try {
        const res = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body,
          signal: controller.signal,
        });
        if (res.status === 429) {
          lastKind = "rate_limited";
          break;
        }
        if (!res.ok) {
          lastKind = "failed";
          continue;
        }

        const ct = (res.headers.get("Content-Type") ?? "").toLowerCase();
        if (ct.includes("audio/")) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (isAudioPayload(buf)) {
            return { ok: true, audio: buf, contentType: "audio/mpeg", elapsedMs: Math.max(0, this.now() - began) };
          }
          lastKind = "failed";
          continue;
        }

        const data = (await res.json().catch(() => null)) as { url?: unknown } | null;
        if (typeof data?.url === "string" && data.url.startsWith("https://")) {
          const dl = await this.fetchFn(data.url, { method: "GET", signal: controller.signal });
          if (dl.ok) {
            const buf = new Uint8Array(await dl.arrayBuffer());
            if (isAudioPayload(buf)) {
              return { ok: true, audio: buf, contentType: "audio/mpeg", elapsedMs: Math.max(0, this.now() - began) };
            }
          }
        }
        lastKind = "failed";
      } catch {
        lastKind = timedOut ? "slow" : "failed";
      } finally {
        clearTimeout(timer);
      }
    }

    return { ok: false, kind: lastKind, elapsedMs: Math.max(0, this.now() - began) };
  }
}
