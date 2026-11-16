import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { ghostPlacement, orbIntensity } from "./haunt";
import { GHOST_MIN_DISTANCE } from "./types";
import { finiteDouble, pointInBoundsArb, vec3Arb } from "./viewer.arb";

describe("Property 6: Orb intensity is monotone and zero when found", () => {
  // Feature: world-viewer, Property 6: Orb intensity is monotone and zero when found
  // Validates: Requirements 3.3
  it("never increases with distance, stays in [0, 1], and is 0 once found", () => {
    fc.assert(
      fc.property(finiteDouble(0, 100), finiteDouble(0, 100), finiteDouble(0.05, 10), fc.boolean(), (d1, d2, radius, found) => {
        const near = Math.min(d1, d2), far = Math.max(d1, d2);
        const a = orbIntensity(near, found, radius), b = orbIntensity(far, found, radius);
        if (a < b || a < 0 || a > 1 || b < 0 || b > 1) return false;
        return !found || (a === 0 && b === 0);
      }),
      propParams(),
    );
    expect(orbIntensity(0, false, 2.5)).toBe(1);
    expect(orbIntensity(Number.NaN, false, 2.5)).toBe(0);
  });
});

describe("Property 7: Ghost placement keeps distance and bounds", () => {
  // Feature: world-viewer, Property 7: Ghost placement keeps distance and bounds
  // Validates: Requirements 3.4
  it("is at least 1.2 m away, inside the bounds, and identical for identical inputs", () => {
    fc.assert(
      fc.property(
        pointInBoundsArb(3),
        finiteDouble(-Math.PI * 4, Math.PI * 4),
        fc.option(vec3Arb(), { nil: undefined }),
        finiteDouble(0, 60000),
        ({ bounds, pos }, yaw, anchor, t) => {
          const placed = ghostPlacement(pos, yaw, anchor, t, bounds);
          if (JSON.stringify(placed) !== JSON.stringify(ghostPlacement(pos, yaw, anchor, t, bounds))) return false;
          const inside =
            placed[0] >= bounds.min[0] && placed[0] <= bounds.max[0] &&
            placed[1] >= bounds.min[1] && placed[1] <= bounds.max[1] &&
            placed[2] >= bounds.min[2] && placed[2] <= bounds.max[2];
          const away = Math.hypot(placed[0] - pos[0], placed[1] - pos[1], placed[2] - pos[2]);
          return inside && away >= GHOST_MIN_DISTANCE - 1e-9;
        },
      ),
      propParams(),
    );
  });

  it("stands where the player faces when there is room and no anchor", () => {
    const placed = ghostPlacement([0, 1.6, 0], 0, undefined, 0, { min: [-20, 0, -20], max: [20, 4, 20] });
    expect(placed[0]).toBeCloseTo(0, 9);
    expect(placed[2]).toBeCloseTo(-2.5, 9);
  });
});
