import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import {
  ENHANCE_FOV_DEG, ENHANCE_VIEWS_DEFAULT, ENHANCE_VIEWS_MAX, MIN_OVERLAP, enhanceEnabledFromEnv, enhanceViewsFromEnv, multiImagePrompt, planEnhance, singlePrompt,
} from "./enhance";
import { MAX_LONG_SIDE, MIN_SHORT_SIDE } from "./upload";

const okSize = fc.record({ width: fc.integer({ min: MIN_SHORT_SIDE, max: MAX_LONG_SIDE }), height: fc.integer({ min: MIN_SHORT_SIDE, max: MAX_LONG_SIDE }) });

describe("Property 14 (first half): Enhance plans overlap", () => {
  // Feature: world-pipeline, Property 14: Enhance plans overlap and fall back
  // Validates: Requirements 11.1
  it("for any size and any view count, the views have pairwise-distinct azimuths, none is the original's, and each keeps at least 40% of the original", () => {
    fc.assert(fc.property(okSize, fc.integer({ min: -3, max: 9 }), (size, n) => {
      const plan = planEnhance(size, n);
      if (!plan.ok) return false;
      if (plan.width !== size.width || plan.height !== size.height) return false;
      if (plan.views.length < 1 || plan.views.length > ENHANCE_VIEWS_MAX) return false;
      const az = plan.views.map((v) => v.azimuthDeg);
      if (new Set(az).size !== az.length || az.includes(0)) return false;
      return plan.views.every((v) => v.overlap >= MIN_OVERLAP && Math.abs(v.overlap - (1 - Math.abs(v.shift))) < 1e-9 && Math.abs(v.fill.fraction - Math.abs(v.shift)) < 1e-9
        && v.fill.fraction <= 1 - MIN_OVERLAP + 1e-9 && Math.sign(v.azimuthDeg) === Math.sign(v.shift) && (v.fill.side === "right") === (v.shift > 0));
    }), propParams());
  });
  it("gives exactly the number asked for, from 1 to 4, and the default for anything that is not a number", () => {
    const plan = (n: number) => (planEnhance({ width: 1200, height: 900 }, n) as unknown as { views: unknown[] }).views.length;
    expect([1, 2, 3, 4].map(plan)).toEqual([1, 2, 3, 4]);
    expect(plan(0)).toBe(1);
    expect(plan(99)).toBe(4);
    expect(plan(Number.NaN)).toBe(ENHANCE_VIEWS_DEFAULT);
    expect(plan(Number.POSITIVE_INFINITY)).toBe(ENHANCE_VIEWS_DEFAULT);
  });
  it("makes the widest views first, one to each side, so a quota that stops early still has left and right", () => {
    const two = (planEnhance({ width: 1200, height: 900 }, 2) as unknown as { views: { azimuthDeg: number }[] }).views.map((v) => v.azimuthDeg);
    expect(two).toEqual([0.5 * ENHANCE_FOV_DEG, -0.5 * ENHANCE_FOV_DEG]);
  });
  it("refuses a size the upload would refuse, or that is not whole pixels", () => {
    for (const bad of [
      { width: MIN_SHORT_SIDE - 1, height: 1000 }, { width: 1000, height: MIN_SHORT_SIDE - 1 }, { width: MAX_LONG_SIDE + 1, height: 1000 }, { width: 1000.5, height: 900 },
      { width: Number.NaN, height: 900 }, { width: 900, height: Number.POSITIVE_INFINITY }, { width: -900, height: 900 }, { width: "900" as never, height: 900 },
    ]) expect(planEnhance(bad)).toEqual({ ok: false, reason: "bad_size" });
    expect(planEnhance(null as never)).toEqual({ ok: false, reason: "bad_size" });
    expect(planEnhance(undefined as never)).toEqual({ ok: false, reason: "bad_size" });
    expect(planEnhance({ width: MIN_SHORT_SIDE, height: MAX_LONG_SIDE }).ok).toBe(true);
  });
});

describe("the switch and the count from the environment", () => {
  it("is on only for the word true, and off by default (Requirement 11.2)", () => {
    expect(enhanceEnabledFromEnv(undefined)).toBe(false);
    for (const v of ["", "false", "1", "yes", "on", "tru", "truee"]) expect(enhanceEnabledFromEnv(v)).toBe(false);
    for (const v of ["true", "TRUE", " true "]) expect(enhanceEnabledFromEnv(v)).toBe(true);
  });
  it("takes a count from 1 to 4 and uses the default for anything else", () => {
    expect([undefined, "", "0", "5", "-1", "two", "2.5", "99", "1e1"].map(enhanceViewsFromEnv)).toEqual(Array(9).fill(ENHANCE_VIEWS_DEFAULT));
    expect(["1", "2", "3", "4", " 3 "].map(enhanceViewsFromEnv)).toEqual([1, 2, 3, 4, 3]);
  });
});

describe("the prompt", () => {
  const original = { image: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
  it("puts the original at azimuth 0 among the extensions, sorted by azimuth", () => {
    const left = { image: new Uint8Array([9]), contentType: "image/png", azimuthDeg: -35 };
    const right = { image: new Uint8Array([8]), contentType: "image/png", azimuthDeg: 35 };
    const p = multiImagePrompt(original, [right, left]);
    expect(p.kind).toBe("multi-image");
    expect(p.kind === "multi-image" && p.images.map((i) => i.azimuthDeg)).toEqual([-35, 0, 35]);
    expect(p.kind === "multi-image" && p.images[1]!.image).toBe(original.image);
  });
  it("is the single-image prompt, with the original photo, when there are no extensions", () => {
    expect(multiImagePrompt(original, [])).toEqual(singlePrompt(original.image, original.contentType));
    expect(singlePrompt(original.image, original.contentType)).toEqual({ kind: "single", image: original.image, contentType: "image/jpeg" });
  });
});
