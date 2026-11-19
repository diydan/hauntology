import { describe, expect, it } from "vitest";
import { SKY_LOW_HEIGHT, SKY_LOW_WIDTH, SKY_MAX_HEIGHT, SKY_MAX_WIDTH, rasterizeSky, skyVisibility } from "./sky-texture";
import { STAR_LIST } from "./star-list";
import { moonSky, starsAbove } from "./stars";
import { MAX_STARS } from "./types";

describe("STAR_LIST (conditions 6.1)", () => {
  it("contains at most 300 stars sorted brightest-first with valid ranges and unique names", () => {
    expect(STAR_LIST.length).toBeGreaterThan(20);
    expect(STAR_LIST.length).toBeLessThanOrEqual(MAX_STARS);
    const names = new Set<string>();
    for (let i = 0; i < STAR_LIST.length; i++) {
      const s = STAR_LIST[i]!;
      expect(s.ra).toBeGreaterThanOrEqual(0);
      expect(s.ra).toBeLessThan(360);
      expect(s.dec).toBeGreaterThanOrEqual(-90);
      expect(s.dec).toBeLessThanOrEqual(90);
      expect(s.mag).toBeGreaterThanOrEqual(-2);
      expect(s.mag).toBeLessThanOrEqual(8);
      if (i > 0) expect(s.mag).toBeGreaterThanOrEqual(STAR_LIST[i - 1]!.mag);
      if (s.name) {
        expect(names.has(s.name)).toBe(false);
        names.add(s.name);
      }
    }
    expect(names.has("Polaris")).toBe(true);
    expect(names.has("Sirius")).toBe(true);
  });
});

describe("starsAbove & moonSky (conditions 6.2)", () => {
  it("places Polaris near observer latitude in the northern hemisphere and hides it far south", () => {
    const polarisIdx = STAR_LIST.findIndex((s) => s.name === "Polaris");
    const london = starsAbove({ lat: 51.51, lon: -0.13 }, Date.UTC(2024, 3, 23, 23, 0));
    const polarisLondon = london.find((s) => s.id === polarisIdx);
    expect(polarisLondon).toBeDefined();
    expect(Math.abs((polarisLondon?.alt ?? 0) - 51.51)).toBeLessThan(1.5);
    expect(polarisLondon!.az < 5 || polarisLondon!.az > 355).toBe(true);

    const sydney = starsAbove({ lat: -33.87, lon: 151.21 }, Date.UTC(2024, 3, 23, 13, 0));
    expect(sydney.find((s) => s.id === polarisIdx)).toBeUndefined();
  });

  it("computes moon illumination near 0 on new moon (2024-04-08) and near 1 on full moon (2024-04-23)", () => {
    const place = { lat: 51.51, lon: -0.13 };
    expect(moonSky(place, Date.UTC(2024, 3, 8, 18, 20)).lit).toBeLessThan(0.05);
    expect(moonSky(place, Date.UTC(2024, 3, 23, 23, 49)).lit).toBeGreaterThan(0.95);
  });
});

describe("skyVisibility & rasterizeSky (conditions 6.3)", () => {
  it("returns 0 visibility at dawn/day and in fog/rain/storm/snow, and dims under cloud", () => {
    expect(skyVisibility("clear", "night")).toBe(1);
    expect(skyVisibility("clear", "dusk")).toBe(0.5);
    expect(skyVisibility("cloud", "night")).toBeCloseTo(0.35);
    expect(skyVisibility("fog", "night")).toBe(0);
    expect(skyVisibility("rain", "night")).toBe(0);
    expect(skyVisibility("storm", "night")).toBe(0);
    expect(skyVisibility("snow", "night")).toBe(0);
    expect(skyVisibility("clear", "day")).toBe(0);
    expect(skyVisibility("clear", "dawn")).toBe(0);

    const stars = starsAbove({ lat: 51.51, lon: -0.13 }, Date.UTC(2024, 3, 23, 23, 49));
    const moon = { az: 180, alt: 35, lit: 0.95 };
    const low = rasterizeSky(stars, moon, "clear", "night", { low: true });
    expect([low.width, low.height, low.data.length]).toEqual([SKY_LOW_WIDTH, SKY_LOW_HEIGHT, SKY_LOW_WIDTH * SKY_LOW_HEIGHT * 4]);
    expect(low.data.reduce((m, b) => (b > m ? b : m), 0)).toBeGreaterThan(0);

    const hi = rasterizeSky(stars, moon, "fog", "night");
    expect([hi.width, hi.height]).toEqual([SKY_MAX_WIDTH, SKY_MAX_HEIGHT]);
    expect(hi.data.every((b) => b === 0)).toBe(true);
  });
});
