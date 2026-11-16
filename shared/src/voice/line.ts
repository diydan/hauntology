/**
 * A spoken line the server holds so the speech route can find it (ghost-voice design, `VoiceLine`). Pure data and two pure functions.
 *
 * The line carries the plain `spoken` text and a voice id, but it can never choose a voice by itself: `speechVoices` takes the voices from the
 * cast tables (`voices.ts`) and reads the line's `voice` only to tell WHICH of the Lodger's six it is. So a line that names another Speaker's
 * voice, or one that is not in the cast, is still spoken in its own Speaker's voice.
 */
import { LODGER_VOICES, LODGER_VOICE_ORDER, voiceFor, type LodgerVoice, type Speaker, type VoiceId } from "./voices";

export const LINE_KINDS = ["narration", "haunt_event", "midnight", "ending"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type VoiceLine = {
  /** Unguessable, made on the server. */
  id: string;
  kind: LineKind;
  speaker: Speaker;
  /** The whole validated line: the Subtitle. */
  text: string;
  /** Leading whole sentences, at most 240 characters, plain text with no Steering Tag. `''` means subtitle only. */
  spoken: string;
  /** The Inworld voice of the line. */
  voice: VoiceId;
  createdAt: number;
};

/** Which of the six Lodger Voices a Lodger line has; `undefined` for any other Speaker. A voice that is not one of the six reads as Mark (`voiceFor`). */
export function lodgerVoiceOf(line: Pick<VoiceLine, "speaker" | "voice">): LodgerVoice | undefined {
  if (line.speaker !== "lodger") return undefined;
  return LODGER_VOICE_ORDER.find((v) => `inworld:${LODGER_VOICES[v].inworld}` === line.voice);
}

/** The two voices the speech route may use for a line, in the order the cache is tried: the Inworld voice, then the Aura-2 voice. */
export function speechVoices(line: Pick<VoiceLine, "speaker" | "voice">): { inworld: VoiceId; aura: VoiceId; lodgerVoice: LodgerVoice | undefined } {
  const lodgerVoice = lodgerVoiceOf(line);
  return { inworld: voiceFor(line.speaker, "inworld", lodgerVoice), aura: voiceFor(line.speaker, "aura", lodgerVoice), lodgerVoice };
}
