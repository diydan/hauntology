import { describe, expect, it } from "vitest";
import { CUTOUT_MAX_COVERAGE, CUTOUT_MIN_COVERAGE, inspectCutOut } from "./cutout";
import { makeRealPng, makeSketchPng } from "./upload-kit";

describe("inspectCutOut", () => {
  it("accepts a PNG that keeps part of the picture and reports how much", async () => {
    // 64 x 64 with the right half kept: 0.5.
    const png = await makeSketchPng(64, 64, (x) => x >= 32, true);
    const r = await inspectCutOut(png);
    expect(r).toEqual({ ok: true, width: 64, height: 64, coverage: 0.5 });
  });

  it("counts a pixel as kept at alpha 128 and not at 127", async () => {
    const at = (alpha: number) => makeRealPng({ width: 10, height: 10, color: "rgba", pixel: (x) => (x < 5 ? [10, 20, 30, alpha] : [0, 0, 0, 0]) });
    expect(await inspectCutOut(await at(128))).toMatchObject({ ok: true, coverage: 0.5 });
    expect(await inspectCutOut(await at(127))).toEqual({ ok: false, reason: "nothing_kept" });
  });

  it("refuses a picture that was not cut: every pixel opaque, grey or RGB without alpha, or nearly so", async () => {
    expect(await inspectCutOut(await makeRealPng({ width: 16, height: 16, color: "rgb", pixel: () => [200, 10, 10] }))).toEqual({ ok: false, reason: "nothing_removed" });
    expect(await inspectCutOut(await makeRealPng({ width: 16, height: 16, color: "gray", pixel: () => [90] }))).toEqual({ ok: false, reason: "nothing_removed" });
    expect(await inspectCutOut(await makeRealPng({ width: 16, height: 16, color: "rgba", pixel: () => [1, 2, 3, 255] }))).toEqual({ ok: false, reason: "nothing_removed" });
    // 1 pixel in 100 removed is 0.99 kept: the edge is allowed; 1 in 200 is over it.
    const one = (w: number, h: number, hole: number) => makeRealPng({ width: w, height: h, color: "rgba", pixel: (x, y) => (y * w + x < hole ? [0, 0, 0, 0] : [9, 9, 9, 255]) });
    expect(await inspectCutOut(await one(10, 10, 1))).toMatchObject({ ok: true, coverage: 0.99 });
    expect(await inspectCutOut(await one(20, 10, 1))).toEqual({ ok: false, reason: "nothing_removed" });
  });

  it("refuses a picture with nothing left in it", async () => {
    expect(await inspectCutOut(await makeRealPng({ width: 16, height: 16, color: "rgba", pixel: () => [0, 0, 0, 0] }))).toEqual({ ok: false, reason: "nothing_kept" });
    const few = (kept: number) => makeRealPng({ width: 10, height: 10, color: "rgba", pixel: (x, y) => (y * 10 + x < kept ? [9, 9, 9, 255] : [0, 0, 0, 0]) });
    expect(await inspectCutOut(await few(1))).toMatchObject({ ok: true, coverage: 0.01 });
    expect(await inspectCutOut(await makeRealPng({ width: 20, height: 10, color: "rgba", pixel: (x, y) => (y * 20 + x < 1 ? [9, 9, 9, 255] : [0, 0, 0, 0]) }))).toEqual({ ok: false, reason: "nothing_kept" });
  });

  it("reads a palette PNG whose transparency chunk makes the background clear, and refuses what it cannot read", async () => {
    const png = await makeRealPng({ width: 10, height: 10, color: "palette", palette: [[0, 0, 0], [200, 100, 50]], transparency: [0, 255], pixel: (x) => [x < 3 ? 1 : 0] });
    expect(await inspectCutOut(png)).toMatchObject({ ok: true, coverage: 0.3 });
    for (const bytes of [new Uint8Array(0), Uint8Array.from([1, 2, 3]), new Uint8Array(100), Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]) {
      expect(await inspectCutOut(bytes)).toEqual({ ok: false, reason: "unreadable" });
    }
  });

  it("states its limits", () => {
    expect(CUTOUT_MIN_COVERAGE).toBe(0.01);
    expect(CUTOUT_MAX_COVERAGE).toBe(0.99);
  });
});
