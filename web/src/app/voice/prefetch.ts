import type { ApiResult } from "@hauntology/shared/app/api";

/**
 * In-memory prefetch & decode-ahead store (ghost-voice 4.8, Requirement 1.9).
 *
 * Fetches only line ids listed by the server (`prefetch: true`), decodes them into memory up to
 * 8 lines and 2 MB, never writes to disk or storage, and clears everything when the room ends.
 */
export const PREFETCH_MAX_LINES = 8;
export const PREFETCH_MAX_BYTES = 2 * 1024 * 1024;

export type PrefetchEntry<T> = {
  decoded: T;
  bytes: number;
};

export type AudioPrefetcher<T> = {
  warm(serverIds: readonly string[]): Promise<void>;
  get(lineId: string): T | null;
  clear(): void;
  stats(): { lines: number; bytes: number };
};

export function createAudioPrefetcher<T>(deps: {
  fetchPrefetch: (lineId: string) => Promise<ApiResult<{ audio: Blob }>>;
  decode: (blob: Blob) => Promise<T>;
  maxLines?: number;
  maxBytes?: number;
}): AudioPrefetcher<T> {
  const maxLines = deps.maxLines ?? PREFETCH_MAX_LINES;
  const maxBytes = deps.maxBytes ?? PREFETCH_MAX_BYTES;
  const entries = new Map<string, PrefetchEntry<T>>();
  let totalBytes = 0;

  const evictOldest = () => {
    const oldest = entries.keys().next();
    if (oldest.done) return;
    const removed = entries.get(oldest.value);
    if (removed !== undefined) totalBytes -= removed.bytes;
    entries.delete(oldest.value);
  };

  return {
    async warm(serverIds) {
      for (const lineId of serverIds) {
        if (entries.has(lineId)) continue;
        const res = await deps.fetchPrefetch(lineId).catch(() => null);
        if (res === null || !res.ok) continue;
        const bytes = res.value.audio.size;
        if (bytes <= 0 || bytes > maxBytes) continue;
        let decoded: T;
        try {
          decoded = await deps.decode(res.value.audio);
        } catch {
          continue;
        }
        while (entries.size >= maxLines || totalBytes + bytes > maxBytes) {
          if (entries.size === 0) break;
          evictOldest();
        }
        if (entries.size < maxLines && totalBytes + bytes <= maxBytes) {
          entries.set(lineId, { decoded, bytes });
          totalBytes += bytes;
        }
      }
    },
    get(lineId) {
      return entries.get(lineId)?.decoded ?? null;
    },
    clear() {
      entries.clear();
      totalBytes = 0;
    },
    stats() {
      return { lines: entries.size, bytes: totalBytes };
    },
  };
}
