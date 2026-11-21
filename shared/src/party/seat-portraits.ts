import { presetById } from "../creator/presets";
import type { LobbyContrib } from "./lobby-contrib";
import type { SeatProfile } from "./seatLook";

/**
 * The Seat Portrait each Player is drawn with (party-mode 19.8): the ghost they contributed, or nothing (a nickname chip is drawn instead, and for every Bot).
 * The portrait of a Preset Ghost is its pre-made picture and its black and white twin; a designed or selfie ghost is the Room's own sprite for that seat. A
 * portrait is public, like every Suspect card, and names no secret: it is a picture URL only. A contribution that failed has no portrait.
 */
export const seatSpriteUrl = (code: string, seat: number): string => `/api/ghosts/sprite/${encodeURIComponent(`room-${code}-${seat}`)}`;

export function seatProfile(code: string, seat: number, contrib: LobbyContrib | undefined): SeatProfile | null {
  const g = contrib?.ghosts[seat];
  if (g === undefined || g.status !== "ok") return null;
  const preset = presetById(g.profileId);
  if (preset !== undefined) return { portraitUrl: preset.spriteUrl, ...(preset.monoUrl !== undefined ? { monoUrl: preset.monoUrl } : {}), preset: true };
  return { portraitUrl: seatSpriteUrl(code, seat) };
}
