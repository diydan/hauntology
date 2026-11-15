import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "./prop-config";
import { jobStateArb, pollInputArb } from "./session.arb";
import { pollPlan, stageOf } from "./stage";
import { JOB_STATES, type PollInput } from "./types";

// The numbers from the design, written out: the tests must not share constants with the code.
const FIFTEEN_MIN = 900_000;

const base: PollInput = { now: 10_000, lastPollAt: 9_000, visible: true, stage: "dreaming", rateLimitedUntil: null, startedAt: 0 };

describe("stageOf", () => {
  it("maps each job state to its label", () => {
    expect(JOB_STATES.map(stageOf)).toEqual(["queued", "dreaming", "stitching", "ready", "failed"]);
  });
});

describe("pollPlan", () => {
  it("polls 3 seconds after the last poll", () => {
    expect(pollPlan(base)).toEqual({ pollAt: 12_000, overdue: false });
  });

  it("waits for the end of a rate limit when that is later", () => {
    expect(pollPlan({ ...base, rateLimitedUntil: 30_000 }).pollAt).toBe(30_000);
    expect(pollPlan({ ...base, rateLimitedUntil: 11_000 }).pollAt).toBe(12_000);
    expect(pollPlan({ ...base, rateLimitedUntil: 12_000 }).pollAt).toBe(12_000);
  });

  it("does not poll while hidden or once the stage is terminal", () => {
    expect(pollPlan({ ...base, visible: false }).pollAt).toBeNull();
    expect(pollPlan({ ...base, stage: "ready" }).pollAt).toBeNull();
    expect(pollPlan({ ...base, stage: "failed" }).pollAt).toBeNull();
  });

  it("flags overdue only after 15 minutes, and not for a finished job", () => {
    expect(pollPlan({ ...base, startedAt: base.now - FIFTEEN_MIN }).overdue).toBe(false);
    expect(pollPlan({ ...base, startedAt: base.now - FIFTEEN_MIN - 1 }).overdue).toBe(true);
    expect(pollPlan({ ...base, startedAt: 0, now: 2 * FIFTEEN_MIN, stage: "ready" }).overdue).toBe(false);
    expect(pollPlan({ ...base, startedAt: 0, now: 2 * FIFTEEN_MIN, visible: false }).overdue).toBe(true);
  });
});

describe("Property 6: Stage mapping and polling plan are safe", () => {
  // Validates: Requirements 4.1, 4.3, 4.4, 4.7, 10.3
  it("maps every job state to its label, and ready is the stage that offers Walk in", () => {
    fc.assert(
      fc.property(jobStateArb, (s) => {
        const expected = { queued: "queued", generating: "dreaming", ingesting: "stitching", ready: "ready", failed: "failed" }[s];
        return stageOf(s) === expected && (stageOf(s) === "ready") === (s === "ready");
      }),
      propParams(),
    );
  });

  it("plans a safe next poll for any timeline", () => {
    fc.assert(
      fc.property(pollInputArb, (p) => {
        const plan = pollPlan(p);
        const terminal = p.stage === "ready" || p.stage === "failed";

        // Hidden or finished: no poll.
        if (!p.visible || terminal) return plan.pollAt === null && (!terminal || !plan.overdue);
        if (plan.pollAt === null) return false;

        // Never sooner than 3 s after the last poll, never before the end of a rate limit.
        if (plan.pollAt < p.lastPollAt + 3000) return false;
        if (p.rateLimitedUntil !== null && plan.pollAt < p.rateLimitedUntil) return false;

        const limitBinds = p.rateLimitedUntil !== null && p.rateLimitedUntil > p.lastPollAt + 3000;
        if (limitBinds) {
          if (plan.pollAt !== p.rateLimitedUntil) return false; // exactly the end of the limit
        } else if (plan.pollAt > p.lastPollAt + 5000) {
          return false; // a change shows within 5 s of the next poll
        }

        // Overdue only after 15 minutes.
        return plan.overdue === (p.now - p.startedAt > FIFTEEN_MIN);
      }),
      propParams(),
    );
  });
});
