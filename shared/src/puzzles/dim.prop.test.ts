import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { LIGHT_PEAK, candlePlan, dimPlan, lightPlan, torchPlan, worstChangesPerSecond, type LightKind } from "./dim";

describe("Property 16: Light plans respect the photosensitivity limits", () => {
  // Feature: puzzles, Property 16: Light plans respect the photosensitivity limits
  // Validates: Requirements 12.2
  it("has at most two changes in any second, a peak below white, fades only, and one still step for reduced motion", () => {
    fc.assert(
      fc.property(fc.constantFrom<LightKind>("dark", "torch", "candle"), fc.boolean(), (kind, reduced) => {
        const plan = lightPlan(kind, reduced);
        if (worstChangesPerSecond(plan) > 2) return false;
        if (!plan.every((s) => s.lum >= 0 && s.lum <= LIGHT_PEAK && LIGHT_PEAK < 1)) return false;
        if (reduced) return plan.length === 1;
        return plan.every((s, i) => i === 0 || s.t - (plan[i - 1] as { t: number }).t >= 200); // no jump faster than a ramp
      }),
      propParams(),
    );
  });

  it("has a named plan for each use, and counts a flicker as a flicker", () => {
    expect(dimPlan()).toEqual(lightPlan("dark"));
    expect(torchPlan()).toEqual(lightPlan("torch"));
    expect(candlePlan(true)).toHaveLength(1);
    expect(worstChangesPerSecond([{ t: 0, lum: 0 }, { t: 300, lum: 0.5 }, { t: 600, lum: 0.1 }, { t: 900, lum: 0.5 }])).toBe(3);
  });
});
