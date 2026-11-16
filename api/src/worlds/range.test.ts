import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("reads closed, open and suffix ranges", () => {
    expect(parseRange("bytes=0-3", 10)).toEqual({ kind: "ok", start: 0, end: 3 });
    expect(parseRange("bytes=4-", 10)).toEqual({ kind: "ok", start: 4, end: 9 });
    expect(parseRange("bytes=-4", 10)).toEqual({ kind: "ok", start: 6, end: 9 });
  });

  it("clamps to the file", () => {
    expect(parseRange("bytes=5-999", 10)).toEqual({ kind: "ok", start: 5, end: 9 });
    expect(parseRange("bytes=-999", 10)).toEqual({ kind: "ok", start: 0, end: 9 });
    expect(parseRange("bytes=9-9", 10)).toEqual({ kind: "ok", start: 9, end: 9 });
  });

  it("is unsatisfiable when it starts past the end, or asks for no bytes, or the file is empty", () => {
    expect(parseRange("bytes=10-", 10)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=10-12", 10)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 10)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("is ignored (the whole file) when absent, malformed, multiple, or in another unit", () => {
    for (const h of [undefined, null, "", "bytes=", "bytes=-", "bytes=a-b", "bytes=5-2", "bytes=0-1,3-4", "items=0-1", "bytes 0-1", "bytes=0-1-2", "bytes=99999999999999999999-"]) {
      expect(parseRange(h, 10), String(h)).toEqual({ kind: "none" });
    }
  });

  it("allows spaces around the header", () => {
    expect(parseRange("  bytes=1-2 ", 10)).toEqual({ kind: "ok", start: 1, end: 2 });
  });

  it("never answers a range outside the file, for every small size and every pair of numbers", () => {
    for (let size = 0; size <= 12; size++) {
      for (let a = 0; a <= 14; a++) {
        for (let b = 0; b <= 14; b++) {
          for (const h of [`bytes=${a}-${b}`, `bytes=${a}-`, `bytes=-${b}`]) {
            const r = parseRange(h, size);
            if (r.kind === "ok") {
              expect(r.start, `${h} of ${size}`).toBeGreaterThanOrEqual(0);
              expect(r.start, `${h} of ${size}`).toBeLessThanOrEqual(r.end);
              expect(r.end, `${h} of ${size}`).toBeLessThan(size);
            }
          }
        }
      }
    }
  });
});
