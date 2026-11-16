import type { Bounds, Pose, Vec3 } from "./types";

const TAU = Math.PI * 2;

const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * The position and heading a client reports, made safe (Requirement 3.5): a position that is not three finite numbers is not used and
 * the previous one stays; one that is finite is clamped into the world's bounds; a heading that is not finite is not used, and one that is
 * is wrapped into [-pi, pi). The result is always finite and always inside the bounds.
 */
export function sanitizePose(input: unknown, bounds: Bounds, previous: Pose): Pose {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const pos: Vec3 = isVec3(o["pos"])
    ? [clamp(o["pos"][0], bounds.min[0], bounds.max[0]), clamp(o["pos"][1], bounds.min[1], bounds.max[1]), clamp(o["pos"][2], bounds.min[2], bounds.max[2])]
    : [previous.pos[0], previous.pos[1], previous.pos[2]];
  let yaw = previous.yaw;
  if (typeof o["yaw"] === "number" && Number.isFinite(o["yaw"])) {
    const wrapped = o["yaw"] - TAU * Math.floor((o["yaw"] + Math.PI) / TAU);
    if (Number.isFinite(wrapped)) yaw = wrapped;
  }
  return { pos, yaw };
}
