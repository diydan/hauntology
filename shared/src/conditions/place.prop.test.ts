import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { propParams } from "../app/prop-config";
import { normalizeMatches, normalizePlace } from "./place";

const round2 = (x: number): number => Math.round(x * 100) / 100 + 0;
const anyNumber = fc.oneof(fc.double({ min: -400, max: 400, noNaN: true }), fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, 90, -90, 180, -180, 90.004, 180.004));
const junk = fc.dictionary(fc.string({ maxLength: 8 }).filter((k) => !["lat", "lon", "tz", "label"].includes(k) && k !== "__proto__"), fc.oneof(fc.string(), fc.double(), fc.boolean(), fc.constant(null)), { maxKeys: 6 });
const rawPlace = fc.tuple(fc.record({ lat: anyNumber, lon: anyNumber }), junk, fc.oneof(fc.string({ maxLength: 120 }), fc.constant(undefined)), fc.oneof(fc.string({ maxLength: 20 }), fc.constant(null), fc.constant(undefined))).map(([p, extra, label, tz]) => ({ ...extra, ...p, ...(label === undefined ? {} : { label }), ...(tz === undefined ? {} : { tz }) }));

/**
 * Property 1: A Place keeps only a position rounded to two decimals.
 * Validates: Requirements 1.1, 1.3.
 */
describe("Property 1: a Place keeps only a position rounded to two decimals", () => {
  it("normalizePlace returns a refusal, or a Place with only lat, lon, tz and label, the position rounded and inside its ranges", () => {
    fc.assert(
      fc.property(rawPlace, (input) => {
        const r = normalizePlace(input);
        const inside = Number.isFinite(input.lat) && Number.isFinite(input.lon) && Math.abs(input.lat) <= 90 && Math.abs(input.lon) <= 180;
        if (!inside) return r.ok === false && r.code === "bad_place";
        if (!r.ok) return false;
        const p = r.place;
        return (
          Object.keys(p).sort().join() === "label,lat,lon,tz" &&
          p.lat === round2(input.lat) && p.lon === round2(input.lon) &&
          Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 &&
          p.label.length >= 1 && p.label.length <= 80
        );
      }),
      propParams(),
    );
  });

  it("no unrounded coordinate appears anywhere in the serialisation, whatever extra fields came with it", () => {
    // positions with five decimals, so that the unrounded text is always longer than the rounded one
    const fine = (lo: number, hi: number) => fc.integer({ min: lo * 100_000, max: hi * 100_000 }).map((n) => n / 100_000);
    fc.assert(
      fc.property(fine(-89, 89), fine(-179, 179), junk, (lat, lon, extra) => {
        const text = JSON.stringify(normalizePlace({ ...extra, lat, lon, accuracy: lat, altitude: lon, timestamp: lat }));
        const leaks = (x: number) => x !== round2(x) && text.includes(String(x));
        return !leaks(lat) && !leaks(lon);
      }),
      propParams(),
    );
  });

  it("normalizeMatches returns at most five Places for any list, each with only those four fields", () => {
    fc.assert(
      fc.property(fc.array(rawPlace, { maxLength: 20 }), (list) => {
        const got = normalizeMatches(list);
        expect(got.length).toBeLessThanOrEqual(5);
        for (const p of got) expect(Object.keys(p).sort().join()).toBe("label,lat,lon,tz");
        return true;
      }),
      propParams(),
    );
  });
});
