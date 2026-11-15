import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { isRealDate, lastMemoryDate, validateMemoryDay, weatherRequestFor } from "./memory-day";
import { TIMES_OF_DAY } from "./types";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const text = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
const real = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// dates, real and not, written the one way, plus junk
const dateArb = fc.oneof(
  fc.record({ y: fc.integer({ min: 1900, max: 2040 }), m: fc.integer({ min: 0, max: 13 }), d: fc.integer({ min: 0, max: 32 }) }).map(({ y, m, d }) => text(y, m, d)),
  fc.string({ maxLength: 12 }),
);
const todayArb = fc.record({ y: fc.integer({ min: 1941, max: 2040 }), m: fc.integer({ min: 0, max: 11 }), d: fc.integer({ min: 1, max: 28 }) }).map(({ y, m, d }) => new Date(y, m, d, 12));

/**
 * Property 6: Memory Day stays in range and uses recorded weather.
 * Validates: Requirements 3.1, 3.2.
 */
describe("Property 6: Memory Day stays in range and uses recorded weather", () => {
  it("validateMemoryDay accepts exactly the real calendar dates from 1940-01-01 up to yesterday, and rejects every other string", () => {
    fc.assert(
      fc.property(dateArb, fc.constantFrom(...TIMES_OF_DAY), todayArb, (date, time, today) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const last = text(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate());
        const should = m !== null && real(Number(m[1]), Number(m[2]), Number(m[3])) && date >= "1940-01-01" && date <= last;
        const r = validateMemoryDay(date, time, today);
        return r.ok === should && (r.ok ? r.memoryDay.date === date && r.memoryDay.timeOfDay === time && Object.keys(r.memoryDay).length === 2 : r.code === "bad_memory_day");
      }),
      propParams(),
    );
  });

  it("yesterday is accepted and today is not, for any host date", () => {
    fc.assert(
      fc.property(todayArb, (today) => {
        const last = lastMemoryDate(today);
        const todayText = text(today.getFullYear(), today.getMonth() + 1, today.getDate());
        return validateMemoryDay(last, "day", today).ok === true && validateMemoryDay(todayText, "day", today).ok === false && isRealDate(last);
      }),
      propParams(),
    );
  });

  it("an accepted Memory Day with a Place always makes an archive request for that date, and never a forecast; without one, always a forecast", () => {
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), fc.integer({ min: 1940, max: 2025 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), fc.constantFrom(...TIMES_OF_DAY), (lat, lon, y, mo, d, time) => {
        const day = validateMemoryDay(text(y, mo, d), time, new Date(2026, 10, 15));
        if (!day.ok) return false;
        const withDay = weatherRequestFor({ lat, lon }, day.memoryDay);
        const without = weatherRequestFor({ lat, lon });
        expect(withDay).toMatchObject({ kind: "archive", date: text(y, mo, d) });
        expect(without.kind).toBe("forecast");
        return true;
      }),
      propParams(),
    );
  });
});
