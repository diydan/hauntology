import type { VoiceLine } from "@hauntology/shared/voice/line";
import { speakFoundLine, type SpeakDeps, type Who } from "./speak";

/**
 * Speculative synthesis (ghost-voice 3.12): the moment a game validates a line and speaking is on, start the paid call, so that the `speak`
 * request that follows joins the running call or finds the clip, and the visitor hears the line sooner. It is a thin gate in front of
 * `speakFoundLine`, which already does the work: the Library and the cache first (free), then one Ticket, one call, one flight per line.
 *
 * It starts nothing when speaking is off, when the voice is off (`VOICE_ENABLED`, the operator's window), or for a line with nothing to speak.
 * It never throws and never makes the caller wait: the work is handed to `defer` (the Worker's `waitUntil`) when there is one. If the visitor
 * never asks for the line, one unit was spent, and the Meter's caps still bound how many: a refused Ticket is a quiet no.
 *
 * Who says "speaking is on" is the caller's to know. A Party Room knows it (the Master's `settings.speech`, through `decideSpeak`); a Single
 * player game does not, because the turn route has no voice flag by design (3.8), so until a signal exists it passes `speaking: false` and only
 * the later `speak` request pays. Nothing here reads a secret: the line is the one already validated for the visitor.
 */
export type SpeculateOptions = Readonly<{
  /** The visitor (or the Master) has speech on. */
  speaking: boolean;
  /** `VOICE_ENABLED` and the operator's voice window. Defaults to on: the speak service's own kill switch still stops a paid call. */
  voiceEnabled?: boolean;
  /** Where the work goes so the caller does not wait (the Worker's `waitUntil`). Without it the returned promise is the work. */
  defer?: (work: Promise<unknown>) => void;
}>;

export type SpeculateResult = "started" | "off" | "silent";

export function speculate(deps: SpeakDeps, who: Who, line: VoiceLine, o: SpeculateOptions): { result: SpeculateResult; done: Promise<void> } {
  if (!o.speaking || o.voiceEnabled === false) return { result: "off", done: Promise.resolve() };
  if (line.spoken.trim() === "") return { result: "silent", done: Promise.resolve() };
  const work = speakFoundLine(deps, who, line, o.defer ? { defer: o.defer } : {}).then(
    () => undefined,
    () => undefined, // a failure only means the later request pays for itself
  );
  o.defer?.(work);
  return { result: "started", done: work };
}
