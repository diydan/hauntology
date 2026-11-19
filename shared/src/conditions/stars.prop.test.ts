import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { SKY_MAX_HEIGHT, SKY_MAX_WIDTH, rasterizeSky } from "./sky-texture";
import { moonSky, starsAbove } from "./stars";
import { MAX_STARS, TIMES_OF_DAY, WEATHER_CLASSES } from "./types";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const placeArb = fc.record({
  lat: fc.double({ min: -89, max: 89, noNaN: true }).map(round2),
  lon: fc.double({ min: -179, max: 179, noNaN: true }).map(round2),
});

/**
 * Property 10: Star texture bounds and dimming (conditions 6.4).
 * Validates: Requirements 6.1, 6.2, 6.3.
 */
describe("Property 10: Star texture bounds and dimming", () => {
  it("starsAbove returns <= 300 stars above the horizon, rasterizeSky keeps dimensions <= 1024x512, dims under cloud, and is empty at dawn/day or obscured weather", () => {
    fc.assert(
      fc.property(
        placeArb,
        fc.integer({ min: Date.UTC(1950, 0, 1), max: Date.UTC(2030, 0, 1) }),
        fc.constantFrom(...WEATHER_CLASSES),
        fc.constantFrom(...TIMES_OF_DAY),
        fc.boolean(),
        (place, instantMs, weather, tod, low) => {
          const stars = starsAbove(place, instantMs);
          if (stars.length > MAX_STARS || stars.some((s) => s.alt <= 0)) return false;
          const moon = moonSky(place, instantMs);

          const tex = rasterizeSky(stars, moon, weather, tod, { low });
          if (tex.width < 1 || tex.width > SKY_MAX_WIDTH || tex.height < 1 || tex.height > SKY_MAX_HEIGHT) return false;
          if (tex.data.length !== tex.width * tex.height * 4) return false;

          const peak = tex.data.reduce((m, b) => (b > m ? b : m), 0);
          if (tod === "dawn" || tod === "day" || weather === "fog" || weather === "rain" || weather === "storm" || weather === "snow") {
            return peak === 0;
          }

          if (weather === "cloud") {
            const clearTex = rasterizeSky(stars, moon, "clear", tod, { low });
            const clearPeak = clearTex.data.reduce((m, b) => (b > m ? b : m), 0);
            if (peak > clearPeak) return false;
          }
          return true;
        },
      ),
      propParams(),
    );
  });
});
