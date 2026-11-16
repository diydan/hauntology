import { hashParts, mulberry32, shuffleWith } from "./hash";
import type { Slot } from "./marks";

/**
 * Cosmetic 3-by-2 room layout for the Spirit table (spirit-table 2.1): assigns each of the six Zones in the pool
 * to one of six slots from the Room Code alone, never from any game secret, so every phone in the Room sees the
 * same floor plan and the layout reveals nothing about where Zones sit in the world.
 */
export type RoomLayout = Readonly<{ zone: string; slot: number }>;

export const SLOT_COUNT = 6;

/** Convert a slot index (0 to 5) into its column (0 to 2, left to right) and row (0 back, 1 front). */
export const slotCoord = (slot: number): Slot => ({
  c: ((Math.trunc(slot) % 3) + 3) % 3,
  r: Math.trunc(slot) >= 3 ? 1 : 0,
});

/** Deterministic Zone-to-slot assignment from Room Code and Zone ids. */
export function tableLayout(roomCode: string, zones: readonly string[]): RoomLayout[] {
  if (zones.length === 0) return [];
  const unique = [...new Set(zones)].sort();
  const next = mulberry32(hashParts("table-layout", roomCode, ...unique));
  if (unique.length === zones.length) {
    const order = shuffleWith(next, unique);
    const slotOf = new Map(order.map((z, i) => [z, i] as const));
    return zones.map((zone) => ({ zone, slot: slotOf.get(zone) ?? 0 }));
  }
  const indices = shuffleWith(next, zones.map((_, i) => i));
  return zones.map((zone, i) => ({ zone, slot: indices[i] ?? i }));
}
