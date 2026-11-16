import { ANCHOR_IDS, ANCHOR_RADIUS, type Anchor, type Bounds, type Vec3 } from "./types";
import type { Rng } from "./rng";

/** The least distance from the spawn, and between two anchors, in scaled world units (Requirement 1.2). */
export const MIN_SPAWN_DISTANCE = 3;
export const MIN_ANCHOR_SPACING = 4;
/** `sampler(x, z)` is the floor height there, or `null` where there is no floor (a raycast on the client, one constant in disc mode). */
export type FloorSampler = (x: number, z: number) => number | null;

export type AnchorContext = { spawn: Vec3; bounds: Bounds; walkRadius: number; sampler?: FloorSampler };
export type AnchorCheck = { ok: true; anchors: Anchor[] } | { ok: false; reason: "shape" | "bounds" | "walk_radius" | "spawn_distance" | "spacing" | "floor" };

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const inside = (p: Vec3, b: Bounds): boolean => p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];
const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * Whether three anchors may be used (Requirements 1.2 and 1.5): exactly `a1`, `a2` and `a3`, finite, inside the bounds and the walk
 * radius, at least 3 m from the spawn and 4 m from each other (on the floor plane), and, when a floor sampler is given, standing on the floor
 * it knows. Whatever radius a client sent is dropped: the server's radius is the one that counts. The anchors come back in id order.
 */
export function validateAnchors(input: unknown, ctx: AnchorContext): AnchorCheck {
  if (!Array.isArray(input) || input.length !== ANCHOR_IDS.length) return { ok: false, reason: "shape" };
  const byId = new Map<string, Vec3>();
  for (const a of input) {
    const o = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : null;
    if (o === null || typeof o["id"] !== "string" || !(ANCHOR_IDS as readonly string[]).includes(o["id"]) || byId.has(o["id"]) || !isVec3(o["pos"])) return { ok: false, reason: "shape" };
    byId.set(o["id"], o["pos"]);
  }
  const anchors: Anchor[] = ANCHOR_IDS.map((id) => ({ id, pos: byId.get(id) as Vec3, radius: ANCHOR_RADIUS }));
  for (const a of anchors) {
    if (!inside(a.pos, ctx.bounds)) return { ok: false, reason: "bounds" };
    if (flat(a.pos, ctx.spawn) > ctx.walkRadius) return { ok: false, reason: "walk_radius" };
    if (flat(a.pos, ctx.spawn) < MIN_SPAWN_DISTANCE) return { ok: false, reason: "spawn_distance" };
    if (ctx.sampler !== undefined) {
      const y = ctx.sampler(a.pos[0], a.pos[2]);
      if (y === null || Math.abs(y - a.pos[1]) > 0.5) return { ok: false, reason: "floor" };
    }
  }
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) if (flat((anchors[i] as Anchor).pos, (anchors[j] as Anchor).pos) < MIN_ANCHOR_SPACING) return { ok: false, reason: "spacing" };
  return { ok: true, anchors };
}

/** Three anchors 120 degrees apart on a ring around the spawn, of radius 0.6 of the walk radius kept between 3 m and 8 m (the fixed layout when none else is good). */
export function ringAnchors(spawn: Vec3, walkRadius: number, floorY: number = spawn[1]): Anchor[] {
  const radius = Math.min(8, Math.max(3, 0.6 * walkRadius));
  return ANCHOR_IDS.map((id, i) => {
    const angle = (i * 2 * Math.PI) / 3;
    return { id, pos: [spawn[0] + radius * Math.cos(angle), floorY, spawn[2] + radius * Math.sin(angle)] as Vec3, radius: ANCHOR_RADIUS };
  });
}

export const MAX_ATTEMPTS = 200;

/**
 * Three positions chosen from a seed (`rng`) by trying points around the spawn: a distance between 3 m and the walk radius, a direction
 * from 0 to 360 degrees, snapped to the floor by `sampler`. A point is kept when it is inside the bounds and at least 4 m from those already kept;
 * after 200 tries for one anchor the whole set is the ring instead. The same seed and room give the same anchors. Needs a walk radius of
 * 5 m or more (the manifest's ingest keeps to it; below that the ring is given).
 */
export function placeAnchors(input: { sampler: FloorSampler; spawn: Vec3; bounds: Bounds; walkRadius: number; rng: Rng }): Anchor[] {
  const { sampler, spawn, bounds, walkRadius, rng } = input;
  // The ring stands on the floor under the spawn (the spawn itself is at eye height).
  const ring = (): Anchor[] => ringAnchors(spawn, walkRadius, sampler(spawn[0], spawn[2]) ?? spawn[1]);
  if (!(walkRadius >= 5)) return ring();
  const kept: Anchor[] = [];
  for (const id of ANCHOR_IDS) {
    let placed: Anchor | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && placed === null; attempt++) {
      const distance = MIN_SPAWN_DISTANCE + rng() * (walkRadius - MIN_SPAWN_DISTANCE);
      const angle = rng() * 2 * Math.PI;
      const x = spawn[0] + distance * Math.cos(angle);
      const z = spawn[2] + distance * Math.sin(angle);
      const y = sampler(x, z);
      if (y === null) continue;
      const pos: Vec3 = [x, y, z];
      if (!inside(pos, bounds) || flat(pos, spawn) > walkRadius || kept.some((k) => flat(k.pos, pos) < MIN_ANCHOR_SPACING)) continue;
      placed = { id, pos, radius: ANCHOR_RADIUS };
    }
    if (placed === null) return ring();
    kept.push(placed);
  }
  return kept;
}

/** The distance a visitor can walk from the spawn: the smaller half of the world's width and depth, never under 5 m. */
export const walkRadiusOf = (bounds: Bounds): number => Math.max(5, Math.min((bounds.max[0] - bounds.min[0]) / 2, (bounds.max[2] - bounds.min[2]) / 2));
