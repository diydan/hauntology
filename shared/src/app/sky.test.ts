import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConditionsChoiceSchema } from "../conditions/types";
import { DEFAULT_SEED, propParams } from "./prop-config";
import { MEMORY_DAY_MIN, conditionsChoice, isoDate, memoryDayError, memoryDayMax, placeFromMatch, placeFromPosition } from "./sky";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("Memory Day bounds", () => {
  it("is a date from 1940-01-01 up to yesterday, in the visitor's own calendar", () => {
    const today = day(2026, 11, 15);
    expect(MEMORY_DAY_MIN).toBe("1940-01-01");
    expect(memoryDayMax(today)).toBe("2026-11-14");
    expect(memoryDayError("1940-01-01", today)).toBeNull();
    expect(memoryDayError("2026-11-14", today)).toBeNull();
    expect(memoryDayError("1939-12-31", today)).toBe("range");
    expect(memoryDayError("2026-11-15", today)).toBe("range");
    expect(memoryDayError("2030-01-01", today)).toBe("range");
  });

  it("crosses month and year ends and the leap day", () => {
    expect(memoryDayMax(day(2026, 3, 1))).toBe("2026-02-28");
    expect(memoryDayMax(day(2028, 3, 1))).toBe("2028-02-29");
    expect(memoryDayMax(day(2027, 1, 1))).toBe("2026-12-31");
    expect(memoryDayError("2028-02-29", day(2028, 3, 1))).toBeNull();
    expect(memoryDayError("2027-02-29", day(2028, 3, 1))).toBe("format");
  });

  it("is a format error for anything that is not a real calendar day", () => {
    const today = day(2026, 11, 15);
    for (const bad of ["", "2020-1-1", "20-01-01", "2020-13-01", "2020-00-10", "2020-02-30", "2020/01/01", " 2020-01-01", "2020-01-01 ", "2020-01-01T00:00", "abcd-ef-gh", "99999-01-01"]) {
      expect(memoryDayError(bad, today), JSON.stringify(bad)).toBe("format");
    }
  });

  it("agrees with a plain comparison for any real date", () => {
    const today = day(2026, 11, 15);
    fc.assert(
      fc.property(fc.date({ min: new Date(1900, 0, 1), max: new Date(2100, 11, 31), noInvalidDate: true }), (d) => {
        const iso = isoDate(d);
        const err = memoryDayError(iso, today);
        const inside = iso >= "1940-01-01" && iso <= "2026-11-14";
        return inside ? err === null : err === "range";
      }),
      propParams(DEFAULT_SEED),
    );
  });

  it("formats a date with zero padding", () => {
    const early = new Date(2000, 2, 9, 12);
    early.setFullYear(5);
    expect(isoDate(early)).toBe("0005-03-09");
    expect(isoDate(day(2026, 1, 2))).toBe("2026-01-02");
  });
});

describe("places", () => {
  it("keeps a searched place to two decimals, and its label and time zone", () => {
    expect(placeFromMatch({ label: "Lyon, France", lat: 45.7640001, lon: 4.8357, tz: "Europe/Paris" })).toEqual({ lat: 45.76, lon: 4.84, label: "Lyon, France", tz: "Europe/Paris" });
    expect(placeFromMatch({ label: "Nowhere", lat: 1, lon: 2, tz: null }).tz).toBeNull();
  });

  it("cuts the visitor's position to two decimals, with no time zone and a fixed label", () => {
    expect(placeFromPosition(51.50735, -0.12776)).toEqual({ lat: 51.51, lon: -0.13, tz: null, label: "Your location" });
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (lat, lon) => {
        const p = placeFromPosition(lat, lon);
        return p.lat === Math.round(p.lat * 100) / 100 && p.lon === Math.round(p.lon * 100) / 100 && Math.abs(p.lat - lat) <= 0.005 + 1e-9 && Math.abs(p.lon - lon) <= 0.005 + 1e-9;
      }),
      propParams(DEFAULT_SEED),
    );
  });
});

describe("conditionsChoice", () => {
  it("is nothing at all when the visitor chose nothing, so the default sky applies", () => {
    expect(conditionsChoice({ hostHour: 14 })).toBeUndefined();
  });

  it("carries only what was chosen, with the visitor's own hour", () => {
    const place = placeFromPosition(10, 20);
    expect(conditionsChoice({ place, hostHour: 9 })).toEqual({ place, hostHour: 9 });
    expect(conditionsChoice({ memoryDay: { date: "1999-10-31", timeOfDay: "dusk" }, hostHour: 23 })).toEqual({ memoryDay: { date: "1999-10-31", timeOfDay: "dusk" }, hostHour: 23 });
    expect(Object.keys(conditionsChoice({ place, memoryDay: { date: "1999-10-31", timeOfDay: "night" }, hostHour: 0 })!).sort()).toEqual(["hostHour", "memoryDay", "place"]);
  });

  it("keeps the hour a whole number from 0 to 23, and always fits the conditions schema", () => {
    const place = placeFromPosition(10, 20);
    for (const [given, want] of [[-3, 0], [24, 23], [99, 23], [7.9, 7], [0, 0], [23, 23]] as const) expect(conditionsChoice({ place, hostHour: given })!.hostHour).toBe(want);
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (h, lat, lon) => {
        return ConditionsChoiceSchema.safeParse(conditionsChoice({ place: placeFromPosition(lat, lon), hostHour: h })).success;
      }),
      propParams(DEFAULT_SEED),
    );
  });
});
