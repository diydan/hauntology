/**
 * A haunted-marionette rig for a flat standee (spirit-table 9.4): a chain of points suspended from the crown that drags like
 * dead weight, cocks sharply at the neck while keeping the torso stiff, sinks to rest without cartoon pendulum bounce, and draws
 * itself upright head-first after a dead drop. Pure maths with no browser inside. Metres: x sideways, y up.
 */
export type Chain = Readonly<{ n: number; seg: number; p: Float64Array; q: Float64Array }>;

const at = (a: Float64Array, i: number): number => a[i] ?? 0;

/** Anatomical bending floor (fraction of seg between node i and i+2, max 2.0): pinned keeps stiff torso & crooked neck; dropped releases neck, waist and knee hinges. */
const spanMinPin = (i: number): number => (i === 0 ? 1.58 : i <= 2 ? 1.955 : 1.84);
const spanMinDrop = (i: number): number => (i === 1 ? 1.68 : i === 3 ? 1.52 : 0);

export function makeChain(n: number, length: number, topX: number, topY: number): Chain {
  const seg = length / (n - 1), p = new Float64Array(n * 2), q = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { p[2 * i] = q[2 * i] = topX; p[2 * i + 1] = q[2 * i + 1] = topY - i * seg; }
  return { n, seg, p, q };
}

export function resetChain(c: Chain, topX: number, topY: number): void {
  for (let i = 0; i < c.n; i++) { c.p[2 * i] = c.q[2 * i] = topX; c.p[2 * i + 1] = c.q[2 * i + 1] = topY - i * c.seg; }
}

export type StepOptions = Readonly<{
  /** Where the finger holds the top of the figure. */
  holdX?: number; holdY?: number;
  /** The top follows the finger (default true); false once it is let go. */
  pinned?: boolean;
  gravity?: number; damping?: number;
  /** 0 to 1: how hard the body pulls back upright head-first (after a drop). Gravity fades out as it rises. */
  restoreK?: number; restTopX?: number; restTopY?: number;
  /** Points never go below this height. */
  floorY?: number;
}>;

