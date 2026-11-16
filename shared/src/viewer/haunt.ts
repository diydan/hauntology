import {
  clamp,
  clamp01,
  clampToBounds,
  finiteOr,
  GHOST_MIN_DISTANCE,
  type Bounds,
  type Vec3,
} from "./types";

/**
 * Where the haunt shows itself (Requirements 3.3, 3.4; world-viewer task 2.8):
 * how bright a memory orb is, and where the ghost billboard stands.
 */

/**
 * Orb brightness in [0, 1]: 0 once the memory is found, 1 at the anchor, fading
 * linearly to 0 at five anchor radii. A distance that is not a positive finite
 * number counts as "at the anchor" only when it is exactly 0; NaN yields 0, so a
 * broken pose never lights every orb. Non-increasing in distance.
 */
export function orbIntensity(distance: number, found: boolean, radius: number): number {
  if (found) return 0;
  if (Number.isNaN(distance)) return 0;
  const r = radius > 0 && Number.isFinite(radius) ? radius : 1;
  const d = Math.max(0, distance);
  return clamp01(1 - d / (5 * r));
}

const GHOST_DISTANCE = 2.5;
const GHOST_BOB = 0.05;
/** Directions tried, in order, as offsets from the preferred heading (radians). */
const FALLBACK_TURNS = [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];

const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Where the ghost stands: `GHOST_DISTANCE` from the player, towards the anchor when
 * one is given, else where the player faces, with a gentle bob from `tMs`. The result
 * is inside the bounds and at least 1.2 m from the player whenever the bounds hold any
 * such point (directions are tried in a fixed order, then the farthest corner wins).
 * Deterministic: identical inputs give an identical place.
 */
export function ghostPlacement(playerPos: Vec3, yaw: number, anchor: Vec3 | undefined, tMs: number, bounds: Bounds): Vec3 {
  const player = clampToBounds(playerPos, bounds);
  const bob = Math.sin(finiteOr(tMs, 0) / 900) * GHOST_BOB;
  const y = clamp(player[1] + bob, bounds.min[1], bounds.max[1]);

  let heading = finiteOr(yaw, 0);
  if (anchor && Number.isFinite(anchor[0]) && Number.isFinite(anchor[2])) {
    const dx = anchor[0] - player[0], dz = anchor[2] - player[2];
    if (Math.hypot(dx, dz) > 1e-6) heading = Math.atan2(-dx, -dz);
  }

  for (const turn of FALLBACK_TURNS) {
    const h = heading + turn;
    const candidate: Vec3 = [
      clamp(player[0] - Math.sin(h) * GHOST_DISTANCE, bounds.min[0], bounds.max[0]),
      y,
      clamp(player[2] - Math.cos(h) * GHOST_DISTANCE, bounds.min[2], bounds.max[2]),
    ];
    if (distance3(candidate, player) >= GHOST_MIN_DISTANCE) return candidate;
  }

  // No straight direction works (a small world): the farthest corner is the best left.
  let best: Vec3 = [bounds.min[0], y, bounds.min[2]];
  let bestDist = -1;
  for (const cx of [bounds.min[0], bounds.max[0]]) {
    for (const cz of [bounds.min[2], bounds.max[2]]) {
      const corner: Vec3 = [cx, y, cz];
      const d = distance3(corner, player);
      if (d > bestDist) {
        best = corner;
        bestDist = d;
      }
    }
  }
  return best;
}
