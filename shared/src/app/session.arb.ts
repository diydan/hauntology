import * as fc from "fast-check";
import { shellFlagsArb } from "./capabilities.arb";
import { worldIdArb } from "./routes.arb";
import { JOB_STATES, STAGES, type JobState, type PollInput, type SessionRecord, type Stage } from "./types";

export const jobStateArb: fc.Arbitrary<JobState> = fc.constantFrom(...JOB_STATES);
export const stageArb: fc.Arbitrary<Stage> = fc.constantFrom(...STAGES);

/** A `GET /api/session` payload. Ids are present or absent, never `undefined`. */
export const sessionRecordArb: fc.Arbitrary<SessionRecord> = fc.record(
  {
    lastWorldId: worldIdArb,
    lastPlayId: worldIdArb,
    ackNotice: fc.boolean(),
    flags: shellFlagsArb,
  },
  { requiredKeys: ["ackNotice", "flags"] },
);

/** A missing or expired Session is `null`. */
export const sessionOrNullArb: fc.Arbitrary<SessionRecord | null> = fc.option(sessionRecordArb, { nil: null, freq: 6 });

const MINUTE = 60_000;

/**
 * Inputs for `pollPlan`: a timeline with the job started first, the last poll after it, and `now` after that.
 * Waits reach past 15 minutes (so `overdue` is reachable) and `now` can be far past the last poll.
 */
export const pollInputArb: fc.Arbitrary<PollInput> = fc
  .record({
    startedAt: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    sinceStart: fc.integer({ min: 0, max: 25 * MINUTE }),
    sincePoll: fc.oneof(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 5 * MINUTE })),
    limitOffset: fc.option(fc.integer({ min: -10_000, max: 60_000 }), { nil: null, freq: 3 }),
    visible: fc.boolean(),
    stage: stageArb,
  })
  .map(({ startedAt, sinceStart, sincePoll, limitOffset, visible, stage }): PollInput => {
    const lastPollAt = startedAt + sinceStart;
    const now = lastPollAt + sincePoll;
    return {
      now,
      lastPollAt,
      visible,
      stage,
      rateLimitedUntil: limitOffset === null ? null : now + limitOffset,
      startedAt,
    };
  });
