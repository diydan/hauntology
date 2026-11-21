import { hash, mulberry32, randInt, shuffle } from "./rng";
import { DEFAULT_KINDS, isMemoryKind, type Kind, type Level, type PuzzleSetting } from "./types";
import { ErrorCode, fail, ok, type Result } from "../errors";

export type PlacedLock = Readonly<{
  lockId: string;
  zone: string;
  kind: Kind;
  level: Level;
  seed: number;
  /** The Zone that shows this Lock's Sight (the next Zone round the ring), or null for a Kind with no Sight. */
  sightZone: string | null;
}>;

/**
 * Put one Lock in every Zone, deterministically from the room seed. Each enabled Kind is used at most twice, and a
 * Memory Kind's Sight sits in another Zone with no two Sights sharing a Zone. When `reachable` is supplied, Sights for
 * Locks in reachable Zones stay within `reachable` (avoiding Memory Kinds if fewer than 2 reachable Zones exist and a
 * non-Memory Kind is enabled), so no Player is sent behind a shut door for an open Lock (knock-door 2.8). `off` places none.
 * Needs at least two Zones, and at most two Zones for every enabled Kind.
 */
export function placePuzzles(
  roomSeed: number,
  zones: readonly string[],
  setting: PuzzleSetting,
  enabled: readonly Kind[] = DEFAULT_KINDS,
  reachable?: readonly string[],
): Result<readonly PlacedLock[]> {
  if (setting === "off") return ok([]);
  const kinds = [...new Set(enabled)];
  if (zones.length < 2 || new Set(zones).size !== zones.length || zones.length > 2 * kinds.length) {
    return fail(ErrorCode.puzzle_bad_placement);
  }
  const r = mulberry32(hash("place", roomSeed));
  const pool = [...shuffle(r, kinds), ...shuffle(r, kinds)];
  const open = reachable ? zones.filter((z) => reachable.includes(z)) : zones;
  const shut = reachable ? zones.filter((z) => !reachable.includes(z)) : [];
  if (reachable !== undefined && open.length === 1) {
    const idx0 = zones.indexOf(open[0] as string);
    if (idx0 >= 0 && isMemoryKind(pool[idx0] as Kind)) {
      const swapIdx = pool.slice(0, zones.length).findIndex((k) => !isMemoryKind(k));
      if (swapIdx >= 0) [pool[idx0], pool[swapIdx]] = [pool[swapIdx] as Kind, pool[idx0] as Kind];
    }
  }
  const sightForZone = (zone: string, i: number, kind: Kind): string | null => {
    if (!isMemoryKind(kind)) return null;
    if (reachable === undefined) return zones[(i + 1) % zones.length] as string;
    if (open.includes(zone)) {
      if (open.length >= 2) return open[(open.indexOf(zone) + 1) % open.length] as string;
      return zones[(i + 1) % zones.length] as string;
    }
    if (shut.length >= 2) return shut[(shut.indexOf(zone) + 1) % shut.length] as string;
    return open[0] ?? (zones[(i + 1) % zones.length] as string);
  };
  const locks = zones.map((zone, i): PlacedLock => {
    const kind = pool[i] as Kind;
    return {
      lockId: `L${hash(roomSeed, "lock-id", zone).toString(16).padStart(8, "0")}`,
      zone,
      kind,
      level: setting,
      seed: hash(roomSeed, "lock", zone),
      sightZone: sightForZone(zone, i, kind),
    };
  });
  return ok(locks);
}

/**
 * The Kind for the Nth memory found in Wander (0 is the first). The first is never a Memory Kind, because there is
 * no earlier scene to have seen its Sight in. Null when no enabled Kind fits.
 */
export function kindForDiscovery(seed: number, index: number, enabled: readonly Kind[] = DEFAULT_KINDS): Kind | null {
  const pool = index === 0 ? enabled.filter((k) => !isMemoryKind(k)) : [...enabled];
  if (pool.length === 0) return null;
  return pool[randInt(mulberry32(hash("discovery", seed, index)), pool.length)] as Kind;
}
