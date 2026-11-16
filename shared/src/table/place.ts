/**
 * Where the Spirit table lands when the Player taps Place (spirit-table 4.1): 0.85 m along the phone's current view
 * direction, never higher than 28 cm below the phone and never closer than 30 cm across the floor, with the front
 * edge facing the Player. Matches tools/playtest/js/ar-place.js.
 */
export const PLACE_SLANT = 0.85;
export const PLACE_MIN_DROP = 0.28;
export const PLACE_MIN_ACROSS = 0.3;
export const PLACE_FLAT_EPS = 0.2;

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type Heading2 = Readonly<{ x: number; z: number }>;
export type PlacedTable = Readonly<{ x: number; y: number; z: number; facing: number; heading: Heading2 }>;

function unitHeading(h: Heading2): Heading2 {
  if (!Number.isFinite(h.x) || !Number.isFinite(h.z)) return { x: 0, z: -1 };
  const len = Math.hypot(h.x, h.z);
  return len > 1e-9 ? { x: h.x / len, z: h.z / len } : { x: 0, z: -1 };
}

export function placeTable(dir: Vec3, lastHeading: Heading2 = { x: 0, z: -1 }): PlacedTable {
  const fallback = unitHeading(lastHeading);
  const len = Number.isFinite(dir.x) && Number.isFinite(dir.y) && Number.isFinite(dir.z) ? Math.hypot(dir.x, dir.y, dir.z) : 0;
  const ux = len > 1e-9 ? dir.x / len : fallback.x;
  const uy = len > 1e-9 ? dir.y / len : 0;
  const uz = len > 1e-9 ? dir.z / len : fallback.z;

  const flat = Math.hypot(ux, uz);
  const heading = flat < PLACE_FLAT_EPS ? fallback : { x: ux / flat, z: uz / flat };
  const y = Math.min(-PLACE_MIN_DROP, uy * PLACE_SLANT);
  const across = Math.max(PLACE_MIN_ACROSS, Math.sqrt(Math.max(0, PLACE_SLANT * PLACE_SLANT - y * y)));
  return {
    x: heading.x * across,
    y,
    z: heading.z * across,
    facing: Math.atan2(-heading.x, -heading.z),
    heading,
  };
}
