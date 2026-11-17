import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { MOON_PHASES, TEMP_BANDS, TIMES_OF_DAY, WEATHER_CLASSES, WIND_BANDS, type Atmosphere } from "../conditions/types";
import {
  atmosphereParams,
  GRADE_MAX,
  GRADE_MIN,
  MAX_PARTICLES,
  PITCH_LIMIT,
  tiltLook,
  TILT_DEADZONE_DEG,
  TILT_MAX_RATE,
  type LookState,
} from "./atmosphere";
import type { QualityLevel } from "./types";
import { finiteDouble } from "./viewer.arb";

const atmosphereArb: fc.Arbitrary<Atmosphere> = fc.record(
  {
    timeOfDay: fc.constantFrom(...TIMES_OF_DAY),
    weather: fc.constantFrom(...WEATHER_CLASSES),
    tempBand: fc.constantFrom(...TEMP_BANDS),
    windBand: fc.constantFrom(...WIND_BANDS),
    moon: fc.constantFrom(...MOON_PHASES),
    stars: fc.array(
      fc.record({ id: fc.integer({ min: 0, max: 299 }), az: finiteDouble(0, 360), alt: finiteDouble(-90, 90), mag: finiteDouble(-2, 8) }),
      { maxLength: 20 },
    ),
    moonSky: fc.record({ az: finiteDouble(0, 360), alt: finiteDouble(-90, 90), lit: finiteDouble(0, 1) }),
  },
  { requiredKeys: ["timeOfDay", "weather", "tempBand", "windBand", "moon"] },
);

const qualityArb = fc.constantFrom<QualityLevel>(0, 1, 2, 3);

describe("Property 12: Atmosphere and tilt are bounded and never touch movement", () => {
  // Feature: world-viewer, Property 12: Atmosphere and tilt are bounded and never touch movement
  // Validates: Requirements 3.6, 8.1
  it("caps particles, lowers them for low quality and reduced motion, and grades within limits", () => {
    fc.assert(
      fc.property(atmosphereArb, qualityArb, fc.boolean(), (atmosphere, quality, reducedMotion) => {
        const p = atmosphereParams(atmosphere, quality, reducedMotion);
        // Looks only: the result carries no movement, collision, anchor or haunt field.
        if (Object.keys(p).sort().join(",") !== "brightness,fogDensity,precipitation,sky,tint") return false;
        if (p.precipitation.count < 0 || p.precipitation.count > MAX_PARTICLES) return false;
        if (atmosphereParams(atmosphere, 0, reducedMotion).precipitation.count > atmosphereParams(atmosphere, 3, reducedMotion).precipitation.count) return false;
        if (atmosphereParams(atmosphere, quality, true).precipitation.count > atmosphereParams(atmosphere, quality, false).precipitation.count) return false;
        if (!p.tint.every((c) => c >= GRADE_MIN && c <= GRADE_MAX)) return false;
        if (p.brightness < GRADE_MIN || p.brightness > GRADE_MAX || p.fogDensity < 0) return false;
        const night = atmosphere.timeOfDay === "dusk" || atmosphere.timeOfDay === "night";
        if (p.sky.starsVisible !== night) return false;
        if (p.sky.starCount !== (night ? (atmosphere.stars?.length ?? 0) : 0)) return false;
        return true;
      }),
      propParams(),
    );
    expect(atmosphereParams(null, 3, false).precipitation).toEqual({ kind: "none", count: 0 });
    expect(atmosphereParams(null, 0, true).tint).toEqual([1, 1, 1]);
  });

  it("tilt ignores wobble and broken readings, clamps the turn rate, and never moves position", () => {
    const readingArb = fc.option(
      fc.record({ alpha: fc.double(), beta: fc.double() }),
      { nil: null },
    );
    fc.assert(
      fc.property(fc.array(readingArb, { maxLength: 50 }), fc.record({ alpha: finiteDouble(0, 360), beta: finiteDouble(-90, 90) }), finiteDouble(1, 100),
        (readings, calibration, dtMs) => {
          let look: LookState = { yaw: 0.2, pitch: 0 };
          for (const reading of readings) {
            const next = tiltLook(look, reading, calibration, dtMs);
            // Look only: the result has no position to change.
            if (Object.keys(next).sort().join(",") !== "pitch,yaw") return false;
            if (!Number.isFinite(next.yaw) || !Number.isFinite(next.pitch)) return false;
            if (Math.abs(next.pitch) > PITCH_LIMIT) return false;
            const maxTurn = (TILT_MAX_RATE * dtMs) / 1000 + 1e-12;
            if (Math.abs(next.yaw - look.yaw) > maxTurn || Math.abs(next.pitch - look.pitch) > maxTurn) return false;
            if (reading === null && (next.yaw !== look.yaw || next.pitch !== look.pitch)) return false;
            look = next;
          }
          return true;
        }),
      propParams(),
    );
  });

  it("leaves the look alone inside the deadzone and with no reading", () => {
    const look = { yaw: 1, pitch: 0.1 };
    const calibration = { alpha: 100, beta: 45 };
    expect(tiltLook(look, { alpha: 100 + TILT_DEADZONE_DEG / 2, beta: 45 - TILT_DEADZONE_DEG / 2 }, calibration, 16)).toEqual(look);
    expect(tiltLook(look, null, calibration, 16)).toEqual(look);
    expect(tiltLook(look, { alpha: Number.NaN, beta: 45 }, calibration, 16)).toEqual(look);
    expect(tiltLook(look, { alpha: Number.POSITIVE_INFINITY, beta: 45 }, calibration, 16)).toEqual(look);
  });
});
