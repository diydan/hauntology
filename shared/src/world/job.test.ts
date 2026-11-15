import { describe, expect, it } from "vitest";
import { BACKOFF_MAX_MS, DEFAULT_TIMING, JITTER, JOB_TIMEOUT_MS, POLL_MS, backoffDelay, isFinished, jobReducer, jobStart, pollDelay, type JobData, type JobEvent, type JobTiming } from "./job";

const T0 = 1_800_000_000_000;
const mid = () => 0.5; // no jitter
const run = (job: JobData, event: JobEvent, now = T0, rnd = mid, timing?: JobTiming) => jobReducer(job, event, now, rnd, timing);
const at = (status: JobData["status"], over: Partial<JobData> = {}): JobData => ({ status, startedAt: T0, strikes: 0, ...(status !== "queued" ? { operationId: "op-1" } : {}), ...over });

describe("jobStart", () => {
  it("is queued with no operation", () => {
    expect(jobStart(T0)).toEqual({ status: "queued", startedAt: T0, strikes: 0 });
  });
});

describe("the happy path", () => {
  it("goes queued, generating, ingesting, ready, and commits once", () => {
    let step = run(jobStart(T0), { t: "started", operationId: "op-1" });
    expect(step.job).toMatchObject({ status: "generating", operationId: "op-1" });
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + POLL_MS }]);
    step = run(step.job, { t: "poll_pending" }, T0 + 10_000);
    expect(step.job.status).toBe("generating");
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 20_000 }]);
    step = run(step.job, { t: "poll_done" }, T0 + 20_000);
    expect(step.job.status).toBe("ingesting");
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 20_000 }]); // ingest now
    step = run(step.job, { t: "ingest_ok" }, T0 + 21_000);
    expect(step.job.status).toBe("ready");
    expect(step.effects).toEqual([{ t: "commit" }]);
  });
});

describe("failure", () => {
  it("fails on a timeout from any unfinished state, releasing once", () => {
    for (const status of ["queued", "generating", "ingesting"] as const) {
      const step = run(at(status), { t: "timeout" }, T0 + JOB_TIMEOUT_MS);
      expect(step.job).toMatchObject({ status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
      expect(step.effects).toEqual([{ t: "release" }]);
    }
  });

  it("fails as out of credits on a 402, releases and trips the kill switch, and does not offer a retry", () => {
    for (const status of ["queued", "generating"] as const) {
      const step = run(at(status), { t: "upstream_error", status: 402 });
      expect(step.job).toMatchObject({ status: "failed", failure: { code: "upstream_no_credits", retryAllowed: false } });
      expect(step.effects).toEqual([{ t: "release" }, { t: "tripKill" }]);
    }
  });

  it("fails as rejected on any other client error, releasing and not tripping the switch", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 499]) {
      const step = run(at("generating"), { t: "upstream_error", status });
      expect(step.job).toMatchObject({ status: "failed", failure: { code: "upstream_rejected", retryAllowed: false } });
      expect(step.effects).toEqual([{ t: "release" }]);
    }
  });

  it("fails an ingest that the world service refuses as ingest_failed, with a retry offered", () => {
    const step = run(at("ingesting"), { t: "upstream_error", status: 404 });
    expect(step.job).toMatchObject({ status: "failed", failure: { code: "ingest_failed", retryAllowed: true } });
    expect(step.effects).toEqual([{ t: "release" }]);
  });

  it("fails on ingest_failed with the code it was given, and releases", () => {
    const step = run(at("ingesting"), { t: "ingest_failed", code: "ingest_failed" });
    expect(step.job).toMatchObject({ status: "failed", failure: { code: "ingest_failed", quotaReturned: true, retryAllowed: true } });
    expect(step.effects).toEqual([{ t: "release" }]);
  });
});

