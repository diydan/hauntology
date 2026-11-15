import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { REP_HOUR, localHour, timeOfDay } from "./time";

describe("timeOfDay", () => {
  it("is dawn from 5 to 7, day from 8 to 17, dusk from 18 to 20 and night from 21 to 4", () => {
    const want = (h: number) => (h >= 5 && h <= 7 ? "dawn" : h >= 8 && h <= 17 ? "day" : h >= 18 && h <= 20 ? "dusk" : "night");
    for (let h = 0; h < 24; h++) expect(timeOfDay(h), String(h)).toBe(want(h));
  });

  it("wraps an hour outside 0 to 23 around the clock, and takes the whole hour of a fraction", () => {
    expect([timeOfDay(24), timeOfDay(29), timeOfDay(-1), timeOfDay(-19), timeOfDay(7.9), timeOfDay(17.99)]).toEqual(["night", "dawn", "night", "dawn", "dawn", "day"]);
    fc.assert(fc.property(fc.integer({ min: -1000, max: 1000 }), (h) => timeOfDay(h) === timeOfDay(h + 24)));
  });

  it("is night for anything that is not a finite number", () => {
    for (const h of [NaN, Infinity, -Infinity]) expect(timeOfDay(h)).toBe("night");
  });
});

describe("REP_HOUR", () => {
  it("is the middle of each Time of Day: dawn 6, day 12, dusk 19, night 23, and each sits inside its own Time of Day", () => {
    expect(REP_HOUR).toEqual({ dawn: 6, day: 12, dusk: 19, night: 23 });
    for (const [t, h] of Object.entries(REP_HOUR)) expect(timeOfDay(h), t).toBe(t);
    expect(Object.isFrozen(REP_HOUR)).toBe(true);
  });
});

describe("localHour", () => {
  const noonUtc = Date.UTC(2024, 5, 21, 12, 30); // 21 June 2024, 12:30 UTC

  it("reads the hour at a place from its zone", () => {
    expect(localHour(noonUtc, "UTC")).toBe(12);
    expect(localHour(noonUtc, "Asia/Tokyo")).toBe(21); // UTC+9, no daylight saving
    expect(localHour(noonUtc, "Europe/London")).toBe(13); // British Summer Time
    expect(localHour(noonUtc, "America/New_York")).toBe(8); // EDT
    expect(localHour(noonUtc, "Pacific/Kiritimati")).toBe(2); // UTC+14, the next day
  });

  it("gives hour 0 for midnight, never 24, and counts daylight saving on its own dates", () => {
    expect(localHour(Date.UTC(2024, 0, 1, 0, 0), "UTC")).toBe(0);
    expect(localHour(Date.UTC(2024, 0, 1, 23, 59, 59), "UTC")).toBe(23);
    expect(localHour(Date.UTC(2024, 0, 15, 12), "Europe/London")).toBe(12); // winter: GMT
    expect(localHour(Date.UTC(2024, 6, 15, 12), "Europe/London")).toBe(13); // summer: BST
  });

  it("is null for a zone that is missing or unknown, and for an instant that is not a time, so the caller uses the host's hour", () => {
    for (const tz of [null, undefined, "", "Mars/Olympus", "not a zone"]) expect(localHour(noonUtc, tz), String(tz)).toBeNull();
    for (const t of [NaN, Infinity, -Infinity, 8.64e15 + 1]) expect(localHour(t, "UTC"), String(t)).toBeNull();
  });

  it("is always a whole hour from 0 to 23, or null", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2e12, max: 5e12 }), fc.constantFrom("UTC", "Asia/Kolkata", "America/Sao_Paulo", "Australia/Lord_Howe", "Pacific/Auckland", "Nope/Zone", null), (t, tz) => {
        const h = localHour(t, tz);
        return h === null ? tz === null || tz === "Nope/Zone" : Number.isInteger(h) && h >= 0 && h <= 23;
      }),
    );
  });
});
