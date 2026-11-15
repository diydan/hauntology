import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { timeOfDay } from "./time";

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
