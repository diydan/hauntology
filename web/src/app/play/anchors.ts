import { placeAnchors, validateAnchors, walkRadiusOf, type FloorSampler } from "@hauntology/shared/ghost/anchors";
import { hashText, makeRng } from "@hauntology/shared/ghost/rng";
import type { Anchor, Bounds, Vec3 } from "@hauntology/shared/ghost/types";
import { waitForGround } from "../viewer/anchor-ground";
import type { AnchorGround } from "../viewer/types";

/**
 * Client anchor placement (ghost-engine 6.3, the part that needs no Viewer). The Viewer's floor sampler (a raycast on its BVH) is
 * a parameter; with none, nothing is sent and the server places the anchors itself. The seed comes from the world id, so the same place
 * gives the same three anchors on every visit; what the client sends is checked again by the server (`validateAnchors`).
 */
export type ClientAnchorInput = { worldId: string; spawn: Vec3; bounds: Bounds; sampler: FloorSampler | undefined };

/** The seed of a world's anchors: a 32-bit hash of its id. */
export const anchorSeedOf = (worldId: string): number => hashText(`anchors:${worldId}`);

/** Three anchors for `start`, or `undefined` when there is no floor sampler or the placed set does not pass the same check the server runs. */
export function planClientAnchors(input: ClientAnchorInput): Anchor[] | undefined {
  const { worldId, spawn, bounds, sampler } = input;
  if (sampler === undefined) return undefined;
  const walkRadius = walkRadiusOf(bounds);
  let placed: Anchor[];
  try {
    placed = placeAnchors({ sampler, spawn, bounds, walkRadius, rng: makeRng(anchorSeedOf(worldId)) });
  } catch {
    return undefined;
  }
  const checked = validateAnchors(placed, { spawn, bounds, walkRadius });
  return checked.ok ? checked.anchors : undefined;
}

/**
 * The anchors for `start` from the mounted Viewer: waits a short while for its collider, then plans on its floor. Gives `undefined` (the server
 * places the anchors) when the Viewer has no ground in time, has no `anchorGround` (the stand-in), or the placed set does not pass the check.
 * Never throws.
 */
export async function planAnchorsFromViewer(input: {
  worldId: string;
  ground: () => AnchorGround | undefined | null;
  wait?: Parameters<typeof waitForGround>[1];
}): Promise<Anchor[] | undefined> {
  try {
    const ground = await waitForGround(input.ground, input.wait);
    if (ground === undefined) return undefined;
    return planClientAnchors({ worldId: input.worldId, spawn: ground.spawn, bounds: ground.bounds, sampler: ground.sampler });
  } catch {
    return undefined;
  }
}
