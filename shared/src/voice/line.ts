/**
 * A spoken line the server holds so the speech route can find it (ghost-voice design, `VoiceLine`). Pure data and two pure functions.
 *
 * The line carries the plain `spoken` text and a voice id, but it can never choose a voice by itself: `speechVoices` takes the voices from the
 * cast tables (`voices.ts`) and reads the line's `voice` only to tell WHICH of the Lodger's six it is. So a line that names another Speaker's
 * voice, or one that is not in the cast, is still spoken in its own Speaker's voice.
 */
import { z } from "zod";
import { LODGER_VOICES, LODGER_VOICE_ORDER, voiceFor, type LodgerVoice, type Speaker, type VoiceId } from "./voices";

export const LINE_KINDS = ["narration", "haunt_event", "midnight", "ending"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** A Single-player game keeps the last 8 lines, each for 10 minutes (ghost-voice 3.5). A line is a few hundred characters: this bounds what a game stores. */
export const VOICE_LINES_KEPT = 8;
export const VOICE_LINE_TTL_MS = 10 * 60_000;

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

/**
 * A stored line as it may be trusted when a game is read back from storage: the shapes and the limits. The session schema uses it, so a game with a damaged
 * list keeps playing with no lines and is never ended by it.
 */
export const VoiceLineSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  kind: z.enum(LINE_KINDS),
  speaker: z.enum(["whisper", "keeper", "lodger"]),
  text: z.string().min(1).max(2000),
  spoken: z.string().max(240),
  voice: z.string().regex(/^(?:inworld|aura-2):[A-Za-z0-9._-]{1,40}$/),
  createdAt: z.number().finite(),
});

/** The lines still worth keeping at `now`: younger than ten minutes. Never more than the last 8. A time in the future is treated as just made. */
export function liveLines(lines: readonly VoiceLine[] | undefined, now: number): VoiceLine[] {
  return (lines ?? []).filter((l) => now - l.createdAt < VOICE_LINE_TTL_MS).slice(-VOICE_LINES_KEPT);
}

/** `lines` with `line` added: the old ones pruned first, and no more than the last 8 kept. */
export function keepLine(lines: readonly VoiceLine[] | undefined, line: VoiceLine, now: number): VoiceLine[] {
  return [...liveLines(lines, now), line].slice(-VOICE_LINES_KEPT);
}

/** The line with this id if it is still live at `now`, else `null`. An id that is not there and an id that has expired are the same answer. */
export function findLine(lines: readonly VoiceLine[] | undefined, id: string, now: number): VoiceLine | null {
  return liveLines(lines, now).find((l) => l.id === id) ?? null;
}
