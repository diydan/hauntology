import { describe, expect, it } from "vitest";
import { capabilities } from "./capabilities";
import { HOME_FACTS, HOME_PREMISE, REASON_COPY, reasonCopy } from "./home-copy";
import type { CapabilityReason, QuotaSnapshot, ShellFlags } from "./types";

const REASONS: CapabilityReason[] = ["kill_switch", "day_cap", "total_cap", "quota_image", "quota_world"];
const open: ShellFlags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true };
const quota = (world: number, image: number): QuotaSnapshot => ({ world, image, llm: 10, tts: 10, stt: 10, live: 10 });

describe("Home copy", () => {
  it("has a one-line premise", () => {
    expect(HOME_PREMISE.length).toBeGreaterThan(10);
    expect(HOME_PREMISE).not.toMatch(/\n/);
  });

  it("says that worlds are static, that the ghost is a billboard sprite and that photos are deleted after 24 hours", () => {
    const text = HOME_FACTS.join(" ");
    expect(HOME_FACTS).toHaveLength(4);
    expect(text).toMatch(/static/);
    expect(text).toMatch(/billboard sprite/);
    expect(text).toMatch(/deleted after 24 hours/);
  });

  it("says that a place can be solved as a case, alone against Bots, and that wandering is the other way (Requirement 1.1)", () => {
    expect(HOME_PREMISE).toMatch(/\bcase\b/);
    expect(HOME_PREMISE).toMatch(/wander/i);
    expect(HOME_PREMISE).not.toMatch(/\bsingle player\b/i);
    const fact = HOME_FACTS.find((f) => /\bcase\b/.test(f));
    expect(fact).toBeDefined();
    expect(fact).toMatch(/alone/);
    expect(fact).toMatch(/Bots/);
  });

  it("has a line for every reason, and only for them", () => {
    expect(Object.keys(REASON_COPY).sort()).toEqual([...REASONS].sort());
    for (const r of REASONS) {
      expect(reasonCopy(r)).toBe(REASON_COPY[r]);
      expect(REASON_COPY[r].length).toBeGreaterThan(10);
      expect(REASON_COPY[r]).not.toMatch(/\n/);
    }
  });

  it("never promises money, and always points to the Gallery or an upload that still works", () => {
    for (const r of REASONS) {
      expect(REASON_COPY[r]).not.toMatch(/[$€£]|\bcost|\bpay|\bcredit/i);
      expect(REASON_COPY[r]).toMatch(/Gallery/);
    }
  });

  it("covers every reason `capabilities` can give", () => {
    const seen = new Set<CapabilityReason>();
    for (const flags of [open, { ...open, worldGenEnabled: false }, { ...open, dayCapReached: true }, { ...open, totalCapReached: true }]) {
      for (const q of [quota(2, 8), quota(0, 8), quota(2, 0), quota(0, 0)]) {
        const reason = capabilities(q, flags).reason;
        if (reason) seen.add(reason);
      }
    }
    expect([...seen].sort()).toEqual([...REASONS].sort());
    for (const r of seen) expect(REASON_COPY[r]).toBeTruthy();
  });
});
