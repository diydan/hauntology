// A haunted-marionette rig for a flat standee: a chain of points suspended from the crown that drags like dead weight,
// cocks sharply at the neck while keeping the torso stiff, sinks to rest without cartoon pendulum bounce, and draws
// itself upright head-first after a dead drop. Pure maths with no browser inside, so a test can run it.
// Coordinates are metres: x is sideways, y is up.

export function makeChain(n, length, topX, topY) {
  const seg = length / (n - 1), p = new Float64Array(n * 2), q = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { p[2 * i] = q[2 * i] = topX; p[2 * i + 1] = q[2 * i + 1] = topY - i * seg; }
  return { n, seg, p, q };
}

export function resetChain(c, topX, topY) {
  for (let i = 0; i < c.n; i++) { c.p[2 * i] = c.q[2 * i] = topX; c.p[2 * i + 1] = c.q[2 * i + 1] = topY - i * c.seg; }
}

// Anatomical bending floor (fraction of seg between node i and i+2, max 2.0):
// i=0 is the neck hinge (loose so the head cocks askew), i=1..2 is the ribcage/spine (rigid dead weight),
// i>=3 is the lower coat/legs (trails heavily and crumples on floor impact).
const spanMin = (i) => (i === 0 ? 1.58 : i <= 2 ? 1.955 : 1.84);

// o: { holdX, holdY, pinned = true, gravity = 6.2, damping = 0.785, restoreK = 0, restTopX, restTopY, floorY }
// pinned: the top point follows the hold point (the unseen hand).
// gravity & damping: near-critical damping for a 10.5 cm effigy so it trails heavily and creeps to a dead hang
//   with no cartoon pendulum wobble.
// restoreK 0..1: pulls the body back upright head-first (as if drawn up by unseen marionette strings).
// floorY: points never go below it, and floor slide is heavily damped so dropped figures land dead.
export function stepChain(c, dt, o) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 1 / 30);
  const pinned = o.pinned !== false, restoreK = o.restoreK ?? 0, damping = o.damping ?? 0.785;
  if (pinned && !(Number.isFinite(o.holdX) && Number.isFinite(o.holdY))) return; // a broken finger position: do nothing
  if (restoreK > 0 && !(Number.isFinite(o.restTopX) && Number.isFinite(o.restTopY))) return;
  const gravity = (o.gravity ?? 6.2) * (1 - Math.min(1, restoreK)); // standing up fades gravity out, so it ends exactly upright
  const sub = 2, h = dt / sub, damp = Math.pow(damping, h * 60), { n, seg, p, q } = c;
  const denom = Math.max(1, n - 1);
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < n; i++) {
      if (i === 0 && pinned) { p[0] = q[0] = o.holdX; p[1] = q[1] = o.holdY; continue; }
      const x = p[2 * i], y = p[2 * i + 1], vx = (x - q[2 * i]) * damp, vy = (y - q[2 * i + 1]) * damp;
      q[2 * i] = x; q[2 * i + 1] = y;
      p[2 * i] = x + vx; p[2 * i + 1] = y + vy - gravity * h * h;
      if (restoreK > 0) {
        const lead = Math.pow(Math.min(1, Math.max(0, restoreK)), 1 + 2.4 * (i / denom));
        const k = Math.min(1, lead * h * 12);
        const rx = (o.restTopX - p[2 * i]) * k, ry = (o.restTopY - i * seg - p[2 * i + 1]) * k;
        p[2 * i] += rx; p[2 * i + 1] += ry;
        q[2 * i] += rx * 0.82; q[2 * i + 1] += ry * 0.82; // creep upright without spring-bounce overshoot
      }
    }
    const wUp = restoreK > 0 ? 0.25 : 0.5, wDn = 1 - wUp;
    for (let it = 0; it < 10; it++) {
      if (pinned) { p[0] = o.holdX; p[1] = o.holdY; }
      for (let i = 0; i < n - 2; i++) { // broken-neck hinge, stiff dead-weight torso, trailing hem (soft pass before link lengths)
        const dx = p[2 * i + 4] - p[2 * i], dy = p[2 * i + 5] - p[2 * i + 1], d = Math.hypot(dx, dy) || 1e-9, min = spanMin(i) * seg;
        if (d < min) {
          const f = (min - d) / d * 0.45;
          if (i === 0 && pinned) { p[4] += dx * f * 2; p[5] += dy * f * 2; }
          else { p[2 * i] -= dx * f; p[2 * i + 1] -= dy * f; p[2 * i + 4] += dx * f; p[2 * i + 5] += dy * f; }
        }
      }
      if (o.floorY !== undefined) {
        for (let i = 0; i < n; i++) if (p[2 * i + 1] < o.floorY) p[2 * i + 1] = o.floorY;
      }
      if (pinned) { p[0] = o.holdX; p[1] = o.holdY; }
      for (let i = 0; i < n - 1; i++) { // hard link-length pass runs last so links never stretch
        const dx = p[2 * i + 2] - p[2 * i], dy = p[2 * i + 3] - p[2 * i + 1], d = Math.hypot(dx, dy) || 1e-9, f = (d - seg) / d;
        if (i === 0 && pinned) { p[2] -= dx * f; p[3] -= dy * f; }
        else { p[2 * i] += dx * f * wUp; p[2 * i + 1] += dy * f * wUp; p[2 * i + 2] -= dx * f * wDn; p[2 * i + 3] -= dy * f * wDn; }
      }
    }
    if (o.floorY !== undefined) {
      for (let i = 0; i < n; i++) if (p[2 * i + 1] < o.floorY) {
        p[2 * i + 1] = o.floorY;
        q[2 * i] = p[2 * i] - (p[2 * i] - q[2 * i]) * 0.25;
        q[2 * i + 1] = p[2 * i + 1];
      }
    }
  }
  for (let i = 0; i < 2 * n; i++) if (!Number.isFinite(p[i]) || !Number.isFinite(q[i])) { resetChain(c, pinned ? o.holdX : (o.restTopX ?? 0), pinned ? o.holdY : (o.restTopY ?? 0.1)); return; }
}

