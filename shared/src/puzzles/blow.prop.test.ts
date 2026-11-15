import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { BLOW_FLOOR, BLOW_MIN_MS, blowDetect } from "./blow";
import { loudnessArb } from "./puzzles.arb";

/** An independent reading of the rule: the longest unbroken run above the threshold, in ms. */
function longestRun(levels: ReadonlyArray<{ t: number; level: number }>, baseline: number): number {
  const thr = Math.max(BLOW_FLOOR, 3 * baseline);
  let best = 0;
  let start: number | null = null;
  for (const p of levels) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.level) || p.level <= thr) { start = null; continue; }
    start = start ?? p.t;
    best = Math.max(best, p.t - start);
  }
  return best;
}

describe("Property 17: A breath needs sustained loudness", () => {
  // Feature: puzzles, Property 17: A breath needs sustained loudness
  // Validates: Requirements 11.4
  it("is true exactly when some unbroken run above the threshold lasts 300 ms", () => {
    fc.assert(
      fc.property(loudnessArb, fc.double({ min: 0, max: 0.5, noNaN: true }), (levels, baseline) =>
        blowDetect(levels, baseline) === longestRun(levels, baseline) >= BLOW_MIN_MS),
      propParams(),
    );
  });

  it("is false for nothing, for non-numbers and for a loud burst that is too short", () => {
    expect(blowDetect([])).toBe(false);
    expect(blowDetect([{ t: 0, level: Number.NaN }, { t: 400, level: Number.POSITIVE_INFINITY }])).toBe(false);
    const burst = (to: number, level: number) => Array.from({ length: Math.floor(to / 16) + 1 }, (_, i) => ({ t: i * 16, level }));
    expect(blowDetect(burst(250, 0.95))).toBe(false);
    expect(blowDetect(burst(400, 0.95))).toBe(true);
    expect(blowDetect(burst(400, 0.2), 0.1)).toBe(false); // a noisy room raises the bar
  });
});
