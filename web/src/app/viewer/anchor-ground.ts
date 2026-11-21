import type { FloorSampler } from "@hauntology/shared/ghost/anchors";
import type { Bounds, Vec3 } from "@hauntology/shared/ghost/types";
import type { FloorProbe } from "./collision";
import type { AnchorGround } from "./types";

/**
 * The floor sampler of the Viewer (ghost-engine 6.3): a straight ray down the collider's BVH from a little above the spawn's eye, so a ceiling
 * is never what the ray meets first in an ordinary room. A point with no standable surface within `FLOOR_DROP` metres below gives `null`, and
 * `placeAnchors` tries another point. The probe is a parameter, so the logic runs over a fake or a real BVH in Node.
 */
export const FLOOR_LIFT = 0.3;
export const FLOOR_DROP = 4;

export function floorSamplerFromProbe(probe: FloorProbe, spawnEyeY: number): FloorSampler {
  const top = spawnEyeY + FLOOR_LIFT;
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const y = probe.floorBelow(x, z, top, FLOOR_DROP + FLOOR_LIFT);
    return y !== null && Number.isFinite(y) ? y : null;
  };
}

/**
 * The ground the shell asks for, from the collider's state: still `"pending"` gives `undefined` (ask again), `"none"` (no collider mesh, or it would not parse)
 * gives `null` (never; the server places the anchors), a built probe gives the ground.
 */
export function anchorGroundFrom(collider: FloorProbe | "pending" | "none", spawn: Vec3, bounds: Bounds): AnchorGround | undefined | null {
  if (collider === "pending") return undefined;
  if (collider === "none") return null;
  return { sampler: floorSamplerFromProbe(collider, spawn[1]), spawn, bounds };
}

/**
 * The collider is built after the scene starts, so `get` may say `undefined` ("not yet") at first. Polls until it gives the ground or `timeoutMs` has passed,
 * then gives up with `undefined` (the server places the anchors); `null` ("never") ends the wait at once. Never throws; a `get` that throws counts as "not yet".
 */
export async function waitForGround(
  get: () => AnchorGround | undefined | null,
  o: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<AnchorGround | undefined> {
  const timeoutMs = o.timeoutMs ?? 1500;
  const pollMs = o.pollMs ?? 100;
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const until = now() + timeoutMs;
  for (;;) {
    try {
      const ground = get();
      if (ground === null) return undefined;
      if (ground !== undefined) return ground;
    } catch {
      /* not yet */
    }
    if (now() >= until) return undefined;
    await sleep(pollMs);
  }
}
