/**
 * The cast of the ghost's voice: three Speakers and the Lodger's six voices.
 * See `.kiro/specs/ghost-voice/design.md` ("The cast", "The Lodger's six voices") and `docs/story/CHARACTERS.md`.
 * Pure data and pure functions. No I/O, no clock, no randomness.
 *
 * Only what the Library needs is here so far (ghost-voice task 2.2 will add `speakerForPersona`, `toVoiceLine` and the rest).
 */

export type Speaker = "whisper" | "keeper" | "lodger";

/** A Suspect's voice, fixed when its Ghost Profile is made (ghost-voice Requirement 1.11). */
export type LodgerVoice = "mark" | "conrad" | "arjun" | "chloe" | "eleanor" | "victoria";

export type VoiceId = `inworld:${string}` | `aura-2:${string}`;

export interface SpeakerSettings {
  /** The Inworld `voice_id`. For the Lodger this is only the default (Mark); a line's voice comes from `LODGER_VOICES`. */
  readonly inworld: "Pippa" | "Ronald" | "Mark";
  /** The Steering Tag. Added to the text in exactly one place, the Inworld wrapper. Never in a key, a Subtitle or a log. */
  readonly tag: "[whisper] " | "" | "[speak nervously] ";
  readonly rate: number;
  readonly temperature: number;
  /** The Deepgram Aura-2 fallback speaker. */
  readonly aura: string;
}

/** The settings used in the samples Dan approved on 2026-11-15. */
export const SPEAKERS: Readonly<Record<Speaker, SpeakerSettings>> = {
  whisper: { inworld: "Pippa", tag: "[whisper] ", rate: 0.9, temperature: 1.0, aura: "luna" },
  keeper: { inworld: "Ronald", tag: "", rate: 0.9, temperature: 0.7, aura: "zeus" },
  lodger: { inworld: "Mark", tag: "[speak nervously] ", rate: 1.1, temperature: 1.2, aura: "aries" },
};

/** The fixed order Speakers are listed in (the Library is built in this order). */
export const SPEAKER_ORDER: readonly Speaker[] = ["whisper", "keeper", "lodger"];

export interface LodgerVoiceSettings {
  readonly inworld: "Mark" | "Conrad" | "Arjun" | "Chloe" | "Eleanor" | "Victoria";
  /**
   * The Aura-2 fallback speaker. `null` until Spike ghost-voice 1.1 picks one (a female speaker that is not `luna`
   * for the women, a male one that is not `zeus` for Conrad and Arjun); until then the Lodger default is used.
   */
  readonly aura: string | null;
}

export const LODGER_VOICES: Readonly<Record<LodgerVoice, LodgerVoiceSettings>> = {
  mark: { inworld: "Mark", aura: "aries" },
  conrad: { inworld: "Conrad", aura: null },
  arjun: { inworld: "Arjun", aura: null },
  chloe: { inworld: "Chloe", aura: null },
  eleanor: { inworld: "Eleanor", aura: null },
  victoria: { inworld: "Victoria", aura: null },
};

/** The fixed order the six Lodger Voices are listed in. */
export const LODGER_VOICE_ORDER: readonly LodgerVoice[] = ["mark", "conrad", "arjun", "chloe", "eleanor", "victoria"];

/** A Ghost Profile's Lodger Voice: the one it carries, else Mark. Reads nothing else, so a voice can never tell who is guilty. */
export function lodgerVoiceFor(profile: { readonly lodgerVoice?: LodgerVoice | undefined }): LodgerVoice {
  return profile.lodgerVoice ?? "mark";
}

/** The voice id for a Speaker at one step of the Fallback Chain. Always English, always from the tables above. */
export function voiceFor(speaker: Speaker, step: "inworld" | "aura", lodgerVoice?: LodgerVoice): VoiceId {
  if (speaker === "lodger") {
    const v = LODGER_VOICES[lodgerVoice ?? "mark"];
    return step === "inworld" ? `inworld:${v.inworld}` : `aura-2:${v.aura ?? SPEAKERS.lodger.aura}`;
  }
  const s = SPEAKERS[speaker];
  return step === "inworld" ? `inworld:${s.inworld}` : `aura-2:${s.aura}`;
}

/** The Speaker's Steering Tag. Used only by the Inworld wrapper (and by cost estimates). */
export function steeringTag(speaker: Speaker): string {
  return SPEAKERS[speaker].tag;
}
