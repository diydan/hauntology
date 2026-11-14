import type { Stage } from "./types";

/**
 * The fixed words of the Haunt screen's Stage display (Requirements 4.1, 4.4, 4.6, 4.7). Plain and
 * honest: the steps are the Stages of `steering/visual-style.md`, and no line promises a time the
 * job does not keep. The progress is a list of steps with the current one marked, so it never relies
 * on a spinner alone.
 */

/** The steps a world goes through, in order. `failed` is not a step: it ends the list. */
export const STAGE_STEPS = ["queued", "dreaming", "stitching", "ready"] as const satisfies readonly Stage[];
export type StageStep = (typeof STAGE_STEPS)[number];

export const STAGE_COPY: Record<Stage, { label: string; line: string }> = {
  queued: { label: "Queued", line: "Your place is waiting its turn." },
  dreaming: { label: "Dreaming", line: "Your picture is being imagined as a place. This takes a few minutes." },
  stitching: { label: "Stitching", line: "Nearly there. The pieces are being sewn into a place you can walk in." },
  ready: { label: "Ready", line: "Your place is ready." },
  failed: { label: "It did not work", line: "Your place could not be made." },
};

/** Which step is current, counting from 1, or `null` for `failed` (no step is current). */
export function stageStep(stage: Stage): number | null {
  const i = (STAGE_STEPS as readonly string[]).indexOf(stage);
  return i === -1 ? null : i + 1;
}

/** Said once the wait passes the expected maximum. The job keeps running (Requirement 4.7). */
export const OVERDUE_LINE = "This is taking longer than it should. Your place is still being made, and you can visit the Gallery while you wait.";

/** Said when the stage is ready (Requirement 4.3). */
export const READY_ANNOUNCEMENT = "Your place is ready.";

/** Whether the allowance came back, from what the API said and nothing more (Requirement 4.4). */
export const QUOTA_RETURNED_LINE = "Your allowance for this place was returned.";
export const QUOTA_KEPT_LINE = "Your allowance for this place was not returned.";

export const quotaLine = (quotaReturned: boolean): string => (quotaReturned ? QUOTA_RETURNED_LINE : QUOTA_KEPT_LINE);
