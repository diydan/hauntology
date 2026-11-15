import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { PLAIN_INSPECT_MS, lockCharge, plainInspectCharge } from "./charge";
import { CAPS, PRESETS, capFor, presetSetting } from "./settings";
import { weirdNumberArb } from "./puzzles.arb";

describe("Property 7: The time charged stays between ten seconds and the Cap", () => {
  // Feature: puzzles, Property 7: The time charged stays between ten seconds and the Cap
  // Validates: Requirements 1.2, 1.3, 1.7
  it("is at least 10 s, at most the Cap, equal to the time spent in between, and a Plain Inspect pays the whole Cap", () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: 0, max: 120_000, noNaN: true }), weirdNumberArb), fc.constantFrom(...PRESETS.map(capFor)), (elapsed, cap) => {
        const c = lockCharge(elapsed, cap);
        if (!(c >= PLAIN_INSPECT_MS && c <= cap)) return false;
        if (Number.isFinite(elapsed) && elapsed >= PLAIN_INSPECT_MS && elapsed <= cap && c !== elapsed) return false;
        return plainInspectCharge(cap) === cap;
      }),
      propParams(),
    );
  });

  it("holds the floor even for a Cap under ten seconds or a broken one", () => {
    fc.assert(
      fc.property(weirdNumberArb, weirdNumberArb, (elapsed, cap) => {
        const c = lockCharge(elapsed, cap);
        return Number.isFinite(c) && c >= PLAIN_INSPECT_MS && plainInspectCharge(cap) >= PLAIN_INSPECT_MS;
      }),
      propParams(),
    );
  });
});

describe("presets", () => {
  it("map to the settings and Caps of the spec", () => {
    expect(CAPS).toEqual({ classic: 25_000, gentle: 40_000, quick: 20_000 });
    expect([presetSetting("classic"), presetSetting("gentle"), presetSetting("quick")]).toEqual(["normal", "easy", "off"]);
    expect(lockCharge(3000, 25_000)).toBe(10_000);
    expect(lockCharge(12_345, 25_000)).toBe(12_345);
    expect(lockCharge(99_999, 40_000)).toBe(40_000);
  });
});
