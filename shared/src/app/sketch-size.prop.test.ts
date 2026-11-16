import * as fc from "fast-check";
import { describe, it } from "vitest";
import { inkCoverage } from "../sketch";
import { DEFAULT_SEED, propParams } from "./prop-config";
import { downscaleSize, inkGate } from "./sketch-size";
import { inkBitmapArb, sketchDimsArb } from "./sketch-size.arb";

describe("Property 8: Sketch downscale preserves shape and never enlarges", () => {
  // Validates: Requirements 2.3
  it("holds for any positive width and height", () => {
    fc.assert(
      fc.property(sketchDimsArb, ({ w, h }) => {
        const out = downscaleSize(w, h);
        const longest = Math.max(w, h);
        const scale = Math.min(1, 512 / longest);

        if (Math.max(out.w, out.h) > 512) return false; // the longest side is at most 512
        if (out.w < 1 || out.h < 1) return false; // at least one pixel each way
        if (out.w > w || out.h > h) return false; // never larger than the input
        if (!Number.isInteger(out.w) || !Number.isInteger(out.h)) return false;
        // Shape kept: each side is within one pixel of the exactly scaled side.
        if (Math.abs(out.w - w * scale) > 1 || Math.abs(out.h - h * scale) > 1) return false;
        // Already small enough: untouched. Otherwise the longest side lands on 512.
        if (longest <= 512) return out.w === w && out.h === h;
        return Math.max(out.w, out.h) === 512;
      }),
      propParams(),
    );
  });
});

describe("Property 11: The ink floor gate matches the server", () => {
  // Validates: Requirements 2.4
  it("enables Make it real exactly when the ink share reaches half a percent", () => {
    fc.assert(
      fc.property(inkBitmapArb, ({ bitmap, inkPixels }) => {
        const total = bitmap.width * bitmap.height;
        const gate = inkGate(bitmap);
        // The share the server's function reports is the one the gate uses.
        if (gate.coverage !== inkCoverage(bitmap)) return false;
        // It is the share of ink pixels that were painted, counted without the code under test.
        if (gate.coverage !== inkPixels / total) return false;
        // The floor, written out as whole pixels so no rounding can hide an off-by-one:
        // ink / total >= 0.005 is the same as 200 * ink >= total.
        return gate.enabled === (200 * inkPixels >= total) && gate.enabled === (gate.coverage >= 0.005);
      }),
      propParams(DEFAULT_SEED, 300),
    );
  });
});
