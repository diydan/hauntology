/**
 * Pepper's-ghost pyramid trapezoid and parametric holder geometry (party-mode 8.3).
 * Defaults to a 60 mm base edge and 10 mm top edge with faces inclined at 45° to the screen.
 */

export const DEFAULT_PYRAMID_BASE_MM = 60;
export const DEFAULT_PYRAMID_TOP_MM = 10;

export type PyramidOptions = Readonly<{
  baseMm?: number;
  topMm?: number;
}>;

export type Point2D = readonly [number, number];

export type PyramidTrapezoid = Readonly<{
  baseMm: number;
  topMm: number;
  /** Horizontal inset from base edge to top edge in 3D: `(baseMm - topMm) / 2`. */
  runMm: number;
  /** Vertical height of the truncated pyramid at 45° inclination: `(baseMm - topMm) / 2`. */
  heightMm: number;
  /** 2D slant height of each isosceles trapezoid face: `((baseMm - topMm) / 2) * Math.SQRT2`. */
  slantMm: number;
  /** Inclination angle of each trapezoid face to the horizontal screen in degrees (`45`). */
  angleDeg: number;
  /** Length of the two equal sloped side edges of the 2D trapezoid pattern. */
  legMm: number;
  /** Four 2D vertices `[x, y]` of the isosceles trapezoid template (counter-clockwise). */
  vertices2d: readonly [Point2D, Point2D, Point2D, Point2D];
}>;

export function pyramidTrapezoid(opts: PyramidOptions = {}): PyramidTrapezoid {
  const baseMm = opts.baseMm ?? DEFAULT_PYRAMID_BASE_MM;
  const topMm = opts.topMm ?? DEFAULT_PYRAMID_TOP_MM;
  if (!Number.isFinite(baseMm) || !Number.isFinite(topMm) || !(topMm > 0) || !(baseMm > topMm)) {
    throw new Error(`pyramidTrapezoid requires 0 < topMm < baseMm (got topMm=${topMm}, baseMm=${baseMm})`);
  }

  const runMm = (baseMm - topMm) / 2;
  const heightMm = runMm; // tan(45°) === 1
  const slantMm = runMm * Math.SQRT2;
  const angleDeg = (Math.atan2(heightMm, runMm) * 180) / Math.PI;
  const legMm = Math.hypot(runMm, slantMm);

  const halfBase = baseMm / 2;
  const halfTop = topMm / 2;
  const vertices2d: readonly [Point2D, Point2D, Point2D, Point2D] = [
    [-halfBase, 0],
    [halfBase, 0],
    [halfTop, slantMm],
    [-halfTop, slantMm],
  ];

  return {
    baseMm,
    topMm,
    runMm,
    heightMm,
    slantMm,
    angleDeg,
    legMm,
    vertices2d,
  };
}

export type HolderParams = Readonly<{
  baseMm: number;
  topMm: number;
  heightMm: number;
  slantMm: number;
  angleDeg: number;
  frameOuterMm: number;
  wallMm: number;
  slotWidthMm: number;
}>;

/**
 * Compute parametric pyramid holder dimensions scaled for a given screen footprint (phone or tablet),
 * clamped so the printed frame always fits within a 180 mm bed.
 */
export function holderParams(
  footprintMm = DEFAULT_PYRAMID_BASE_MM,
  opts: Readonly<{ maxBedMm?: number; wallMm?: number; slotWidthMm?: number }> = {},
): HolderParams {
  const maxBedMm = opts.maxBedMm ?? 180;
  const wallMm = opts.wallMm ?? 2.4;
  const slotWidthMm = opts.slotWidthMm ?? 0.8;
  const maxBase = Math.max(20, maxBedMm - 2 * wallMm - 8);
  const baseMm = Math.min(maxBase, Math.max(24, footprintMm));
  const ratio = DEFAULT_PYRAMID_TOP_MM / DEFAULT_PYRAMID_BASE_MM;
  const topMm = Math.max(6, Math.min(baseMm - 10, Math.round(baseMm * ratio * 10) / 10));
  const trap = pyramidTrapezoid({ baseMm, topMm });
  return {
    baseMm: trap.baseMm,
    topMm: trap.topMm,
    heightMm: trap.heightMm,
    slantMm: trap.slantMm,
    angleDeg: trap.angleDeg,
    frameOuterMm: trap.baseMm + 2 * wallMm + 4,
    wallMm,
    slotWidthMm,
  };
}
