import { sha256Hex } from "@hauntology/shared/voice/digest";
import { libraryKey, type Digest } from "@hauntology/shared/voice/key";
import type { VoiceId } from "@hauntology/shared/voice/voices";
import { playableAudio } from "../guarded/workersai/speak";

/**
 * The Voice Library in R2 (ghost-voice 3.12): every scripted line, rendered once ahead of time and kept under `speech/lib/v1/<sha-256 of [voice, text]>`
 * (the same key function as the cache, a different prefix). 527 files were uploaded on 2026-11-16 by `tools/prerender-voice.mjs`.
 *
 * - It is READ-ONLY. Its bucket type has `get` and nothing else, so no code path here can write, overwrite or delete a Library object.
 * - A Library object has no `storedAt`: it never expires, so there is no freshness check. It is only checked to be playable audio.
 * - It is a free read, like the cache: it asks for no Ticket and runs with every cap spent. It is tried before the cache.
 * - A failing R2 is a miss, never an error.
 * - Only the Inworld voice is rendered, so only an Inworld voice can hit.
 */
export interface LibraryBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface SpeechLibrary {
  /** The rendered clip for this voice and spoken text, or `null` (not in the Library, not playable, or R2 failed). */
  lookup(voice: VoiceId, spoken: string): Promise<Uint8Array | null>;
}

export class R2SpeechLibrary implements SpeechLibrary {
  private readonly digest: Digest;

  constructor(private readonly bucket: LibraryBucket, options: { digest?: Digest } = {}) {
    this.digest = options.digest ?? sha256Hex;
  }

  async lookup(voice: VoiceId, spoken: string): Promise<Uint8Array | null> {
    try {
      const object = await this.bucket.get(await libraryKey(voice, spoken, this.digest));
      return object === null ? null : playableAudio(new Uint8Array(await object.arrayBuffer()));
    } catch {
      return null;
    }
  }
}
