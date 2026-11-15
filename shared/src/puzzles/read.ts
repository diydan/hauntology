/**
 * Reading a Spirit clue (puzzles Requirement 15.5): keep the middle of the view within 12 degrees of a clue for 0.7 seconds
 * of steady looking and it is read; look away and the progress falls back to empty in 1.4 seconds. Pure maths on numbers:
 * progress depends on how long, never on how often the phone reports, and a clue once read stays read.
 */
export const READ_MS = 700;
export const FALL_MS = 1400;
export const READ_ANGLE = (12 * Math.PI) / 180;
/** A frame that took longer than this (a stalled tab) counts as this long, so a stall never reads a clue. */
export const MAX_STEP_MS = 100;

/** Seven steps of 100 ms add up to 0.9999999999999999, so a rising progress this close to full counts as full. */
const EPS = 1e-9;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The next progress, 0 to 1. A bad progress counts as 0, a bad or negative time step changes nothing, a bad angle is far away. */
export function stepRead(progress: number, angleRad: number, dtMs: number): number {
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return p;
  const dt = Math.min(dtMs, MAX_STEP_MS);
  if (Number.isFinite(angleRad) && Math.abs(angleRad) <= READ_ANGLE) {
    const up = p + dt / READ_MS;
    return up >= 1 - EPS ? 1 : up;
  }
  return clamp01(p - dt / FALL_MS);
}

/** One clue's reading state. Once `read` is true it stays true. */
export type ClueRead = Readonly<{ progress: number; read: boolean }>;
export const UNREAD: ClueRead = { progress: 0, read: false };

export function stepClue(s: ClueRead, angleRad: number, dtMs: number): ClueRead {
  if (s.read) return { progress: 1, read: true };
  const progress = stepRead(s.progress, angleRad, dtMs);
  return progress >= 1 ? { progress: 1, read: true } : { progress, read: false };
}

export type View = Readonly<{ turn: number; height: number }>;

/**
 * The angle in radians (0 to pi) between where the phone points and where a clue hangs: the angle between two directions
 * given as a turn and a height. Anything that is not a number counts as pi (far away).
 */
export function clueAngle(view: View, clue: View): number {
  const { turn: t1, height: h1 } = view, { turn: t2, height: h2 } = clue;
  if (![t1, h1, t2, h2].every(Number.isFinite)) return Math.PI;
  const c = Math.sin(h1) * Math.sin(h2) + Math.cos(h1) * Math.cos(h2) * Math.cos(t1 - t2);
  return Math.acos(Math.min(1, Math.max(-1, c)));
}
