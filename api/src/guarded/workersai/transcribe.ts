import { LISTEN_MAX_BYTES, LISTEN_MAX_MS } from "@hauntology/shared/voice/limits";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket, NoTicketError } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";

/**
 * Guarded Whisper transcription wrapper (ghost-voice 3.3, Requirements 3.3 and 4.1).
 *
 * Calls `@cf/openai/whisper-large-v3-turbo` with `language: "en"` and passes the audio clip straight
 * in without writing to storage or logging content. Requires a granted `stt` or `live` SpendTicket.
 */

export const DEFAULT_STT_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** `VOICE_STT_MODEL_ID`: blank is the default, the one id accepted is itself, and anything else is `null`. */
export function sttModelFromEnv(value: string | undefined): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id === "" || id === DEFAULT_STT_MODEL ? DEFAULT_STT_MODEL : null;
}

export const LISTEN_CONTENT_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
] as const;

export function normalizeAudioType(contentType: string | undefined): string | null {
  if (typeof contentType !== "string") return null;
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (LISTEN_CONTENT_TYPES as readonly string[]).includes(base) ? base : null;
}

export const TRANSCRIBE_TIMEOUT_MS = 8_000;

export type TranscribeRequest = {
  audio: Uint8Array;
  contentType: string;
  durationMs?: number | undefined;
};

export type TranscribeAnswer =
  | { ok: true; transcript: string; elapsedMs: number }
  | { ok: false; kind: CallFailure | "unusable" | "invalid"; elapsedMs: number };

export interface ClipTranscriber {
  transcribe(req: TranscribeRequest): Promise<TranscribeAnswer>;
}

/** Whether a transcription call was charged: Whisper answered cleanly or with empty/unreadable output. */
export const transcribeWasCharged = (a: TranscribeAnswer): boolean => a.ok || a.kind === "unusable";

/** Listening is paid from `stt`, or `live` inside Live Mode. Any other meter is refused. */
export function assertTranscribeTicket(ticket: SpendTicket): void {
  const meter = ticket !== null && typeof ticket === "object" ? ticket.meter : undefined;
  if (meter !== "stt" && meter !== "live") throw new NoTicketError("stt");
  assertTicket(ticket, meter);
}

/** The only door to Whisper transcription: requires a granted `stt` or `live` Ticket. */
export function transcribeClip(transcriber: ClipTranscriber, ticket: SpendTicket, req: TranscribeRequest): Promise<TranscribeAnswer> {
  assertTranscribeTicket(ticket);
  return transcriber.transcribe(req);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function extractTranscript(raw: unknown): string | null {
  if (!isObject(raw)) return null;
  const nested = isObject(raw.result) ? raw.result.text : undefined;
  const text = typeof nested === "string" ? nested : typeof raw.text === "string" ? raw.text : null;
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export type TranscribeOptions = {
  model?: string;
  timeoutMs?: number;
  maxBytes?: number;
};

export class WorkersAiTranscriber implements ClipTranscriber {
  constructor(private readonly ai: AiBinding, private readonly options: TranscribeOptions = {}) {}

  async transcribe(req: TranscribeRequest): Promise<TranscribeAnswer> {
    const maxBytes = this.options.maxBytes ?? LISTEN_MAX_BYTES;
    if (
      req === null ||
      typeof req !== "object" ||
      !(req.audio instanceof Uint8Array) ||
      req.audio.byteLength <= 0 ||
      req.audio.byteLength > maxBytes ||
      normalizeAudioType(req.contentType) === null ||
      (req.durationMs !== undefined && (!Number.isFinite(req.durationMs) || req.durationMs < 0 || req.durationMs > LISTEN_MAX_MS))
    ) {
      return { ok: false, kind: "invalid", elapsedMs: 0 };
    }

    const start = Date.now();
    try {
      const out = await withTimeout(
        this.ai.run(this.options.model ?? DEFAULT_STT_MODEL, { audio: req.audio, language: "en" }),
        this.options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS,
      );
      const transcript = extractTranscript(out);
      const elapsedMs = Date.now() - start;
      return transcript === null ? { ok: false, kind: "unusable", elapsedMs } : { ok: true, transcript, elapsedMs };
    } catch (e) {
      return { ok: false, kind: failureKind(e), elapsedMs: Date.now() - start };
    }
  }
}
