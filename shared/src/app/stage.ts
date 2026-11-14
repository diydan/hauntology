import type { JobState, PollInput, Stage } from "./types";

/** The label the visitor sees for each world job state (`steering/visual-style.md`). */
export function stageOf(state: JobState): Stage {
  switch (state) {
    case "queued": return "queued";
    case "generating": return "dreaming";
    case "ingesting": return "stitching";
    case "ready": return "ready";
    case "failed": return "failed";
  }
}

export const isTerminalStage = (stage: Stage): boolean => stage === "ready" || stage === "failed";

/** Polls are at least this far apart. */
export const POLL_MIN_MS = 3000;
/** Without a rate limit, the next poll is never later than this after the last one. */
export const POLL_MAX_MS = 5000;
/** After this long the Haunt screen says honestly that it is taking long. The job itself times out at 20 minutes. */
export const OVERDUE_MS = 15 * 60_000;

/**
 * When to ask for the job status next.
 *
 * - `pollAt` is `null` while the tab is hidden and once the stage is terminal. Otherwise it is
 *   3 seconds after the last poll, or the end of a rate limit if that is later. It may lie in the
 *   past (the tab was hidden for a while); the caller then polls at once.
 * - `overdue` is true once more than 15 minutes have passed since the start, and never for a
 *   terminal stage, where "taking long" would be wrong.
 *
 * Times are epoch milliseconds, passed in: nothing here reads a clock.
 */
export function pollPlan(input: PollInput): { pollAt: number | null; overdue: boolean } {
  const terminal = isTerminalStage(input.stage);
  const overdue = !terminal && input.now - input.startedAt > OVERDUE_MS;
  if (!input.visible || terminal) return { pollAt: null, overdue };

  const regular = input.lastPollAt + POLL_MIN_MS;
  const pollAt = input.rateLimitedUntil === null ? regular : Math.max(regular, input.rateLimitedUntil);
  return { pollAt, overdue };
}
