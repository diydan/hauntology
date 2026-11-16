// Where the Table goes in front of a phone, from the direction the phone points. Pure, so a test can run it.
// The board lands along the way the phone points, so it is where the Player is looking when they press Place, and never
// higher than a table 28 centimetres below the phone, so that its top is in view even when the phone is held upright.
export const SLANT = 0.85;     // metres from the phone to the middle of the board
export const MIN_DROP = 0.28;  // the board is never higher than this below the phone
export const MIN_ACROSS = 0.3; // and never closer than this across the floor

// f: the unit direction the phone points ({x, y, z}, y up). last: the heading to keep when the phone points almost straight up or down.
export function placeFor(f, last = { x: 0, z: -1 }) {
  if (![f.x, f.y, f.z].every(Number.isFinite)) f = { x: 0, y: -0.7, z: -0.7 };
  const flat = Math.hypot(f.x, f.z);
  const heading = flat < 0.2 ? last : { x: f.x / flat, z: f.z / flat };
  let y = f.y * SLANT;
  if (y > -MIN_DROP) y = -MIN_DROP;
  const across = Math.max(MIN_ACROSS, Math.sqrt(Math.max(0, SLANT * SLANT - y * y)));
  return { x: heading.x * across, y, z: heading.z * across, facing: Math.atan2(-heading.x, -heading.z), heading };
}
