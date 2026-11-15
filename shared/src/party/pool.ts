import { hash, mulberry32, shuffle } from "../puzzles/rng";

/**
 * The case pool (party-mode 3.1 to 3.4): six Suspects, six Zones and six Relics. What the Players made comes first;
 * the rest is filled from the Preset Ghosts and a curated list of Zone names, so the lobby can always start, even
 * when nobody contributed, every photo was rejected and every portrait failed.
 */

export const RELICS = [
  { id: "r1", name: "music box" }, { id: "r2", name: "wax hand" }, { id: "r3", name: "locket" },
  { id: "r4", name: "planchette" }, { id: "r5", name: "silver key" }, { id: "r6", name: "bell" },
] as const;

/** Twelve curated Zone names for the fill. Plain, a little eerie, all short. */
export const CURATED_ZONE_NAMES = [
  "The Long Hall", "The Cold Pantry", "The Nursery", "The Study", "The Back Stairs", "The Glasshouse",
  "The Cellar", "The Attic", "The Music Room", "The Old Kitchen", "The Library", "The Garden Door",
] as const;

export const ZONE_NAME_MIN = 3;
export const ZONE_NAME_MAX = 24;

/** What one seat offered in the lobby. Every field is optional: none is needed to start (3.1). */
export type Contribution = Readonly<{
  seat: number;
  /** A designed or selfie Suspect: its Ghost Profile id, and whether making its portrait worked. */
  ghost?: Readonly<{ profileId: string; status: "ok" | "failed" }>;
  /** A photo to frame near a Zone, and its safety verdict. */
  photo?: Readonly<{ photoId: string; status: "accepted" | "rejected" }>;
  zoneName?: string;
}>;

export type PoolSuspect = Readonly<{ id: string; profileId: string; contributedBy: number | null }>;
export type PoolZone = Readonly<{ id: string; name: string; contributedBy: number | null }>;
export type Pool = Readonly<{
  suspects: readonly PoolSuspect[];
  zones: readonly PoolZone[];
  relics: typeof RELICS;
  /** Accepted photos only, by seat order. A rejected photo is dropped and its Player keeps their seat (3.2). */
  photos: readonly Readonly<{ photoId: string; seat: number }>[];
}>;

/** A Zone name a Player typed, cleaned; null when it is too short or too long to use. */
export function cleanZoneName(raw: string): string | null {
  const s = raw.normalize("NFKC").replace(/\p{C}/gu, " ").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
  return [...s].length >= ZONE_NAME_MIN && [...s].length <= ZONE_NAME_MAX ? s : null;
}

/**
 * Build the pool, deterministically from the contributions, the Preset Ghost ids and the seed (3.4).
 * A failed portrait falls back to a Preset Ghost (3.3); a duplicate ghost or Zone name counts once.
 */
export function buildPool(contributions: readonly Contribution[], presetIds: readonly string[], seed: number): Pool {
  const bySeat = [...contributions].sort((a, b) => a.seat - b.seat);
  const r = mulberry32(hash("pool", seed));

  const suspects: PoolSuspect[] = [];
  const usedProfiles = new Set<string>();
  for (const c of bySeat) {
    if (suspects.length >= 6 || c.ghost?.status !== "ok" || usedProfiles.has(c.ghost.profileId)) continue;
    usedProfiles.add(c.ghost.profileId);
    suspects.push({ id: `s${suspects.length + 1}`, profileId: c.ghost.profileId, contributedBy: c.seat });
  }
  for (const p of shuffle(r, [...new Set(presetIds)])) {
    if (suspects.length >= 6) break;
    if (usedProfiles.has(p)) continue;
    usedProfiles.add(p);
    suspects.push({ id: `s${suspects.length + 1}`, profileId: p, contributedBy: null });
  }
  if (suspects.length < 6) throw new Error("buildPool needs at least six Preset Ghosts");

  const zones: PoolZone[] = [];
  const usedNames = new Set<string>();
  const addZone = (name: string, by: number | null): void => {
    const key = name.toLowerCase();
    if (zones.length >= 6 || usedNames.has(key)) return;
    usedNames.add(key);
    zones.push({ id: `z${zones.length + 1}`, name, contributedBy: by });
  };
  for (const c of bySeat) { const n = c.zoneName === undefined ? null : cleanZoneName(c.zoneName); if (n !== null) addZone(n, c.seat); }
  for (const n of shuffle(r, CURATED_ZONE_NAMES)) addZone(n, null);

  const photos = bySeat.flatMap((c) => (c.photo?.status === "accepted" ? [{ photoId: c.photo.photoId, seat: c.seat }] : []));
  return { suspects, zones, relics: RELICS, photos };
}
