import type { SoundPlan } from "./cues";

/**
 * The sound files of the phone and the Host (party-mode 20.1 to 20.3). The list and limits mirror `tools/check-sounds.mjs`
 * (a test keeps the two in step). A missing file never changes the game: that phone flashes and vibrates instead, within
 * the light limits, and the Host shows the log line.
 */
export const SOUND_FILES = [
  { id: "creak", maxSeconds: 3 }, { id: "whisper", maxSeconds: 3 }, { id: "bell", maxSeconds: 3 }, { id: "laugh", maxSeconds: 3 },
  { id: "wind", maxSeconds: 3 }, { id: "rumble", maxSeconds: 3 }, { id: "becoming", maxSeconds: 4 },
] as const;
export type SoundId = (typeof SOUND_FILES)[number]["id"];
export const SOUND_IDS: readonly SoundId[] = SOUND_FILES.map((f) => f.id);
export const SOUND_FILE_MAX_BYTES = 50 * 1024;
export const SOUND_TOTAL_MAX_BYTES = 350 * 1024;
export const isSoundId = (s: string): s is SoundId => (SOUND_IDS as readonly string[]).includes(s);
export const soundUrl = (id: SoundId): string => `/sounds/${id}.m4a`;

export type SoundAvailability = Readonly<{ present: readonly SoundId[]; missing: readonly SoundId[]; has: (id: SoundId) => boolean }>;
/** Which of the sound files exist, from a list of file names such as `creak.m4a` or ids such as `creak`. Anything else is ignored. */
export function soundAvailability(files: readonly string[]): SoundAvailability {
  const names = new Set(files.map((f) => f.replace(/\.m4a$/, "")));
  const present = SOUND_IDS.filter((id) => names.has(id));
  return { present, missing: SOUND_IDS.filter((id) => !names.has(id)), has: (id) => present.includes(id) };
}

export type PhoneAction = Readonly<{ action: "play" | "flash" | "none"; vibrate: boolean }>;
/**
 * What one phone does for one sound: play it when it has consent, audio and the file; otherwise flash and vibrate, unless it
 * prefers reduced motion (then only a vibration) or has no consent or no sound left (nothing). The game state is the same
 * in every case; this is only how it shows.
 */
export function phoneAction(plan: SoundPlan, available: SoundAvailability, id: SoundId, reducedMotion: boolean, canVibrate: boolean): PhoneAction {
  if (plan === "none") return { action: "none", vibrate: false };
  if (plan === "play" && available.has(id)) return { action: "play", vibrate: false };
  return { action: reducedMotion ? "none" : "flash", vibrate: canVibrate };
}
