import { describe, expect, it } from "vitest";
import { SYNODIC_MONTH_DAYS, moonAge, moonPhase } from "./moon";
import { MOON_PHASES } from "./types";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

describe("moonPhase", () => {
  it("names the real phases of April 2024 (new 8 April 18:21 UTC, first quarter 15 April, full 23 April 23:49, last quarter 30 April)", () => {
    expect(moonPhase(at(2024, 4, 8, 18, 21))).toBe("new moon");
    expect(moonPhase(at(2024, 4, 15, 19, 13))).toBe("first quarter");
    expect(moonPhase(at(2024, 4, 23, 23, 49))).toBe("full moon");
    expect(moonPhase(at(2024, 4, 30, 0, 12))).toBe("last quarter");
    // between them
    expect(moonPhase(at(2024, 4, 12))).toBe("waxing crescent");
    expect(moonPhase(at(2024, 4, 19))).toBe("waxing gibbous");
    expect(moonPhase(at(2024, 4, 26, 12))).toBe("waning gibbous");
    expect(moonPhase(at(2024, 5, 3))).toBe("waning crescent");
  });

  it("is within a day of the almanac, as the design says: the new moon is the new moon a day either side and the full moon likewise", () => {
    expect(moonPhase(at(2024, 4, 8, 18, 21) - 20 * 3_600_000)).not.toBe("full moon");
    for (const dh of [-24, 24]) expect(["new moon", "waning crescent", "waxing crescent"]).toContain(moonPhase(at(2024, 4, 8, 18, 21) + dh * 3_600_000));
    for (const dh of [-24, 24]) expect(["full moon", "waxing gibbous", "waning gibbous"]).toContain(moonPhase(at(2024, 4, 23, 23, 49) + dh * 3_600_000));
  });

  it("has age 0 at the reference mean new moon (JD 2451550.1, 6 January 2000, 14:24 UTC) and one mean month later", () => {
    const reference = at(2000, 1, 6, 14, 24);
    expect(moonAge(reference)).toBeLessThan(0.01);
    expect(moonPhase(reference)).toBe("new moon");
    const later = reference + SYNODIC_MONTH_DAYS * 86_400_000 * 100; // a hundred mean months on
    expect(moonAge(later) < 0.05 || moonAge(later) > SYNODIC_MONTH_DAYS - 0.05).toBe(true);
  });

  it("works before 1970 and for a date a Memory Day may hold (1940)", () => {
    for (const t of [at(1940, 1, 1), at(1969, 7, 20, 20, 17), at(1950, 6, 15)]) expect(MOON_PHASES).toContain(moonPhase(t));
  });

  it("is a phase even for an instant that is not a real time", () => {
    for (const t of [NaN, Infinity, -Infinity]) expect(MOON_PHASES).toContain(moonPhase(t));
  });
});

describe("moonAge", () => {
  it("is from 0 up to the mean month, and the mean month is 29.530588853 days", () => {
    expect(SYNODIC_MONTH_DAYS).toBe(29.530588853);
    for (const t of [at(1940, 1, 1), at(2024, 4, 8), at(2060, 12, 31)]) {
      const a = moonAge(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(SYNODIC_MONTH_DAYS);
    }
  });
});
