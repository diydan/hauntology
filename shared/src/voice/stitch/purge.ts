import { CLIP_TTL_HOURS } from "../limits";
import type { StitchClip } from "./compose";
import { consentEffective, type StitchConsent } from "./consent";

/**
 * Stitch clip retention & alarm scheduling (ghost-voice 5.7, Requirement 5.5).
 *
 * Keeps a clip only while the game is not over, Stitch is enabled, the seat is present with
 * effective consent, and less than 6 hours (`CLIP_TTL_MS`) have elapsed since `recordedAt`.
 */
export const CLIP_TTL_MS = CLIP_TTL_HOURS * 60 * 60 * 1000;

export function purgeClips(
  clips: readonly StitchClip[],
  ctx: {
    gameOver: boolean;
    enabled: boolean;
    activeSeats: ReadonlySet<number>;
    consents: readonly StitchConsent[];
  },
  now: number,
): StitchClip[] {
  if (ctx.gameOver || !ctx.enabled || !Number.isFinite(now)) return [];
  const consented = new Set(ctx.consents.filter(consentEffective).map((c) => c.seat));
  return clips.filter(
    (c) =>
      ctx.activeSeats.has(c.seat) &&
      consented.has(c.seat) &&
      Number.isFinite(c.recordedAt) &&
      now >= c.recordedAt &&
      now - c.recordedAt < CLIP_TTL_MS,
  );
}

export function nextPurgeAt(clips: readonly Pick<StitchClip, "recordedAt">[]): number | null {
  let earliest: number | null = null;
  for (const c of clips) {
    if (!Number.isFinite(c.recordedAt)) continue;
    const exp = c.recordedAt + CLIP_TTL_MS;
    if (earliest === null || exp < earliest) earliest = exp;
  }
  return earliest;
}
