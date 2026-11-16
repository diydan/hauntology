import {
  clamp,
  clampToBounds,
  finiteOr,
  MAX_DT_MS,
  type MoveInput,
  type MoveParams,
  type PlayerState,
  type Vec3,
} from "./types";

/**
 * Walking, as arithmetic (Requirements 2.3, 2.5, 2.6; world-viewer task 2.3).
 * Collision against the Collider BVH is scene glue (task 4.3); this module only
 * integrates input and keeps the result finite, in bounds and at eye height.
 */

/**
 * One movement step. `dtMs` is clamped to [0, 50] ms, the input axes are clamped to
 * [-1, 1] and normalised together so a diagonal is no faster than a straight line, and
 * the speed never exceeds walk (or walk x sprintMul while sprinting). The eye height is
 * held at `floorY + eyeHeight`. A non-finite input part counts as 0; a non-finite
 * starting position is pulled back into the bounds. Two half steps with the input
 * (including `yawDelta`) halved land where one full step lands.
 */
export function stepMovement(state: PlayerState, input: MoveInput, dtMs: number, params: MoveParams): PlayerState {
  const dt = clamp(finiteOr(dtMs, 0), 0, MAX_DT_MS) / 1000;
  const yaw = finiteOr(state.yaw, 0) + finiteOr(input.yawDelta, 0);

  let forward = clamp(finiteOr(input.forward, 0), -1, 1);
  let strafe = clamp(finiteOr(input.strafe, 0), -1, 1);
  const axisLen = Math.hypot(forward, strafe);
  if (axisLen > 1) {
    forward /= axisLen;
    strafe /= axisLen;
  }

  const walk = Math.max(0, finiteOr(params.walk, 0));
  const speed = walk * (input.sprint ? Math.max(1, finiteOr(params.sprintMul, 1)) : 1);
  // Yaw 0 faces -Z. Movement uses the mid-step heading, so one step of dt and two of
  // dt/2 (with the yaw change halved) end in the same place up to a second-order error.
  const heading = finiteOr(state.yaw, 0) + finiteOr(input.yawDelta, 0) / 2;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const dx = (-sin * forward + cos * strafe) * speed * dt;
  const dz = (-cos * forward - sin * strafe) * speed * dt;

  const start = clampToBounds(state.pos, params.bounds);
  const eyeY = params.floorY + params.eyeHeight;
  const pos = clampToBounds([start[0] + dx, eyeY, start[2] + dz], params.bounds);
  return { pos, yaw };
}

/**
 * The no-Collider fallback (Requirement 2.5): the player stays within `radius` of the
 * spawn on the ground plane, at the fixed eye height `eyeY` (the caller passes
 * `floorY + eyeHeight`). A radius that is not positive and finite pins the player to
 * the spawn; a non-finite position returns the spawn.
 */
export function constrainToDisc(pos: Vec3, spawn: Vec3, radius: number, eyeY: number): Vec3 {
  const sx = finiteOr(spawn[0], 0), sz = finiteOr(spawn[2], 0);
  const y = finiteOr(eyeY, finiteOr(spawn[1], 0));
  if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[2])) return [sx, y, sz];
  const r = radius > 0 && Number.isFinite(radius) ? radius : 0;
  const dx = pos[0] - sx, dz = pos[2] - sz;
  const dist = Math.hypot(dx, dz);
  if (dist <= r || dist === 0) return [pos[0], y, pos[2]];
  const k = r / dist;
  return [sx + dx * k, y, sz + dz * k];
}
