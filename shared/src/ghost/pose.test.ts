import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sanitizePose } from "./pose";
import type { Bounds, Pose } from "./types";

const BOUNDS: Bounds = { min: [-10, 0, -10], max: [10, 4, 10] };
const PREV: Pose = { pos: [1, 1.6, 2], yaw: 0.5 };

describe("sanitizePose", () => {
  it("keeps a good pose, clamps one outside the world, and keeps the old one for anything that is not three finite numbers", () => {
    expect(sanitizePose({ pos: [2, 1, 3], yaw: 1 }, BOUNDS, PREV)).toEqual({ pos: [2, 1, 3], yaw: 1 });
    expect(sanitizePose({ pos: [99, -5, -99], yaw: 0 }, BOUNDS, PREV)).toEqual({ pos: [10, 0, -10], yaw: 0 });
    for (const pos of [[Number.NaN, 0, 0], [0, Number.POSITIVE_INFINITY, 0], [0, 0], "x", null, undefined, [1, 2, 3, 4], ["1", 2, 3]]) expect(sanitizePose({ pos, yaw: 0 }, BOUNDS, PREV).pos, String(pos)).toEqual(PREV.pos);
    expect(sanitizePose({ pos: [0, 0, 0], yaw: Number.NaN }, BOUNDS, PREV).yaw).toBe(PREV.yaw);
    expect(sanitizePose(null, BOUNDS, PREV)).toEqual(PREV);
    expect(sanitizePose("pose", BOUNDS, PREV)).toEqual(PREV);
  });

  it("wraps a heading into [-pi, pi)", () => {
    const y = sanitizePose({ pos: [0, 0, 0], yaw: 7 }, BOUNDS, PREV).yaw;
    expect(y).toBeGreaterThanOrEqual(-Math.PI);
    expect(y).toBeLessThan(Math.PI);
    expect(y).toBeCloseTo(7 - 2 * Math.PI, 9);
  });

  // Property 6
  it("Property: always a finite position inside the bounds and a finite heading, whatever was reported", () => {
    const num = fc.oneof(fc.double({ noNaN: false }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300), fc.integer());
    fc.assert(
      fc.property(fc.oneof(fc.record({ pos: fc.tuple(num, num, num), yaw: num }), fc.anything()), (input) => {
        const p = sanitizePose(input, BOUNDS, PREV);
        for (let i = 0; i < 3; i++) {
          expect(Number.isFinite(p.pos[i])).toBe(true);
          expect(p.pos[i]).toBeGreaterThanOrEqual(BOUNDS.min[i] as number);
          expect(p.pos[i]).toBeLessThanOrEqual(BOUNDS.max[i] as number);
        }
        expect(Number.isFinite(p.yaw)).toBe(true);
      }),
      { numRuns: 500, seed: 8301 },
    );
  });

  it("Property: a non-finite position gives back the previous one exactly", () => {
    fc.assert(fc.property(fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), fc.integer({ min: 0, max: 2 }), (bad, at) => {
      const pos: [number, number, number] = [1, 1, 1];
      pos[at] = bad;
      expect(sanitizePose({ pos, yaw: 0 }, BOUNDS, PREV).pos).toEqual(PREV.pos);
    }), { numRuns: 60, seed: 8302 });
  });
});
