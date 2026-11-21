import { describe, expect, it } from "vitest";
import { readDeviceCaps, SPARK_MIN_TEXTURE } from "./capabilities";

const gl = (max: number) => ({ MAX_TEXTURE_SIZE: 3379, getParameter: (p: number) => (p === 3379 ? max : 0) }) as never;

describe("readDeviceCaps (world-viewer 3.2)", () => {
  it("reports WebGL2 and the texture size when the device has them", () => {
    expect(readDeviceCaps({ webgl2: () => gl(8192), coarsePointer: () => false, deviceMemory: 8, hardwareConcurrency: 8 })).toEqual({ mobile: false, memoryGb: 8, cores: 8, maxTexture: 8192, webgl2: true });
  });
  it("sends a device with no WebGL2 context, or a throwing one, to the panorama rung", () => {
    expect(readDeviceCaps({ webgl2: () => null, coarsePointer: () => true })).toEqual({ mobile: true, maxTexture: 0, webgl2: false });
    expect(readDeviceCaps({ webgl2: () => { throw new Error("blocked"); }, coarsePointer: () => false }).webgl2).toBe(false);
  });
  it("sends a device whose textures are too small for the splat data to the panorama rung", () => {
    expect(readDeviceCaps({ webgl2: () => gl(SPARK_MIN_TEXTURE - 1), coarsePointer: () => false }).webgl2).toBe(false);
    expect(readDeviceCaps({ webgl2: () => gl(SPARK_MIN_TEXTURE), coarsePointer: () => false }).webgl2).toBe(true);
  });
  it("leaves out what the browser does not say", () => {
    const c = readDeviceCaps({ webgl2: () => gl(8192), coarsePointer: () => false });
    expect("memoryGb" in c).toBe(false);
    expect("cores" in c).toBe(false);
  });
});
