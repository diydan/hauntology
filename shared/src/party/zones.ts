import { hash, mulberry32 } from "../puzzles/rng";

/**
 * Zones in the world (party-mode 4.5): six places, on walkable floor, inside the walk radius and the bounds, at least
 * 3 m from the spawn and 4 m from each other. Authored Zones win when a Gallery World has them; otherwise the Room
 * samples them from the seed, and falls back to a fixed ring when sampling fails. A world whose walk radius is under
 * 7 m with no authored Zones is refused as `world_too_small`.
 */
export type Point = Readonly<{ x: number; z: number }>;
export type Bounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
/** Whether a point is on walkable floor (the Viewer's collider answers this). */
export type Sampler = Readonly<{ walkable: (p: Point) => boolean }>;
export type ZoneWorld = Readonly<{ sampler: Sampler; spawn: Point; bounds: Bounds; walkRadius: number }>;

export const ZONE_COUNT = 6;
export const MIN_FROM_SPAWN = 3;
export const MIN_APART = 4;
export const ZONE_RADIUS = 2.5;
export const MIN_WALK_RADIUS = 7;
const TRIES = 400;

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
const inBounds = (p: Point, b: Bounds): boolean => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

/** The reasons a set of Zones fails, empty when it passes. `walkable` false checks geometry only (the ring). */
export function zoneProblems(zones: readonly Point[], world: ZoneWorld, walkable = true): string[] {
  const out: string[] = [];
  if (zones.length !== ZONE_COUNT) out.push("count");
  zones.forEach((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) out.push(`${i}:not_finite`);
    if (!inBounds(p, world.bounds)) out.push(`${i}:out_of_bounds`);
    if (dist(p, world.spawn) > world.walkRadius + 1e-9) out.push(`${i}:beyond_walk_radius`);
    if (dist(p, world.spawn) < MIN_FROM_SPAWN - 1e-9) out.push(`${i}:near_spawn`);
    if (walkable && !world.sampler.walkable(p)) out.push(`${i}:not_walkable`);
    for (let j = 0; j < i; j++) if (dist(p, zones[j] as Point) < MIN_APART - 1e-9) out.push(`${i}:near_${j}`);
  });
  return out;
}
export const validateZones = (zones: readonly Point[], world: ZoneWorld, walkable = true): boolean => zoneProblems(zones, world, walkable).length === 0;

/**
 * Pick `count` points by seeded rejection sampling with the Anchor rules. Returns null when the world has no room for
 * them within the tries. Shared with ghost Anchors when that code lands.
 */
export function placePoints(world: ZoneWorld, seed: number, count: number, minApart = MIN_APART): Point[] | null {
  const r = mulberry32(hash("zones", seed));
  const out: Point[] = [];
  for (let t = 0; t < TRIES && out.length < count; t++) {
    const ang = r() * Math.PI * 2;
    const rad = MIN_FROM_SPAWN + Math.sqrt(r()) * (world.walkRadius - MIN_FROM_SPAWN);
    const p = { x: Math.round((world.spawn.x + Math.cos(ang) * rad) * 100) / 100, z: Math.round((world.spawn.z + Math.sin(ang) * rad) * 100) / 100 };
    if (dist(p, world.spawn) < MIN_FROM_SPAWN || dist(p, world.spawn) > world.walkRadius) continue;
    if (!inBounds(p, world.bounds) || !world.sampler.walkable(p)) continue;
    if (out.some((q) => dist(p, q) < minApart)) continue;
    out.push(p);
  }
  return out.length === count ? out : null;
}

/** Six points 60 degrees apart on a ring of radius clamp(0.6 x walk radius, 4, 8) round the spawn. */
export function ringZones(spawn: Point, walkRadius: number): Point[] {
  const radius = Math.min(8, Math.max(4, 0.6 * walkRadius));
  return Array.from({ length: ZONE_COUNT }, (_, i) => ({ x: spawn.x + radius * Math.cos((i * Math.PI) / 3), z: spawn.z + radius * Math.sin((i * Math.PI) / 3) }));
}

export type ZonePlacement =
  | Readonly<{ ok: true; zones: readonly Point[]; source: "authored" | "placed" | "ring" }>
  | Readonly<{ ok: false; code: "world_too_small" }>;

/** Where the six Zones go. Runs when the Master picks the world, so a world too small is refused before the lobby closes. */
export function placeZones(world: ZoneWorld, seed: number, authored: readonly Point[] | null = null): ZonePlacement {
  if (authored !== null && validateZones(authored, world)) return { ok: true, zones: authored, source: "authored" };
  if (world.walkRadius < MIN_WALK_RADIUS) return { ok: false, code: "world_too_small" };
  const placed = placePoints(world, seed, ZONE_COUNT);
  if (placed !== null && validateZones(placed, world)) return { ok: true, zones: placed, source: "placed" };
  return { ok: true, zones: ringZones(world.spawn, world.walkRadius), source: "ring" };
}