describe("waiting", () => {
  it("waits longer each time in a row on a rate limit, and starts over after a good answer", () => {
    let step = run(at("generating"), { t: "rate_limited" });
    expect(step.job.strikes).toBe(1);
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 20_000 }]);
    step = run(step.job, { t: "rate_limited" });
    expect(step.job.strikes).toBe(2);
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 40_000 }]);
    step = run(step.job, { t: "poll_pending" });
    expect(step.job.strikes).toBe(0);
  });

  it("never waits longer than the ceiling, and honours a longer Retry-After", () => {
    expect(backoffDelay(30, DEFAULT_TIMING, mid)).toBe(BACKOFF_MAX_MS);
    const step = run(at("generating"), { t: "rate_limited", retryAfterMs: 90_000 });
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 90_000 }]);
    const short = run(at("generating"), { t: "rate_limited", retryAfterMs: 1000 });
    expect(short.effects).toEqual([{ t: "scheduleNext", at: T0 + 20_000 }]);
  });

  it("treats a 429, a 408 and a server fault as waiting, not failing", () => {
    for (const status of [429, 408, 500, 502, 503, 504, 0]) {
      const step = run(at("generating"), { t: "upstream_error", status });
      expect(step.job.status, String(status)).toBe("generating");
      expect(step.job.strikes).toBe(1);
      expect(step.effects[0]).toMatchObject({ t: "scheduleNext" });
    }
  });

  it("keeps trying to make the operation while queued", () => {
    const step = run(at("queued"), { t: "rate_limited" });
    expect(step.job.status).toBe("queued");
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 20_000 }]);
  });

  it("never schedules a wake after the 20-minute deadline", () => {
    const late = T0 + JOB_TIMEOUT_MS - 1000;
    const step = run(at("generating", { strikes: 5 }), { t: "rate_limited" }, late);
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + JOB_TIMEOUT_MS }]);
    const pending = run(at("generating"), { t: "poll_pending" }, late);
    expect(pending.effects).toEqual([{ t: "scheduleNext", at: T0 + JOB_TIMEOUT_MS }]);
  });

  it("wakes at once when the deadline has already passed, so the timeout can be recorded", () => {
    const step = run(at("generating"), { t: "poll_pending" }, T0 + JOB_TIMEOUT_MS + 5000);
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + JOB_TIMEOUT_MS + 5000 }]);
  });
});

describe("a finished job", () => {
  const events: JobEvent[] = [
    { t: "started", operationId: "x" }, { t: "poll_pending" }, { t: "poll_done" }, { t: "rate_limited" }, { t: "upstream_error", status: 402 },
    { t: "upstream_error", status: 500 }, { t: "ingest_ok" }, { t: "ingest_failed", code: "ingest_failed" }, { t: "timeout" },
  ];

  it("ignores every later event, with no effect, so the ticket is settled once", () => {
    for (const status of ["ready", "failed"] as const) {
      const job: JobData = { ...at(status), ...(status === "failed" ? { failure: { code: "timeout" as const, quotaReturned: true as const, retryAllowed: true } } : {}) };
      for (const e of events) {
        const step = run(job, e);
        expect(step.job, `${status} ${e.t}`).toBe(job);
        expect(step.effects).toEqual([]);
      }
      expect(isFinished(job)).toBe(true);
    }
  });

  it("is not finished while queued, generating or ingesting", () => {
    for (const status of ["queued", "generating", "ingesting"] as const) expect(isFinished(at(status))).toBe(false);
  });
});

describe("events that do not fit the state", () => {
  it("are ignored without a change", () => {
    const cases: [JobData, JobEvent][] = [
      [at("queued"), { t: "poll_pending" }], [at("queued"), { t: "poll_done" }], [at("queued"), { t: "ingest_ok" }],
      [at("generating"), { t: "started", operationId: "again" }], [at("generating"), { t: "ingest_ok" }], [at("generating"), { t: "ingest_failed", code: "ingest_failed" }],
      [at("ingesting"), { t: "started", operationId: "again" }], [at("ingesting"), { t: "poll_pending" }], [at("ingesting"), { t: "poll_done" }],
    ];
    for (const [job, e] of cases) {
      const step = run(job, e);
      expect(step.job, `${job.status} ${e.t}`).toBe(job);
      expect(step.effects).toEqual([]);
    }
  });
});

describe("delays", () => {
  it("spreads the poll delay by 20 percent either way", () => {
    expect(pollDelay(DEFAULT_TIMING, () => 0)).toBe(Math.round(POLL_MS * (1 - JITTER)));
    expect(pollDelay(DEFAULT_TIMING, () => 0.5)).toBe(POLL_MS);
    expect(pollDelay(DEFAULT_TIMING, () => 0.999999)).toBe(Math.round(POLL_MS * (1 + JITTER * 0.999998)));
  });

  it("doubles from the poll delay up to the ceiling", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, DEFAULT_TIMING, mid))).toEqual([20_000, 40_000, 80_000, 120_000, 120_000, 120_000]);
    expect(backoffDelay(0, DEFAULT_TIMING, mid)).toBe(20_000); // strikes below 1 count as 1
  });

  it("uses the timing it is given", () => {
    const fast: JobTiming = { timeoutMs: 5000, pollMs: 100, backoffMaxMs: 400 };
    const step = jobReducer(jobStart(T0), { t: "started", operationId: "o" }, T0, mid, fast);
    expect(step.effects).toEqual([{ t: "scheduleNext", at: T0 + 100 }]);
    const late = jobReducer(step.job, { t: "poll_pending" }, T0 + 4950, mid, fast);
    expect(late.effects).toEqual([{ t: "scheduleNext", at: T0 + 5000 }]);
  });
});
