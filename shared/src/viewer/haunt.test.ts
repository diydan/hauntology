import { describe, expect, it } from "vitest";
import { GRADE_FULL, gradeParams, orbPulse, promptFor, smoothHaunt } from "./haunt";

describe("interaction prompt (world-viewer 6.1, Requirement 4.1)", () => {
  const me: [number, number, number] = [0, 1.6, 0];
  const near = { pos: [0, 1, -2] as [number, number, number], radius: 2.5 };
  const far = { pos: [0, 1, -9] as [number, number, number], radius: 2.5 };

  it("offers an anchor inside its radius first, the ghost within 4 m, else nobody", () => {
    expect(promptFor(me, [near], [0, 1, -1], true)).toBe("anchor");
    expect(promptFor(me, [far], [0, 1, -3.9], true)).toBe("ghost");
    expect(promptFor(me, [far], [0, 1, -4.1], true)).toBeNull();
    expect(promptFor(me, [far], [0, 1, -1], false)).toBeNull();
    expect(promptFor(me, [], null, true)).toBeNull();
    expect(promptFor([Number.NaN, 0, 0], [near], null, true)).toBeNull();
  });

  it("counts the edge of the radius as inside", () => {
    expect(promptFor([0, 1, 0], [{ pos: [0, 1, -2.5], radius: 2.5 }], null, false)).toBe("anchor");
    expect(promptFor([0, 1, 0], [{ pos: [0, 1, -2.5001], radius: 2.5 }], null, false)).toBeNull();
  });
});

describe("haunt grade (world-viewer 5.1)", () => {
  it("is off at level 0, full at level 1, and half-way at a half", () => {
    expect(gradeParams(0)).toEqual({ desaturate: 0, vignette: 0, grain: 0, dim: 0 });
    expect(gradeParams(1)).toEqual({ ...GRADE_FULL });
    expect(gradeParams(0.5).dim).toBeCloseTo(GRADE_FULL.dim / 2, 12);
    expect(gradeParams(2)).toEqual({ ...GRADE_FULL });
    expect(gradeParams(Number.NaN)).toEqual({ desaturate: 0, vignette: 0, grain: 0, dim: 0 });
  });

  it("smoothing approaches the target without overshooting, at any frame rate", () => {
    let v = 0;
    for (let i = 0; i < 240; i++) v = smoothHaunt(v, 1, 16);
    expect(v).toBeGreaterThan(0.99);
    expect(v).toBeLessThanOrEqual(1);
    let w = 0;
    for (let i = 0; i < 120; i++) w = smoothHaunt(w, 1, 32);
    expect(Math.abs(v - w)).toBeLessThan(0.01);
    expect(smoothHaunt(0.5, 0.5, 100)).toBe(0.5);
  });

  it("pulses inside [0.75, 1] and slower under reduced motion", () => {
    for (const t of [0, 300, 999, 5000, 60000]) {
      expect(orbPulse(t, false)).toBeGreaterThanOrEqual(0.75);
      expect(orbPulse(t, false)).toBeLessThanOrEqual(1);
    }
    // At a quarter of the slow period the normal pulse has swung further from its start.
    const dNormal = Math.abs(orbPulse(200, false) - orbPulse(0, false));
    const dSlow = Math.abs(orbPulse(200, true) - orbPulse(0, true));
    expect(dNormal).toBeGreaterThan(dSlow);
  });
});
