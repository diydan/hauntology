import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { flicker, FLICKER_MIN } from "./flicker";

const seedArb = fc.integer({ min: -100000, max: 100000 });

/** Sample start offsets (ms) of dips: runs where the multiplier drops below ~1. */
function dipStarts(seed: number, spanMs: number): number[] {
  const starts: number[] = [];
  let inDip = false;
  for (let t = 0; t <= spanMs; t += 10) {
    const dipping = flicker(t, seed, false) < 0.999;
    if (dipping && !inDip) starts.push(t);
    inDip = dipping;
  }
  return starts;
}

describe("Property 5: Flicker is bounded and off under reduced motion", () => {
  // Feature: world-viewer, Property 5: Flicker is bounded and off under reduced motion
  // Validates: Requirements 3.2, 6.2
  it("stays within [0.8, 1] for any time and seed, and is deterministic", () => {
    fc.assert(
      fc.property(seedArb, fc.double({ min: 0, max: 120000, noNaN: true }), (seed, t) => {
        const v = flicker(t, seed, false);
        return v >= FLICKER_MIN && v <= 1 && v === flicker(t, seed, false);
      }),
      propParams(),
    );
  });

  it("has at most three dips in any one-second window", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const starts = dipStarts(seed, 30000);
        if (starts.length === 0) return false; // the schedule must actually flicker
        return starts.every((s, i) => starts.filter((o) => o >= s && o < s + 1000).length <= 3 && (i === 0 || s - (starts[i - 1] as number) >= 390));
      }),
      propParams(),
    );
  });

  it("is exactly 1 under reduced motion", () => {
    fc.assert(
      fc.property(seedArb, fc.double({ min: 0, max: 120000, noNaN: true }), (seed, t) => flicker(t, seed, true) === 1),
      propParams(),
    );
    expect(flicker(Number.NaN, 7, false)).toBe(1);
  });
});
