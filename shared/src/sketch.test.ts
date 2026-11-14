import { describe, expect, it } from "vitest";
import { INK_FLOOR, inkCoverage, type Bitmap } from "./sketch";

const px = (r: number, g: number, b: number, a: number) => [r, g, b, a];
const bitmap = (width: number, height: number, pixels: number[][]): Bitmap => ({
  width, height, data: Uint8ClampedArray.from(pixels.flat()),
});

describe("INK_FLOOR", () => {
  it("is half a percent", () => {
    expect(INK_FLOOR).toBe(0.005);
  });
});

describe("inkCoverage", () => {
  it("counts black strokes on a white page", () => {
    const b = bitmap(2, 2, [px(0, 0, 0, 255), px(255, 255, 255, 255), px(255, 255, 255, 255), px(255, 255, 255, 255)]);
    expect(inkCoverage(b)).toBe(0.25);
  });

  it("counts dark strokes on a transparent page, and ignores the transparent pixels", () => {
    const b = bitmap(2, 1, [px(0, 0, 0, 255), px(0, 0, 0, 0)]);
    expect(inkCoverage(b)).toBe(0.5);
  });

  it("does not count white, light grey or faint ink", () => {
    const b = bitmap(4, 1, [px(255, 255, 255, 255), px(200, 200, 200, 255), px(0, 0, 0, 127), px(130, 130, 130, 255)]);
    expect(inkCoverage(b)).toBe(0);
  });

  it("counts mid-dark grey and the alpha edge", () => {
    const b = bitmap(2, 1, [px(100, 100, 100, 255), px(0, 0, 0, 128)]);
    expect(inkCoverage(b)).toBe(1);
  });

  it("is 1 for solid ink and 0 for an empty page", () => {
    expect(inkCoverage(bitmap(1, 2, [px(0, 0, 0, 255), px(0, 0, 0, 255)]))).toBe(1);
    expect(inkCoverage({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(0);
  });

  it("counts a bitmap whose data does not match its size as blank", () => {
    expect(inkCoverage({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toBe(0);
    expect(inkCoverage({ width: 1.5, height: 2, data: new Uint8ClampedArray(12) })).toBe(0);
    expect(inkCoverage({ width: -1, height: -1, data: new Uint8ClampedArray(4) })).toBe(0);
  });
});
