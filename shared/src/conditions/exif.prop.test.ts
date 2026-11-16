import * as fc from "fast-check";
import { describe, it } from "vitest";
import { DEFAULT_SEED, propParams } from "../app/prop-config";
import { readCaptureDate } from "./exif";
import { jpegWithExif, type ExifSpec } from "./exif.fixture";

const TODAY = new Date(2026, 10, 15, 12);

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const dateText = fc
  .record({ y: fc.integer({ min: 1900, max: 2040 }), mo: fc.integer({ min: 0, max: 14 }), d: fc.integer({ min: 0, max: 33 }), h: fc.integer({ min: 0, max: 26 }), mi: fc.integer({ min: 0, max: 62 }), s: fc.integer({ min: 0, max: 62 }) })
  .map(({ y, mo, d, h, mi, s }) => `${pad(y, 4)}:${pad(mo, 2)}:${pad(d, 2)} ${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}`);

const specArb: fc.Arbitrary<ExifSpec> = fc.record(
  {
    order: fc.constantFrom("II" as const, "MM" as const),
    original: dateText,
    digitized: dateText,
    modified: dateText,
    gpsDate: fc.constantFrom("2019:07:08", "1950:01:01", "2025:12:31"),
    make: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !s.includes("\0")),
    model: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !s.includes("\0")),
    serial: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("\0")),
    gps: fc.boolean(),
    leading: fc.boolean(),
  },
  { requiredKeys: [] },
);

/** An independent reading of the rule: the capture date is the original date, if it is a real day from 1940 to yesterday. */
function expected(original: string | undefined): { date: string; timeOfDay: string } | undefined {
  const m = original === undefined ? null : /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(original);
  if (m === null) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59 || s > 59) return undefined;
  const real = new Date(y, mo - 1, d);
  if (real.getFullYear() !== y || real.getMonth() !== mo - 1 || real.getDate() !== d) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (date < "1940-01-01" || date > "2026-11-14") return undefined;
  return { date, timeOfDay: h >= 5 && h <= 7 ? "dawn" : h >= 8 && h <= 17 ? "day" : h >= 18 && h <= 20 ? "dusk" : "night" };
}

describe("Property 9: Photo timestamp reading keeps only the capture date", () => {
  // Validates: Requirements 3.3
  it("returns the DateTimeOriginal's date and Time of Day, or nothing, whatever else the EXIF holds", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const got = readCaptureDate(jpegWithExif(spec), TODAY);
        const want = expected(spec.original);
        if (want === undefined) return got === undefined;
        return got !== undefined && Object.keys(got).sort().join() === "date,timeOfDay" && got.date === want.date && got.timeOfDay === want.timeOfDay;
      }),
      propParams(DEFAULT_SEED, 300),
    );
  });

  it("never throws, and never invents a date, for truncated or corrupt data", () => {
    fc.assert(
      fc.property(specArb, fc.nat(), fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { maxLength: 12 }), fc.boolean(), (spec, cut, flips, truncate) => {
        const bytes = jpegWithExif(spec);
        const damaged = truncate ? bytes.slice(0, cut % (bytes.length + 1)) : Uint8Array.from(bytes);
        for (const [at, value] of flips) if (damaged.length > 0) damaged[at % damaged.length] = value;
        const got = readCaptureDate(damaged, TODAY);
        if (got === undefined) return true;
        // Whatever comes back is a well-formed date in range, with a Time of Day, and only those two fields.
        return Object.keys(got).sort().join() === "date,timeOfDay" && /^\d{4}-\d{2}-\d{2}$/.test(got.date) && got.date >= "1940-01-01" && got.date <= "2026-11-14" && ["dawn", "day", "dusk", "night"].includes(got.timeOfDay);
      }),
      propParams(DEFAULT_SEED, 500),
    );
  });

  it("never throws for any byte sequence, including ones that start like a JPEG", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), fc.boolean(), (raw, jpegLike) => {
        const bytes = jpegLike ? Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...raw]) : raw;
        const got = readCaptureDate(bytes, TODAY);
        return got === undefined || Object.keys(got).sort().join() === "date,timeOfDay";
      }),
      propParams(DEFAULT_SEED, 500),
    );
  });
});
