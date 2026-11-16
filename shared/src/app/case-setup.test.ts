import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { ErrorCode } from "../errors";
import {
  BOTS_DEFAULT, BOTS_MAX, BOTS_MIN, CASE_PRESETS, CASE_PRESET_COPY, CASE_REFUSAL_FALLBACK, CASE_REFUSAL_COPY,
  DEFAULT_CASE_SETUP, caseAvailability, caseRefusalCopy, clampBots, isCasePreset, normalizeCaseSetup, refusalPasses,
} from "./case-setup";
import { DEFAULT_SEED, propParams } from "./prop-config";

describe("the case setup limits", () => {
  it("offers Classic, Relaxed (Gentle) and Quick, two to five Bots, and starts on Classic with two", () => {
    expect([...CASE_PRESETS]).toEqual(["classic", "gentle", "quick"]);
    expect(CASE_PRESETS.map((p) => CASE_PRESET_COPY[p].label)).toEqual(["Classic", "Relaxed", "Quick"]);
    expect([BOTS_MIN, BOTS_MAX, BOTS_DEFAULT]).toEqual([2, 5, 2]);
    expect(DEFAULT_CASE_SETUP).toEqual({ preset: "classic", bots: 2 });
  });

  it("gives each preset one short line that names its turn time as party-mode's preset rows do", () => {
    expect(CASE_PRESET_COPY.classic.line).toContain("60 seconds");
    expect(CASE_PRESET_COPY.gentle.line).toContain("90 seconds");
    expect(CASE_PRESET_COPY.quick.line).toContain("45 seconds");
    for (const p of CASE_PRESETS) expect(CASE_PRESET_COPY[p].line).not.toMatch(/\n/);
  });
});

describe("clampBots and normalizeCaseSetup", () => {
  it("keeps 2 to 5, rounds a fraction, and pulls a count out of range to the nearest limit", () => {
    for (const n of [2, 3, 4, 5]) expect(clampBots(n)).toBe(n);
    expect([clampBots(0), clampBots(1), clampBots(-3), clampBots(6), clampBots(99)]).toEqual([2, 2, 2, 5, 5]);
    expect([clampBots(2.4), clampBots(2.6), clampBots(4.5)]).toEqual([2, 3, 5]);
  });

  it("gives the default for anything that is not a finite number", () => {
    for (const v of [NaN, Infinity, -Infinity, "4", null, undefined, {}, [], true]) expect(clampBots(v), String(v)).toBe(BOTS_DEFAULT);
  });

  it("knows a preset only by its exact name", () => {
    for (const p of CASE_PRESETS) expect(isCasePreset(p)).toBe(true);
    for (const v of ["Classic", "relaxed", "", "constructor", "__proto__", 1, null, undefined]) expect(isCasePreset(v), String(v)).toBe(false);
  });

  it("any input becomes a setup the Host accepts, and a good setup is unchanged", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (preset, bots) => {
        const s = normalizeCaseSetup({ preset, bots });
        return (CASE_PRESETS as readonly string[]).includes(s.preset) && Number.isInteger(s.bots) && s.bots >= BOTS_MIN && s.bots <= BOTS_MAX;
      }),
      propParams(DEFAULT_SEED),
    );
    fc.assert(
      fc.property(fc.constantFrom(...CASE_PRESETS), fc.integer({ min: BOTS_MIN, max: BOTS_MAX }), (preset, bots) => {
        const s = normalizeCaseSetup({ preset, bots });
        return s.preset === preset && s.bots === bots;
      }),
      propParams(DEFAULT_SEED),
    );
    expect(normalizeCaseSetup(null)).toEqual(DEFAULT_CASE_SETUP);
    expect(normalizeCaseSetup(undefined)).toEqual(DEFAULT_CASE_SETUP);
  });
});

describe("caseAvailability", () => {
  const W = "w-AbCdEfGhIjKlMnOpQrSt12";

  it("is available when party mode is on and the Host has not refused this world", () => {
    expect(caseAvailability({ partyEnabled: true })).toEqual({ available: true });
    expect(caseAvailability({ partyEnabled: true }, { worldId: "other", code: "world_too_small" }, W)).toEqual({ available: true });
  });

  it("gives one line and no case when party mode is off, whatever else is true", () => {
    const off = caseAvailability({ partyEnabled: false }, undefined, W);
    expect(off).toEqual({ available: false, reason: CASE_REFUSAL_COPY.party_disabled });
    expect(caseAvailability({ partyEnabled: false }, { worldId: W, code: "world_too_small" }, W)).toEqual(off);
  });

  it("gives the Host's own refusal for the world it refused, in one line each", () => {
    for (const code of ["world_too_small", "party_disabled", "rooms_full"] as const) {
      const r = caseAvailability({ partyEnabled: true }, { worldId: W, code }, W);
      expect(r).toEqual({ available: false, reason: CASE_REFUSAL_COPY[code] });
    }
    for (const reason of Object.values(CASE_REFUSAL_COPY)) {
      expect(reason).not.toMatch(/\n/);
      expect(reason).toMatch(/wander|Wander/);
    }
  });

  it("keeps a too-small place off for the visit and lets every other refusal pass", () => {
    expect(refusalPasses("world_too_small")).toBe(false);
    for (const code of [...Object.values(ErrorCode).filter((c) => c !== "world_too_small"), "case_failed"]) expect(refusalPasses(code), code).toBe(true);
  });

  it("falls back to a plain line for any other code, never the code itself", () => {
    for (const code of Object.values(ErrorCode)) {
      const line = caseRefusalCopy(code);
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toContain(code);
    }
    expect(caseRefusalCopy("not_a_code")).toBe(CASE_REFUSAL_FALLBACK);
  });
});
