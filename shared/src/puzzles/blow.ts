/**
 * Telling a breath from other noise, from loudness numbers only: the microphone code computes one number per frame
 * and no audio ever leaves it. A breath is loudness above a threshold for at least 300 ms in one unbroken run.
 */
export const BLOW_MIN_MS = 300;
export const BLOW_FLOOR = 0.08;

export type LoudnessSample = Readonly<{ t: number; level: number }>;

export function blowDetect(levels: readonly LoudnessSample[], baseline = 0): boolean {
  if (!Array.isArray(levels) || levels.length === 0) return false;
  const thr = Math.max(BLOW_FLOOR, 3 * (Number.isFinite(baseline) ? baseline : 0));
  let start: number | null = null;
  for (const p of levels) {
    if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.level)) { start = null; continue; }
    if (p.level > thr) {
      const from: number = start ?? p.t;
      start = from;
      if (p.t - from >= BLOW_MIN_MS) return true;
    } else start = null;
  }
  return false;
}
