import { describe, expect, it } from "vitest";
import { downscaleSize, inkGate } from "./sketch-size";
import type { Bitmap } from "./types";

describe("downscaleSize", () => {
  it("shrinks the longest side to 512 and keeps the shape", () => {
    expect(downscaleSize(1024, 512)).toEqual({ w: 512, h: 256 });
    expect(downscaleSize(512, 2048)).toEqual({ w: 128, h: 512 });
    expect(downscaleSize(1000, 750)).toEqual({ w: 512, h: 384 });
  });

  it("never enlarges", () => {
    expect(downscaleSize(300, 200)).toEqual({ w: 300, h: 200 });
    expect(downscaleSize(512, 512)).toEqual({ w: 512, h: 512 });
    expect(downscaleSize(1, 1)).toEqual({ w: 1, h: 1 });
  });

  it("keeps at least one pixel on the short side", () => {
    expect(downscaleSize(20_000, 1)).toEqual({ w: 512, h: 1 });
    expect(downscaleSize(1, 20_000)).toEqual({ w: 1, h: 512 });
  });

  it("takes a different limit", () => {
    expect(downscaleSize(400, 200, 100)).toEqual({ w: 100, h: 50 });
  });

  it("falls back to 1 pixel for a size that is not a positive number", () => {
    expect(downscaleSize(0, 0)).toEqual({ w: 1, h: 1 });
    expect(downscaleSize(Number.NaN, 600)).toEqual({ w: 1, h: 512 });
    expect(downscaleSize(-5, Number.POSITIVE_INFINITY)).toEqual({ w: 1, h: 1 });
  });
});

describe("inkGate", () => {
  const page = (inkPixels: number, total = 200): Bitmap => {
    const data = new Uint8ClampedArray(total * 4).fill(255);
    for (let i = 0; i < inkPixels; i++) data.fill(0, i * 4, i * 4 + 3);
    return { width: total, height: 1, data };
  };

  it("is off for a blank page and on at exactly half a percent", () => {
    expect(inkGate(page(0))).toEqual({ enabled: false, coverage: 0 });
    expect(inkGate(page(1))).toEqual({ enabled: true, coverage: 0.005 });
    expect(inkGate(page(200)).enabled).toBe(true);
  });

  it("is off just under half a percent", () => {
    expect(inkGate(page(1, 201)).enabled).toBe(false);
    expect(inkGate(page(9, 2000)).enabled).toBe(false);
    expect(inkGate(page(10, 2000)).enabled).toBe(true);
  });
});
