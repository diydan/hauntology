import { LODGER_VOICES, SPEAKERS, steeringTag, voiceFor, type LodgerVoice, type Speaker, type VoiceId } from "@hauntology/shared/voice/voices";
import { MAX_SPOKEN_CHARS } from "@hauntology/shared/voice/speakable";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket, NoTicketError } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";

/**
 * The ghost's voice (ghost-voice 3.3): one spoken line in, MP3 bytes out. Inworld TTS 2 through the Workers AI binding first, then
 * Deepgram Aura-2 English with the same Ticket if that gives nothing usable, all inside one 5 second deadline.
 *
 * This is the ONLY place a Steering Tag is added to a text (`steeringTag(speaker)` below). The Subtitle, the cache key, the Library key and
 * every log line are made from the plain `spoken` text, so none of them can hold a tag. Aura-2 is sent no tag.
 *
 * The Inworld request and answer shapes are the ones the Voice Library render Worker (`tools/voice-render/`) used for 527 real files. The
 * Aura-2 request (`{ text, speaker, encoding: 'mp3' }`) and its streamed answer are from the design and are NOT yet run against the real
 * service (Spike ghost-voice 1.1), so every shape of answer is read defensively and an unreadable one is `unusable`, never a crash.
 */

export const DEFAULT_TTS_MODEL = "inworld/tts-2";
export const DEFAULT_TTS_FALLBACK_MODEL = "@cf/deepgram/aura-2-en";
/** From the request to the last byte of audio. A step that would start after this is skipped; late audio is dropped. */
export const SPEAK_DEADLINE_MS = 5_000;
/** A real clip of one sentence is far above this; the Voice Library tool uses the same floor (`MIN_MP3_BYTES`). */
export const AUDIO_MIN_BYTES = 800;
/** 240 characters speak for under 20 seconds, about 320 kB as MP3; anything near this size is not one line of speech. */
export const AUDIO_MAX_BYTES = 1_500_000;

/** What to say and who says it. `spoken` is plain text: the Steering Tag is added here, never by the caller. */
export type SpeechRequest = { speaker: Speaker; lodgerVoice?: LodgerVoice; spoken: string };

export type SpeechStep = "inworld" | "aura";
/** `slow` is a step that did not finish inside the deadline. */
export type SpeechOutcome = "ok" | "failed" | "rate_limited" | "unusable" | "slow";
/** What each step did and how long it took: counters only, never the text or the audio. */
export type SpeechAttempt = { step: SpeechStep; outcome: SpeechOutcome; ms: number };

/**
 * The audio, or why there is none. `invalid` (the request itself is refused before any call), `failed` and `rate_limited` are not charged;
 * `unusable` (a model answered with nothing playable) is charged, like the other wrappers. If any step answered unusably the whole answer is
 * `unusable`, because that call was made and answered.
 */
export type SpeechAnswer =
  | { ok: true; audio: Uint8Array; contentType: "audio/mpeg"; via: SpeechStep; voice: VoiceId; elapsedMs: number; attempts: SpeechAttempt[] }
  | { ok: false; kind: CallFailure | "unusable" | "invalid"; elapsedMs: number; attempts: SpeechAttempt[] };

export interface SpeechMaker {
  speak(req: SpeechRequest): Promise<SpeechAnswer>;
}

/** Whether a speech answer is charged to the Ticket: a call was made and answered, even if the answer is not playable. */
export const speechWasCharged = (a: SpeechAnswer): boolean => a.ok || a.kind === "unusable";

/** Speech is paid from the `tts` meter, or from the `live` meter when Live Mode speaks. A Ticket for any other meter is refused. */
export function assertSpeechTicket(ticket: SpendTicket): void {
  const meter = ticket !== null && typeof ticket === "object" ? ticket.meter : undefined;
  if (meter !== "tts" && meter !== "live") throw new NoTicketError("tts");
  assertTicket(ticket, meter);
}

/** The only door to the voice: it needs a Ticket for the `tts` (or `live`) meter and refuses to call without one. */
export function generateSpeech(maker: SpeechMaker, ticket: SpendTicket, req: SpeechRequest): Promise<SpeechAnswer> {
  assertSpeechTicket(ticket);
  return maker.speak(req);
}