/** One step of `dt` seconds (a step longer than 1/30 counts as 1/30). A broken finger position changes nothing; a point that is not a number resets the chain. */
export function stepChain(c: Chain, dtIn: number, o: StepOptions): void {
  if (!(dtIn > 0)) return;
  const dt = Math.min(dtIn, 1 / 30);
  const pinned = o.pinned !== false, restoreK = o.restoreK ?? 0;
  const damping = o.damping ?? (pinned ? 0.785 : restoreK > 0 ? 0.8 : 0.985);
  const holdX = o.holdX ?? Number.NaN, holdY = o.holdY ?? Number.NaN, restX = o.restTopX ?? Number.NaN, restY = o.restTopY ?? Number.NaN;
  if (pinned && !(Number.isFinite(holdX) && Number.isFinite(holdY))) return;
  if (restoreK > 0 && !(Number.isFinite(restX) && Number.isFinite(restY))) return;
  const gravity = (o.gravity ?? (pinned ? 6.2 : 15.5)) * (1 - Math.min(1, restoreK)); // standing up fades gravity out, so it ends exactly upright
  const blend = pinned ? 1 : Math.min(1, Math.max(0, restoreK) * 1.45);
  const floorSlip = restoreK > 0 ? 0.55 : 0.06;
  const sub = 2, h = dt / sub, damp = Math.pow(damping, h * 60), { n, seg, p, q } = c;
  const denom = Math.max(1, n - 1);
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < n; i++) {
      if (i === 0 && pinned) { p[0] = q[0] = holdX; p[1] = q[1] = holdY; continue; }
      const x = at(p, 2 * i), y = at(p, 2 * i + 1), vx = (x - at(q, 2 * i)) * damp, vy = (y - at(q, 2 * i + 1)) * damp;
      q[2 * i] = x; q[2 * i + 1] = y;
      p[2 * i] = x + vx; p[2 * i + 1] = y + vy - gravity * h * h;
      if (restoreK > 0) {
        const lead = Math.pow(Math.min(1, Math.max(0, restoreK)), 1 + 2.1 * (i / denom));
        const k = Math.min(1, lead * h * 14);
        const rx = (restX - at(p, 2 * i)) * k, ry = (restY - i * seg - at(p, 2 * i + 1)) * k;
        p[2 * i] = at(p, 2 * i) + rx; p[2 * i + 1] = at(p, 2 * i + 1) + ry;
        q[2 * i] = at(q, 2 * i) + rx * 0.82; q[2 * i + 1] = at(q, 2 * i + 1) + ry * 0.82;
      }
    }
    const wUp = restoreK > 0 ? 0.25 : 0.5, wDn = 1 - wUp;
    for (let it = 0; it < 10; it++) {
      if (pinned) { p[0] = holdX; p[1] = holdY; }
      for (let i = 0; i < n - 2; i++) { // broken-neck hinge, stiff dead-weight torso while hanging, slack hinges on drop
        const dx = at(p, 2 * i + 4) - at(p, 2 * i), dy = at(p, 2 * i + 5) - at(p, 2 * i + 1), d = Math.hypot(dx, dy) || 1e-9;
        const target = spanMinDrop(i) + (spanMinPin(i) - spanMinDrop(i)) * blend;
        if (target > 0) {
          const min = target * seg;
          if (d < min) {
            const f = ((min - d) / d) * 0.45;
            if (i === 0 && pinned) { p[4] = at(p, 4) + dx * f * 2; p[5] = at(p, 5) + dy * f * 2; }
            else {
              p[2 * i] = at(p, 2 * i) - dx * f; p[2 * i + 1] = at(p, 2 * i + 1) - dy * f;
              p[2 * i + 4] = at(p, 2 * i + 4) + dx * f; p[2 * i + 5] = at(p, 2 * i + 5) + dy * f;
            }
          }
        }
      }
      if (o.floorY !== undefined) {
        for (let i = 0; i < n; i++) if (at(p, 2 * i + 1) < o.floorY) p[2 * i + 1] = o.floorY;
      }
      if (pinned) { p[0] = holdX; p[1] = holdY; }
      for (let i = 0; i < n - 1; i++) { // hard link-length pass runs last so links never stretch
        const dx = at(p, 2 * i + 2) - at(p, 2 * i), dy = at(p, 2 * i + 3) - at(p, 2 * i + 1), d = Math.hypot(dx, dy) || 1e-9, f = (d - seg) / d;
        if (i === 0 && pinned) { p[2] = at(p, 2) - dx * f; p[3] = at(p, 3) - dy * f; }
        else {
          p[2 * i] = at(p, 2 * i) + dx * f * wUp; p[2 * i + 1] = at(p, 2 * i + 1) + dy * f * wUp;
          p[2 * i + 2] = at(p, 2 * i + 2) - dx * f * wDn; p[2 * i + 3] = at(p, 2 * i + 3) - dy * f * wDn;
        }
      }
    }
    if (o.floorY !== undefined) {
      for (let i = 0; i < n; i++) {
        if (at(p, 2 * i + 1) <= o.floorY + 1e-5) {
          p[2 * i + 1] = o.floorY;
          q[2 * i] = at(p, 2 * i) - (at(p, 2 * i) - at(q, 2 * i)) * floorSlip;
          q[2 * i + 1] = o.floorY;
        }
      }
    }
  }
  for (let i = 0; i < 2 * n; i++) {
    if (!Number.isFinite(at(p, i)) || !Number.isFinite(at(q, i))) {
      resetChain(c, pinned ? holdX : Number.isFinite(restX) ? restX : 0, pinned ? holdY : Number.isFinite(restY) ? restY : 0.1);
      return;
    }
  }
}

/** How far the chain is from standing straight under its top point, and how fast it is moving: at rest when both are tiny. */
export function chainUnrest(c: Chain, topX: number, topY: number): { off: number; speed: number } {
  let off = 0, speed = 0;
  for (let i = 0; i < c.n; i++) {
    off = Math.max(off, Math.hypot(at(c.p, 2 * i) - topX, at(c.p, 2 * i + 1) - (topY - i * c.seg)));
    speed = Math.max(speed, Math.hypot(at(c.p, 2 * i) - at(c.q, 2 * i), at(c.p, 2 * i + 1) - at(c.q, 2 * i + 1)));
  }
  return { off, speed };
}

/** The longest any link is from its length, as a fraction of the length (0 when every link is exact). */
export function linkStretch(c: Chain): number {
  let worst = 0;
  for (let i = 0; i < c.n - 1; i++) {
    const d = Math.hypot(at(c.p, 2 * i + 2) - at(c.p, 2 * i), at(c.p, 2 * i + 3) - at(c.p, 2 * i + 1));
    worst = Math.max(worst, Math.abs(d - c.seg) / c.seg);
  }
  return worst;
}

const FOLD_Z: readonly number[] = [-0.56, -0.34, -0.09, 0.16, 0];
const FOLD_Y: readonly number[] = [0.016, 0.042, 0.058, 0.175, 0.006];
const catmull = (a: number, b: number, c: number, d: number, f: number): number =>
  0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
