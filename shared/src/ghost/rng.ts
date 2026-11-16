/**
 * Seeded randomness with its state in the open, so a game that is saved and restored goes on with the same numbers.
 * `stepRng` is mulberry32 over an explicit 32-bit state; `makeRng` is the same as a closure for code that wants a function.
 */
export type Rng = () => number;

/** One step: the float in [0, 1) and the next state. */
export function stepRng(state: number): readonly [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    const [value, next] = stepRng(s);
    s = next;
    return value;
  };
}

/** FNV-1a: a stable unsigned 32-bit number from any text. */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
