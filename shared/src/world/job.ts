import type { ErrorCode } from "../errors";
import type { JobState } from "../app/types";

/**
 * The world job state machine (world-pipeline design "Job state machine", task 3.12, Requirements 7.2 to 7.6).
 * `queued -> generating -> ingesting -> ready`, and `failed` from any state that is not finished. `ready` and
 * `failed` are absorbing: every later event is ignored, so a ticket is settled exactly once. A job that ends
 * `ready` asks for a commit, one that ends `failed` asks for a release, and none asks for both. Pure: the clock
 * and the random numbers are parameters, and the effects are returned for the caller to run.
 */

export const JOB_TIMEOUT_MS = 20 * 60 * 1000;
export const POLL_MS = 10_000;
export const BACKOFF_MAX_MS = 120_000;
/** The poll delay is spread by up to this share either way, so jobs do not poll in step. */
export const JITTER = 0.2;

export type JobTiming = { timeoutMs: number; pollMs: number; backoffMaxMs: number };
export const DEFAULT_TIMING: JobTiming = { timeoutMs: JOB_TIMEOUT_MS, pollMs: POLL_MS, backoffMaxMs: BACKOFF_MAX_MS };

export type JobFailure = { code: ErrorCode; quotaReturned: true; retryAllowed: boolean };

export type JobData = {
  status: JobState;
  /** When the job started; the 20 minutes run from here. */
  startedAt: number;
  operationId?: string;
  failure?: JobFailure;
  /** Rate limits and transient errors in a row, for the back-off. Reset by a good answer. */
  strikes: number;
};

export type JobEvent =
  | { t: "started"; operationId: string }
  | { t: "poll_pending" }
  | { t: "poll_done" }
  | { t: "rate_limited"; retryAfterMs?: number }
  | { t: "upstream_error"; status: number }
  | { t: "ingest_ok" }
  | { t: "ingest_failed"; code: ErrorCode }
  | { t: "timeout" };

export type JobEffect =
  | { t: "commit" }
  | { t: "release" }
  /** Insufficient credits upstream: stop all new worlds. */
  | { t: "tripKill" }
  /** Wake the job again at this time (epoch milliseconds). */
  | { t: "scheduleNext"; at: number };

export type JobStep = { job: JobData; effects: JobEffect[] };

export const jobStart = (now: number): JobData => ({ status: "queued", startedAt: now, strikes: 0 });
export const isFinished = (job: JobData): boolean => job.status === "ready" || job.status === "failed";

/** A poll delay with jitter. `rnd` is in [0, 1). */
export function pollDelay(timing: JobTiming, rnd: () => number): number {
  return Math.round(timing.pollMs * (1 - JITTER + 2 * JITTER * rnd()));
}

/** The wait after `strikes` rate limits or errors in a row: doubling from the poll delay up to a ceiling, with jitter. */
export function backoffDelay(strikes: number, timing: JobTiming, rnd: () => number): number {
  const base = Math.min(timing.backoffMaxMs, timing.pollMs * 2 ** Math.max(1, strikes));
  return Math.round(base * (1 - JITTER + 2 * JITTER * rnd()));
}

/** Retry is offered for a failure that may not happen again. */
const RETRY: Partial<Record<ErrorCode, boolean>> = { timeout: true, ingest_failed: true, upstream_rejected: false, upstream_no_credits: false };

const fail = (job: JobData, code: ErrorCode, extra: JobEffect[] = []): JobStep => ({
  job: { ...job, status: "failed", failure: { code, quotaReturned: true, retryAllowed: RETRY[code] ?? false } },
  effects: [{ t: "release" }, ...extra],
});

/** How an answer from the world service that is not a success ends the job, or `null` when it only means "try again later". */
function upstreamFailure(status: number, whileIngesting: boolean): { code: ErrorCode; kill: boolean } | null {
  if (status === 402) return { code: "upstream_no_credits", kill: true };
  if (status === 408 || status === 429 || status < 400 || status >= 500) return null;
  return { code: whileIngesting ? "ingest_failed" : "upstream_rejected", kill: false };
}

/**
 * One step. `rnd` gives the jitter. Nothing here reads a clock or the network.
 *
 * - `started` (queued): the operation is made; poll later.
 * - `poll_pending` (generating): poll again later. `poll_done`: the world is made; ingest it.
 * - `rate_limited`, or an upstream error that is a rate limit, a timeout or a server fault: wait, longer each time in a row.
 * - an upstream answer of 402 fails the job as out of credits and trips the kill switch; any other client error fails it.
 * - `ingest_ok` (ingesting): ready, and the unit is kept. `ingest_failed`: failed, and the unit comes back.
 * - `timeout` (any unfinished state): failed, the unit comes back.
 */
export function jobReducer(job: JobData, event: JobEvent, now: number, rnd: () => number, timing: JobTiming = DEFAULT_TIMING): JobStep {
  if (isFinished(job)) return { job, effects: [] };
  if (event.t === "timeout") return fail(job, "timeout");

  const deadline = job.startedAt + timing.timeoutMs;
  const wake = (delay: number): JobEffect => ({ t: "scheduleNext", at: Math.max(now, Math.min(now + Math.max(0, delay), deadline)) });
  const wait = (strikes: number, retryAfterMs?: number): JobStep => ({
    job: { ...job, strikes },
    effects: [wake(Math.max(retryAfterMs ?? 0, backoffDelay(strikes, timing, rnd)))],
  });

  if (event.t === "rate_limited") return wait(job.strikes + 1, event.retryAfterMs);

  if (event.t === "upstream_error") {
    const failure = upstreamFailure(event.status, job.status === "ingesting");
    if (failure === null) return wait(job.strikes + 1, undefined);
    return fail(job, failure.code, failure.kill ? [{ t: "tripKill" }] : []);
  }

  switch (job.status) {
    case "queued":
      if (event.t === "started") return { job: { ...job, status: "generating", operationId: event.operationId, strikes: 0 }, effects: [wake(pollDelay(timing, rnd))] };
      return { job, effects: [] };
    case "generating":
      if (event.t === "poll_pending") return { job: { ...job, strikes: 0 }, effects: [wake(pollDelay(timing, rnd))] };
      if (event.t === "poll_done") return { job: { ...job, status: "ingesting", strikes: 0 }, effects: [{ t: "scheduleNext", at: now }] };
      return { job, effects: [] };
    case "ingesting":
      if (event.t === "ingest_ok") return { job: { ...job, status: "ready", strikes: 0 }, effects: [{ t: "commit" }] };
      if (event.t === "ingest_failed") return fail(job, event.code);
      return { job, effects: [] };
    default:
      return { job, effects: [] };
  }
}
