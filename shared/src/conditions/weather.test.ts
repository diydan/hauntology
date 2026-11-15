import { describe, expect, it } from "vitest";
import { PARTICLE_CAPS, TEMP_EDGES, WIND_EDGES, particleBudget, tempBand, weatherClassFromCode, windBand } from "./weather";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("weatherClassFromCode", () => {
  it("maps the WMO codes of the design", () => {
    for (const c of [0, 1]) expect(weatherClassFromCode(c), String(c)).toBe("clear");
    for (const c of [2, 3]) expect(weatherClassFromCode(c), String(c)).toBe("cloud");
    for (const c of [45, 48]) expect(weatherClassFromCode(c), String(c)).toBe("fog");
    for (const c of [...range(51, 67), ...range(80, 82)]) expect(weatherClassFromCode(c), String(c)).toBe("rain");
    for (const c of [...range(71, 77), 85, 86]) expect(weatherClassFromCode(c), String(c)).toBe("snow");
    for (const c of [95, 96, 99]) expect(weatherClassFromCode(c), String(c)).toBe("storm");
  });

  it("calls every other value clear: codes that are not in the table, fractions, NaN, null, text", () => {
    for (const c of [4, 10, 44, 46, 50, 68, 69, 70, 78, 79, 83, 84, 87, 90, 94, 97, 98, 100, -1, 2.5, 45.5, 61.5, 71.9, 80.5, 95.5, NaN, Infinity, null, undefined, "61", {}, [] ]) expect(weatherClassFromCode(c), String(c)).toBe("clear");
  });

  it("returns one of the six classes for any whole number", () => {
    const six = new Set(["clear", "cloud", "fog", "rain", "storm", "snow"]);
    for (let c = -5; c < 130; c++) expect(six.has(weatherClassFromCode(c))).toBe(true);
  });
});

describe("tempBand and windBand", () => {
  it("cut at 0, 10, 20 and 28 degrees, with the edge going to the warmer band", () => {
    expect(TEMP_EDGES).toEqual({ freezing: 0, cold: 10, mild: 20, warm: 28 });
    expect([tempBand(-30), tempBand(-0.1), tempBand(0), tempBand(9.9), tempBand(10), tempBand(19.9), tempBand(20), tempBand(27.9), tempBand(28), tempBand(45)]).toEqual(["freezing", "freezing", "cold", "cold", "mild", "mild", "warm", "warm", "hot", "hot"]);
  });

  it("cut at 12 and 29 kilometres an hour", () => {
    expect(WIND_EDGES).toEqual({ calm: 12, breezy: 29 });
    expect([windBand(0), windBand(11.9), windBand(12), windBand(28.9), windBand(29), windBand(120)]).toEqual(["calm", "calm", "breezy", "breezy", "windy", "windy"]);
  });

  it("call a value that is not a number mild and calm", () => {
    for (const v of [null, undefined, NaN, "20", {}]) {
      expect(tempBand(v), String(v)).toBe("mild");
      expect(windBand(v), String(v)).toBe("calm");
    }
  });
});

describe("particleBudget", () => {
  it("is nothing for clear, cloud and fog", () => {
    for (const w of ["clear", "cloud", "fog"] as const) for (const quality of [0, 1, 2, 3]) for (const reducedMotion of [false, true]) expect(particleBudget(w, { quality, reducedMotion })).toBe(0);
  });

  it("is 1200, 400 at quality 1 or lower and 120 under reduced motion, the smallest that applies, for rain, storm and snow", () => {
    expect(PARTICLE_CAPS).toEqual({ normal: 1200, low: 400, reduced: 120 });
    for (const w of ["rain", "storm", "snow"] as const) {
      expect(particleBudget(w, { quality: 2, reducedMotion: false })).toBe(1200);
      expect(particleBudget(w, { quality: 1, reducedMotion: false })).toBe(400);
      expect(particleBudget(w, { quality: 0, reducedMotion: false })).toBe(400);
      expect(particleBudget(w, { quality: 3, reducedMotion: true })).toBe(120);
      expect(particleBudget(w, { quality: 0, reducedMotion: true })).toBe(120);
    }
  });
});
