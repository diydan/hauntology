import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { capabilities } from "./capabilities";
import { quotaSnapshotArb, shellFlagsArb } from "./capabilities.arb";
import { propParams } from "./prop-config";
import type { QuotaSnapshot, ShellFlags } from "./types";

const OPEN: ShellFlags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false };
const Q = (world: number, image: number): QuotaSnapshot => ({ world, image, llm: 10, tts: 10, stt: 10, live: 5 });

describe("capabilities", () => {
  it("offers everything when generation is on and quota is left", () => {
    expect(capabilities(Q(2, 4), OPEN)).toEqual({ canDraw: true, canUpload: true, canGallery: true });
  });

  it("names the kill switch first, then the total cap, the day cap, the image quota and the world quota", () => {
    const all: ShellFlags = { worldGenEnabled: false, dayCapReached: true, totalCapReached: true, voiceEnabled: true, liveEnabled: false };
    expect(capabilities(Q(0, 0), all).reason).toBe("kill_switch");
    expect(capabilities(Q(0, 0), { ...all, worldGenEnabled: true }).reason).toBe("total_cap");
    expect(capabilities(Q(0, 0), { ...all, worldGenEnabled: true, totalCapReached: false }).reason).toBe("day_cap");
    expect(capabilities(Q(0, 0), OPEN).reason).toBe("quota_image");
    expect(capabilities(Q(0, 3), OPEN).reason).toBe("quota_world");
  });

  it("keeps uploading when only the image quota is gone", () => {
    expect(capabilities(Q(1, 0), OPEN)).toEqual({ canDraw: false, canUpload: true, canGallery: true, reason: "quota_image" });
  });

  it("turns both off, but never the gallery, with the kill switch on", () => {
    expect(capabilities(Q(5, 5), { ...OPEN, worldGenEnabled: false })).toEqual({
      canDraw: false, canUpload: false, canGallery: true, reason: "kill_switch",
    });
  });

  it("has no reason key at all when nothing is off", () => {
    expect("reason" in capabilities(Q(1, 1), OPEN)).toBe(false);
  });
});

describe("Property 5: Gallery is always available and creation follows quota", () => {
  // Validates: Requirements 1.3, 5.3
  it("holds for any quota snapshot and flags", () => {
    fc.assert(
      fc.property(quotaSnapshotArb, shellFlagsArb, (quota, flags) => {
        const c = capabilities(quota, flags);
        if (c.canGallery !== true) return false;

        // Written out again, not shared with the implementation.
        const uploadOk = flags.worldGenEnabled && !flags.totalCapReached && !flags.dayCapReached && quota.world > 0;
        const drawOk = uploadOk && quota.image > 0;
        if (c.canUpload !== uploadOk || c.canDraw !== drawOk) return false;

        // The design's words: off whenever the kill switch is on or the relevant quota is zero.
        if (!flags.worldGenEnabled && (c.canDraw || c.canUpload)) return false;
        if (quota.world === 0 && (c.canDraw || c.canUpload)) return false;
        if (quota.image === 0 && c.canDraw) return false;

        // A reason exists exactly when something is off, and it is the first true cause.
        const off = !c.canDraw || !c.canUpload;
        if (("reason" in c) !== off) return false;
        if (!off) return true;
        const expected = !flags.worldGenEnabled ? "kill_switch"
          : flags.totalCapReached ? "total_cap"
          : flags.dayCapReached ? "day_cap"
          : quota.image === 0 ? "quota_image"
          : "quota_world";
        return c.reason === expected;
      }),
      propParams(),
    );
  });
});
