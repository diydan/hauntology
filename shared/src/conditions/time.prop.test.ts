import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { localHour, timeOfDay } from "./time";

/**
 * Property 2: Every hour maps to exactly one time of day.
 * Validates: Requirements 1.4.
 */
describe("Property 2: every hour maps to exactly one time of day", () => {
  const zones = fc.constantFrom("UTC", "Europe/London", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland", "Australia/Adelaide", "Africa/Cairo");

  it("for any instant and valid zone, the local hour is 0 to 23 and its time of day is exactly one of the four, by the hour bands", () => {
    fc.assert(
      fc.property(fc.integer({ min: -3e12, max: 6e12 }), zones, (t, tz) => {
        const h = localHour(t, tz);
        if (h === null) return false;
        const want = h >= 5 && h <= 7 ? "dawn" : h >= 8 && h <= 17 ? "day" : h >= 18 && h <= 20 ? "dusk" : "night";
        return Number.isInteger(h) && h >= 0 && h <= 23 && timeOfDay(h) === want;
      }),
      propParams(),
    );
  });

  it("each of the 24 hours is in exactly one time of day, and the four are all used", () => {
    const seen = new Map<string, number>();
    for (let h = 0; h < 24; h++) seen.set(timeOfDay(h), (seen.get(timeOfDay(h)) ?? 0) + 1);
    expect([...seen.entries()].sort()).toEqual([["dawn", 3], ["day", 10], ["dusk", 3], ["night", 8]]);
    expect(new Set(seen.keys()).size).toBe(4);
  });

  it("the local hour is the UTC hour moved by the zone's offset: the same instant in UTC and in a fixed-offset zone differ by that offset", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4e12 }), (t) => {
        const utc = localHour(t, "UTC") as number;
        const kolkata = localHour(t, "Asia/Kolkata") as number; // UTC+5:30, no daylight saving
        const tokyo = localHour(t, "Asia/Tokyo") as number; // UTC+9
        expect(tokyo).toBe((utc + 9) % 24);
        // 5:30 ahead is 5 or 6 hours ahead, depending on the minute
        expect([(utc + 5) % 24, (utc + 6) % 24]).toContain(kolkata);
        return true;
      }),
      propParams(),
    );
  });
});
