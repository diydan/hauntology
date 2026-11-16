import { NARRATION_MAX_TOKENS, buildNarrationPrompt, readsOutRules, replyChecksFor, validateGhostReply } from "@hauntology/shared/ghost/narration";
import type { NarrationJob } from "@hauntology/shared/ghost/play";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { generateNarration, narrationWasCharged, type Narrator } from "../guarded/workersai/narrator";

/**
 * The model's part of a turn (ghost-engine 4.1 to 4.4, Requirements 5 and 6): builds the prompt from the job, takes one `llm` unit from `SpendGuard` for each
 * call, calls the narrator through the guarded door with a Ticket, and checks what comes back. It answers with the model's words, or with none, and then the
 * scripted ones stand: no failure here ever fails a turn. One retry after a reply that fails its check or a call that failed; no retry after a refusal, a
 * spend refusal or when the turn's deadline is near. The visitor's words are in the prompt only, and nothing is logged from here.
 */
export type Narration = {
  /** `null` when there is no narrator (no `AI` binding or no `AI_GATEWAY_ID`). */
  narrator: Narrator | null;
  spend: SpendGuard;
  /** The model kill switch (Requirement 6.2): `false` and the ghost speaks only scripted lines. */
  enabled: boolean;
  now?: () => number;
};

/** `model`: the model's words are to be used. `invalid`: a reply failed its check twice, `refused`: the model declined, `failed`: the call failed twice, `capped`: no unit to spend, `off`: no model this turn. */
export type NarrationOutcome = "model" | "invalid" | "refused" | "failed" | "capped" | "off";
export type Narrated = { outcome: NarrationOutcome; /** Model calls made. */ attempts: number; /** The model's words for the turn (the memory, or the line), when the outcome is `model`. */ text: string | null };

/** At most two calls, each given 6 seconds, but the whole turn is over by 9: a retry that would run past it is not made. */
export const TURN_DEADLINE_MS = 9_000;
export const CALL_TIMEOUT_MS = 6_000;
export const MIN_RETRY_MS = 1_500;
/** Thinking is off: the spike found none used even by default, and `thinking: disabled` is accepted. */
const THINKING = "off" as const;

export async function narrateTurn(deps: Narration, job: NarrationJob, who: { sessionId: string; ipHash: string }): Promise<Narrated> {
  const narrator = deps.narrator;
  if (!deps.enabled || narrator === null) return { outcome: "off", attempts: 0, text: null };
  const prompt = buildNarrationPrompt(job.input);
  if (prompt === null) return { outcome: "off", attempts: 0, text: null };
  const now = deps.now ?? Date.now;
  const started = now();
  const checks = replyChecksFor(job.input.directive, job.input.history);

  let outcome: NarrationOutcome = "failed";
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const left = TURN_DEADLINE_MS - (now() - started);
    if (attempt > 1 && left < MIN_RETRY_MS) break;
    try {
      const reserved = await deps.spend.reserve({ meter: "llm", sessionId: who.sessionId, ipHash: who.ipHash, now: now() });
      if (!reserved.ok) { outcome = "capped"; break; }
      attempts += 1;
      let answer;
      try {
        answer = await generateNarration(narrator, reserved.ticket, { system: prompt.system, user: prompt.user, maxTokens: NARRATION_MAX_TOKENS, timeoutMs: Math.min(CALL_TIMEOUT_MS, left), thinking: THINKING });
      } catch (error) {
        await deps.spend.release(reserved.ticket);
        throw error;
      }
      await (narrationWasCharged(answer) ? deps.spend.commit(reserved.ticket) : deps.spend.release(reserved.ticket));

      if (answer.ok) {
        // A reply cut short by the token cap is not a whole thought.
        const checked = answer.stopReason === "max_tokens" ? null : validateGhostReply(answer.text, checks);
        if (checked !== null && checked.ok && !readsOutRules(checked.text, prompt.system)) return { outcome: "model", attempts, text: checked.text };
        outcome = "invalid";
      } else if (answer.kind === "refused") {
        outcome = "refused";
        break;
      } else {
        outcome = answer.kind === "unusable" ? "invalid" : "failed";
      }
    } catch {
      outcome = "failed";
    }
  }
  return { outcome, attempts, text: null };
}
