/**
 * Speech keys (ghost-voice design, "Speech cache"). Pure: the SHA-256 digest is injected, so `shared/` stays free of
 * I/O. Node and Workers pass their own (`crypto.createHash` and `crypto.subtle`).
 *
 * The key is made from the voice id and the plain spoken text only. A Steering Tag is never in it: the tag is a fixed
 * function of the Speaker, which the voice id already names.
 */
import type { VoiceId } from "./voices";

/** The Library: kept with no expiry, never deleted by a lifecycle rule. */
export const LIBRARY_PREFIX = "speech/lib/v1/";
/** The cache: deleted after 30 days. */
export const CACHE_PREFIX = "speech/v1/";

/** SHA-256 of a string, as 64 lowercase hex characters. May be async. */
export type Digest = (data: string) => string | Promise<string>;

/** NFC, runs of whitespace collapsed to one space, trimmed. */
export function normalise(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Injective: two (voice, text) pairs give the same string exactly when the voice and the normalised text are equal. */
export function canonicalSpeechKey(voice: VoiceId, text: string): string {
  return JSON.stringify([voice, normalise(text)]);
}

async function keyWith(prefix: string, voice: VoiceId, text: string, digest: Digest): Promise<string> {
  const hex = await digest(canonicalSpeechKey(voice, text));
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("digest must return 64 lowercase hex characters");
  return prefix + hex;
}

/** The R2 key of a Library file. */
export function libraryKey(voice: VoiceId, text: string, digest: Digest): Promise<string> {
  return keyWith(LIBRARY_PREFIX, voice, text, digest);
}

/** The R2 key of a cached file (30 days). */
export function speechCacheKey(voice: VoiceId, text: string, digest: Digest): Promise<string> {
  return keyWith(CACHE_PREFIX, voice, text, digest);
}
