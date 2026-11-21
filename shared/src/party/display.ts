/**
 * The optional Display (party-mode 7.3, 7.4, 10.x): the pyramid layout and the photosensitivity limits for reactions.
 * Pure. Pixels come from the on-screen calibration; no pixel density is assumed.
 */
export type TileId = "top" | "right" | "bottom" | "left";
export type PyramidInput = Readonly<{ width: number; height: number; innerPx: number; tilePx: number; orientation: "inward" | "outward"; mirror: boolean }>;
export type Tile = Readonly<{ id: TileId; cx: number; cy: number; size: number; rotationDeg: 0 | 90 | 180 | 270; mirror: boolean }>;

const DIRS: readonly { id: TileId; dx: number; dy: number; rot: 0 | 90 | 180 | 270 }[] = [
  { id: "top", dx: 0, dy: -1, rot: 0 },
  { id: "right", dx: 1, dy: 0, rot: 90 },
  { id: "bottom", dx: 0, dy: 1, rot: 180 },
  { id: "left", dx: -1, dy: 0, rot: 270 },
];

const num = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * The largest tile (at most `tilePx`) that stays on the screen (`halfExtent` is the distance from the centre to the
 * screen edge along the tile's axis) and cannot reach across the centre into a neighbour (at most twice the inner gap).
 * Zero means the tile does not fit and is left out.
 */
export function fitTile(tilePx: number, innerPx: number, halfExtent: number): number {
  const inner = Math.max(0, num(innerPx));
  const s = Math.min(Math.max(0, num(tilePx)), num(halfExtent) - inner, 2 * inner);
  return Math.max(0, s);
}

/** Four tiles at 0, 90, 180 and 270 degrees, each centred `innerPx + size / 2` from the centre, shrunk to fit, never overlapping. */
export function pyramidLayout(i: PyramidInput): Tile[] {
  const cx = num(i.width) / 2, cy = num(i.height) / 2;
  // Every tile uses one size, so the picture stays symmetric: the smallest that fits on every side.
  const size = Math.min(fitTile(i.tilePx, i.innerPx, cy), fitTile(i.tilePx, i.innerPx, cx));
  if (size <= 0) return [];
  const inner = Math.max(0, num(i.innerPx));
  const flip = i.orientation === "outward" ? 180 : 0;
  return DIRS.map((d) => ({
    id: d.id,
    cx: cx + d.dx * (inner + size / 2),
    cy: cy + d.dy * (inner + size / 2),
    size,
    rotationDeg: ((d.rot + flip) % 360) as 0 | 90 | 180 | 270,
    mirror: i.mirror,
  }));
}

/** The reaction kinds of 7.4, plus the Blackout dimming of a Haunt Event. */
export type ReactionKind = "suggest" | "shown" | "accuse-wrong" | "accuse-right" | "achievement" | "time-warning" | "haunt-event" | "blackout";
export type ReactionEvent = Readonly<{ id: number; atMs: number; kind: ReactionKind }>;
export type Reaction = Readonly<{
  id: number; kind: ReactionKind;
  /** When each flash starts. */
  flashes: readonly number[];
  /** The size of each flash as a share of full brightness. */
  flashStepPct: number;
  /** A Blackout dims in steps of at most 20% each. */
  dim: readonly { atMs: number; levelPct: number }[];
  /** The culprit's Sprite is revealed on a correct Accusation. */
  reveal: boolean;
}>;

export const MAX_FLASHES_PER_SECOND = 3;
export const MAX_LUMINANCE_STEP_PCT = 20;
/** Flashes are at least a third of a second apart (a little over, so three never fit in under a second). */
export const MIN_FLASH_GAP_MS = 334;
const FLASH_STEP_PCT = 15;
const FLASHES: Readonly<Record<ReactionKind, number>> = {
  suggest: 1, shown: 1, "accuse-wrong": 2, "accuse-right": 3, achievement: 2, "time-warning": 1, "haunt-event": 2, blackout: 0,
};
const DIM_TARGET_PCT = 40;

/**
 * Schedules reactions within the photosensitivity limits: at most three flashes in any second across every reaction,
 * a luminance step of at most 20%, and nothing at all when the visitor prefers reduced motion. A reaction that would
 * break the rate is moved later, never dropped; events are taken in time order.
 */
export function effectLimits(events: readonly ReactionEvent[], prefersReducedMotion: boolean): Reaction[] {
  if (prefersReducedMotion) return [];
  const out: Reaction[] = [];
  let nextFree = Number.NEGATIVE_INFINITY;
  for (const e of [...events].sort((a, b) => a.atMs - b.atMs || a.id - b.id)) {
    const flashes: number[] = [];
    for (let k = 0; k < FLASHES[e.kind]; k++) {
      const t = Math.max(num(e.atMs), nextFree);
      flashes.push(t);
      nextFree = t + MIN_FLASH_GAP_MS;
    }
    const dim: { atMs: number; levelPct: number }[] = [];
    if (e.kind === "blackout") {
      let level = 100;
      let t = num(e.atMs);
      while (level > DIM_TARGET_PCT) {
        level = Math.max(DIM_TARGET_PCT, level - MAX_LUMINANCE_STEP_PCT);
        t += MIN_FLASH_GAP_MS;
        dim.push({ atMs: t, levelPct: level });
      }
    }
    out.push({ id: e.id, kind: e.kind, flashes, flashStepPct: FLASH_STEP_PCT, dim, reveal: e.kind === "accuse-right" });
  }
  return out;
}
