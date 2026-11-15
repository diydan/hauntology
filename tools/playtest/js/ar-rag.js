// A rag-doll for a flat standee: a short chain of points that hangs from the finger, swings, and bends the picture along it.
// Pure maths with no browser inside, so a test can run it. Coordinates are metres: x is sideways, y is up.
// The chain is simulated in one fixed frame (not the figure's own), so when the finger moves, the body really lags behind it.

export function makeChain(n, length, topX, topY) {
  const seg = length / (n - 1), p = new Float64Array(n * 2), q = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { p[2 * i] = q[2 * i] = topX; p[2 * i + 1] = q[2 * i + 1] = topY - i * seg; }
  return { n, seg, p, q };
}

export function resetChain(c, topX, topY) {
  for (let i = 0; i < c.n; i++) { c.p[2 * i] = c.q[2 * i] = topX; c.p[2 * i + 1] = c.q[2 * i + 1] = topY - i * c.seg; }
}

// o: { holdX, holdY, pinned = true, gravity = 7, damping = 0.985, restoreK = 0, restTopX, restTopY, floorY }
// pinned: the top point follows the hold point (the finger). restoreK 0..1: how hard the body pulls back upright (after a drop).
// floorY: points never go below it.
export function stepChain(c, dt, o) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 1 / 30);
  const pinned = o.pinned !== false, restoreK = o.restoreK ?? 0, damping = o.damping ?? 0.985;
  if (pinned && !(Number.isFinite(o.holdX) && Number.isFinite(o.holdY))) return; // a broken finger position: do nothing
  if (restoreK > 0 && !(Number.isFinite(o.restTopX) && Number.isFinite(o.restTopY))) return;
  const gravity = (o.gravity ?? 7) * (1 - Math.min(1, restoreK)); // standing up fades gravity out, so it ends exactly upright
  const sub = 2, h = dt / sub, damp = Math.pow(damping, h * 60), { n, seg, p, q } = c;
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < n; i++) {
      if (i === 0 && pinned) { p[0] = q[0] = o.holdX; p[1] = q[1] = o.holdY; continue; }
      const x = p[2 * i], y = p[2 * i + 1], vx = (x - q[2 * i]) * damp, vy = (y - q[2 * i + 1]) * damp;
      q[2 * i] = x; q[2 * i + 1] = y;
      p[2 * i] = x + vx; p[2 * i + 1] = y + vy - gravity * h * h;
      if (restoreK > 0) {
        const k = Math.min(1, restoreK * h * 10);
        p[2 * i] += (o.restTopX - p[2 * i]) * k; p[2 * i + 1] += (o.restTopY - i * seg - p[2 * i + 1]) * k;
      }
    }
    for (let it = 0; it < 8; it++) {
      if (pinned) { p[0] = o.holdX; p[1] = o.holdY; }
      for (let i = 0; i < n - 1; i++) { // keep each link its length
        const dx = p[2 * i + 2] - p[2 * i], dy = p[2 * i + 3] - p[2 * i + 1], d = Math.hypot(dx, dy) || 1e-9, f = (d - seg) / d;
        if (i === 0 && pinned) { p[2] -= dx * f; p[3] -= dy * f; }
        else { p[2 * i] += dx * f * 0.5; p[2 * i + 1] += dy * f * 0.5; p[2 * i + 2] -= dx * f * 0.5; p[2 * i + 3] -= dy * f * 0.5; }
      }
      for (let i = 0; i < n - 2; i++) { // a little stiffness, so the body bends and does not fold in half
        const dx = p[2 * i + 4] - p[2 * i], dy = p[2 * i + 5] - p[2 * i + 1], d = Math.hypot(dx, dy) || 1e-9, min = 1.85 * seg;
        if (d < min) {
          const f = (min - d) / d * 0.5;
          if (i === 0 && pinned) { p[4] += dx * f * 2; p[5] += dy * f * 2; }
          else { p[2 * i] -= dx * f; p[2 * i + 1] -= dy * f; p[2 * i + 4] += dx * f; p[2 * i + 5] += dy * f; }
        }
      }
    }
    if (o.floorY !== undefined) {
      for (let i = 0; i < n; i++) if (p[2 * i + 1] < o.floorY) { p[2 * i + 1] = o.floorY; q[2 * i] = p[2 * i] - (p[2 * i] - q[2 * i]) * 0.5; q[2 * i + 1] = p[2 * i + 1]; }
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
// With the chain hanging straight down from (ox, topY + oy), the output equals the input.
export function deformVertices(c, orig, out, topY, h, ox, oy) {
  const n = c.n, P = c.p;
  const X = (i) => P[2 * i] - ox, Y = (i) => P[2 * i + 1] - oy;
  for (let k = 0; k < orig.length; k += 3) {
    const x = orig[k], y = orig[k + 1];
    const t = Math.min(1, Math.max(0, (topY - y) / h)), s = t * (n - 1), i = Math.min(n - 2, Math.floor(s)), f = s - i;
    const cx = X(i) + (X(i + 1) - X(i)) * f, cy = Y(i) + (Y(i + 1) - Y(i)) * f;
    let tx = X(i + 1) - X(i), ty = Y(i + 1) - Y(i); const l1 = Math.hypot(tx, ty) || 1; tx /= l1; ty /= l1;
    let ux = tx, uy = ty;
    if (i + 2 < n) {
      let t2x = X(i + 2) - X(i + 1), t2y = Y(i + 2) - Y(i + 1); const l2 = Math.hypot(t2x, t2y) || 1; t2x /= l2; t2y /= l2;
      ux = tx + (t2x - tx) * f; uy = ty + (t2y - ty) * f;
    }
    const lu = Math.hypot(ux, uy) || 1; ux /= lu; uy /= lu;
    out[k] = cx - uy * x; out[k + 1] = cy + ux * x; out[k + 2] = 0; // the sideways direction is the body's tangent turned a quarter
  }
}
