import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import type { AssetRef } from "../world/manifest";
import {
  chooseLod,
  initialQuality,
  initialQualityLevel,
  nextQuality,
  RESOLUTION_SCALES,
  QUALITY_MIN_CHANGE_GAP_MS,
  QUALITY_NO_UP_AFTER_DOWN_MS,
  type QualityState,
} from "./quality";
import { QUALITY_MAX, QUALITY_MIN, type DeviceCaps, type QualityLevel } from "./types";
import { finiteDouble } from "./viewer.arb";

describe("Property 8: Quality control obeys its timing rules", () => {
  // Feature: world-viewer, Property 8: Quality control obeys its timing rules
  // Validates: Requirements 5.2
  it("changes by at most one level, keeps the gaps, and never steps up soon after a step down", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ fps: finiteDouble(1, 120), dtMs: fc.integer({ min: 16, max: 2000 }) }), { maxLength: 300 }),
        fc.constantFrom<QualityLevel>(0, 1, 2, 3),
        (samples, startLevel) => {
          let state: QualityState = initialQuality(startLevel);
          let now = 0;
          let lastDownAt: number | null = null;
          let lastChangeAt: number | null = null;
          for (const s of samples) {
            now += s.dtMs;
            const before = state.level;
            const r = nextQuality(state, s.fps, now);
            state = r.state;
            if (r.level !== state.level || r.level < QUALITY_MIN || r.level > QUALITY_MAX) return false;
            if (Math.abs(r.level - before) > 1) return false;
            if (r.level !== before) {
              if (lastChangeAt !== null && now - lastChangeAt < QUALITY_MIN_CHANGE_GAP_MS) return false;
              if (r.level > before && lastDownAt !== null && now - lastDownAt < QUALITY_NO_UP_AFTER_DOWN_MS) return false;
              if (r.level < before) lastDownAt = now;
              lastChangeAt = now;
            }
          }
          return true;
        },
      ),
      propParams(),
    );
  });

  it("steps down to the floor under a sustained low rate and not below", () => {
    let state = initialQuality(3);
    for (let t = 0; t <= 120000; t += 100) state = nextQuality(state, 10, t).state;
    expect(state.level).toBe(0);
    for (let t = 120100; t <= 180000; t += 100) state = nextQuality(state, 10, t).state;
    expect(state.level).toBe(0);
  });

  it("starts a strong desktop at the top level, a weak phone at the bottom, and scales resolution by level", () => {
    expect(initialQualityLevel({ mobile: false, memoryGb: 16, cores: 8, maxTexture: 16384, webgl2: true })).toBe(3);
    expect(initialQualityLevel({ mobile: true, memoryGb: 2, cores: 2, maxTexture: 2048, webgl2: true })).toBe(0);
    expect(initialQualityLevel({ mobile: true, memoryGb: 16, cores: 8, maxTexture: 16384, webgl2: false })).toBe(0);
    expect(RESOLUTION_SCALES[0]).toBeLessThan(RESOLUTION_SCALES[1]);
    expect(RESOLUTION_SCALES[2]).toBeLessThan(RESOLUTION_SCALES[3]);
    expect(RESOLUTION_SCALES[3]).toBe(1);
  });

  it("does not step down on a brief dip", () => {
    let state = initialQuality(3);
    for (let t = 0; t <= 1000; t += 100) state = nextQuality(state, 5, t).state;
    for (let t = 1100; t <= 20000; t += 100) state = nextQuality(state, 60, t).state;
    expect(state.level).toBe(3);
  });
});

const LODS: readonly AssetRef[] = [
  { path: "splat-100k.spz", bytes: 1000, lod: "100k" },
  { path: "splat-150k.spz", bytes: 2200, lod: "150k" },
  { path: "splat-500k.spz", bytes: 5000, lod: "500k" },
  { path: "splat-full.spz", bytes: 20000, lod: "full" },
  { path: "splat.spz", bytes: 9000 },
];
const rank = (r: AssetRef): number => (r.lod === "full" ? 3 : r.lod === "500k" ? 2 : r.lod === "150k" ? 1 : r.lod === "100k" ? 0 : -1);

const capsArb: fc.Arbitrary<Required<DeviceCaps>> = fc.record({
  mobile: fc.boolean(),
  memoryGb: finiteDouble(0.5, 32),
  cores: fc.integer({ min: 1, max: 32 }),
  maxTexture: fc.integer({ min: 1024, max: 16384 }),
  webgl2: fc.boolean(),
});

describe("Property 10: LOD choice is available and monotone", () => {
  // Feature: world-viewer, Property 10: LOD choice is available and monotone
  // Validates: Requirements 1.1
  it("always returns one of the available LODs", () => {
    fc.assert(
      fc.property(capsArb, fc.subarray([...LODS], { minLength: 1 }), (caps, available) => available.includes(chooseLod(caps, available))),
      propParams(),
    );
  });

  it("never gives a more capable device a lower LOD", () => {
    fc.assert(
      fc.property(capsArb, fc.subarray([...LODS], { minLength: 1 }), finiteDouble(0, 16), fc.integer({ min: 0, max: 16 }), fc.integer({ min: 0, max: 8192 }),
        (caps, available, memUp, coreUp, texUp) => {
          const stronger: Required<DeviceCaps> = {
            mobile: false,
            memoryGb: caps.memoryGb + memUp,
            cores: caps.cores + coreUp,
            maxTexture: caps.maxTexture + texUp,
            webgl2: true,
          };
          const weaker: Required<DeviceCaps> = { ...caps, mobile: true };
          return rank(chooseLod(stronger, available)) >= rank(chooseLod(weaker, available));
        }),
      propParams(),
    );
  });

  it("picks 150k for a middling phone, between 100k and 500k", () => {
    expect(chooseLod({ mobile: true, memoryGb: 6, cores: 8, maxTexture: 8192, webgl2: true }, LODS).lod).toBe("150k");
    expect(chooseLod({ mobile: true, memoryGb: 2, cores: 2, maxTexture: 2048, webgl2: true }, LODS).lod).toBe("100k");
  });

  it("picks full for a strong desktop and 100k without WebGL2", () => {
    expect(chooseLod({ mobile: false, memoryGb: 16, cores: 8, maxTexture: 16384, webgl2: true }, LODS).lod).toBe("full");
    expect(chooseLod({ mobile: true, memoryGb: 16, cores: 8, maxTexture: 16384, webgl2: false }, LODS).lod).toBe("100k");
    expect(() => chooseLod({ mobile: false, maxTexture: 4096, webgl2: true }, [])).toThrow(RangeError);
  });
});
