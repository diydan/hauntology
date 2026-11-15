import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { JOB_TIMEOUT_MS, isFinished, jobReducer, jobStart, type JobEffect, type JobEvent } from "./job";

const T0 = 1_800_000_000_000;

const event: fc.Arbitrary<JobEvent> = fc.oneof(
  fc.record({ t: fc.constant("started" as const), operationId: fc.constantFrom("op-1", "op-2") }),
  fc.constant({ t: "poll_pending" as const }),
  fc.constant({ t: "poll_done" as const }),
  fc.constant({ t: "rate_limited" as const }),
  fc.record({ t: fc.constant("rate_limited" as const), retryAfterMs: fc.integer({ min: 0, max: 300_000 }) }),
  fc.record({ t: fc.constant("upstream_error" as const), status: fc.constantFrom(0, 400, 402, 404, 408, 422, 429, 500, 503) }),
  fc.constant({ t: "ingest_ok" as const }),
  fc.constant({ t: "ingest_failed" as const, code: "ingest_failed" as const }),
  fc.constant({ t: "timeout" as const }),
);

const EDGES = new Set(["ready>ready", "failed>failed", "queued>queued", "queued>generating", "queued>failed", "generating>generating", "generating>ingesting", "generating>failed", "ingesting>ingesting", "ingesting>ready", "ingesting>failed"]);

/** Property 9: the job state machine is safe. */
describe("Property 9: job state machine is safe", () => {
  it("follows only the allowed edges, finishes for good, and settles its ticket exactly once", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ e: event, dt: fc.integer({ min: 0, max: 400_000 }), r: fc.double({ min: 0, max: 0.999999, noNaN: true }) }), { maxLength: 40 }), (steps) => {
        let job = jobStart(T0);
        let now = T0;
        const all: JobEffect[] = [];
        for (const { e, dt, r } of steps) {
          now += dt;
          const before = job;
          const step = jobReducer(job, e, now, () => r);
          expect(EDGES.has(`${before.status}>${step.job.status}`), `${before.status} > ${step.job.status} on ${e.t}`).toBe(true);
          if (isFinished(before)) {
            expect(step.job).toBe(before); // absorbing
            expect(step.effects).toEqual([]);
          }
          for (const f of step.effects) if (f.t === "scheduleNext") expect(f.at).toBeLessThanOrEqual(Math.max(now, before.startedAt + JOB_TIMEOUT_MS));
          all.push(...step.effects);
          job = step.job;
        }
        const count = (t: JobEffect["t"]) => all.filter((f) => f.t === t).length;
        if (job.status === "ready") { expect(count("commit")).toBe(1); expect(count("release")).toBe(0); }
        else if (job.status === "failed") { expect(count("release")).toBe(1); expect(count("commit")).toBe(0); expect(job.failure?.quotaReturned).toBe(true); }
        else { expect(count("commit") + count("release")).toBe(0); }
        expect(count("tripKill")).toBeLessThanOrEqual(1);
        if (count("tripKill") === 1) expect(job.failure?.code).toBe("upstream_no_credits");
      }),
      propParams(),
    );
  });

  it("fails with a timeout from any unfinished state when the 20 minutes are up", () => {
    fc.assert(
      fc.property(fc.array(event.filter((e) => e.t !== "timeout" && e.t !== "upstream_error" || (e.t === "upstream_error" && (e.status === 408 || e.status >= 500 || e.status === 0 || e.status === 429))), { maxLength: 10 }), (events) => {
        let job = jobStart(T0);
        for (const e of events) {
          const next = jobReducer(job, e, T0 + 1000, () => 0.5);
          if (next.job.status === "ready") return; // finished fine: nothing to time out
          job = next.job;
        }
        const out = jobReducer(job, { t: "timeout" }, T0 + JOB_TIMEOUT_MS, () => 0.5);
        expect(out.job.status).toBe("failed");
        expect(out.job.failure?.code).toBe(job.status === "failed" ? job.failure?.code : "timeout");
        expect(out.effects.filter((f) => f.t === "release").length).toBe(job.status === "failed" ? 0 : 1);
      }),
      propParams(),
    );
  });
});
