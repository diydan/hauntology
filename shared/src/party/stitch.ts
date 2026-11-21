import { STITCH_GAME_CAP, STITCH_MIN_GAME_MS, STITCH_ROUND_CAP } from "../voice/limits";
import type { StitchClip } from "../voice/stitch/compose";
import { consentEffective, consentReduce, INITIAL_CONSENT_STATE, type ConsentState, type StitchConsent } from "../voice/stitch/consent";
import { stitchEligible, stitchReveal, type PlayedStitch, type StitchEligibilityInput } from "../voice/stitch/play";
import { nextPurgeAt, purgeClips, CLIP_TTL_MS } from "../voice/stitch/purge";

/**
 * Stitch in the Room (party-mode 18.1 to 18.5). The rules live in the `ghost-voice` spec (`voice/stitch/`); this file
 * names them as the Room uses them, so the Room has one place to read, and adds nothing of its own. Stitch is off by
 * default, a Player's yes is their own, and a clip never leaves the Room.
 */
export const stitchEnabled = (state: ConsentState): boolean => state.enabled;
export { INITIAL_CONSENT_STATE as INITIAL_STITCH_STATE, consentEffective, CLIP_TTL_MS, STITCH_GAME_CAP, STITCH_ROUND_CAP, STITCH_MIN_GAME_MS };
export type { ConsentState as StitchState, StitchConsent, PlayedStitch };

/** The Master switch, a Player's own answer, or a Player leaving. Returns the new state and whose clips to delete now. */
export const recordConsent = consentReduce;

/** One line at a Haunt Event or midnight, if the rules allow it: rare, never early, never during an Accusation, never the same Player twice. */
export const stitchSchedule = stitchEligible;
export type StitchScheduleInput = StitchEligibilityInput;

export type Lifecycle = Readonly<{ keep: readonly StitchClip[]; nextWakeMs: number | null; reveal: readonly PlayedStitch[] }>;
/**
 * Which clips the Room still holds: none once the game is over or Stitch is off, none for a Player who left or has no
 * effective yes, none after 6 hours. `nextWakeMs` is the next 6-hour deadline for the Room's one alarm, and `reveal` is
 * the list for the ending payload (each stitched line and whose words it used). The lobby and the start never wait for a
 * clip: `stitchBlocksStart` is always false.
 */
export function stitchLifecycle(clips: readonly StitchClip[], ctx: Readonly<{ gameOver: boolean; enabled: boolean; activeSeats: ReadonlySet<number>; consents: readonly StitchConsent[] }>, played: readonly PlayedStitch[], now: number): Lifecycle {
  const keep = purgeClips(clips, ctx, now);
  return { keep, nextWakeMs: nextPurgeAt(keep), reveal: ctx.gameOver ? stitchReveal(played) : [] };
}
export const stitchBlocksStart = (): false => false;
