import { makeRng } from "../ghost/rng";
import { finiteOr } from "./types";

/**
 * The haunt flicker (Requirements 3.2, 6.2; world-viewer task 2.6): a brightness
 * multiplier in [0.8, 1]. Dips are scheduled from the seed at least 400 ms apart
 * (start to start), each eased over at least 80 ms, so any one-second window holds
 * at most three dips and the luminance never changes by more than 20%. With reduced
 * motion the multiplier is exactly 1. The schedule is walked from t = 0 with the
 * ghost engine's seeded generator, so the value is a pure function of (t, seed).
 */
export const FLICKER_MIN = 0.8;
export const FLICKER_MIN_GAP_MS = 400;
export const FLICKER_MIN_DIP_MS = 80;

const MAX_GAP_MS = 2400;
const MAX_DIP_MS = 240;

type Dip = { start: number; duration: number; depth: number };

/** The dip covering `tMs`, if any, walking the seeded schedule from the start. */
function dipAt(tMs: number, seed: number): Dip | null {
  const rng = makeRng(seed);
  let start = FLICKER_MIN_GAP_MS + rng() * (MAX_GAP_MS - FLICKER_MIN_GAP_MS);
  for (;;) {
    const duration = FLICKER_MIN_DIP_MS + rng() * (MAX_DIP_MS - FLICKER_MIN_DIP_MS);
    const depth = rng() * (1 - FLICKER_MIN);
    if (tMs < start) return null;
    if (tMs <= start + duration) return { start, duration, depth };
    start += duration + FLICKER_MIN_GAP_MS + rng() * (MAX_GAP_MS - FLICKER_MIN_GAP_MS);
  }
}

const smoothstep = (x: number): number => x * x * (3 - 2 * x);

export function flicker(tMs: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const t = Math.max(0, finiteOr(tMs, 0));
  const dip = dipAt(t, Math.trunc(finiteOr(seed, 0)));
  if (!dip) return 1;
  // Ease down over the first half of the dip and back up over the second half.
  const phase = (t - dip.start) / dip.duration;
  const eased = phase < 0.5 ? smoothstep(phase * 2) : smoothstep((1 - phase) * 2);
  return 1 - dip.depth * eased;
}
