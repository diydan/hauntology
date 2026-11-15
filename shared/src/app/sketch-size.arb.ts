import * as fc from "fast-check";
import type { Bitmap } from "./types";

/** Pixel sizes for `downscaleSize`: ordinary, very thin, already small, and at the limit. */
export const sketchDimsArb: fc.Arbitrary<{ w: number; h: number }> = fc
  .oneof(
    { weight: 4, arbitrary: fc.tuple(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 20_000 })) },
    { weight: 1, arbitrary: fc.tuple(fc.constant(1), fc.integer({ min: 1, max: 20_000 })) },
    { weight: 1, arbitrary: fc.tuple(fc.integer({ min: 1, max: 20_000 }), fc.constant(1)) },
    { weight: 1, arbitrary: fc.tuple(fc.integer({ min: 1, max: 600 }), fc.integer({ min: 1, max: 600 })) },
    { weight: 1, arbitrary: fc.constantFrom<[number, number]>([512, 512], [511, 512], [512, 513], [513, 512], [1, 1]) },
  )
  .map(([w, h]) => ({ w, h }));

export type InkBitmap = {
  bitmap: Bitmap;
  /** Number of ink pixels placed. */
  inkPixels: number;
  /** `inkPixels` divided by the pixel count. */
  coverage: number;
};

/** Ink is opaque black (0,0,0,255) on an opaque white (255,255,255,255) ground. */
function paint(width: number, height: number, inkCount: number, seed: number): InkBitmap {
  const total = width * height;
  const data = new Uint8ClampedArray(total * 4).fill(255);
  // Partial Fisher-Yates over pixel indices, driven by a small seeded generator (mulberry32).
  const order = Uint32Array.from({ length: total }, (_, i) => i);
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < inkCount; i++) {
    const j = i + Math.floor(next() * (total - i));
    const tmp = order[i] as number;
    order[i] = order[j] as number;
    order[j] = tmp;
    const p = (order[i] as number) * 4;
    data[p] = 0;
    data[p + 1] = 0;
    data[p + 2] = 0;
    data[p + 3] = 255;
  }
  return { bitmap: { width, height, data }, inkPixels: inkCount, coverage: inkCount / total };
}

/** Any ink amount from none to full, on small canvases. */
const anyInk: fc.Arbitrary<InkBitmap> = fc
  .record({
    width: fc.integer({ min: 1, max: 48 }),
    height: fc.integer({ min: 1, max: 48 }),
    density: fc.oneof(fc.constant(0), fc.constant(1), fc.double({ min: 0, max: 1, noNaN: true })),
    seed: fc.integer(),
  })
  .map(({ width, height, density, seed }) => paint(width, height, Math.round(density * width * height), seed));

/**
 * Canvases whose pixel count is a multiple of 200, with ink at exactly the floor, one pixel under it
 * or one pixel over it. The floor is 0.5% (world-pipeline Requirement 2.2). At these sizes it is a whole
 * number of pixels (`total / 200`), so the `>=` edge is exact.
 */
const aroundFloor: fc.Arbitrary<InkBitmap> = fc
  .record({
    width: fc.constantFrom(10, 20, 40),
    multiple: fc.integer({ min: 1, max: 12 }),
    delta: fc.constantFrom(-1, 0, 1),
    seed: fc.integer(),
  })
  .map(({ width, multiple, delta, seed }) => {
    const total = 200 * multiple;
    return paint(width, total / width, total / 200 + delta, seed);
  });

export const inkBitmapArb: fc.Arbitrary<InkBitmap> = fc.oneof(
  { weight: 3, arbitrary: anyInk },
  { weight: 2, arbitrary: aroundFloor },
);
