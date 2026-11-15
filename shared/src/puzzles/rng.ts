/**
 * Seeded randomness for puzzles. Pure: the same seed always gives the same numbers, and nothing here reads the
 * clock or `Math.random` (`shared` logic takes its randomness as a parameter).
 */
export type Rng = () => number;

/** FNV-1a over the string form of the parts: a stable unsigned 32-bit number from any inputs. */
export function hash(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("␟")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a float in [0, 1) per call. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [0, n). */
export const randInt = (r: Rng, n: number): number => Math.floor(r() * n);

/** A shuffled copy (Fisher-Yates); the input is not changed. */
export function shuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}

/** [0, 1, ..., n - 1]. */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
