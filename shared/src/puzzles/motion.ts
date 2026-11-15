/**
 * Tilt maths: turning a phone's orientation into a steady, bounded, screen-correct angle. Pure; the sensor itself
 * lives in `web/src/puzzles/feel/motion.ts`. Every function is total: NaN, infinities and missing values count as 0.
 */
export type Tilt = Readonly<{ x: number; y: number }>;

export const TILT_MAX = 45;
export const DEAD_ZONE = 2;

const finite = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** An exponential average: `alpha` of the new reading each step. */
export const smoothTilt = (prev: Tilt, raw: Tilt, alpha = 0.2): Tilt => ({
  x: finite(prev.x) + alpha * (finite(raw.x) - finite(prev.x)),
  y: finite(prev.y) + alpha * (finite(raw.y) - finite(prev.y)),
});

/** Changes under `dz` degrees count as nothing; larger ones are reduced by `dz`, so there is no jump at the edge. */
export const deadZone = (v: number, dz = DEAD_ZONE): number => {
  const x = finite(v);
  return Math.abs(x) <= dz ? 0 : x - Math.sign(x) * dz;
};

/**
 * Raw `beta` and `gamma` (degrees) to a screen-space tilt: `x > 0` when the right side of the screen is lower and
 * `y > 0` when the bottom is lower, for screen angles 0, 90, 180 and 270 (other angles round to the nearest quarter).
 */
export function tiltForScreen(raw: Readonly<{ beta: number; gamma: number }>, angle = 0): Tilt {
  const b = finite(raw.beta);
  const g = finite(raw.gamma);
  const a = (((Math.round(finite(angle) / 90) * 90) % 360) + 360) % 360;
  switch (a) {
    case 90: return { x: b, y: -g };
    case 180: return { x: -g, y: -b };
    case 270: return { x: -b, y: g };
    default: return { x: g, y: b };
  }
}

/** The angle the Player holds the phone at (taken on a "hold level" tap) becomes neutral. */
export const zeroTilt = (zero: Tilt, raw: Tilt): Tilt => ({ x: finite(raw.x) - finite(zero.x), y: finite(raw.y) - finite(zero.y) });
export const clampTilt = (t: Tilt, max = TILT_MAX): Tilt => ({ x: clamp(finite(t.x), -max, max), y: clamp(finite(t.y), -max, max) });

/** A tilt of -45 to 45 degrees to a position in [lo, hi]: linear, clamped, monotone. */
export const tiltToPosition = (deg: number, lo = -40, hi = 40): number =>
  lo + ((clamp(finite(deg), -TILT_MAX, TILT_MAX) + TILT_MAX) / (2 * TILT_MAX)) * (hi - lo);

/**
 * The turn of the phone about its own screen axis (twisting it like a steering wheel) from the gravity vector, in
 * degrees (-180, 180]. Null when the phone lies nearly flat, where gravity no longer lies in the screen plane.
 * Sign conventions differ by platform; Spike puzzles 1.2 decides, and the screens offer an invert switch.
 */
export function dialFromGravity(ax: number, ay: number, az: number): number | null {
  const x = finite(ax);
  const y = finite(ay);
  if (Math.abs(finite(az)) > 7.5) return null;
  if (Math.hypot(x, y) < 2) return null;
  return (Math.atan2(x, y) * 180) / Math.PI;
}
