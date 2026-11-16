// Support-free check for the print kit's binary STLs.
//
// A printer lays flat layers, so a face that points down has nothing under it unless it is
//   - lying on the bed,
//   - sloped at OVERHANG_DEG or less from vertical (it leans on the layer below), or
//   - a short bridge: a flat roof no wider than BRIDGE_MAX_MM between two walls.
// Everything else needs supports. `findOverhangs` returns the regions that are none of those, so build-print can refuse a part
// that claims "no supports" while carrying a wide flat roof (the check before this one only saw watertightness).
//
// Two traps this avoids:
//   - A downward face that has a solid upward face touching it from below (two bodies that OpenSCAD did not merge) is a
//     zero-thickness seam inside solid plastic, not a roof, so it is skipped.
//   - A long thin strip, or a dumbbell of two small roofs joined by a channel, has a huge bounding box but a short span, so the
//     span is the diameter of the largest circle that fits inside the region (a distance transform on a 0.5 mm grid).

export const OVERHANG_DEG = 50.5; // design target is 45 degrees; 50 is the most a 0.4 mm nozzle with a part fan holds cleanly (plus 0.5 for facet noise)
export const BED_BAND_MM = 0.7; // sloped first-layer bevels ("elephant foot" chamfers) are 0.4 to 0.6 mm tall and touch the bed, so they are fine
export const BRIDGE_MAX_MM = 10; // a flat roof narrower than 10 mm bridges cleanly without supports on a 0.4 mm nozzle
export const MIN_REGION_MM2 = 20; // ignore specks

const WELD = 1000; // weld vertices at 1 micrometre, like the mesh check
const SEAM_MM = 0.06; // an upward face within this distance below a downward face makes it a seam

/** @param {Buffer} buf a binary STL  @returns {{areaMm2:number, widthMm:number, zMm:number, xMm:[number,number], yMm:[number,number]}[]} */
export function findOverhangs(buf, { overhangDeg = OVERHANG_DEG, bridgeMaxMm = BRIDGE_MAX_MM, minAreaMm2 = MIN_REGION_MM2 } = {}) {
  const n = buf.readUInt32LE(80);
  const limit = -Math.sin((overhangDeg * Math.PI) / 180);
  const tris = [];
  let minZ = Infinity;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    const p = [0, 1, 2].map((j) => [buf.readFloatLE(o + 12 + j * 12), buf.readFloatLE(o + 16 + j * 12), buf.readFloatLE(o + 20 + j * 12)]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    for (const v of p) if (v[2] < minZ) minZ = v[2];
    tris.push({ p, c: nz / len, a: len / 2 });
  }

  // upward flat faces, bucketed by height, to find seams
  const ups = new Map();
  for (const t of tris) {
    if (t.c < 0.99) continue;
    const k = Math.round(t.p[0][2] / SEAM_MM);
    (ups.get(k) ?? ups.set(k, []).get(k)).push(t);
  }
  const inside = (t, x, y) => {
    const [a, b, c] = t.p;
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) return false;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    return l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6;
  };
  const seam = (t) => {
    const cx = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, cy = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, z = t.p[0][2];
    const k = Math.round(z / SEAM_MM);
    for (const kk of [k - 1, k, k + 1]) for (const u of ups.get(kk) ?? []) if (Math.abs(u.p[0][2] - z) <= SEAM_MM && inside(u, cx, cy)) return true;
    return false;
  };

  const flagged = tris.filter((t) => {
    if (t.c >= limit) return false;
    const zTop = Math.max(t.p[0][2], t.p[1][2], t.p[2][2]);
    // A flat downward ceiling (t.c < -0.98) above z = minZ + 0.08 is a real bridge even at z = 0.4 mm (e.g. an upside-down sticker pocket);
    // only sloped first-layer chamfers (t.c >= -0.98) get the BED_BAND_MM exemption.
    if (t.c < -0.98) return zTop >= minZ + 0.08 && !seam(t);
    return zTop >= minZ + BED_BAND_MM;
  });

  // group by shared (welded) vertices
  const parent = new Map();
  const find = (k) => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const nx = parent.get(k); parent.set(k, r); k = nx; }
    return r;
  };
  const key = (v) => `${Math.round(v[0] * WELD)},${Math.round(v[1] * WELD)},${Math.round(v[2] * WELD)}`;
  for (const t of flagged) {
    const ks = t.p.map(key);
    for (const k of ks) if (!parent.has(k)) parent.set(k, k);
    for (let j = 1; j < 3; j++) { const a = find(ks[0]), b = find(ks[j]); if (a !== b) parent.set(a, b); }
  }
  const groups = new Map();
  for (const t of flagged) {
    const r = find(key(t.p[0]));
    (groups.get(r) ?? groups.set(r, []).get(r)).push(t);
  }

  const out = [];
  for (const g of groups.values()) {
    const area = g.reduce((s, t) => s + t.a, 0);
    if (area < minAreaMm2) continue;
    const pts = g.flatMap((t) => t.p);
    const width = spanMm(g);
    if (width <= bridgeMaxMm) continue;
    const xs = pts.map((v) => v[0]), ys = pts.map((v) => v[1]);
    out.push({
      areaMm2: area,
      widthMm: width,
      zMm: g.reduce((s, t) => s + t.a * ((t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3), 0) / area,
      xMm: [Math.min(...xs), Math.max(...xs)],
      yMm: [Math.min(...ys), Math.max(...ys)],
    });
  }
  return out.sort((a, b) => b.areaMm2 - a.areaMm2);
}

const CELL = 0.5; // mm

/** Diameter of the largest circle that fits inside the union of these triangles seen from above (the bridge span). */
function spanMm(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of g) for (const v of t.p) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
  const nx = Math.ceil((x1 - x0) / CELL) + 3, ny = Math.ceil((y1 - y0) / CELL) + 3;
  const full = new Uint8Array(nx * ny);
  for (const t of g) {
    const [a, b, c] = t.p;
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / CELL) + 1), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / CELL) + 1);
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - y0) / CELL) + 1), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - y0) / CELL) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i - 1 + 0.5) * CELL, y = y0 + (j - 1 + 0.5) * CELL;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
      const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
      if (l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0) full[j * nx + i] = 1;
    }
  }
  // two-pass chamfer distance to the nearest empty cell (the border is empty)
  const dist = new Float32Array(nx * ny);
  for (let k = 0; k < dist.length; k++) dist[k] = full[k] ? 1e9 : 0;
  const R2 = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!full[k]) continue;
    let m = dist[k];
    if (i > 0) m = Math.min(m, dist[k - 1] + 1);
    if (j > 0) { m = Math.min(m, dist[k - nx] + 1); if (i > 0) m = Math.min(m, dist[k - nx - 1] + R2); if (i < nx - 1) m = Math.min(m, dist[k - nx + 1] + R2); }
    dist[k] = m;
  }
  let best = 0;
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    if (!full[k]) continue;
    let m = dist[k];
    if (i < nx - 1) m = Math.min(m, dist[k + 1] + 1);
    if (j < ny - 1) { m = Math.min(m, dist[k + nx] + 1); if (i < nx - 1) m = Math.min(m, dist[k + nx + 1] + R2); if (i > 0) m = Math.min(m, dist[k + nx - 1] + R2); }
    dist[k] = m;
    if (m > best) best = m;
  }
  return (2 * best - 1) * CELL; // distance counted from an empty cell centre to a full one: a strip w cells wide peaks at (w+1)/2
}
