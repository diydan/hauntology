import { describe, expect, it } from "vitest";
import { MIN_MEMORY_DATE, instantFor, isRealDate, lastMemoryDate, validateMemoryDay, weatherRequestFor } from "./memory-day";
import { REP_HOUR } from "./time";

const TODAY = new Date(2026, 10, 15, 9); // 15 November 2026, local

describe("validateMemoryDay", () => {
  it("accepts a real date from 1940-01-01 up to yesterday, with a Time of Day, and keeps only those two fields", () => {
    expect(validateMemoryDay("1940-01-01", "dawn", TODAY)).toEqual({ ok: true, memoryDay: { date: "1940-01-01", timeOfDay: "dawn" } });
    expect(validateMemoryDay("2026-11-14", "night", TODAY)).toEqual({ ok: true, memoryDay: { date: "2026-11-14", timeOfDay: "night" } });
    expect(validateMemoryDay("1985-07-03", "dusk", TODAY)).toMatchObject({ ok: true });
    expect(MIN_MEMORY_DATE).toBe("1940-01-01");
  });

  it("rejects the day before 1940, today, tomorrow and the future", () => {
    for (const d of ["1939-12-31", "1900-01-01", "0001-01-01", "2026-11-15", "2026-11-16", "2027-01-01", "9999-12-31"]) expect(validateMemoryDay(d, "day", TODAY), d).toEqual({ ok: false, code: "bad_memory_day" });
  });

  it("rejects what is not a real calendar date, and every other kind of text or value", () => {
    for (const d of ["2023-02-29", "2023-02-30", "2023-04-31", "2023-13-01", "2023-00-10", "2023-01-00", "2023-1-1", "20230101", "2023/01/01", "2023-01-01T00:00", " 2023-01-01", "", "yesterday", 20230101, null, undefined, {}, ["2023-01-01"]])
      expect(validateMemoryDay(d, "day", TODAY), String(d)).toEqual({ ok: false, code: "bad_memory_day" });
  });

  it("knows a leap day from one that is not", () => {
    expect(validateMemoryDay("2024-02-29", "day", TODAY).ok).toBe(true);
    expect(validateMemoryDay("1900-02-29", "day", TODAY).ok).toBe(false); // 1900 was not a leap year (and is before 1940 anyway)
    expect(isRealDate("1944-02-29")).toBe(true);
    expect(isRealDate("1942-02-29")).toBe(false);
    expect(isRealDate("2000-02-29")).toBe(true);
    expect(isRealDate("2100-02-29")).toBe(false);
    // a year under 100 is that year, not 19xx
    expect(isRealDate("0004-02-29")).toBe(true);
    expect(isRealDate("0050-02-29")).toBe(false);
    expect(isRealDate("0050-06-15")).toBe(true);
    for (const d of ["2023-00-10", "2023-13-01", "2023-01-00", "2023-01-32", "2023-12-32", "2023-04-31"]) expect(isRealDate(d), d).toBe(false);
  });

  it("rejects a Time of Day that is not one of the four", () => {
    for (const t of ["noon", "Day", "", "evening", null, undefined, 12, {}]) expect(validateMemoryDay("2000-05-05", t, TODAY), String(t)).toEqual({ ok: false, code: "bad_memory_day" });
  });

  it("takes yesterday from the host's own calendar, across a month and a year end", () => {
    expect(lastMemoryDate(new Date(2026, 2, 1, 0, 5))).toBe("2026-02-28");
    expect(lastMemoryDate(new Date(2024, 2, 1, 23, 59))).toBe("2024-02-29");
    expect(lastMemoryDate(new Date(2027, 0, 1, 12))).toBe("2026-12-31");
    expect(validateMemoryDay("2026-12-31", "day", new Date(2027, 0, 1)).ok).toBe(true);
    expect(validateMemoryDay("2027-01-01", "day", new Date(2027, 0, 1)).ok).toBe(false);
  });
});

describe("instantFor", () => {
  it("is the date at the middle hour of its Time of Day in local solar time", () => {
    expect(instantFor({ date: "2000-06-15", timeOfDay: "day" }, 0)).toBe(Date.UTC(2000, 5, 15, 12));
    // at 90 degrees east it is 6 hours ahead of Greenwich, so noon there is 06:00 UTC
    expect(instantFor({ date: "2000-06-15", timeOfDay: "day" }, 90)).toBe(Date.UTC(2000, 5, 15, 6));
    // at 90 degrees west it is 6 hours behind, so noon there is 18:00 UTC
    expect(instantFor({ date: "2000-06-15", timeOfDay: "day" }, -90)).toBe(Date.UTC(2000, 5, 15, 18));
    expect(instantFor({ date: "1999-12-31", timeOfDay: "night" }, 0)).toBe(Date.UTC(1999, 11, 31, REP_HOUR.night));
    // a fraction of an hour is kept
    expect(instantFor({ date: "2000-06-15", timeOfDay: "dawn" }, 7.5)).toBe(Date.UTC(2000, 5, 15, 5, 30));
  });

  it("does not turn on a longitude that is not a number", () => {
    expect(instantFor({ date: "2000-06-15", timeOfDay: "day" }, NaN)).toBe(Date.UTC(2000, 5, 15, 12));
  });
});

describe("weatherRequestFor", () => {
  const place = { lat: 51.51, lon: -0.13 };
  it("asks the forecast for a Place alone", () => {
    expect(weatherRequestFor(place)).toEqual({ kind: "forecast", lat: 51.51, lon: -0.13 });
  });
  it("asks the archive, for that date at the hour of its Time of Day, and never the forecast, when a Memory Day is set", () => {
    expect(weatherRequestFor(place, { date: "1999-12-31", timeOfDay: "dusk" })).toEqual({ kind: "archive", lat: 51.51, lon: -0.13, date: "1999-12-31", hour: 19 });
    expect(weatherRequestFor(place, { date: "1999-12-31", timeOfDay: "dawn" })).toMatchObject({ kind: "archive", hour: 6 });
  });
  it("carries only the position and the date: nothing of the label or the zone", () => {
    const r = weatherRequestFor({ ...place, label: "Home", tz: "Europe/London" } as typeof place, { date: "1999-12-31", timeOfDay: "day" });
    expect(Object.keys(r).sort()).toEqual(["date", "hour", "kind", "lat", "lon"]);
  });
});
