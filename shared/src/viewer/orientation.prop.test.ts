import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { determinant3, orientationTransform, transformPoint } from "./orientation";
import type { Vec3 } from "./types";
import { finiteDouble, quatArb, vec3Arb } from "./viewer.arb";

const EPS = 1e-9;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("Property 1: Orientation maps up to +Y and preserves handedness", () => {
  // Feature: world-viewer, Property 1: Orientation maps up to +Y and preserves handedness
  // Validates: Requirements 1.4
  it("sends the declared up vector to +Y, scales distances uniformly, determinant positive", () => {
    fc.assert(
      fc.property(quatArb, finiteDouble(0.01, 100), vec3Arb(), vec3Arb(), (upFix, scale, a, b) => {
        const m = orientationTransform({ upFix, scale });
        // The world's declared up is the vector the rotation sends to +Y: R^T * (0,1,0),
        // read from the unscaled matrix's second row (column-major storage).
        const r = orientationTransform({ upFix, scale: 1 });
        const up: Vec3 = [r[1], r[5], r[9]];
        const mapped = transformPoint(m, up);
        if (Math.abs(mapped[0]) > 1e-6 * scale || Math.abs(mapped[2]) > 1e-6 * scale) return false;
        if (Math.abs(mapped[1] - scale) > 1e-6 * scale) return false;
        // Uniform scale and handedness.
        const scaled = dist(transformPoint(m, a), transformPoint(m, b));
        if (Math.abs(scaled - scale * dist(a, b)) > 1e-6 * scale * (1 + dist(a, b))) return false;
        const det = determinant3(m);
        return det > 0 && Math.abs(det - scale ** 3) <= 1e-6 * scale ** 3 + EPS;
      }),
      propParams(),
    );
  });

  it("keeps a positive determinant for degenerate input", () => {
    for (const bad of [
      { upFix: [0, 0, 0, 0] as const, scale: 2 },
      { upFix: [Number.NaN, 0, 0, 1] as const, scale: -3 },
      { upFix: [0, 0, 0, 1] as const, scale: Number.POSITIVE_INFINITY },
    ]) {
      expect(determinant3(orientationTransform(bad))).toBeGreaterThan(0);
    }
    // Identity: no fix, unit scale leaves a point alone.
    expect(transformPoint(orientationTransform({ upFix: [0, 0, 0, 1], scale: 1 }), [3, -2, 5])).toEqual([3, -2, 5]);
  });
});
