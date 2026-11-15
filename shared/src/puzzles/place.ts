import { hash, mulberry32, randInt, shuffle } from "./rng";
import { BUILT_KINDS, isMemoryKind, type BuiltKind, type Level, type PuzzleSetting } from "./types";
import { ErrorCode, fail, ok, type Result } from "../errors";

export type PlacedLock = Readonly<{
  lockId: string;
  zone: string;
  kind: BuiltKind;
  level: Level;
  seed: number;
  /** The Zone that shows this Lock's Sight (the next Zone round the ring), or null for a Kind with no Sight. */
  sightZone: string | null;
}>;

/**
 * Put one Lock in every Zone, deterministically from the room seed. Each enabled Kind is used at most twice, and a
 * Memory Kind's Sight sits in the next Zone round the ring, so every Zone holds at most one Sight. `off` places none.
 * Needs at least two Zones, and at most two Zones for every enabled Kind.
 */
export function placePuzzles(
  roomSeed: number,
  zones: readonly string[],
  setting: PuzzleSetting,
  enabled: readonly BuiltKind[] = BUILT_KINDS,
): Result<readonly PlacedLock[]> {
  if (setting === "off") return ok([]);
  const kinds = [...new Set(enabled)];
  if (zones.length < 2 || new Set(zones).size !== zones.length || zones.length > 2 * kinds.length) {
    return fail(ErrorCode.puzzle_bad_placement);
  }
  const r = mulberry32(hash("place", roomSeed));
  const pool = [...shuffle(r, kinds), ...shuffle(r, kinds)];
  const locks = zones.map((zone, i): PlacedLock => {
    const kind = pool[i] as BuiltKind;
    return {
      lockId: `L${hash(roomSeed, "lock-id", zone).toString(16).padStart(8, "0")}`,
      zone,
      kind,
      level: setting,
      seed: hash(roomSeed, "lock", zone),
      sightZone: isMemoryKind(kind) ? (zones[(i + 1) % zones.length] as string) : null,
    };
  });
  return ok(locks);
}

/**
 * The Kind for the Nth memory found in Wander (0 is the first). The first is never a Memory Kind, because there is
 * no earlier scene to have seen its Sight in. Null when no enabled Kind fits.
 */
export function kindForDiscovery(seed: number, index: number, enabled: readonly BuiltKind[] = BUILT_KINDS): BuiltKind | null {
  const pool = index === 0 ? enabled.filter((k) => !isMemoryKind(k)) : [...enabled];
  if (pool.length === 0) return null;
  return pool[randInt(mulberry32(hash("discovery", seed, index)), pool.length)] as BuiltKind;
}
