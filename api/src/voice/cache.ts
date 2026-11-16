import { cacheFresh } from "@hauntology/shared/voice/cache";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { speechCacheKey, type Digest } from "@hauntology/shared/voice/key";
import type { VoiceId } from "@hauntology/shared/voice/voices";
import { AUDIO_MAX_BYTES, AUDIO_MIN_BYTES } from "../guarded/workersai/speak";

/**
 * The speech cache in R2 (ghost-voice 3.4): clips under `speech/v1/<sha-256 of [voice, text]>`, kept 30 days.
 *
 * - The key is made from the voice id and the plain spoken text, so no Steering Tag is ever in it (`key.ts`).
 * - An object's custom metadata is `storedAt` and `voice` and **never the text**: nobody can read what was said from the bucket's listing.
 * - The read path checks `cacheFresh` itself, so a late lifecycle rule never serves old audio. A read does not delete.
 * - A cache that fails is a miss and a write that fails is not an error: the clip is still played, only not kept.
 * - It never touches `speech/lib/v1/` (the Library, no expiry): it only makes keys with `speechCacheKey`.
 *
 * The 30-day R2 lifecycle rule is a bucket setting, not code: `wrangler r2 bucket lifecycle add hauntology-worlds speech-cache speech/v1/ --expire-days 30`.
 * The prefix is not optional: a rule with none would delete the Library.
 */

/** The part of an R2 bucket this cache uses. The real `R2Bucket` fits it, and so does `FakeR2`. */
export interface SpeechBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; customMetadata?: Record<string, string> } | null>;
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): unknown;
}

export type CachedSpeech = { audio: Uint8Array; voice: VoiceId; storedAt: number };

export interface SpeechCache {
  /** The first fresh clip for these voices, tried in the order given (the line's Inworld voice, then its Aura-2 voice). `null` is a miss, and so is any failure. */
  lookup(voices: readonly VoiceId[], spoken: string): Promise<CachedSpeech | null>;
  /** Keeps a clip under its voice and text. `false` when it was not kept (the clip is not playable audio, or the write failed); never throws. */
  put(voice: VoiceId, spoken: string, audio: Uint8Array): Promise<boolean>;
}

export type R2SpeechCacheOptions = { digest?: Digest; now?: () => number };

export class R2SpeechCache implements SpeechCache {
  private readonly digest: Digest;
  private readonly now: () => number;

  constructor(private readonly bucket: SpeechBucket, options: R2SpeechCacheOptions = {}) {
    this.digest = options.digest ?? sha256Hex;
    this.now = options.now ?? Date.now;
  }

  async lookup(voices: readonly VoiceId[], spoken: string): Promise<CachedSpeech | null> {
    for (const voice of voices) {
      try {
        const object = await this.bucket.get(await speechCacheKey(voice, spoken, this.digest));
        if (object === null) continue;
        const meta = object.customMetadata;
        const storedAt = meta !== undefined && /^\d{1,16}$/.test(meta.storedAt ?? "") ? Number(meta.storedAt) : Number.NaN;
        if (meta?.voice !== voice || !cacheFresh(storedAt, this.now())) continue; // damaged, mis-keyed or old: a miss
        const audio = new Uint8Array(await object.arrayBuffer());
        if (audio.length < AUDIO_MIN_BYTES || audio.length > AUDIO_MAX_BYTES) continue;
        return { audio, voice, storedAt };
      } catch {
        // a cache that fails is a miss
      }
    }
    return null;
  }

  async put(voice: VoiceId, spoken: string, audio: Uint8Array): Promise<boolean> {
    if (audio.length < AUDIO_MIN_BYTES || audio.length > AUDIO_MAX_BYTES) return false;
    try {
      await this.bucket.put(await speechCacheKey(voice, spoken, this.digest), audio, {
        httpMetadata: { contentType: "audio/mpeg" },
        customMetadata: { storedAt: String(this.now()), voice },
      });
      return true;
    } catch {
      return false;
    }
  }
}
