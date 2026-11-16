import * as fc from "fast-check";
import type { Bounds, Vec3 } from "./types";

/** Shared generators for the viewer property tests. */

export const finiteDouble = (min: number, max: number) => fc.double({ min, max, noNaN: true });

export const vec3Arb = (min = -20, max = 20): fc.Arbitrary<Vec3> =>
  fc.tuple(finiteDouble(min, max), finiteDouble(min, max), finiteDouble(min, max));

/** A box of at least `minSize` on every side, somewhere near the origin. */
export const boundsArb = (minSize = 3, maxSize = 30): fc.Arbitrary<Bounds> =>
  fc
    .tuple(vec3Arb(-10, 10), finiteDouble(minSize, maxSize), finiteDouble(minSize, maxSize), finiteDouble(minSize, maxSize))
    .map(([min, sx, sy, sz]) => ({ min, max: [min[0] + sx, min[1] + sy, min[2] + sz] as Vec3 }));

/** A point inside the box (with the box itself). */
export const pointInBoundsArb = (minSize = 3): fc.Arbitrary<{ bounds: Bounds; pos: Vec3 }> =>
  boundsArb(minSize).chain((bounds) =>
    fc
      .tuple(finiteDouble(0, 1), finiteDouble(0, 1), finiteDouble(0, 1))
      .map(([fx, fy, fz]) => ({
        bounds,
        pos: [
          bounds.min[0] + fx * (bounds.max[0] - bounds.min[0]),
          bounds.min[1] + fy * (bounds.max[1] - bounds.min[1]),
          bounds.min[2] + fz * (bounds.max[2] - bounds.min[2]),
        ] as Vec3,
      })),
  );

/** A unit quaternion [x, y, z, w] from four gaussians-ish components. */
export const quatArb = fc
  .tuple(finiteDouble(-1, 1), finiteDouble(-1, 1), finiteDouble(-1, 1), finiteDouble(-1, 1))
  .filter(([x, y, z, w]) => Math.hypot(x, y, z, w) > 0.2)
  .map(([x, y, z, w]) => {
    const len = Math.hypot(x, y, z, w);
    return [x / len, y / len, z / len, w / len] as const;
  });
