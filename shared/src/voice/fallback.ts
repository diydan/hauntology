import { playTurn, type WorldFacts } from "../ghost/play";
import type { PlaySession } from "../ghost/session";
import type { AnchorId, Directive } from "../ghost/types";
import { SPEECH_DEADLINE_MS } from "./limits";

/**
 * The Fallback Chain (ghost-voice 2.4, Requirements 1.2, 1.3, 4.2, 4.3):
 * Library -> Cache -> Inworld TTS 2 -> Aura-2 English -> Browser speechSynthesis -> Subtitle alone.
 *
 * The Library and cache steps are free reads (they ignore `kill` and `!ticket`). Paid steps
 * (`inworld`, `aura`) never run when `kill` is on or `ticket` is false. No step starts at or after
 * 5,000 ms, audio ready after 5,000 ms is never used, and the result has no error member: the
 * Subtitle is always shown.
 */

export type Step = "library" | "cache" | "inworld" | "aura" | "browser" | "subtitle";
export type AttemptStep = Exclude<Step, "subtitle">;
export type Outcome = "ok" | "miss" | "error" | "slow" | "denied";

export type SpeechResult = {
  via: Step;
  subtitle: true;
  elapsedMs: number;
  paidCalls: number;
};

export type FallbackContext = {
  kill: boolean;
  ticket: boolean;
  browserVoice: boolean;
};

const ORDER: readonly AttemptStep[] = ["library", "cache", "inworld", "aura", "browser"];
const isPaid = (s: AttemptStep): boolean => s === "inworld" || s === "aura";

export function resolveSpeech(
  ctx: FallbackContext,
  attempt: (step: AttemptStep) => { outcome: Outcome; ms: number },
): SpeechResult {
  let elapsedMs = 0;
  let paidCalls = 0;

  for (const step of ORDER) {
    if (isPaid(step) && (ctx.kill || !ctx.ticket)) continue;
    if (step === "browser" && !ctx.browserVoice) continue;
    if (elapsedMs >= SPEECH_DEADLINE_MS) break;

    const r = attempt(step);
    if (isPaid(step)) paidCalls += 1;
    const ms = Number.isFinite(r.ms) && r.ms > 0 ? r.ms : 0;
    elapsedMs += ms;

    if (r.outcome === "ok" && elapsedMs <= SPEECH_DEADLINE_MS) {
      return { via: step, subtitle: true, elapsedMs, paidCalls };
    }
  }

  return { via: "subtitle", subtitle: true, elapsedMs, paidCalls };
}

export type EngineProgress = {
  turn: number;
  found: AnchorId[];
  ended: boolean;
  directive: Directive["kind"];
  revealed: boolean;
};

/**
 * Test helper (ghost-voice 2.4): runs a sequence of engine `playTurn` steps alongside `resolveSpeech`,
 * returning the engine progress sequence and speech results so tests can verify that voice outcomes
 * (including zero meters / total failure) never alter what the engine decides.
 */
export function runWithVoice(
  initial: PlaySession,
  turns: readonly { input: unknown; pose: unknown; now: number }[],
  world: Pick<WorldFacts, "bounds" | "brief">,
  ctx: FallbackContext,
  attempt: (step: AttemptStep) => { outcome: Outcome; ms: number },
): { progress: EngineProgress[]; speechResults: SpeechResult[]; session: PlaySession } {
  let session = initial;
  const progress: EngineProgress[] = [];
  const speechResults: SpeechResult[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const r = playTurn(session, { input: t.input, pose: t.pose, world, now: t.now, voiceLineId: `vl-${i}` });
    if (!r.ok) continue;
    session = r.session;
    progress.push({
      turn: session.state.turn,
      found: [...session.state.found],
      ended: session.state.ended,
      directive: r.directive.kind,
      revealed: r.revealed,
    });
    if (r.voiceLine !== null && r.voiceLine.spoken !== "") {
      speechResults.push(resolveSpeech(ctx, attempt));
    }
  }
  return { progress, speechResults, session };
}
