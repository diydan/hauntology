/**
 * Deterministic FNV-1a hash and PRNG helpers for cosmetic table layout and the Whisper's tour.
 * Pure, with no clock, platform random or game secret.
 */
export type TableRng = () => number;

/** FNV-1a over the string form of the parts: a stable unsigned 32-bit number from any inputs. */
export function hashParts(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("␟")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a float in [0, 1) per call from a 32-bit state. */
export function mulberry32(init: number): TableRng {
  let state = init >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fisher-Yates shuffled copy; the input array is never changed. */
export function shuffleWith<T>(next: TableRng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