function evalFold(knots: readonly number[], t: number): number {
  const s = t * 4, j = Math.min(3, Math.floor(s)), f = s - j, v = knots[j] ?? 0, w = knots[j + 1] ?? 0;
  const a = j > 0 ? (knots[j - 1] ?? v) : 2 * v - w;
  const d = j < 3 ? (knots[j + 2] ?? w) : 2 * w - v;
  return catmull(a, v, w, d, f);
}

/**
 * Bend a flat picture along the chain. `orig`: the flat vertices (x sideways, y up, z 0). `topY` and `h`: where the picture's
 * top is and how tall it is. (`ox`, `oy`) is subtracted from the chain so the result is in the picture's own frame.
 * `zBend`: optional out-of-plane depth trail (metres) so dragging forward/back drapes the lower shroud in 3D.
 * With the chain hanging straight down from (ox, topY + oy) and zBend = 0 the output equals the input.
 */
export function deformVertices(c: Chain, orig: ArrayLike<number>, out: Float32Array | Float64Array, topY: number, h: number, ox: number, oy: number, zBend = 0): void {
  const n = c.n, zSafe = Number.isFinite(zBend) ? zBend : 0;
  const X = (i: number): number => at(c.p, 2 * i) - ox, Y = (i: number): number => at(c.p, 2 * i + 1) - oy;
  const spanDist = Math.hypot(X(n - 1) - X(0), Y(n - 1) - Y(0));
  const rawCrumple = h > 1e-6 ? Math.max(0, Math.min(1, (0.86 * h - spanDist) / (0.48 * h))) : 0;
  const crumple = rawCrumple * rawCrumple * (3 - 2 * rawCrumple);
  const footX = X(n - 1), footY = Math.max(0, Y(n - 1));
  const leanX = Math.max(-0.34 * h, Math.min(0.34 * h, X(0) - footX));
  const neckShift = Math.max(-0.08 * h, Math.min(0.08 * h, (X(0) - X(1)) * 0.65));
  for (let k = 0; k + 2 < orig.length; k += 3) {
    const x = orig[k] ?? 0, y = orig[k + 1] ?? 0;
    const t = Math.min(1, Math.max(0, (topY - y) / h)), s = t * (n - 1), i = Math.min(n - 2, Math.floor(s)), f = s - i;
    const cx = X(i) + (X(i + 1) - X(i)) * f, cy = Y(i) + (Y(i + 1) - Y(i)) * f;
    let tx = X(i + 1) - X(i), ty = Y(i + 1) - Y(i);
    const l1 = Math.hypot(tx, ty) || 1; tx /= l1; ty /= l1;
    let ux = tx, uy = ty;
    if (i + 2 < n) {
      const bf = i === 0 ? Math.max(0, (f - 0.72) / 0.28) : f;
      let t2x = X(i + 2) - X(i + 1), t2y = Y(i + 2) - Y(i + 1);
      const l2 = Math.hypot(t2x, t2y) || 1; t2x /= l2; t2y /= l2;
      ux = tx + (t2x - tx) * bf; uy = ty + (t2y - ty) * bf;
    }
    const lu = Math.hypot(ux, uy) || 1; ux /= lu; uy /= lu;
    const drape = -zSafe * Math.pow(t, 1.55) - Math.abs(zSafe) * 0.18 * (x * x / (h * h || 1)) * t;
    if (crumple <= 0) {
      out[k] = cx - uy * x; out[k + 1] = cy + ux * x; out[k + 2] = drape;
    } else {
      const neckWeight = t < 0.28 ? Math.pow(1 - t / 0.28, 1.5) : 0;
      const fx = footX + leanX * Math.pow(1 - t, 1.35) + neckShift * neckWeight;
      const fy = footY + Math.max(0.004, evalFold(FOLD_Y, t) * h + 0.002);
      const fz = evalFold(FOLD_Z, t) * h;
      const psi = Math.atan2(leanX * 0.8 + neckShift * neckWeight * 1.4, h || 1);
      const fsx = Math.cos(psi), fsz = Math.sin(psi);
      const rx2 = -uy, ry2 = ux;
      let sx = rx2 + (fsx - rx2) * crumple, sy = ry2 * (1 - crumple), sz = fsz * crumple;
      const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const px = cx + (fx - cx) * crumple, py = cy + (fy - cy) * crumple, pz = drape * (1 - crumple) + fz * crumple;
      out[k] = px + sx * x; out[k + 1] = Math.max(0.002, py + sy * x); out[k + 2] = pz + sz * x;
    }
  }
}
