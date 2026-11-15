import { describe, expect, it } from "vitest";
import { STAGES } from "./types";
import { OVERDUE_LINE, QUOTA_KEPT_LINE, QUOTA_RETURNED_LINE, STAGE_COPY, STAGE_STEPS, quotaLine, stageStep } from "./haunt-copy";

describe("the Stage display copy", () => {
  it("has a label and one line for every Stage, and only for them", () => {
    expect(Object.keys(STAGE_COPY).sort()).toEqual([...STAGES].sort());
    for (const s of STAGES) {
      expect(STAGE_COPY[s].label.length).toBeGreaterThan(2);
      expect(STAGE_COPY[s].line.length).toBeGreaterThan(10);
      expect(STAGE_COPY[s].line).not.toMatch(/\n/);
    }
  });

  it("names the steps queued, dreaming, stitching, ready, in that order, as the visual style does", () => {
    expect([...STAGE_STEPS]).toEqual(["queued", "dreaming", "stitching", "ready"]);
    expect(STAGE_STEPS.map((s) => STAGE_COPY[s].label)).toEqual(["Queued", "Dreaming", "Stitching", "Ready"]);
  });

  it("counts the current step from 1, and has none for a failed place", () => {
    expect(STAGE_STEPS.map(stageStep)).toEqual([1, 2, 3, 4]);
    expect(stageStep("failed")).toBeNull();
  });

  it("promises no time and no money", () => {
    for (const s of STAGES) expect(STAGE_COPY[s].line).not.toMatch(/\d+\s*(second|minute|hour)s?\b.*(exactly|guarantee)|[$€£]/i);
    expect(OVERDUE_LINE).toMatch(/still being made/);
    expect(OVERDUE_LINE).toMatch(/Gallery/);
    expect(OVERDUE_LINE).not.toMatch(/cancel|stopped|failed/i);
  });

  it("says whether the allowance came back, from the API's answer alone", () => {
    expect(quotaLine(true)).toBe(QUOTA_RETURNED_LINE);
    expect(quotaLine(false)).toBe(QUOTA_KEPT_LINE);
    expect(QUOTA_RETURNED_LINE).not.toBe(QUOTA_KEPT_LINE);
    expect(QUOTA_KEPT_LINE).toMatch(/not returned/);
  });
});
