import { CLIP_MAX_MS } from "../voice/limits";
import type { StitchClip } from "../voice/stitch/compose";
import { WORD_BANK } from "../voice/stitch/wordbank";

/**
 * Stitch messages in the Room (party-mode 4.20): the bounds of a clip message, its decoding and the clip as the Host
 * receives it. A clip is checked and kept inside the Room only; none of this touches a route, a bucket, a store or a log.
 */
/** A `stitchClip` message may be larger than an ordinary one: a 2 s clip is a few tens of kilobytes. Nothing else may be. */
export const STITCH_CLIP_MESSAGE_BYTES = 128 * 1024;
export const STITCH_AUDIO_B64_MAX = 120_000;
export const STITCH_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"] as const;

export const isBankWord = (w: string): boolean => (WORD_BANK as readonly string[]).includes(w);
export const clipLengthOk = (ms: number): boolean => Number.isFinite(ms) && ms > 0 && ms <= CLIP_MAX_MS;

/** The base type of an audio content type (`audio/webm;codecs=opus` is `audio/webm`), or null for anything else. */
export function audioBase(contentType: string): (typeof STITCH_AUDIO_TYPES)[number] | null {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (STITCH_AUDIO_TYPES as readonly string[]).includes(base) ? (base as (typeof STITCH_AUDIO_TYPES)[number]) : null;
}

/** Base64 to bytes, or null for anything that is not valid base64. */
export function decodeB64(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
export function encodeB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type HostClip = Readonly<{ word: string; contentType: string; durationMs: number; audio: string }>;
/** What the Host gets to play: each word's clip in order, as base64. The seat is not in it. */
export const hostClips = (clips: readonly StitchClip[]): HostClip[] => clips.map((c) => ({ word: c.word, contentType: c.contentType, durationMs: c.durationMs, audio: encodeB64(c.bytes) }));
