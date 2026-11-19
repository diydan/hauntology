import { parseAction } from "../ghost/parse";
import { acceptTurn, retryAfterMs } from "../ghost/rate";
import type { Action } from "../ghost/types";

/**
 * Transcript preparation for the typed turn route (ghost-voice 2.12, Requirement 3.4).
 *
 * A speech transcript enters through the exact same `parseAction` + `acceptTurn` rules as typed
 * input (200-character truncation, control-character stripping, rule-break check, 1.5 s rate limit).
 * `source` is carried solely for the UI and read by no rule.
 */
export type TurnInputSource = "voice" | "typed";

export type PreparedTurnInput = {
  action: Action;
  accepted: boolean;
  retryAfterMs: number;
  source: TurnInputSource;
};

export function prepareTurnInput(
  raw: string,
  source: TurnInputSource,
  timing: { lastAcceptedAt: number | null; now: number },
): PreparedTurnInput {
  const action = parseAction({ text: raw });
  const accepted = acceptTurn(timing.lastAcceptedAt, timing.now);
  const retry = accepted ? 0 : retryAfterMs(timing.lastAcceptedAt, timing.now);
  return { action, accepted, retryAfterMs: retry, source };
}