// How far the chain is from standing straight under its top point, and how fast it is moving: the figure is at rest when both are tiny.
export function chainUnrest(c, topX, topY) {
  let off = 0, speed = 0;
  for (let i = 0; i < c.n; i++) {
    off = Math.max(off, Math.hypot(c.p[2 * i] - topX, c.p[2 * i + 1] - (topY - i * c.seg)));
    speed = Math.max(speed, Math.hypot(c.p[2 * i] - c.q[2 * i], c.p[2 * i + 1] - c.q[2 * i + 1]));
  }
  return { off, speed };
}

// Bend a flat picture along the chain. orig: the flat vertices (x sideways, y up, z 0). topY and h: where the picture's top is and how tall it is.
// (ox, oy): the point the chain's coordinates are measured from, subtracted so the result is in the picture's own frame.
// zBend: optional out-of-plane depth trail (metres) so dragging forward/back drapes the lower shroud in 3D.
// With the chain hanging straight down from (ox, topY + oy) and zBend = 0, the output equals the input.
export function deformVertices(c, orig, out, topY, h, ox, oy, zBend = 0) {
  const n = c.n, P = c.p, zSafe = Number.isFinite(zBend) ? zBend : 0;
  const X = (i) => P[2 * i] - ox, Y = (i) => P[2 * i + 1] - oy;
  for (let k = 0; k < orig.length; k += 3) {
    const x = orig[k], y = orig[k + 1];
    const t = Math.min(1, Math.max(0, (topY - y) / h)), s = t * (n - 1), i = Math.min(n - 2, Math.floor(s)), f = s - i;
    const cx = X(i) + (X(i + 1) - X(i)) * f, cy = Y(i) + (Y(i + 1) - Y(i)) * f;
    let tx = X(i + 1) - X(i), ty = Y(i + 1) - Y(i); const l1 = Math.hypot(tx, ty) || 1; tx /= l1; ty /= l1;
    let ux = tx, uy = ty;
    if (i + 2 < n) {
      const bf = i === 0 ? Math.max(0, (f - 0.72) / 0.28) : f; // keep skull/face rigid, crease sharply at collar
      let t2x = X(i + 2) - X(i + 1), t2y = Y(i + 2) - Y(i + 1); const l2 = Math.hypot(t2x, t2y) || 1; t2x /= l2; t2y /= l2;
      ux = tx + (t2x - tx) * bf; uy = ty + (t2y - ty) * bf;
    }
    const lu = Math.hypot(ux, uy) || 1; ux /= lu; uy /= lu;
    const drape = -zSafe * Math.pow(t, 1.55) - Math.abs(zSafe) * 0.18 * (x * x / (h * h || 1)) * t;
    out[k] = cx - uy * x; out[k + 1] = cy + ux * x; out[k + 2] = drape; // sideways is tangent turned a quarter; z drapes back
  }
}
