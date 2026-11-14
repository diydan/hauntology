import { INK_FLOOR, inkCoverage, type Bitmap } from "../sketch";

/**
 * The longest side of a sketch is at most `max` pixels. The shape is kept (each side within one
 * pixel of rounding), a sketch already that small is not enlarged, and no side is under 1 pixel.
 */
export function downscaleSize(w: number, h: number, max = 512): { w: number; h: number } {
  const width = Number.isFinite(w) && w > 0 ? w : 1;
  const height = Number.isFinite(h) && h > 0 ? h : 1;
  const longest = Math.max(width, height);
  if (longest <= max) return { w: width, h: height };
  return {
    w: Math.max(1, Math.round((width * max) / longest)),
    h: Math.max(1, Math.round((height * max) / longest)),
  };
}

/**
 * Whether "Make it real" is on: the sketch has at least the ink floor. It uses the same
 * `inkCoverage` and `INK_FLOOR` as the API's sketch route.
 */
export function inkGate(bitmap: Bitmap): { enabled: boolean; coverage: number } {
  const coverage = inkCoverage(bitmap);
  return { enabled: coverage >= INK_FLOOR, coverage };
}
