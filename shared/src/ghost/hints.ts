import { BEARINGS, type Anchor, type AnchorId, type Band, type Bearing, type GameState, type Vec3 } from "./types";

/**
 * Which way a target lies from where the visitor stands and faces, as one of eight words (Requirement 4.1). The forward direction for a heading
 * `yaw` is (-sin yaw, 0, -cos yaw) on the floor plane; the angle to the target is signed (right is positive) and the eight sectors are 45 degrees
 * wide, centred on ahead, ahead-right, right, behind-right, behind, behind-left, left and ahead-left. A target exactly where the visitor stands is "ahead".
 */
export function relativeBearing(player: Vec3, yaw: number, target: Vec3): Bearing {
  const dx = target[0] - player[0];
  const dz = target[2] - player[2];
  if (dx === 0 && dz === 0) return "ahead";
  const forward = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
  const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  const sector = Math.round(Math.atan2(right, forward) / (Math.PI / 4));
  return BEARINGS[((sector % 8) + 8) % 8] as Bearing;
}

/** How far, in three words (Requirement 4.3): up to 6 m very close, up to 15 m nearer, then far. */
export function distanceBand(distance: number): Band {
  return distance <= 6 ? "very close" : distance <= 15 ? "nearer" : "far";
}

/** Eight turns in a row, or 90 seconds, without a memory found: time for an unasked hint (Requirement 4.2). */
export const IDLE_TURNS_FOR_HINT = 8;
export const IDLE_MS_FOR_HINT = 90_000;
export const autoHintDue = (state: Pick<GameState, "idleTurns" | "lastProgressAt">, now: number): boolean =>
  state.idleTurns >= IDLE_TURNS_FOR_HINT || now - state.lastProgressAt >= IDLE_MS_FOR_HINT;

/** The nearest anchor not yet found, with its distance on the floor plane, or `null` when all are found. */
export function nearestUnfound(anchors: readonly Anchor[], found: readonly AnchorId[], pos: Vec3): { anchor: Anchor; distance: number } | null {
  let best: { anchor: Anchor; distance: number } | null = null;
  for (const anchor of anchors) {
    if (found.includes(anchor.id)) continue;
    const distance = Math.hypot(anchor.pos[0] - pos[0], anchor.pos[2] - pos[2]);
    if (best === null || distance < best.distance) best = { anchor, distance };
  }
  return best;
}
