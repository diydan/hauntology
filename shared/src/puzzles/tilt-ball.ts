import { clampTilt, type Tilt } from "./motion";

/**
 * Tilt physics in fixed 1/60 second steps, for the planchette, the torch-free orb and the marble maze. The path does
 * not depend on how often the phone reports or how fast the screen draws (Property 13).
 */
export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;

export type Wall = Readonly<{ x: number; y: number; w: number; h: number }>;
export type World = Readonly<{
  w: number; h: number; walls: readonly Wall[]; r: number;
  accel: number; friction: number; maxSpeed: number; bounce: number; hitSpeed: number;
}>;
export type Ball = { x: number; y: number; vx: number; vy: number; totalMs: number; hits: number };

export const defaultWorld = (w: number, h: number, walls: readonly Wall[] = [], r = 14): World =>
  ({ w, h, walls, r, accel: 14, friction: 2.2, maxSpeed: 260, bounce: 0.3, hitSpeed: 40 });
export const newBall = (x: number, y: number): Ball => ({ x, y, vx: 0, vy: 0, totalMs: 0, hits: 0 });

const overlaps = (x: number, y: number, r: number, wall: Wall): boolean =>
  x + r > wall.x && x - r < wall.x + wall.w && y + r > wall.y && y - r < wall.y + wall.h;

/** One fixed step. Returns the speed of the hardest impact in the step, or 0 when nothing hit hard enough to count. */
export function stepBall(s: Ball, tilt: Tilt, world: World): number {
  const t = clampTilt(tilt);
  s.vx += t.x * world.accel * DT;
  s.vy += t.y * world.accel * DT;
  const f = Math.max(0, 1 - world.friction * DT);
  s.vx *= f;
  s.vy *= f;
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > world.maxSpeed) { s.vx *= world.maxSpeed / sp; s.vy *= world.maxSpeed / sp; }
  let impact = 0;
  const r = world.r;
  // x axis, then y axis, each resolved against the edges and the walls
  s.x += s.vx * DT;
  if (s.x < r) { s.x = r; impact = Math.max(impact, Math.abs(s.vx)); s.vx = -s.vx * world.bounce; }
  else if (s.x > world.w - r) { s.x = world.w - r; impact = Math.max(impact, Math.abs(s.vx)); s.vx = -s.vx * world.bounce; }
  for (const wall of world.walls) {
    if (overlaps(s.x, s.y, r, wall)) {
      s.x = s.vx > 0 ? wall.x - r : wall.x + wall.w + r;
      impact = Math.max(impact, Math.abs(s.vx));
      s.vx = -s.vx * world.bounce;
    }
  }
  s.y += s.vy * DT;
  if (s.y < r) { s.y = r; impact = Math.max(impact, Math.abs(s.vy)); s.vy = -s.vy * world.bounce; }
  else if (s.y > world.h - r) { s.y = world.h - r; impact = Math.max(impact, Math.abs(s.vy)); s.vy = -s.vy * world.bounce; }
  for (const wall of world.walls) {
    if (overlaps(s.x, s.y, r, wall)) {
      s.y = s.vy > 0 ? wall.y - r : wall.y + wall.h + r;
      impact = Math.max(impact, Math.abs(s.vy));
      s.vy = -s.vy * world.bounce;
    }
  }
  if (impact >= world.hitSpeed) s.hits++;
  else impact = 0;
  return impact;
}

/**
 * Advance by `deltaMs` (whole milliseconds) in fixed steps. `tiltOfTick(k)` gives the tilt for global step `k`, so
 * the same signal gives the same path however the time is cut into frames. Returns the strongest impact seen.
 */
export function advanceBall(s: Ball, tiltOfTick: (k: number) => Tilt, deltaMs: number, world: World): number {
  const before = Math.floor((s.totalMs * 3) / 50);
  s.totalMs += Number.isFinite(deltaMs) ? Math.max(0, Math.round(deltaMs)) : 0;
  const after = Math.floor((s.totalMs * 3) / 50);
  let strongest = 0;
  for (let k = before; k < after; k++) strongest = Math.max(strongest, stepBall(s, tiltOfTick(k), world));
  return strongest;
}

/** Feeds real frame times (fractions of a millisecond) to `advanceBall` in whole milliseconds, keeping the remainder. */
export function makeStepper(ball: Ball, world: World): (dtMs: number, tilt: Tilt) => number {
  let acc = 0;
  return (dtMs, tilt) => {
    acc += Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    const ms = Math.floor(acc);
    acc -= ms;
    return advanceBall(ball, () => tilt, ms, world);
  };
}
