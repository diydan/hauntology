import { describe, expect, it } from "vitest";
import { readCaptureDate } from "./exif";
import { jpegWithExif } from "./exif.fixture";

const TODAY = new Date(2026, 10, 15, 12);

describe("readCaptureDate", () => {
  it("reads the DateTimeOriginal of a JPEG, little-endian and big-endian, with a Time of Day from the hour", () => {
    for (const order of ["II", "MM"] as const) {
      expect(readCaptureDate(jpegWithExif({ order, original: "1987:06:21 06:40:00" }), TODAY), order).toEqual({ date: "1987-06-21", timeOfDay: "dawn" });
      expect(readCaptureDate(jpegWithExif({ order, original: "2001:09:09 13:00:00" }), TODAY)).toEqual({ date: "2001-09-09", timeOfDay: "day" });
      expect(readCaptureDate(jpegWithExif({ order, original: "2010:12:24 19:15:59" }), TODAY)).toEqual({ date: "2010-12-24", timeOfDay: "dusk" });
      expect(readCaptureDate(jpegWithExif({ order, original: "1999:10:31 23:30:00" }), TODAY)).toEqual({ date: "1999-10-31", timeOfDay: "night" });
    }
  });

  it("returns only a date and a Time of Day, and reads no other date, location or camera field", () => {
    const bytes = jpegWithExif({
      original: "1987:06:21 06:40:00", digitized: "2020:01:02 03:04:05", modified: "2021:02:03 04:05:06",
      gpsDate: "2019:07:08", make: "Acme", model: "Cam 9", serial: "SN-12345", gps: true,
    });
    const r = readCaptureDate(bytes, TODAY);
    expect(r).toEqual({ date: "1987-06-21", timeOfDay: "dawn" });
    expect(Object.keys(r!).sort()).toEqual(["date", "timeOfDay"]);
  });

  it("gives nothing when there is no DateTimeOriginal, even if other dates are there", () => {
    expect(readCaptureDate(jpegWithExif({ digitized: "2020:01:02 03:04:05", modified: "2021:02:03 04:05:06", gpsDate: "2019:07:08" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({}), TODAY)).toBeUndefined();
  });

  it("gives nothing for a date before 1940 or from today on, and takes the first and last allowed days", () => {
    expect(readCaptureDate(jpegWithExif({ original: "1939:12:31 12:00:00" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "2026:11:15 12:00:00" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "2030:01:01 12:00:00" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1940:01:01 12:00:00" }), TODAY)).toEqual({ date: "1940-01-01", timeOfDay: "day" });
    expect(readCaptureDate(jpegWithExif({ original: "2026:11:14 12:00:00" }), TODAY)).toEqual({ date: "2026-11-14", timeOfDay: "day" });
  });

  it("gives nothing for a date or time that is not real, or a tag that is not a 20 byte date", () => {
    for (const bad of ["0000:00:00 00:00:00", "2020:13:01 12:00:00", "2020:02:30 12:00:00", "2020:01:01 24:00:00", "2020:01:01 12:60:00", "2020-01-01 12:00:00", "abcd:ef:gh ij:kl:mn", "2020:01:01T12:00:00"]) {
      expect(readCaptureDate(jpegWithExif({ original: bad }), TODAY), bad).toBeUndefined();
    }
    expect(readCaptureDate(jpegWithExif({ original: "2020:01:01 12:00:00", originalCount: 19 }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "2020:01:01 12:00:00", originalType: 3 }), TODAY)).toBeUndefined();
  });

  it("gives nothing, and does not throw, for bytes that are not a JPEG with EXIF", () => {
    const samples: Uint8Array[] = [
      new Uint8Array(), new Uint8Array([0xff]), new Uint8Array([0xff, 0xd8]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), new TextEncoder().encode("not a picture at all"),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x02]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45, 0x78]),
    ];
    for (const s of samples) expect(readCaptureDate(s, TODAY)).toBeUndefined();
  });

  it("finds the EXIF segment after other segments, and stops at the image data", () => {
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", leading: true }), TODAY)).toEqual({ date: "1990-05-05", timeOfDay: "day" });
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", exifAfterScan: true }), TODAY)).toBeUndefined();
  });

  it("needs the start of a JPEG, an Exif header, a byte order mark and the magic number 42", () => {
    const good = jpegWithExif({ original: "1990:05:05 09:00:00" });
    expect(readCaptureDate(good, TODAY)).toBeDefined();
    const notStart = Uint8Array.from(good);
    notStart[1] = 0xd9;
    expect(readCaptureDate(notStart, TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", header: [0x58, 0x4d, 0x50, 0, 0, 0] }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", header: [0x45, 0x78, 0x69, 0x66, 0, 1] }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", header: [0x45, 0x78, 0x69, 0x66, 1, 0] }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", orderMark: "XX" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", orderMark: "MI" }), TODAY)).toBeUndefined();
    // Big-endian data under a mark that is neither II nor MM is refused, not guessed.
    expect(readCaptureDate(jpegWithExif({ order: "MM", original: "1990:05:05 09:00:00", orderMark: "XX" }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ order: "MM", original: "1990:05:05 09:00:00" }), TODAY)).toBeDefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", magic: 43 }), TODAY)).toBeUndefined();
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", exifPointerType: 3 }), TODAY)).toBeUndefined();
  });

  it("reads nothing that lies outside its own EXIF block, even if the file goes on", () => {
    // Declared ends that cut into the Exif directory (a long cut) or into the date itself (a short one).
    for (const declaredShort of [5, 12, 30, 60]) {
      expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", declaredShort }), TODAY), String(declaredShort)).toBeUndefined();
    }
    expect(readCaptureDate(jpegWithExif({ original: "1990:05:05 09:00:00", declaredShort: 0 }), TODAY)).toBeDefined();
  });

  it("reads a date up to a quarter of a million bytes into the file only as far as the first segments", () => {
    const big = jpegWithExif({ original: "1990:05:05 09:00:00", trailing: 250_000 });
    expect(readCaptureDate(big, TODAY)).toEqual({ date: "1990-05-05", timeOfDay: "day" });
  });
});