/** The same bar the render Worker holds for every file it sends: a known cast, no markup or bracket (a tag in the text is a bracket), a length. */
const MARKUP = /[[\]<>`*#{}]/;
function requestIsValid(req: SpeechRequest): boolean {
  if (req === null || typeof req !== "object") return false;
  if (typeof req.speaker !== "string" || !Object.hasOwn(SPEAKERS, req.speaker)) return false;
  if (req.lodgerVoice !== undefined && (typeof req.lodgerVoice !== "string" || !Object.hasOwn(LODGER_VOICES, req.lodgerVoice))) return false;
  if (typeof req.spoken !== "string" || req.spoken.trim() === "" || req.spoken.length > MAX_SPOKEN_CHARS) return false;
  return !MARKUP.test(req.spoken);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The audio field of an Inworld answer, which the platform may wrap in `result`. */
function audioField(raw: unknown): unknown {
  if (!isObject(raw)) return undefined;
  const wrapped = isObject(raw.result) ? raw.result.audio : undefined;
  return wrapped ?? raw.audio;
}

function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** MP3 starts with an ID3 tag or a frame sync (the same test as `hasMp3Header` in the Voice Library tool). */
function playable(bytes: Uint8Array | null): Uint8Array | null {
  if (bytes === null || bytes.length < AUDIO_MIN_BYTES || bytes.length > AUDIO_MAX_BYTES) return null;
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const sync = bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
  return id3 || sync ? bytes : null;
}

/** The same test for any clip that is about to be played, wherever it came from: the bytes themselves, or `null`. */
export { playable as playableAudio };

/** Aura-2 answers with a stream; a buffer, a typed array or `{ audio: base64 }` is read too. Anything else is not audio. */
async function aura(raw: unknown): Promise<Uint8Array | null> {
  if (raw instanceof ReadableStream) return playable(new Uint8Array(await new Response(raw).arrayBuffer()));
  if (raw instanceof ArrayBuffer) return playable(new Uint8Array(raw));
  if (raw instanceof Uint8Array) return playable(raw);
  const field = audioField(raw);
  return typeof field === "string" ? playable(fromBase64(field)) : null;
}

export type SpeakOptions = {
  model?: string;
  fallbackModel?: string;
  /** Default `SPEAK_DEADLINE_MS`. */
  deadlineMs?: number;
  /** Downloads Inworld's presigned file. Default `fetch`. */
  fetchFile?: typeof fetch;
};

export class WorkersAiSpeaker implements SpeechMaker {
  constructor(private readonly ai: AiBinding, private readonly options: SpeakOptions = {}) {}

  async speak(req: SpeechRequest): Promise<SpeechAnswer> {
    if (!requestIsValid(req)) return { ok: false, kind: "invalid", elapsedMs: 0, attempts: [] };
    const deadline = this.options.deadlineMs ?? SPEAK_DEADLINE_MS;
    const start = Date.now();
    const attempts: SpeechAttempt[] = [];
    for (const step of ["inworld", "aura"] as const) {
      const left = deadline - (Date.now() - start);
      if (left <= 0) break; // a step that would start after the deadline is skipped
      const began = Date.now();
      const { audio, outcome } = await this.attempt(step, req, left);
      attempts.push({ step, outcome, ms: Date.now() - began });
      if (audio !== null) return { ok: true, audio, contentType: "audio/mpeg", via: step, voice: voiceFor(req.speaker, step, req.lodgerVoice), elapsedMs: Date.now() - start, attempts };
    }
    const kind = attempts.some((a) => a.outcome === "unusable") ? "unusable" : attempts.at(-1)?.outcome === "rate_limited" ? "rate_limited" : "failed";
    return { ok: false, kind, elapsedMs: Date.now() - start, attempts };
  }

  /** One step under what is left of the deadline. The abort stops a download in progress; a late answer from the binding is ignored. */
  private async attempt(step: SpeechStep, req: SpeechRequest, ms: number): Promise<{ audio: Uint8Array | null; outcome: SpeechOutcome }> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ms);
    try {
      const audio = await withTimeout(step === "inworld" ? this.inworld(req, abort.signal) : this.aura(req), ms);
      return audio === null ? { audio: null, outcome: "unusable" } : { audio, outcome: "ok" };
    } catch (e) {
      return { audio: null, outcome: e instanceof Error && e.message === "timeout" ? "slow" : failureKind(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  private async inworld(req: SpeechRequest, signal: AbortSignal): Promise<Uint8Array | null> {
    const s = SPEAKERS[req.speaker];
    const voiceId = voiceFor(req.speaker, "inworld", req.lodgerVoice).slice("inworld:".length);
    const out = await this.ai.run(this.options.model ?? DEFAULT_TTS_MODEL, {
      text: steeringTag(req.speaker) + req.spoken, // the only place a Steering Tag is added
      voice_id: voiceId,
      output_format: "mp3",
      temperature: s.temperature,
      timestamp_type: "none",
      speaking_rate: s.rate,
    });
    const field = audioField(out);
    if (typeof field !== "string" || field === "") return null;
    if (/^https:\/\//i.test(field)) {
      // Inworld returns a temporary file link: download it here, inside the deadline, so the caller never needs it.
      const res = await (this.options.fetchFile ?? fetch)(field, { signal });
      if (!res.ok) throw new Error(`the audio link answered ${res.status}`);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > AUDIO_MAX_BYTES) return null;
      return playable(new Uint8Array(await res.arrayBuffer()));
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(field)) return null; // any other link (http, file, data) is never fetched
    return playable(fromBase64(field));
  }

  private async aura(req: SpeechRequest): Promise<Uint8Array | null> {
    const speaker = voiceFor(req.speaker, "aura", req.lodgerVoice).slice("aura-2:".length);
    // No Steering Tag here: Aura-2 would read it aloud.
    return aura(await this.ai.run(this.options.fallbackModel ?? DEFAULT_TTS_FALLBACK_MODEL, { text: req.spoken, speaker, encoding: "mp3" }));
  }
}
