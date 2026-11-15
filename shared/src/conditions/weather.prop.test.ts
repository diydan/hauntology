import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { PARTICLE_CAPS, particleBudget, tempBand, weatherClassFromCode, windBand } from "./weather";
import { TEMP_BANDS, WEATHER_CLASSES, WIND_BANDS } from "./types";

const anyValue = fc.oneof(fc.integer({ min: -10, max: 200 }), fc.double(), fc.constantFrom(null, undefined, NaN, Infinity, -Infinity), fc.string());

/**
 * Property 3 (the part that exists: the class, the bands and the particle budget; `atmosphereLook` is the Viewer's, conditions task 4.1):
 * Weather class and band mapping is total.
 * Validates: Requirements 2.3, 4.3.
 */
describe("Property 3: weather class and band mapping is total", () => {
  it("any code, temperature and wind gives exactly one class and one band of each kind", () => {
    fc.assert(
      fc.property(anyValue, anyValue, anyValue, (code, temp, wind) => {
        expect(WEATHER_CLASSES).toContain(weatherClassFromCode(code));
        expect(TEMP_BANDS).toContain(tempBand(temp));
        expect(WIND_BANDS).toContain(windBand(wind));
        return true;
      }),
      propParams(),
    );
  });

  it("the bands never go colder or calmer as the number rises", () => {
    fc.assert(
      fc.property(fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -60, max: 60, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return TEMP_BANDS.indexOf(tempBand(lo)) <= TEMP_BANDS.indexOf(tempBand(hi)) && WIND_BANDS.indexOf(windBand(lo)) <= WIND_BANDS.indexOf(windBand(hi));
      }),
      propParams(),
    );
  });

  it("the particle budget is 0 for clear, cloud and fog, and for rain, storm and snow never above 1200, 400 at low quality or 120 under reduced motion", () => {
    fc.assert(
      fc.property(fc.constantFrom(...WEATHER_CLASSES), fc.integer({ min: -2, max: 5 }), fc.boolean(), (weather, quality, reducedMotion) => {
        const n = particleBudget(weather, { quality, reducedMotion });
        if (weather === "clear" || weather === "cloud" || weather === "fog") return n === 0;
        const cap = Math.min(PARTICLE_CAPS.normal, quality <= 1 ? PARTICLE_CAPS.low : Infinity, reducedMotion ? PARTICLE_CAPS.reduced : Infinity);
        return n === cap && n > 0 && n <= 1200 && (quality > 1 || n <= 400) && (!reducedMotion || n <= 120);
      }),
      propParams(),
    );
  });
});
