import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { PLACE_MIN_ACROSS, PLACE_MIN_DROP, placeTable } from "./place";

const dirArb = fc
  .record({
    x: fc.double({ min: -5, max: 5, noNaN: true }),
    y: fc.double({ min: -5, max: 5, noNaN: true }),
    z: fc.double({ min: -5, max: 5, noNaN: true }),
  })
  .filter((d) => Math.hypot(d.x, d.y, d.z) > 1e-4);

const headingArb = fc
  .double({ min: -Math.PI, max: Math.PI, noNaN: true })
  .map((a) => ({ x: Math.cos(a), z: Math.sin(a) }));

describe("Property 5: Place puts the table in front of the player", () => {
  // Feature: spirit-table, Property 5: Place puts the table in front of the player
  // Validates: Requirements 4.1
  it("puts the Table 0.85 to 0.92 m away, >= 28 cm below, facing the Player, and within 30 deg whenever pointing level or down", () => {
    const specialDirs = [
      { x: 0, y: 1, z: 0 },   // straight up
      { x: 0, y: -1, z: 0 },  // straight down
      { x: 0, y: 0, z: -1 },  // dead ahead
      { x: 1, y: 0, z: 0 },
    ];
    fc.assert(
      fc.property(fc.oneof(dirArb, fc.constantFrom(...specialDirs)), headingArb, (dir, lastHeading) => {
        const res = placeTable(dir, lastHeading);
        const again = placeTable(dir, lastHeading);
        if (JSON.stringify(res) !== JSON.stringify(again)) return false;

        const dist = Math.hypot(res.x, res.y, res.z);
        const across = Math.hypot(res.x, res.z);
        if (dist < 0.85 - 1e-6 || dist > 0.92 + 1e-6) return false;
        if (res.y > -PLACE_MIN_DROP + 1e-6 || across < PLACE_MIN_ACROSS - 1e-6) return false;

        // Front edge faces back toward the Player at (0, 0)
        const frontX = Math.sin(res.facing), frontZ = Math.cos(res.facing);
        const toPlayerDot = frontX * (-res.x / across) + frontZ * (-res.z / across);
        if (Math.abs(toPlayerDot - 1) > 1e-6) return false;

        // Within 30 degrees of the view direction whenever pointing level or down
        const dLen = Math.hypot(dir.x, dir.y, dir.z);
        if (dir.y <= 0 && dLen > 1e-9) {
          const cosTheta = (dir.x * res.x + dir.y * res.y + dir.z * res.z) / (dLen * dist);
          if (cosTheta < Math.cos((30 * Math.PI) / 180) - 1e-6) return false;
        }
        return true;
      }),
      propParams(),
    );
  });

  it("gives the same distance and height for the same pitch at any horizontal heading", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        headingArb,
        (y, yawA, yawB, lastHeading) => {
          const horiz = Math.sqrt(Math.max(0, 1 - y * y));
          const a = placeTable({ x: horiz * Math.cos(yawA), y, z: horiz * Math.sin(yawA) }, lastHeading);
          const b = placeTable({ x: horiz * Math.cos(yawB), y, z: horiz * Math.sin(yawB) }, lastHeading);
          return (
            Math.abs(a.y - b.y) < 1e-9 &&
            Math.abs(Math.hypot(a.x, a.y, a.z) - Math.hypot(b.x, b.y, b.z)) < 1e-9
          );
        },
      ),
      propParams(),
    );
  });

  it("never produces NaN on broken inputs", () => {
    const res = placeTable({ x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 0 }, { x: Number.NaN, z: 0 });
    expect([res.x, res.y, res.z, res.facing].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(res.x, res.y, res.z)).toBeCloseTo(0.85, 5);
  });
});
