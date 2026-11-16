#!/usr/bin/env node
// Builds the full 3D asset kit for the Spirit Table AR mode (`tools/playtest/models/spirit-table.glb`).
// Combines QEM-simplified, crease-smoothed, multi-material tinted canonical Relics from `print/stl/` with
// procedurally sculpted Gothic dollhouse architecture, 6 room furniture vignettes, Whisper 3D shroud,
// Cold Spot frost, Suspect plinths, Living & Poltergeist pawns, séance hatpin marks, and 3D Spirit clue frames,
// all baked with ambient occlusion into one standard glTF 2.0 binary (.glb).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stlDir = path.join(root, 'print', 'stl');
const outDir = path.join(here, 'playtest', 'models');
const outFile = path.join(outDir, 'spirit-table.glb');

// ------------------------------------------------------------------ Hauntology PBR palette (linear RGB conversion)
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLin(hex, mul = 1) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const r = srgbToLin(((n >> 16) & 255) / 255) * mul;
  const g = srgbToLin(((n >> 8) & 255) / 255) * mul;
  const b = srgbToLin((n & 255) / 255) * mul;
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}

// Materials table exported into glTF 2.0
const MATERIALS = [
  { name: 'wood_dark', roughness: 0.64, metalness: 0.06 },
  { name: 'brass_aged', roughness: 0.28, metalness: 0.88 },
  { name: 'iron_cast', roughness: 0.46, metalness: 0.78 },
  { name: 'silver_tarnished', roughness: 0.24, metalness: 0.9 },
  { name: 'bone_wax', roughness: 0.42, metalness: 0.04 },
  { name: 'stone_slate', roughness: 0.84, metalness: 0.05 },
  { name: 'fabric_velvet', roughness: 0.92, metalness: 0.02 },
  { name: 'glass_spectral', roughness: 0.16, metalness: 0.1, alphaMode: 'BLEND', doubleSided: true, emissive: [0.04, 0.11, 0.09] },
];
const MAT = Object.fromEntries(MATERIALS.map((m, i) => [m.name, i]));

const C = {
  ink: hexLin(0x14171c),
  ebony: hexLin(0x1f1916),
  walnutDark: hexLin(0x2a1b11),
  walnut: hexLin(0x3e2718),
  mahogany: hexLin(0x4f2c1d),
  leather: hexLin(0x6b4d33),
  oak: hexLin(0x5c4228),
  pine: hexLin(0x7d6040),
  brass: hexLin(0xe0a43a),
  brassDark: hexLin(0x9a6d24),
  copper: hexLin(0xb8623c),
  iron: hexLin(0x27282e),
  ironRust: hexLin(0x463028),
  silver: hexLin(0xc9ced8),
  steel: hexLin(0x8e949e),
  bone: hexLin(0xe9e4d8),
  parchment: hexLin(0xdfd3b8),
  wax: hexLin(0xe5dfd0),
  pearl: hexLin(0xf4efe4),
  stone: hexLin(0x4a4e54),
  stoneDark: hexLin(0x2d3136),
  ashMono: hexLin(0x7e8288),
  velvetRed: hexLin(0x5c1d22),
  velvetGreen: hexLin(0x243b2f),
  velvetBlue: hexLin(0x253244),
  alarm: hexLin(0xd4604a),
  ghost: hexLin(0x9fe8d0),
  ghostDeep: hexLin(0x4ca892),
  frost: hexLin(0xb8efe4),
  mirror: hexLin(0x8ab8b4),
};

// ------------------------------------------------------------------ deterministic PRNG
function makeRng(seed = 1931) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ Mesh builder (per-material primitive buckets)
class PartBuilder {
  constructor(name) {
    this.name = name;
    this.buckets = new Map(); // matIdx -> { pos: number[], norm: number[], col: number[], idx: number[] }
  }
  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) { b = { pos: [], norm: [], col: [], idx: [] }; this.buckets.set(mat, b); }
    return b;
  }
  addRaw(mat, pos, norm, col, idx, alpha = 1) {
    const b = this.bucket(mat);
    const base = b.pos.length / 3;
    const nVerts = pos.length / 3;
    for (let i = 0; i < nVerts; i++) {
      b.pos.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
      b.norm.push(norm[3 * i], norm[3 * i + 1], norm[3 * i + 2]);
      if (col.length === 3 || col.length === 4) {
        b.col.push(col[0], col[1], col[2], col[3] ?? alpha);
      } else {
        b.col.push(col[4 * i], col[4 * i + 1], col[4 * i + 2], col[4 * i + 3]);
      }
    }
    for (let i = 0; i < idx.length; i++) b.idx.push(base + idx[i]);
  }
  addMesh(mat, geom, color, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, alpha = 1) {
    const pos = geom.pos.slice();
    const norm = geom.norm.slice();
    const cx = Math.cos(rx), srx = Math.sin(rx), cy = Math.cos(ry), sry = Math.sin(ry), cz = Math.cos(rz), srz = Math.sin(rz);
    const rot = (x, y, z) => {
      // Z -> X -> Y
      let x1 = x * cz - y * srz, y1 = x * srz + y * cz, z1 = z;
      let y2 = y1 * cx - z1 * srx, z2 = y1 * srx + z1 * cx, x2 = x1;
      return [x2 * cy + z2 * sry, y2, -x2 * sry + z2 * cy];
    };
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const [px, py, pz] = rot(pos[3 * i] * sx, pos[3 * i + 1] * sy, pos[3 * i + 2] * sz);
      pos[3 * i] = px + tx; pos[3 * i + 1] = py + ty; pos[3 * i + 2] = pz + tz;
      const [nx, ny, nz] = rot(norm[3 * i] / sx, norm[3 * i + 1] / sy, norm[3 * i + 2] / sz);
      const l = Math.hypot(nx, ny, nz) || 1;
      norm[3 * i] = nx / l; norm[3 * i + 1] = ny / l; norm[3 * i + 2] = nz / l;
    }
    const idx = sx * sy * sz < 0 ? flipTris(geom.idx) : geom.idx;
    const col = geom.col ? geom.col : color;
    this.addRaw(mat, pos, norm, col, idx, alpha);
  }
  scaleShift(s, tx = 0, ty = 0, tz = 0) {
    for (const b of this.buckets.values()) {
      for (let i = 0; i < b.pos.length; i += 3) {
        b.pos[i] = b.pos[i] * s + tx;
        b.pos[i + 1] = b.pos[i + 1] * s + ty;
        b.pos[i + 2] = b.pos[i + 2] * s + tz;
      }
    }
    return this;
  }
}

function flipTris(idx) {
  const out = idx.slice();
  for (let i = 0; i < out.length; i += 3) { const t = out[i + 1]; out[i + 1] = out[i + 2]; out[i + 2] = t; }
  return out;
}

// ------------------------------------------------------------------ Geometry primitives (bevelled, lathed, extruded, draped)
function computeCreaseNormals(pos, idx, creaseDeg = 44) {
  const cosT = Math.cos((creaseDeg * Math.PI) / 180);
  const nTri = idx.length / 3;
  const fn = new Float64Array(nTri * 3);
  const vertTris = new Map();
  const keyOf = (vi) => `${Math.round(pos[3 * vi] * 1e5)},${Math.round(pos[3 * vi + 1] * 1e5)},${Math.round(pos[3 * vi + 2] * 1e5)}`;
  const keys = new Array(pos.length / 3);
  for (let v = 0; v < keys.length; v++) keys[v] = keyOf(v);

  for (let t = 0; t < nTri; t++) {
    const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const areaLen = Math.hypot(nx, ny, nz);
    if (areaLen > 1e-18) { fn[3 * t] = nx / areaLen; fn[3 * t + 1] = ny / areaLen; fn[3 * t + 2] = nz / areaLen; }
    else { fn[3 * t + 1] = 1; }
    for (const v of [a, b, c]) {
      const k = keys[v];
      let arr = vertTris.get(k);
      if (!arr) { arr = []; vertTris.set(k, arr); }
      arr.push(t);
    }
  }
  const outPos = [], outNorm = [], outIdx = [];
  for (let t = 0; t < nTri; t++) {
    const nx0 = fn[3 * t], ny0 = fn[3 * t + 1], nz0 = fn[3 * t + 2];
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      const adj = vertTris.get(keys[v]);
      let sx = 0, sy = 0, sz = 0;
      for (let j = 0; j < adj.length; j++) {
        const t2 = adj[j];
        const nx1 = fn[3 * t2], ny1 = fn[3 * t2 + 1], nz1 = fn[3 * t2 + 2];
        if (nx0 * nx1 + ny0 * ny1 + nz0 * nz1 >= cosT) { sx += nx1; sy += ny1; sz += nz1; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      outIdx.push(outPos.length / 3);
      outPos.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
      outNorm.push(sx / l, sy / l, sz / l);
    }
  }
  return weldExact(outPos, outNorm, null, outIdx);
}

function weldExact(pos, norm, col, idx) {
  const map = new Map();
  const np = [], nn = [], nc = col ? [] : null, ni = [];
  const q = (v, s) => Math.round(v * s);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    const key = col
      ? `${q(pos[3 * v], 1e5)}_${q(pos[3 * v + 1], 1e5)}_${q(pos[3 * v + 2], 1e5)}_${q(norm[3 * v], 500)}_${q(norm[3 * v + 1], 500)}_${q(norm[3 * v + 2], 500)}_${q(col[4 * v], 255)}_${q(col[4 * v + 1], 255)}_${q(col[4 * v + 2], 255)}_${q(col[4 * v + 3], 255)}`
      : `${q(pos[3 * v], 1e5)}_${q(pos[3 * v + 1], 1e5)}_${q(pos[3 * v + 2], 1e5)}_${q(norm[3 * v], 500)}_${q(norm[3 * v + 1], 500)}_${q(norm[3 * v + 2], 500)}`;
    let nv = map.get(key);
    if (nv === undefined) {
      nv = np.length / 3;
      map.set(key, nv);
      np.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
      nn.push(norm[3 * v], norm[3 * v + 1], norm[3 * v + 2]);
      if (col) nc.push(col[4 * v], col[4 * v + 1], col[4 * v + 2], col[4 * v + 3]);
    }
    ni.push(nv);
  }
  return { pos: np, norm: nn, col: nc, idx: ni };
}

// Chamfered box centered in X/Z, bottom at y = 0, height = h (so pieces stack cleanly in Y!)
function bevelBox(w, h, d, bev = 0.0006) {
  const b = Math.min(bev, w * 0.25, h * 0.25, d * 0.25);
  const hx = w / 2, hz = d / 2, ix = hx - b, iz = hz - b;
  // 4-ring vertical profile from y=0 to y=h
  const rings = [
    [0, ix, iz],
    [b, hx, hz],
    [h - b, hx, hz],
    [h, ix, iz],
  ];
  const pos = [], idx = [];
  for (const [y, rx, rz] of rings) {
    pos.push(-rx, y, hz, rx, y, hz, rx, y, -hz, -rx, y, -hz);
  }
  for (let r = 0; r < 3; r++) {
    const o0 = r * 4, o1 = (r + 1) * 4;
    for (let s = 0; s < 4; s++) {
      const n = (s + 1) % 4;
      idx.push(o0 + s, o0 + n, o1 + n, o0 + s, o1 + n, o1 + s);
    }
  }
  // bottom (0..3) and top (12..15)
  idx.push(0, 2, 1, 0, 3, 2);
  idx.push(12, 13, 14, 12, 14, 15);
  return computeCreaseNormals(pos, idx, 35);
}

// Turned lathe around Y axis; profile = [[r, y], ...] from bottom to top
function lathe(profile, segs = 20, crease = 48) {
  const pos = [], idx = [];
  const rows = profile.length;
  for (let j = 0; j < rows; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    const r0 = profile[j][0], r1 = profile[j + 1][0];
    if (r0 < 1e-7 && r1 < 1e-7) continue;
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      const a = j * segs + i, b = j * segs + n, c = (j + 1) * segs + n, d = (j + 1) * segs + i;
      // Outward normal: (b - a) x (d - a) points inward when a goes CCW from +Y, so wind (a, d, c) and (a, c, b)!
      // (a, d, c) uses row j+1 twice (non-degenerate when r1 > 0); (a, c, b) uses row j twice (non-degenerate when r0 > 0).
      if (r1 > 1e-7) idx.push(a, d, c);
      if (r0 > 1e-7) idx.push(a, c, b);
    }
  }
  // Cap open ends if r > 0
  if (profile[0][0] > 1e-6) {
    const cIdx = pos.length / 3; pos.push(0, profile[0][1], 0);
    for (let i = 0; i < segs; i++) idx.push(cIdx, i, (i + 1) % segs);
  }
  if (profile[rows - 1][0] > 1e-6) {
    const cIdx = pos.length / 3, off = (rows - 1) * segs; pos.push(0, profile[rows - 1][1], 0);
    for (let i = 0; i < segs; i++) idx.push(cIdx, off + ((i + 1) % segs), off + i);
  }
  return computeCreaseNormals(pos, idx, crease);
}

function cylY(rBot, rTop, h, segs = 18) {
  return lathe([[0, 0], [rBot, 0], [rTop, h], [0, h]], segs, 45);
}

function uvSphere(rx, ry, rz, uSegs = 16, vSegs = 12) {
  const pos = [], idx = [];
  for (let v = 0; v <= vSegs; v++) {
    const phi = (v / vSegs) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let u = 0; u <= uSegs; u++) {
      const th = (u / uSegs) * Math.PI * 2;
      pos.push(Math.cos(th) * sp * rx, -cp * ry, Math.sin(th) * sp * rz);
    }
  }
  const stride = uSegs + 1;
  for (let v = 0; v < vSegs; v++) {
    for (let u = 0; u < uSegs; u++) {
      const a = v * stride + u, b = a + 1, c = a + stride + 1, d = a + stride;
      if (v < vSegs - 1) idx.push(a, d, c);
      if (v > 0) idx.push(a, c, b);
    }
  }
  return computeCreaseNormals(pos, idx, 65);
}

// Sweep a circular cross-section along 3D curve points [[x,y,z,r], ...]
function tube(pts, segs = 10, capEnds = true) {
  const pos = [], idx = [];
  let up = [0, 1, 0];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(pts.length - 1, i + 1)];
    let tx = pNext[0] - pPrev[0], ty = pNext[1] - pPrev[1], tz = pNext[2] - pPrev[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    if (Math.abs(tx * up[0] + ty * up[1] + tz * up[2]) > 0.92) up = [1, 0, 0];
    let nx = up[1] * tz - up[2] * ty, ny = up[2] * tx - up[0] * tz, nz = up[0] * ty - up[1] * tx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    up = [bx, by, bz];
    const r = p[3];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(p[0] + (nx * ca + bx * sa) * r, p[1] + (ny * ca + by * sa) * r, p[2] + (nz * ca + bz * sa) * r);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const n = (s + 1) % segs;
      const a = i * segs + s, b = i * segs + n, c = (i + 1) * segs + n, d = (i + 1) * segs + s;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (capEnds && pts.length >= 2) {
    const c0 = pos.length / 3; pos.push(pts[0][0], pts[0][1], pts[0][2]);
    for (let s = 0; s < segs; s++) idx.push(c0, (s + 1) % segs, s);
    const k = pts.length - 1, c1 = pos.length / 3, off = k * segs; pos.push(pts[k][0], pts[k][1], pts[k][2]);
    for (let s = 0; s < segs; s++) idx.push(c1, off + s, off + ((s + 1) % segs));
  }
  return computeCreaseNormals(pos, idx, 55);
}

// Ear-clipping 2D polygon triangulation (CCW 2D points [[x,y], ...]) + extrusion along Z (-depth/2 .. +depth/2)
function polyArea2D(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a * 0.5;
}
function triangulate2D(poly) {
  const pts = polyArea2D(poly) < 0 ? [...poly].reverse() : [...poly];
  const V = pts.map((_, i) => i), tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  let guard = V.length * V.length + 20;
  while (V.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i + V.length - 1) % V.length], ib = V[i], ic = V[(i + 1) % V.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (let j = 0; j < V.length; j++) {
        const ij = V[j];
        if (ij === ia || ij === ib || ij === ic) continue;
        if (inTri(pts[ij], a, b, c)) { ok = false; break; }
      }
      if (ok) { tris.push(ia, ib, ic); V.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) break;
  }
  if (V.length === 3) tris.push(V[0], V[1], V[2]);
  return { pts, tris };
}

function extrude2D(poly, depth, bev = 0.0004) {
  const { pts, tris } = triangulate2D(poly);
  const n = pts.length, hz = depth / 2, b = Math.min(bev, depth * 0.3);
  // Centroid for slight bevel inset
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
  const inset = (p, d) => {
    const vx = cx - p[0], vy = cy - p[1], l = Math.hypot(vx, vy) || 1;
    const f = Math.min(d, l * 0.25) / l;
    return [p[0] + vx * f, p[1] + vy * f];
  };
  const rings = b > 1e-6
    ? [[-hz, b], [-hz + b, 0], [hz - b, 0], [hz, b]]
    : [[-hz, 0], [hz, 0]];
  const pos = [], idx = [];
  for (const [z, ins] of rings) {
    for (let i = 0; i < n; i++) { const q = ins > 0 ? inset(pts[i], ins) : pts[i]; pos.push(q[0], q[1], z); }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const o0 = r * n, o1 = (r + 1) * n;
    for (let i = 0; i < n; i++) {
      const m = (i + 1) % n;
      idx.push(o0 + i, o0 + m, o1 + m, o0 + i, o1 + m, o1 + i);
    }
  }
  // back cap (ring 0) and front cap (last ring)
  const lastOff = (rings.length - 1) * n;
  for (let t = 0; t < tris.length; t += 3) {
    idx.push(tris[t], tris[t + 2], tris[t + 1]);
    idx.push(lastOff + tris[t], lastOff + tris[t + 1], lastOff + tris[t + 2]);
  }
  return computeCreaseNormals(pos, idx, 38);
}

// Parametric surface / cloth sheet: evalFn(u, v) => { x, y, z, col?: [r,g,b,a] }
function surfaceSheet(uSegs, vSegs, wrapU, evalFn) {
  const pos = [], col = [], idx = [];
  let hasCol = false;
  const stride = uSegs + 1;
  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const p = evalFn(wrapU && i === uSegs ? 0 : u, v);
      pos.push(p.x, p.y, p.z);
      if (p.col) { hasCol = true; col.push(p.col[0], p.col[1], p.col[2], p.col[3] ?? 1); }
    }
  }
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride + 1, d = a + stride;
      idx.push(a, d, c, a, c, b);
    }
  }
  // Smooth vertex normals directly on the grid
  const nVerts = pos.length / 3;
  const norm = new Float64Array(nVerts * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { norm[3 * q] += nx; norm[3 * q + 1] += ny; norm[3 * q + 2] += nz; }
  }
  if (wrapU) {
    for (let j = 0; j <= vSegs; j++) {
      const a = j * stride, b = j * stride + uSegs;
      const sx = norm[3 * a] + norm[3 * b], sy = norm[3 * a + 1] + norm[3 * b + 1], sz = norm[3 * a + 2] + norm[3 * b + 2];
      norm[3 * a] = norm[3 * b] = sx; norm[3 * a + 1] = norm[3 * b + 1] = sy; norm[3 * a + 2] = norm[3 * b + 2] = sz;
    }
  }
  for (let i = 0; i < nVerts; i++) {
    const l = Math.hypot(norm[3 * i], norm[3 * i + 1], norm[3 * i + 2]) || 1;
    norm[3 * i] /= l; norm[3 * i + 1] /= l; norm[3 * i + 2] /= l;
  }
  return { pos, norm: Array.from(norm), col: hasCol ? col : null, idx };
}

// ------------------------------------------------------------------ Binary STL reader + QEM Mesh Simplifier (Garland-Heckbert)
function readBinaryStl(filePath, scaleMeters = 0.00062) {
  const buf = fs.readFileSync(filePath);
  const nTri = buf.readUInt32LE(80);
  const vMap = new Map(), verts = [], tris = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const raw = [];
  for (let i = 0; i < nTri; i++) {
    const off = 84 + i * 50;
    for (let k = 0; k < 3; k++) {
      const vOff = off + 12 + k * 12;
      // OpenSCAD (x right, y back, z up) -> Three.js (x right, y up, z front = -y_scad)
      const x = buf.readFloatLE(vOff) * scaleMeters;
      const yScad = buf.readFloatLE(vOff + 4) * scaleMeters;
      const zScad = buf.readFloatLE(vOff + 8) * scaleMeters;
      const y = zScad, z = -yScad;
      raw.push(x, y, z);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
  for (let i = 0; i < nTri; i++) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const idx3 = (i * 3 + k) * 3;
      const x = raw[idx3] - cx, y = raw[idx3 + 1] - minY, z = raw[idx3 + 2] - cz;
      const key = `${Math.round(x * 2e5)},${Math.round(y * 2e5)},${Math.round(z * 2e5)}`;
      let vi = vMap.get(key);
      if (vi === undefined) { vi = verts.length / 3; vMap.set(key, vi); verts.push(x, y, z); }
      tri.push(vi);
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[2] !== tri[0]) tris.push(tri[0], tri[1], tri[2]);
  }
  return { pos: verts, idx: tris, height: maxY - minY };
}

// Fast Quadric Error Metric (QEM) mesh simplifier
function simplifyQEM(posIn, idxIn, targetTris) {
  const nVerts = posIn.length / 3;
  let nTris = idxIn.length / 3;
  if (nTris <= targetTris) return { pos: posIn, idx: idxIn };

  const px = new Float64Array(nVerts), py = new Float64Array(nVerts), pz = new Float64Array(nVerts);
  for (let i = 0; i < nVerts; i++) { px[i] = posIn[3 * i]; py[i] = posIn[3 * i + 1]; pz[i] = posIn[3 * i + 2]; }

  // Symmetric 4x4 quadric per vertex (10 numbers: q0..q9)
  const Q = new Float64Array(nVerts * 10);
  const t0 = Int32Array.from({ length: nTris }, (_, i) => idxIn[3 * i]);
  const t1 = Int32Array.from({ length: nTris }, (_, i) => idxIn[3 * i + 1]);
  const t2 = Int32Array.from({ length: nTris }, (_, i) => idxIn[3 * i + 2]);
  const tDead = new Uint8Array(nTris);
  const vTris = Array.from({ length: nVerts }, () => []);

  for (let t = 0; t < nTris; t++) {
    const a = t0[t], b = t1[t], c = t2[t];
    vTris[a].push(t); vTris[b].push(t); vTris[c].push(t);
    const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
    const vx = px[c] - px[a], vy = py[c] - py[a], vz = pz[c] - pz[a];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-16) continue;
    nx /= len; ny /= len; nz /= len;
    const d = -(nx * px[a] + ny * py[a] + nz * pz[a]);
    const w = len * 1e4; // weight by triangle area
    const q = [nx * nx * w, nx * ny * w, nx * nz * w, nx * d * w, ny * ny * w, ny * nz * w, ny * d * w, nz * nz * w, nz * d * w, d * d * w];
    for (const v of [a, b, c]) { const o = v * 10; for (let k = 0; k < 10; k++) Q[o + k] += q[k]; }
  }

  const evalQ = (o1, o2, x, y, z) => {
    const q0 = Q[o1] + Q[o2], q1 = Q[o1 + 1] + Q[o2 + 1], q2 = Q[o1 + 2] + Q[o2 + 2], q3 = Q[o1 + 3] + Q[o2 + 3];
    const q4 = Q[o1 + 4] + Q[o2 + 4], q5 = Q[o1 + 5] + Q[o2 + 5], q6 = Q[o1 + 6] + Q[o2 + 6];
    const q7 = Q[o1 + 7] + Q[o2 + 7], q8 = Q[o1 + 8] + Q[o2 + 8], q9 = Q[o1 + 9] + Q[o2 + 9];
    return q0 * x * x + 2 * q1 * x * y + 2 * q2 * x * z + 2 * q3 * x + q4 * y * y + 2 * q5 * y * z + 2 * q6 * y + q7 * z * z + 2 * q8 * z + q9;
  };

  const parent = Int32Array.from({ length: nVerts }, (_, i) => i);
  const find = (u) => { while (parent[u] !== u) { parent[u] = parent[parent[u]]; u = parent[u]; } return u; };

  // Multi-pass greedy lowest-cost collapse (fast & artifact-free with normal-flip rejection)
  let liveTris = nTris;
  for (let pass = 0; pass < 28 && liveTris > targetTris; pass++) {
    const edgeSet = new Map();
    for (let t = 0; t < nTris; t++) {
      if (tDead[t]) continue;
      const vs = [find(t0[t]), find(t1[t]), find(t2[t])];
      t0[t] = vs[0]; t1[t] = vs[1]; t2[t] = vs[2];
      if (vs[0] === vs[1] || vs[1] === vs[2] || vs[2] === vs[0]) { tDead[t] = 1; liveTris--; continue; }
      for (let e = 0; e < 3; e++) {
        const u = Math.min(vs[e], vs[(e + 1) % 3]), v = Math.max(vs[e], vs[(e + 1) % 3]);
        const key = u * nVerts + v;
        if (!edgeSet.has(key)) {
          const o1 = u * 10, o2 = v * 10;
          const mx = (px[u] + px[v]) * 0.5, my = (py[u] + py[v]) * 0.5, mz = (pz[u] + pz[v]) * 0.5;
          const eu = evalQ(o1, o2, px[u], py[u], pz[u]);
          const ev = evalQ(o1, o2, px[v], py[v], pz[v]);
          const em = evalQ(o1, o2, mx, my, mz);
          const len2 = (px[u] - px[v]) ** 2 + (py[u] - py[v]) ** 2 + (pz[u] - pz[v]) ** 2;
          let best = em, bx = mx, by = my, bz = mz;
          if (eu <= best) { best = eu; bx = px[u]; by = py[u]; bz = pz[u]; }
          if (ev <= best) { best = ev; bx = px[v]; by = py[v]; bz = pz[v]; }
          edgeSet.set(key, { u, v, cost: Math.max(0, best) + len2 * 0.02, bx, by, bz });
        }
      }
    }
    const candidates = [...edgeSet.values()].sort((a, b) => a.cost - b.cost);
    const locked = new Uint8Array(nVerts);
    const quota = Math.min(candidates.length, Math.ceil((liveTris - targetTris) * 0.65));
    let collapsed = 0;
    for (let i = 0; i < candidates.length && collapsed < quota && liveTris > targetTris; i++) {
      const c = candidates[i];
      const u = find(c.u), v = find(c.v);
      if (u === v || locked[u] || locked[v]) continue;
      // Reject if collapsing flips any adjacent non-degenerate triangle normal
      let flips = false;
      const checkList = vTris[u].concat(vTris[v]);
      for (let j = 0; j < checkList.length; j++) {
        const t = checkList[j];
        if (tDead[t]) continue;
        const a = find(t0[t]), b = find(t1[t]), d = find(t2[t]);
        if ((a === u || b === u || d === u) && (a === v || b === v || d === v)) continue; // will degenerate cleanly
        const pOf = (w, nw) => (w === nw ? [c.bx, c.by, c.bz] : [px[w], py[w], pz[w]]);
        const A0 = [px[a], py[a], pz[a]], B0 = [px[b], py[b], pz[b]], D0 = [px[d], py[d], pz[d]];
        const target = a === v || b === v || d === v ? v : u;
        const A1 = pOf(a, target), B1 = pOf(b, target), D1 = pOf(d, target);
        const n0x = (B0[1] - A0[1]) * (D0[2] - A0[2]) - (B0[2] - A0[2]) * (D0[1] - A0[1]);
        const n0y = (B0[2] - A0[2]) * (D0[0] - A0[0]) - (B0[0] - A0[0]) * (D0[2] - A0[2]);
        const n0z = (B0[0] - A0[0]) * (D0[1] - A0[1]) - (B0[1] - A0[1]) * (D0[0] - A0[0]);
        const n1x = (B1[1] - A1[1]) * (D1[2] - A1[2]) - (B1[2] - A1[2]) * (D1[1] - A1[1]);
        const n1y = (B1[2] - A1[2]) * (D1[0] - A1[0]) - (B1[0] - A1[0]) * (D1[2] - A1[2]);
        const n1z = (B1[0] - A1[0]) * (D1[1] - A1[1]) - (B1[1] - A1[1]) * (D1[0] - A1[0]);
        const l0 = Math.hypot(n0x, n0y, n0z), l1 = Math.hypot(n1x, n1y, n1z);
        if (l0 > 1e-16 && l1 > 1e-16 && (n0x * n1x + n0y * n1y + n0z * n1z) / (l0 * l1) < 0.08) { flips = true; break; }
      }
      if (flips) continue;
      px[u] = c.bx; py[u] = c.by; pz[u] = c.bz;
      const o1 = u * 10, o2 = v * 10;
      for (let k = 0; k < 10; k++) Q[o1 + k] += Q[o2 + k];
      parent[v] = u;
      for (let j = 0; j < vTris[v].length; j++) vTris[u].push(vTris[v][j]);
      vTris[v] = [];
      locked[u] = 1; locked[v] = 1;
      collapsed++;
      liveTris -= 2;
    }
    if (collapsed === 0) break;
  }

  const outMap = new Map(), outPos = [], outIdx = [];
  for (let t = 0; t < nTris; t++) {
    if (tDead[t]) continue;
    const a = find(t0[t]), b = find(t1[t]), c = find(t2[t]);
    if (a === b || b === c || c === a) continue;
    for (const v of [a, b, c]) {
      let nv = outMap.get(v);
      if (nv === undefined) { nv = outPos.length / 3; outMap.set(v, nv); outPos.push(px[v], py[v], pz[v]); }
      outIdx.push(nv);
    }
  }
  return { pos: outPos, idx: outIdx };
}

// ------------------------------------------------------------------ Fast Hemisphere Ray / Spatial-Grid Ambient Occlusion Baker
const AO_DIRS = (() => {
  const dirs = [], N = 26, gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = (i + 0.5) / N, r = Math.sqrt(Math.max(0, 1 - z * z)), th = i * gold;
    dirs.push([Math.cos(th) * r, Math.sin(th) * r, z]);
  }
  return dirs;
})();

function bakePartAO(part, maxDist = 0.028, groundY = 0, strength = 0.52) {
  // Collect all triangles across buckets of this part into a fast uniform spatial grid
  const tris = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of part.buckets.values()) {
    const P = b.pos, I = b.idx;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i] < minX) minX = P[i]; if (P[i] > maxX) maxX = P[i];
      if (P[i + 1] < minY) minY = P[i + 1]; if (P[i + 1] > maxY) maxY = P[i + 1];
      if (P[i + 2] < minZ) minZ = P[i + 2]; if (P[i + 2] > maxZ) maxZ = P[i + 2];
    }
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, c1 = I[t + 1] * 3, c2 = I[t + 2] * 3;
      tris.push(P[a], P[a + 1], P[a + 2], P[c1], P[c1 + 1], P[c1 + 2], P[c2], P[c2 + 1], P[c2 + 2]);
    }
  }
  if (!tris.length) return;
  const cell = Math.max(maxDist * 0.65, Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 22, 0.004);
  const grid = new Map();
  const nT = tris.length / 9;
  for (let t = 0; t < nT; t++) {
    const o = t * 9;
    const x0 = Math.floor((Math.min(tris[o], tris[o + 3], tris[o + 6]) - minX) / cell);
    const x1 = Math.floor((Math.max(tris[o], tris[o + 3], tris[o + 6]) - minX) / cell);
    const y0 = Math.floor((Math.min(tris[o + 1], tris[o + 4], tris[o + 7]) - minY) / cell);
    const y1 = Math.floor((Math.max(tris[o + 1], tris[o + 4], tris[o + 7]) - minY) / cell);
    const z0 = Math.floor((Math.min(tris[o + 2], tris[o + 5], tris[o + 8]) - minZ) / cell);
    const z1 = Math.floor((Math.max(tris[o + 2], tris[o + 5], tris[o + 8]) - minZ) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) for (let gz = z0; gz <= z1; gz++) {
      const k = `${gx},${gy},${gz}`;
      let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(o);
    }
  }

  const rayHit = (ox, oy, oz, dx, dy, dz) => {
    const steps = 3;
    for (let s = 0; s <= steps; s++) {
      const tMid = (s / steps) * maxDist;
      const gx = Math.floor((ox + dx * tMid - minX) / cell);
      const gy = Math.floor((oy + dy * tMid - minY) / cell);
      const gz = Math.floor((oz + dz * tMid - minZ) / cell);
      const list = grid.get(`${gx},${gy},${gz}`);
      if (!list) continue;
      for (let j = 0; j < list.length; j++) {
        const o = list[j];
        const e1x = tris[o + 3] - tris[o], e1y = tris[o + 4] - tris[o + 1], e1z = tris[o + 5] - tris[o + 2];
        const e2x = tris[o + 6] - tris[o], e2y = tris[o + 7] - tris[o + 1], e2z = tris[o + 8] - tris[o + 2];
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const sx = ox - tris[o], sy = oy - tris[o + 1], sz = oz - tris[o + 2];
        const u = inv * (sx * hx + sy * hy + sz * hz);
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = inv * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) continue;
        const dist = inv * (e2x * qx + e2y * qy + e2z * qz);
        if (dist > 0.00035 && dist < maxDist) return 1 - dist / maxDist;
      }
    }
    return 0;
  };

  for (const [matId, b] of part.buckets.entries()) {
    if (matId === MAT.glass_spectral) continue; // keep spectral meshes luminous
    const P = b.pos, N = b.norm, col = b.col;
    const nv = P.length / 3;
    for (let i = 0; i < nv; i++) {
      const nx = N[3 * i], ny = N[3 * i + 1], nz = N[3 * i + 2];
      const ox = P[3 * i] + nx * 0.0003, oy = P[3 * i + 1] + ny * 0.0003, oz = P[3 * i + 2] + nz * 0.0003;
      let up = Math.abs(ny) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let tx = up[1] * nz - up[2] * ny, ty = up[2] * nx - up[0] * nz, tz = up[0] * ny - up[1] * nx;
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      let occ = 0;
      for (let d = 0; d < AO_DIRS.length; d++) {
        const [lx, ly, lz] = AO_DIRS[d];
        const rx = tx * lx + bx * ly + nx * lz;
        const ry = ty * lx + by * ly + ny * lz;
        const rz = tz * lx + bz * ly + nz * lz;
        occ += rayHit(ox, oy, oz, rx, ry, rz);
      }
      occ /= AO_DIRS.length;
      const groundOcc = groundY !== null && P[3 * i + 1] >= groundY
        ? Math.max(0, 1 - (P[3 * i + 1] - groundY) / (maxDist * 0.7)) * Math.max(0, -ny * 0.5 + 0.35)
        : 0;
      const shade = Math.max(0.28, 1 - Math.min(0.72, occ * strength + groundOcc * 0.25));
      col[4 * i] *= shade; col[4 * i + 1] *= shade; col[4 * i + 2] *= shade;
    }
  }
}

// ------------------------------------------------------------------ 1. Gothic Cutaway Dollhouse + Line-up + Relic Shelf
function buildDollhouse() {
  const p = new PartBuilder('dollhouse_chassis');
  const W = 0.3, D = 0.25, WALL = 0.0075;
  const slabW = 3 * W + 0.07, slabD = 2 * D + 0.07;
  const TRAY_Z = D + 0.115;
  const LINEUP_SPACING = 0.142;
  const SHELF_X = 1.5 * W + 0.122;

  // Stepped moulded walnut maquette plinth (y = -0.0204 .. 0) with baize tabletop underlay & brass trim
  p.addMesh(MAT.fabric_velvet, bevelBox(slabW + 0.026, 0.0016, slabD + 0.026, 0.0005), C.velvetGreen, 0, -0.0208, 0);
  p.addMesh(MAT.wood_dark, bevelBox(slabW + 0.02, 0.0056, slabD + 0.02, 0.0014), C.ebony, 0, -0.0196, 0);
  p.addMesh(MAT.brass_aged, bevelBox(slabW + 0.01, 0.0028, slabD + 0.01, 0.0007), C.brass, 0, -0.014, 0);
  p.addMesh(MAT.wood_dark, bevelBox(slabW, 0.014, slabD, 0.0015), C.walnutDark, 0, -0.014, 0);
  // Subtle inlaid brass marquetry frame & four turned brass corner leveling bosses
  p.addMesh(MAT.brass_aged, bevelBox(slabW - 0.006, 0.0012, slabD - 0.006, 0.0004), C.brassDark, 0, -0.0011, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.addMesh(MAT.brass_aged, cylY(0.011, 0.009, 0.0032, 14), C.brassDark, sx * (slabW / 2 - 0.004), -0.0202, sz * (slabD / 2 - 0.004));
  }

  // 4 Mitered Brass Corner Brackets + Rivets on the maquette slab
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (slabW / 2 - 0.017), cz = sz * (slabD / 2 - 0.017);
    p.addMesh(MAT.brass_aged, bevelBox(0.044, 0.016, 0.006, 0.0007), C.brass, cx, -0.0145, sz * (slabD / 2 - 0.002));
    p.addMesh(MAT.brass_aged, bevelBox(0.006, 0.016, 0.044, 0.0007), C.brass, sx * (slabW / 2 - 0.002), -0.0145, cz);
    p.addMesh(MAT.brass_aged, uvSphere(0.0026, 0.0026, 0.0026, 10, 8), C.brass, cx, 0.0012, sz * (slabD / 2 - 0.005));
  }

  // Front Line-up Gallery Tray with 6 bespoke brass-rimmed Suspect sockets & baize well
  p.addMesh(MAT.fabric_velvet, bevelBox(slabW + 0.012, 0.0015, 0.102, 0.0005), C.velvetGreen, 0, -0.0206, TRAY_Z);
  p.addMesh(MAT.wood_dark, bevelBox(slabW + 0.008, 0.0048, 0.098, 0.0012), C.ebony, 0, -0.0192, TRAY_Z);
  p.addMesh(MAT.wood_dark, bevelBox(slabW, 0.014, 0.09, 0.0015), C.walnutDark, 0, -0.014, TRAY_Z);
  p.addMesh(MAT.brass_aged, bevelBox(slabW - 0.012, 0.002, 0.078, 0.0006), C.brassDark, 0, -0.001, TRAY_Z);
  p.addMesh(MAT.wood_dark, bevelBox(slabW - 0.02, 0.0022, 0.07, 0.0006), C.ebony, 0, -0.0008, TRAY_Z);
  // Subtle brass nameplate strip along the front gallery lip
  p.addMesh(MAT.brass_aged, bevelBox(slabW * 0.42, 0.0032, 0.0035, 0.0005), C.brassDark, 0, -0.0085, TRAY_Z + 0.0455);
  const socketCollar = lathe([[0.0218, 0], [0.0282, 0], [0.0282, 0.0018], [0.0224, 0.0022]], 24);
  const socketRing = lathe([[0.022, 0], [0.0268, 0], [0.026, 0.0032], [0.0222, 0.003]], 24);
  for (let i = 0; i < 6; i++) {
    const lx = (i - 2.5) * LINEUP_SPACING;
    p.addMesh(MAT.wood_dark, socketCollar, C.mahogany, lx, 0, TRAY_Z);
    p.addMesh(MAT.brass_aged, socketRing, C.brass, lx, 0.0006, TRAY_Z);
    p.addMesh(MAT.fabric_velvet, cylY(0.022, 0.022, 0.0012, 20), C.velvetRed, lx, 0, TRAY_Z);
  }

  // Side 6-Alcove Relic Curio Shelf (right side of dollhouse, wide 2 columns x 3 rows of velvet-lined sockets!)
  const shelfW = 0.18, shelfD = 2 * D + 0.055;
  p.addMesh(MAT.fabric_velvet, bevelBox(shelfW + 0.012, 0.0015, shelfD + 0.012, 0.0005), C.velvetGreen, SHELF_X, -0.0206, 0);
  p.addMesh(MAT.wood_dark, bevelBox(shelfW, 0.016, shelfD, 0.0015), C.walnutDark, SHELF_X, -0.016, 0);
  p.addMesh(MAT.brass_aged, bevelBox(shelfW + 0.006, 0.0028, shelfD + 0.006, 0.0006), C.brassDark, SHELF_X, -0.015, 0);
  p.addMesh(MAT.fabric_velvet, bevelBox(shelfW - 0.022, 0.0014, shelfD - 0.028, 0.0005), C.velvetGreen, SHELF_X - 0.004, -0.0002, 0);
  // Raised back curio rail, brass gallery rod & turned finials
  p.addMesh(MAT.wood_dark, bevelBox(0.007, 0.032, shelfD - 0.012, 0.0009), C.walnut, SHELF_X + shelfW / 2 - 0.0055, 0, 0);
  p.addMesh(MAT.brass_aged, bevelBox(0.0026, 0.0026, shelfD - 0.08, 0.0004), C.brass, SHELF_X + shelfW / 2 - 0.0055, 0.038, 0);
  for (const sz of [-1, 0, 1]) {
    p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.0046, 0], [0.0028, 0.01], [0.0042, 0.014], [0, 0.018]], 12), C.brass, SHELF_X + shelfW / 2 - 0.0055, 0.032, sz * (shelfD * 0.42));
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const rx = SHELF_X - 0.039 + c * 0.078, rz = (r - 1) * 0.168;
    const rh = 0.0055 * (c + 1);
    p.addMesh(MAT.wood_dark, bevelBox(0.054, rh, 0.054, 0.0008), C.ebony, rx, 0, rz);
    p.addMesh(MAT.brass_aged, bevelBox(0.05, 0.0015, 0.05, 0.0003), C.brass, rx, rh - 0.0001, rz);
    p.addMesh(MAT.fabric_velvet, bevelBox(0.044, 0.0014, 0.044, 0.0004), C.velvetRed, rx, rh + 0.0002, rz);
  }

  // Tall Exterior Back & Side Cutaway Walls with Fluted Pilasters, Wainscoting & 3 Gothic Lancet Windows
  const wallH = 0.112, baseY = 0.004;
  const winW = 0.082, winSill = 0.03, winTop = 0.092;
  const totalBackW = 3 * W + 2 * WALL;
  p.addMesh(MAT.wood_dark, bevelBox(totalBackW, winSill, WALL, 0.0007), C.walnutDark, 0, baseY, -D - WALL / 2);
  p.addMesh(MAT.wood_dark, bevelBox(totalBackW, wallH - winTop, WALL, 0.0007), C.walnutDark, 0, baseY + winTop, -D - WALL / 2);
  // Moulded crown cornice & chair rail along back wall
  p.addMesh(MAT.wood_dark, bevelBox(totalBackW + 0.008, 0.007, WALL + 0.007, 0.0009), C.mahogany, 0, baseY + wallH - 0.0035, -D - WALL / 2);
  p.addMesh(MAT.wood_dark, bevelBox(totalBackW + 0.004, 0.0038, WALL + 0.004, 0.0006), C.leather, 0, baseY + 0.027, -D - WALL / 2);
  // Vertical bay pilasters separating the 3 upper galleries
  for (const px of [-1.5 * W, -0.5 * W, 0.5 * W, 1.5 * W]) {
    p.addMesh(MAT.wood_dark, bevelBox(0.011, wallH - 0.004, WALL + 0.004, 0.0007), C.mahogany, px, baseY, -D - WALL / 2);
    p.addMesh(MAT.brass_aged, bevelBox(0.013, 0.004, WALL + 0.006, 0.0004), C.brassDark, px, baseY + wallH - 0.01, -D - WALL / 2);
  }

  // Piers between the 3 windows + pointed Gothic lancet hoods & diamond leaded glass panes
  const winCenters = [-W, 0, W];
  const pierEdges = [
    [-totalBackW / 2, winCenters[0] - winW / 2],
    [winCenters[0] + winW / 2, winCenters[1] - winW / 2],
    [winCenters[1] + winW / 2, winCenters[2] - winW / 2],
    [winCenters[2] + winW / 2, totalBackW / 2],
  ];
  for (const [x0, x1] of pierEdges) {
    p.addMesh(MAT.wood_dark, bevelBox(x1 - x0, winTop - winSill, WALL, 0.0006), C.walnutDark, (x0 + x1) / 2, baseY + winSill, -D - WALL / 2);
  }
  const archHood = extrude2D([
    [-winW * 0.56, 0], [winW * 0.56, 0], [winW * 0.52, 0.007], [0, 0.018], [-winW * 0.52, 0.007],
  ], WALL + 0.005, 0.0005);
  for (const wx of winCenters) {
    p.addMesh(MAT.wood_dark, bevelBox(winW + 0.008, 0.004, WALL + 0.006, 0.0006), C.oak, wx, baseY + winSill - 0.0015, -D - WALL / 2);
    p.addMesh(MAT.wood_dark, archHood, C.mahogany, wx, baseY + winTop - 0.002, -D - WALL / 2);
    p.addMesh(MAT.silver_tarnished, bevelBox(0.0022, winTop - winSill, 0.0028, 0.0003), C.silver, wx, baseY + winSill, -D - WALL / 2);
    for (const sx of [-1, 1]) {
      p.addMesh(MAT.silver_tarnished, bevelBox(0.0015, winTop - winSill, 0.0024, 0.0002), C.silver, wx + sx * winW * 0.25, baseY + winSill, -D - WALL / 2);
    }
    p.addMesh(MAT.silver_tarnished, bevelBox(winW, 0.0022, 0.0028, 0.0003), C.silver, wx, baseY + winSill + (winTop - winSill) * 0.55, -D - WALL / 2);
    p.addMesh(MAT.glass_spectral, bevelBox(winW - 0.002, winTop - winSill - 0.002, 0.0012, 0.0001), C.frost, wx, baseY + winSill, -D - WALL / 2, 0, 0, 0, 1, 1, 1, 0.34);
  }
  // Recessed wainscot panels along back wall interior
  for (let i = 0; i < 9; i++) {
    const px = (i - 4) * (3 * W / 9);
    p.addMesh(MAT.wood_dark, bevelBox(0.072, 0.02, 0.002, 0.0005), C.mahogany, px, baseY + 0.0045, -D + 0.0008);
  }

  // Stepped cutaway Left & Right Exterior Side Walls (tall in back row, stepping down in front row!)
  for (const sx of [-1, 1]) {
    const wx = sx * (1.5 * W + WALL / 2);
    p.addMesh(MAT.wood_dark, bevelBox(WALL, wallH, D, 0.0007), C.walnutDark, wx, baseY, -D / 2);
    p.addMesh(MAT.wood_dark, bevelBox(WALL + 0.005, 0.0068, D + 0.004, 0.0007), C.mahogany, wx, baseY + wallH - 0.0035, -D / 2);
    p.addMesh(MAT.wood_dark, bevelBox(WALL, 0.052, D, 0.0007), C.walnutDark, wx, baseY, D / 2);
    p.addMesh(MAT.wood_dark, bevelBox(WALL + 0.0045, 0.005, D + 0.004, 0.0007), C.mahogany, wx, baseY + 0.049, D / 2);
    p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.0052, 0], [0.0032, 0.009], [0.0046, 0.014], [0, 0.018]], 12), C.brass, wx, baseY + 0.054, 0.004);
  }

  // Front Cutaway Sill + Carved Hall Entrance Threshold, Gateposts & Twin Brass Coach Lanterns
  p.addMesh(MAT.wood_dark, bevelBox(1.16 * W, 0.011, WALL, 0.0007), C.walnut, -W * 0.92, baseY, D + WALL / 2);
  p.addMesh(MAT.wood_dark, bevelBox(1.16 * W, 0.011, WALL, 0.0007), C.walnut, W * 0.92, baseY, D + WALL / 2);
  p.addMesh(MAT.stone_slate, bevelBox(0.16, 0.0055, 0.03, 0.0007), C.stone, 0, baseY - 0.001, D + 0.012);
  for (const sx of [-1, 1]) {
    const px = sx * 0.084;
    p.addMesh(MAT.wood_dark, bevelBox(0.014, 0.04, 0.014, 0.0009), C.mahogany, px, baseY, D + WALL / 2);
    p.addMesh(MAT.brass_aged, bevelBox(0.017, 0.003, 0.017, 0.0005), C.brassDark, px, baseY + 0.04, D + WALL / 2);
    p.addMesh(MAT.glass_spectral, bevelBox(0.009, 0.011, 0.009, 0.0004), C.wax, px, baseY + 0.043, D + WALL / 2, 0, 0, 0, 1, 1, 1, 0.72);
    p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.007, 0], [0.002, 0.005], [0, 0.008]], 10), C.brass, px, baseY + 0.054, D + WALL / 2);
  }

  // Interior Partitions with Framed Doorways, Brass Knobs & Inlaid Brass Threshold Strips
  for (const x of [-0.5 * W, 0.5 * W]) for (const r of [0, 1]) {
    const cz = (r - 0.5) * D, ph = r === 0 ? 0.058 : 0.041;
    p.addMesh(MAT.wood_dark, bevelBox(WALL, ph, D * 0.31, 0.0006), C.walnut, x, baseY, cz - D * 0.345);
    p.addMesh(MAT.wood_dark, bevelBox(WALL, ph, D * 0.31, 0.0006), C.walnut, x, baseY, cz + D * 0.345);
    for (const sz of [-1, 1]) {
      p.addMesh(MAT.wood_dark, bevelBox(WALL + 0.004, ph + 0.0035, 0.006, 0.0006), C.mahogany, x, baseY, cz + sz * D * 0.19);
      p.addMesh(MAT.brass_aged, uvSphere(0.0014, 0.0014, 0.0014, 8, 6), C.brass, x + (x < 0 ? 0.006 : -0.006), baseY + 0.016, cz + sz * D * 0.175);
    }
    p.addMesh(MAT.wood_dark, bevelBox(0.015, 0.0018, D * 0.36, 0.0005), C.oak, x, baseY, cz);
    p.addMesh(MAT.brass_aged, bevelBox(0.003, 0.0022, D - 0.012, 0.0003), C.brassDark, x, baseY + 0.0001, cz);
  }
  for (const c of [-1, 0, 1]) {
    const cx = c * W;
    p.addMesh(MAT.wood_dark, bevelBox(W * 0.31, 0.036, WALL, 0.0006), C.walnut, cx - W * 0.345, baseY, 0);
    p.addMesh(MAT.wood_dark, bevelBox(W * 0.31, 0.036, WALL, 0.0006), C.walnut, cx + W * 0.345, baseY, 0);
    for (const sx of [-1, 1]) {
      p.addMesh(MAT.wood_dark, bevelBox(0.006, 0.039, WALL + 0.004, 0.0006), C.mahogany, cx + sx * W * 0.19, baseY, 0);
      p.addMesh(MAT.brass_aged, uvSphere(0.0014, 0.0014, 0.0014, 8, 6), C.brass, cx + sx * W * 0.175, baseY + 0.015, 0.006);
    }
    p.addMesh(MAT.wood_dark, bevelBox(W * 0.36, 0.0018, 0.015, 0.0005), C.oak, cx, baseY, 0);
    p.addMesh(MAT.brass_aged, bevelBox(W - 0.012, 0.0022, 0.003, 0.0003), C.brassDark, cx, baseY + 0.0001, 0);
  }

  bakePartAO(p, 0.06, -0.02, 0.5);
  return p;
}

// ------------------------------------------------------------------ 2. Six Canonical Sculpted Relics + Relic Token
function buildRelicToken() {
  const p = new PartBuilder('relic_token');
  // Stepped square-chamfered ink plinth with brass border bezel and ivory QR plate
  p.addMesh(MAT.iron_cast, bevelBox(0.04, 0.0052, 0.04, 0.0011), C.ink, 0, 0, 0);
  p.addMesh(MAT.brass_aged, bevelBox(0.035, 0.0016, 0.035, 0.0006), C.brassDark, 0, 0.0052, 0);
  p.addMesh(MAT.bone_wax, bevelBox(0.03, 0.0009, 0.03, 0.0003), C.bone, 0, 0.0066, 0);
  bakePartAO(p, 0.018, 0, 0.4);
  return p;
}

function buildCanonicalRelic(name, stlFile, scaleMeters, targetTris, classifyTri) {
  const raw = readBinaryStl(path.join(stlDir, stlFile), scaleMeters);
  const simp = simplifyQEM(raw.pos, raw.idx, targetTris);
  const smooth = computeCreaseNormals(simp.pos, simp.idx, 42);
  const p = new PartBuilder(name);
  const P = smooth.pos, N = smooth.norm, I = smooth.idx;
  // Partition triangles into material/color buckets for rich multi-part realism!
  const sub = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const cx = (P[3 * a] + P[3 * b] + P[3 * c]) / 3;
    const cy = (P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3;
    const cz = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    const ny = (N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1]) / 3;
    const nz = (N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2]) / 3;
    const { mat, col } = classifyTri(cx, cy, cz, ny, nz);
    const key = `${mat}_${col[0].toFixed(3)}_${col[1].toFixed(3)}_${col[2].toFixed(3)}`;
    let g = sub.get(key);
    if (!g) { g = { mat, col, idx: [] }; sub.set(key, g); }
    g.idx.push(a, b, c);
  }
  for (const g of sub.values()) {
    const used = new Map(), sp = [], sn = [], si = [];
    for (const v of g.idx) {
      let nv = used.get(v);
      if (nv === undefined) { nv = sp.length / 3; used.set(v, nv); sp.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); sn.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]); }
      si.push(nv);
    }
    p.addRaw(g.mat, sp, sn, g.col, si);
  }
  bakePartAO(p, 0.022, 0, 0.56);
  return p;
}

function buildAllRelics() {
  const s = 0.00105; // ~50mm -> ~52.5mm museum-grade tabletop display scale
  return [
    buildRelicToken(),
    buildCanonicalRelic('relic_music_box', 'relic-music-box.stl', s, 1800, (x, y, z) => {
      if (y < 4.6 * s) return { mat: MAT.iron_cast, col: C.ebony };
      if (x > 8.6 * s) return { mat: MAT.brass_aged, col: C.brass }; // side winding key
      if (y > 14.5 * s && y < 18.2 * s && Math.abs(x) < 6.8 * s && Math.abs(z) < 4.2 * s) {
        return z > 2.2 * s ? { mat: MAT.silver_tarnished, col: C.steel } : { mat: MAT.brass_aged, col: C.brass }; // steel comb & pinned brass drum
      }
      if (z > 5.8 * s && y < 14.5 * s && Math.abs(x) < 5.5 * s) return { mat: MAT.brass_aged, col: C.brass }; // front keyhole escutcheon
      if (y > 20.5 * s && z > -5.2 * s && Math.abs(x) < 6.0 * s) return { mat: MAT.bone_wax, col: C.parchment }; // inner lid song label
      return { mat: MAT.wood_dark, col: C.mahogany };
    }),
    buildCanonicalRelic('relic_wax_hand', 'relic-wax-hand.stl', s, 1800, (x, y, z) => {
      if (y < 4.6 * s) return { mat: MAT.iron_cast, col: C.ebony };
      if (y < 9.5 * s) return { mat: MAT.brass_aged, col: C.brassDark }; // brass wax-catcher saucer
      if (z > 3.1 * s && y > 18 * s && y < 27.5 * s && Math.abs(x) < 4.5 * s) return { mat: MAT.fabric_velvet, col: C.alarm }; // crimson palm seal
      return { mat: MAT.bone_wax, col: C.wax };
    }),
    buildCanonicalRelic('relic_locket', 'relic-locket.stl', s, 1650, (x, y, z) => {
      if (y < 4.6 * s) return { mat: MAT.iron_cast, col: C.ebony };
      if (z > 2.4 * s && y > 17 * s && y < 33 * s) {
        const rx = x / (8.2 * s), ry = (y - 25 * s) / (11.2 * s), r2 = rx * rx + ry * ry;
        if (r2 < 0.85) return { mat: MAT.wood_dark, col: C.ebony }; // dark cameo oval
        if (r2 > 1.25 && r2 < 2.2) return { mat: MAT.bone_wax, col: C.pearl }; // pearl bezel
      }
      return { mat: MAT.brass_aged, col: C.brass };
    }),
    buildCanonicalRelic('relic_planchette', 'relic-planchette.stl', s, 1550, (x, y, z) => {
      if (y < 4.6 * s) return { mat: MAT.iron_cast, col: C.ebony };
      if (y < 14 * s) return { mat: MAT.brass_aged, col: C.brassDark }; // turned brass caster legs
      const dy = y - 23.2 * s;
      if (z > 0.6 * s && Math.hypot(x, dy) < 7.4 * s && Math.hypot(x, dy) > 4.2 * s) return { mat: MAT.brass_aged, col: C.brass }; // brass viewing oculus
      return { mat: MAT.wood_dark, col: C.leather };
    }),
    buildCanonicalRelic('relic_silver_key', 'relic-silver-key.stl', s, 1600, (x, y, z) => {
      if (y < 13.4 * s) return z > 3.8 * s ? { mat: MAT.brass_aged, col: C.brassDark } : { mat: MAT.wood_dark, col: C.ebony };
      return { mat: MAT.silver_tarnished, col: C.silver };
    }),
    buildCanonicalRelic('relic_bell', 'relic-bell.stl', s, 1600, (x, y) => {
      if (y < 4.6 * s) return { mat: MAT.iron_cast, col: C.ebony };
      if (y < 12.2 * s && y > 6.8 * s) return { mat: MAT.iron_cast, col: C.iron }; // iron clapper & arch
      if (y > 31.2 * s) return { mat: MAT.wood_dark, col: C.walnut }; // turned baluster handle
      return { mat: MAT.brass_aged, col: C.brass };
    }),
  ];
}

// ------------------------------------------------------------------ 3. The Whisper 3D Draped Shroud & Cold Spot Frost
function buildWhisperShroud() {
  const p = new PartBuilder('whisper_shroud');
  const H = 0.265;
  // Sculpted hooded cowl + draped shoulders + 42x28 pleated billowing shroud with multi-harmonic tattered hem
  const shroud = surfaceSheet(42, 28, false, (u, v) => {
    const ang = (u - 0.5) * Math.PI * 1.5;
    const t = v; // 0 = crown of hood, 1 = tattered hem
    let r;
    if (t < 0.22) r = 0.0055 + Math.sin((t / 0.22) * (Math.PI / 2)) * 0.034; // rounded hood cowl
    else if (t < 0.36) r = 0.032 + ((t - 0.22) / 0.14) * 0.025; // neck to draped shoulders
    else r = 0.056 + Math.pow((t - 0.36) / 0.64, 1.25) * 0.048; // flaring ghostly veil
    const pleats = Math.sin(u * Math.PI * 13) * 0.0058 * Math.pow(t, 1.25) + Math.cos(u * Math.PI * 5 + t * 4.5) * 0.0034 * t;
    const tatters = t > 0.7 ? (Math.sin(u * Math.PI * 13) * 0.018 + Math.cos(u * Math.PI * 19) * 0.007) * ((t - 0.7) / 0.3) : 0;
    const rr = r + pleats;
    const y = H * (1 - t) + tatters;
    const x = Math.sin(ang) * rr;
    const z = -Math.cos(ang) * rr * 0.78 - 0.006;
    const edgeFade = Math.sin(u * Math.PI);
    const hemFade = t > 0.7 ? 1 - ((t - 0.7) / 0.3) * 0.75 : 1;
    const shade = 0.55 + 0.45 * edgeFade;
    return {
      x, y, z,
      col: [C.ghost[0] * shade, C.ghost[1] * shade, C.ghost[2] * shade, Math.max(0.08, 0.54 * hemFade * (0.45 + 0.55 * edgeFade))],
    };
  });
  p.addRaw(MAT.glass_spectral, shroud.pos, shroud.norm, shroud.col, shroud.idx);

  // 4 Spiralling Ectoplasm Rib-Tendrils beneath the shroud
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + 0.4;
    const pts = [];
    for (let s = 0; s <= 12; s++) {
      const u = s / 12, a = a0 + u * 2.5, r = 0.025 + u * 0.048;
      pts.push([Math.cos(a) * r, 0.125 * (1 - u), Math.sin(a) * r, 0.0032 * (1 - u * 0.8)]);
    }
    p.addMesh(MAT.glass_spectral, tube(pts, 7, true), C.ghostDeep, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0.44);
  }
  return p;
}

function buildColdSpotFrost() {
  const p = new PartBuilder('cold_spot_frost');
  const rng = makeRng(404);
  // Radial crystalline ice-rime shards creeping flat across a 30 x 25 cm Nursery's floorboards
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + (rng() - 0.5) * 0.16;
    const len = 0.062 + rng() * 0.05, w = 0.0075 + rng() * 0.0052;
    const shard = extrude2D([[0, -w * 0.5], [len * 0.65, -w], [len, 0], [len * 0.65, w], [0, w * 0.5]], 0.0016, 0.0003);
    p.addMesh(MAT.glass_spectral, shard, C.frost, Math.cos(a) * 0.018, 0.0008, Math.sin(a) * 0.018, Math.PI / 2, a, 0, 1, 1, 1, 0.5);
  }
  p.addMesh(MAT.glass_spectral, lathe([[0.032, 0], [0.078, 0.0012], [0.104, 0.0003], [0.032, 0]], 32), C.ghost, 0, 0.0002, 0, 0, 0, 0, 1, 1, 1, 0.36);
  return p;
}

// ------------------------------------------------------------------ 4. Turned Suspect Plinth & Player Pawns + Turn Ring
function buildSuspectPlinth() {
  const p = new PartBuilder('suspect_plinth');
  // Heavy weighted Victorian Staunton-base standee plinth: baize felt pad, walnut body, twin brass rings & engraved clasp
  p.addMesh(MAT.fabric_velvet, cylY(0.023, 0.0234, 0.0014, 24), C.velvetGreen, 0, 0, 0);
  const body = lathe([
    [0, 0.0012], [0.0226, 0.0012], [0.0224, 0.0028], [0.0196, 0.0042], [0.018, 0.0064], [0.0156, 0.0076], [0, 0.0076],
  ], 24, 42);
  p.addMesh(MAT.wood_dark, body, C.walnutDark);
  const lowerBead = lathe([[0.0218, 0.0012], [0.0234, 0.0014], [0.023, 0.0026], [0.0214, 0.0026]], 24, 42);
  p.addMesh(MAT.brass_aged, lowerBead, C.brassDark);
  const brassCollar = lathe([[0.0176, 0.0036], [0.0206, 0.0038], [0.0202, 0.0052], [0.0174, 0.0052]], 24, 42);
  p.addMesh(MAT.brass_aged, brassCollar, C.brass);
  // Milled brass portrait clasp jaws + front angled nameplate plaque with corner studs
  for (const sz of [-1, 1]) {
    p.addMesh(MAT.brass_aged, bevelBox(0.022, 0.0048, 0.0024, 0.0004), C.brassDark, 0, 0.0068, sz * 0.0024);
  }
  p.addMesh(MAT.brass_aged, bevelBox(0.023, 0.0038, 0.0062, 0.0004), C.brass, 0, 0.0022, 0.0185, -0.45, 0, 0);
  for (const sx of [-1, 1]) {
    p.addMesh(MAT.brass_aged, uvSphere(0.0009, 0.0009, 0.0009, 6, 4), C.pearl, sx * 0.009, 0.0042, 0.0205);
  }
  bakePartAO(p, 0.018, 0, 0.45);
  return p;
}

function buildPawnLiving() {
  const p = new PartBuilder('pawn_living');
  // Carved Staunton-meets-lantern investigator pawn (~65 mm tall) with felt base & glowing lantern cage finial
  p.addMesh(MAT.fabric_velvet, cylY(0.0172, 0.0175, 0.0014, 22), C.velvetGreen, 0, 0, 0);
  const wood = lathe([
    [0, 0.0012], [0.0168, 0.0012], [0.0164, 0.0034], [0.0136, 0.0062], [0.0098, 0.0135],
    [0.0074, 0.0285], [0.0108, 0.0345], [0.0086, 0.039], [0.0118, 0.049], [0.0082, 0.056], [0, 0.0565],
  ], 22, 46);
  p.addMesh(MAT.wood_dark, wood, C.mahogany);
  const baseRing = lathe([[0.0156, 0.0012], [0.0174, 0.0014], [0.017, 0.003], [0.0154, 0.003]], 22, 42);
  p.addMesh(MAT.brass_aged, baseRing, C.brassDark);
  const collar = lathe([[0.0072, 0.032], [0.012, 0.0338], [0.012, 0.0365], [0.0072, 0.0375]], 22, 42);
  p.addMesh(MAT.brass_aged, collar, C.brass);
  // Pierced brass lantern finial atop the Staunton crown
  p.addMesh(MAT.glass_spectral, cylY(0.0042, 0.0046, 0.0075, 10), C.wax, 0, 0.0568, 0, 0, 0, 0, 1, 1, 1, 0.78);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    p.addMesh(MAT.brass_aged, cylY(0.0007, 0.0007, 0.008, 6), C.brass, Math.cos(a) * 0.005, 0.0566, Math.sin(a) * 0.005);
  }
  p.addMesh(MAT.brass_aged, lathe([[0, 0.0642], [0.0072, 0.0645], [0.0044, 0.068], [0.002, 0.0705], [0, 0.072]], 14, 42), C.brass);
  bakePartAO(p, 0.02, 0, 0.48);
  return p;
}

function buildPawnPoltergeist() {
  const p = new PartBuilder('pawn_poltergeist');
  // Weathered, fractured monochrome ash-stone effigy pawn (~62 mm tall, tilted & jagged, Req 2.2)
  const stone = lathe([
    [0, 0], [0.0168, 0], [0.0158, 0.0036], [0.0124, 0.0072], [0.0088, 0.017],
    [0.0068, 0.0295], [0.0102, 0.037], [0.0078, 0.0455], [0.0096, 0.054], [0, 0.06],
  ], 9, 28);
  p.addMesh(MAT.stone_slate, stone, C.ashMono, 0, 0, 0, 0.05, 0.2, -0.09);
  p.addMesh(MAT.stone_slate, bevelBox(0.0072, 0.017, 0.0056, 0.0006), C.stoneDark, 0.0056, 0.0315, 0.0028, 0.2, 0.3, -0.35);
  p.addMesh(MAT.stone_slate, bevelBox(0.0056, 0.013, 0.0056, 0.0006), C.stoneDark, -0.0056, 0.023, -0.0028, -0.15, 0.1, 0.3);
  bakePartAO(p, 0.02, 0, 0.55);
  return p;
}

function buildPawnTurnRing() {
  const p = new PartBuilder('pawn_turn_ring');
  const ring = lathe([[0.0195, 0], [0.0258, 0], [0.025, 0.0028], [0.0202, 0.0028], [0.0195, 0]], 28, 42);
  p.addMesh(MAT.brass_aged, ring, C.brass);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.addMesh(MAT.brass_aged, bevelBox(0.0048, 0.0038, 0.0075, 0.0005), C.brass, Math.cos(a) * 0.0235, 0, Math.sin(a) * 0.0235, 0, -a, 0);
    const b = a + Math.PI / 4;
    p.addMesh(MAT.brass_aged, uvSphere(0.0016, 0.0016, 0.0016, 8, 6), C.pearl, Math.cos(b) * 0.0228, 0.0028, Math.sin(b) * 0.0228);
  }
  p.addMesh(MAT.fabric_velvet, uvSphere(0.0022, 0.002, 0.0022, 8, 6), C.alarm, 0, 0.0034, 0.0235);
  return p;
}

// ------------------------------------------------------------------ 5. Physicalized Séance Hatpins & Inspected Magnifying Lens
function buildMarkHatpin() {
  const p = new PartBuilder('mark_hatpin');
  // Tapered steel needle (y = 0 .. 0.215) + faceted dark bead + brass filigree collar & crossbar
  p.addMesh(MAT.silver_tarnished, lathe([[0.0003, 0], [0.0013, 0.028], [0.0015, 0.215], [0, 0.215]], 10, 50), C.steel);
  p.addMesh(MAT.brass_aged, lathe([[0, 0.213], [0.004, 0.215], [0.0026, 0.221], [0.0054, 0.227], [0, 0.232]], 14, 42), C.brass);
  p.addMesh(MAT.iron_cast, uvSphere(0.0058, 0.0064, 0.0058, 12, 10), C.ebony, 0, 0.238, 0);
  p.addMesh(MAT.brass_aged, cylY(0.0016, 0.0008, 0.0055, 10), C.brass, 0, 0.244, 0);
  // Horizontal brass crossbar holding the parchment pennant
  p.addMesh(MAT.brass_aged, bevelBox(0.106, 0.0026, 0.0026, 0.0005), C.brass, 0, 0.216, 0);
  for (const sx of [-1, 1]) p.addMesh(MAT.brass_aged, uvSphere(0.0026, 0.0026, 0.0026, 8, 6), C.brass, sx * 0.054, 0.216, 0);
  // Slightly curled 3D parchment backing card hanging from the crossbar (y = 0.188 .. 0.216)
  const card = surfaceSheet(12, 4, false, (u, v) => ({
    x: (u - 0.5) * 0.102,
    y: 0.216 - v * 0.028,
    z: Math.sin(u * Math.PI * 1.5) * 0.0024 + v * v * 0.0026,
  }));
  p.addMesh(MAT.bone_wax, card, C.parchment, 0, 0, -0.001);
  return p;
}

function buildInspectedLens() {
  const p = new PartBuilder('inspected_lens');
  const rim = lathe([[0.0068, 0], [0.0086, 0], [0.0086, 0.0022], [0.0068, 0.0022], [0.0068, 0]], 20, 42);
  p.addMesh(MAT.brass_aged, rim, C.brass, 0, 0.0008, 0);
  p.addMesh(MAT.glass_spectral, cylY(0.0069, 0.0069, 0.0008, 18), C.frost, 0, 0.0015, 0, 0, 0, 0, 1, 1, 1, 0.45);
  p.addMesh(MAT.wood_dark, bevelBox(0.0024, 0.0022, 0.013, 0.0006), C.ebony, 0, 0.0008, 0.0145);
  p.addMesh(MAT.brass_aged, bevelBox(0.003, 0.0026, 0.003, 0.0004), C.brass, 0, 0.0007, 0.0092);
  p.scaleShift(1.75);
  bakePartAO(p, 0.018, 0, 0.4);
  return p;
}

// ------------------------------------------------------------------ 6. Sculpted Room Vignette Kits (+ animatable rocking horse & clock pendulum!)
// Each room is 30 cm x 25 cm (x in [-0.15, +0.15], z in [-0.125, +0.125]); furniture hugs back & side walls so center rugs stay clear!
function buildRoomLibrary() {
  const p = new PartBuilder('room_library');
  const rng = makeRng(101);
  // Arched triple-bay Gothic walnut bookcase against back wall (after 1.85x -> z = -0.096)
  p.addMesh(MAT.wood_dark, bevelBox(0.072, 0.044, 0.012, 0.0006), C.walnutDark, -0.006, 0, -0.052);
  p.addMesh(MAT.wood_dark, bevelBox(0.076, 0.0035, 0.014, 0.0005), C.mahogany, -0.006, 0.044, -0.052);
  const arch = extrude2D([[-0.026, 0], [0.026, 0], [0.018, 0.005], [0, 0.009], [-0.018, 0.005]], 0.012, 0.0005);
  p.addMesh(MAT.wood_dark, arch, C.mahogany, -0.006, 0.047, -0.052);
  const bookCols = [C.velvetRed, C.velvetGreen, C.velvetBlue, C.leather, C.mahogany, C.brassDark];
  for (let sh = 0; sh < 3; sh++) {
    const sy = 0.004 + sh * 0.013;
    p.addMesh(MAT.wood_dark, bevelBox(0.068, 0.0018, 0.0125, 0.0003), C.oak, -0.006, sy, -0.0515);
    let bx = -0.036;
    while (bx < 0.022) {
      const bw = 0.0028 + rng() * 0.0022, bh = 0.0085 + rng() * 0.0028;
      const col = bookCols[Math.floor(rng() * bookCols.length)];
      p.addMesh(MAT.fabric_velvet, bevelBox(bw, bh, 0.008, 0.0003), col, bx + bw / 2, sy + 0.0018, -0.0495, 0, 0, (rng() - 0.5) * 0.08);
      bx += bw + 0.0005;
    }
  }
  // Terrestrial Brass & Parchment Floor Globe in Meridian Stand (back-left corner)
  const gx = -0.055, gz = -0.026;
  p.addMesh(MAT.wood_dark, lathe([[0, 0], [0.0085, 0], [0.007, 0.002], [0.0022, 0.01], [0, 0.01]], 16), C.walnut, gx, 0, gz);
  p.addMesh(MAT.bone_wax, uvSphere(0.0085, 0.0085, 0.0085, 16, 12), C.parchment, gx, 0.018, gz, 0.2, 0.4, -0.4);
  p.addMesh(MAT.brass_aged, tube(Array.from({ length: 13 }, (_, i) => {
    const a = -Math.PI * 0.65 + (i / 12) * Math.PI * 1.3;
    return [gx + Math.sin(a) * 0.0102, 0.018 - Math.cos(a) * 0.0102, gz, 0.0009];
  }), 7), C.brass);
  // Side reading pedestal table with open leather folio & brass candlestick
  p.addMesh(MAT.wood_dark, lathe([[0, 0], [0.007, 0], [0.005, 0.002], [0.0018, 0.014], [0.0095, 0.015], [0.0095, 0.017], [0, 0.017]], 16), C.mahogany, 0.027, 0, -0.036);
  p.addMesh(MAT.bone_wax, bevelBox(0.011, 0.0016, 0.0085, 0.0002), C.parchment, 0.025, 0.0172, -0.036, 0, 0.22, 0);
  p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.0022, 0], [0.001, 0.004], [0, 0.005]], 10), C.brass, 0.032, 0.0172, -0.038);
  // Tufted Wingback Reading Armchair (back-right corner)
  const cx = 0.052, cz = -0.038;
  p.addMesh(MAT.fabric_velvet, bevelBox(0.02, 0.009, 0.018, 0.0012), C.velvetRed, cx, 0.003, cz);
  p.addMesh(MAT.fabric_velvet, bevelBox(0.02, 0.024, 0.005, 0.0012), C.velvetRed, cx, 0.008, cz - 0.007, -0.12, 0, 0);
  for (const sx of [-1, 1]) {
    p.addMesh(MAT.fabric_velvet, bevelBox(0.0045, 0.014, 0.018, 0.001), C.velvetRed, cx + sx * 0.009, 0.007, cz);
    p.addMesh(MAT.fabric_velvet, bevelBox(0.004, 0.013, 0.008, 0.0008), C.velvetRed, cx + sx * 0.0095, 0.019, cz - 0.005);
  }
  p.scaleShift(1.85);
  bakePartAO(p, 0.044, 0, 0.55);
  return p;
}

function buildRoomStudy() {
  const p = new PartBuilder('room_study');
  // Victorian Roll-Top Desk against back wall (after 1.85x -> dz = -0.085)
  const dx = 0.004, dz = -0.046;
  for (const sx of [-1, 1]) {
    p.addMesh(MAT.wood_dark, bevelBox(0.013, 0.017, 0.022, 0.0006), C.walnutDark, dx + sx * 0.016, 0, dz);
    for (const dy of [0.0045, 0.0105]) p.addMesh(MAT.brass_aged, bevelBox(0.004, 0.0012, 0.0012, 0.0002), C.brass, dx + sx * 0.016, dy, dz + 0.0112);
  }
  p.addMesh(MAT.wood_dark, bevelBox(0.046, 0.0025, 0.024, 0.0005), C.mahogany, dx, 0.017, dz);
  const hood = extrude2D([[-0.011, 0], [0.011, 0], [0.011, 0.005], [0.008, 0.01], [0.002, 0.012], [-0.011, 0.012]], 0.044, 0.0005);
  p.addMesh(MAT.wood_dark, hood, C.walnut, dx, 0.019, dz - 0.001, 0, Math.PI / 2, 0);
  p.addMesh(MAT.fabric_velvet, bevelBox(0.018, 0.0008, 0.01, 0.0002), C.velvetGreen, dx, 0.0195, dz + 0.005);
  p.addMesh(MAT.bone_wax, bevelBox(0.011, 0.0014, 0.008, 0.0002), C.parchment, dx - 0.002, 0.0202, dz + 0.005, 0, 0.14, 0);
  p.addMesh(MAT.fabric_velvet, cylY(0.0014, 0.0014, 0.0005, 10), C.alarm, dx - 0.005, 0.0214, dz + 0.007); // red wax seal
  p.addMesh(MAT.brass_aged, cylY(0.0014, 0.0011, 0.0022, 10), C.brassDark, dx + 0.012, 0.0195, dz + 0.004); // inkwell
  p.addMesh(MAT.bone_wax, bevelBox(0.0008, 0.009, 0.0016, 0.0002), C.bone, dx + 0.013, 0.021, dz + 0.004, -0.2, 0, -0.35); // quill plume
  p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.0035, 0], [0.0014, 0.005], [0.0026, 0.006], [0, 0.006]], 12), C.brass, dx + 0.016, 0.031, dz - 0.005);
  p.addMesh(MAT.bone_wax, cylY(0.0012, 0.0011, 0.007, 10), C.wax, dx + 0.016, 0.037, dz - 0.005);
  // Turned Captain's Chair pulled out slightly crooked
  const cx = dx + 0.003, cz = dz + 0.022;
  p.addMesh(MAT.wood_dark, cylY(0.0018, 0.0018, 0.01, 10), C.ebony, cx, 0.002, cz);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    p.addMesh(MAT.wood_dark, bevelBox(0.014, 0.002, 0.0022, 0.0003), C.ebony, cx, 0.001, cz, 0, a, 0);
  }
  p.addMesh(MAT.wood_dark, cylY(0.0085, 0.0085, 0.0022, 16), C.mahogany, cx, 0.011, cz);
  p.addMesh(MAT.wood_dark, tube(Array.from({ length: 9 }, (_, i) => {
    const a = -1.9 + (i / 8) * 3.8;
    return [cx + Math.sin(a) * 0.008, 0.019, cz + Math.cos(a) * 0.008, 0.0011];
  }), 7), C.mahogany);
  p.scaleShift(1.85);
  bakePartAO(p, 0.04, 0, 0.54);
  return p;
}

function buildRoomNursery() {
  const p = new PartBuilder('room_nursery');
  // Wrought-Iron Victorian Spindle Crib in back-right corner (after 1.85x -> cx = 0.063, cz = -0.081)
  const cx = 0.034, cz = -0.044, cw = 0.042, cd = 0.024;
  p.addMesh(MAT.bone_wax, bevelBox(cw - 0.004, 0.005, cd - 0.004, 0.0012), C.bone, cx, 0.007, cz);
  p.addMesh(MAT.fabric_velvet, bevelBox(0.018, 0.0024, cd - 0.005, 0.0008), C.velvetGreen, cx - 0.007, 0.0112, cz); // wool quilt
  p.addMesh(MAT.fabric_velvet, bevelBox(0.011, 0.0038, cd - 0.006, 0.001), C.velvetBlue, cx + 0.012, 0.0115, cz, 0, 0, 0.08);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cx + sx * (cw / 2), pz = cz + sz * (cd / 2);
    p.addMesh(MAT.iron_cast, cylY(0.0011, 0.0011, 0.024, 8), C.iron, px, 0, pz);
    p.addMesh(MAT.brass_aged, uvSphere(0.002, 0.0024, 0.002, 10, 8), C.brass, px, 0.025, pz);
  }
  for (const sz of [-1, 1]) {
    p.addMesh(MAT.iron_cast, bevelBox(cw, 0.0014, 0.0014, 0.0003), C.iron, cx, 0.007, cz + sz * (cd / 2));
    p.addMesh(MAT.iron_cast, bevelBox(cw, 0.0014, 0.0014, 0.0003), C.iron, cx, 0.02, cz + sz * (cd / 2));
    for (let i = -3; i <= 3; i++) p.addMesh(MAT.iron_cast, cylY(0.0006, 0.0006, 0.013, 6), C.iron, cx + i * 0.0052, 0.007, cz + sz * (cd / 2));
  }
  for (const sx of [-1, 1]) {
    p.addMesh(MAT.iron_cast, bevelBox(0.0014, 0.0014, cd, 0.0003), C.iron, cx + sx * (cw / 2), 0.022, cz);
    for (let i = -1; i <= 1; i++) p.addMesh(MAT.iron_cast, cylY(0.0006, 0.0006, 0.015, 6), C.iron, cx + sx * (cw / 2), 0.007, cz + i * 0.006);
  }
  // Scattered wooden toy blocks tucked near the crib
  p.addMesh(MAT.wood_dark, bevelBox(0.0065, 0.0065, 0.0065, 0.0006), C.alarm, -0.008, 0, -0.034, 0, 0.35, 0);
  p.addMesh(MAT.bone_wax, bevelBox(0.006, 0.006, 0.006, 0.0006), C.bone, -0.001, 0, -0.03, 0, -0.2, 0);
  p.addMesh(MAT.brass_aged, bevelBox(0.0058, 0.0058, 0.0058, 0.0006), C.brass, -0.005, 0.0065, -0.032, 0, 0.7, 0);
  p.scaleShift(1.85);
  bakePartAO(p, 0.04, 0, 0.5);
  return p;
}

function buildNurseryHorse() {
  const p = new PartBuilder('nursery_horse');
  // Carved Victorian Rocking Horse on curved runners (pivot at bottom of runners y = 0!)
  for (const sz of [-1, 1]) {
    const runner = tube(Array.from({ length: 11 }, (_, i) => {
      const x = (i / 10 - 0.5) * 0.036;
      return [x, 0.0014 + x * x * 11, sz * 0.0065, 0.0013];
    }), 7);
    p.addMesh(MAT.wood_dark, runner, C.mahogany);
  }
  p.addMesh(MAT.wood_dark, bevelBox(0.004, 0.0015, 0.015, 0.0003), C.walnut, -0.01, 0.0022, 0);
  p.addMesh(MAT.wood_dark, bevelBox(0.004, 0.0015, 0.015, 0.0003), C.walnut, 0.01, 0.0022, 0);
  for (const [lx, lz, tilt] of [[-0.008, -0.004, 0.25], [-0.008, 0.004, 0.25], [0.008, -0.004, -0.25], [0.008, 0.004, -0.25]]) {
    p.addMesh(MAT.bone_wax, bevelBox(0.0025, 0.012, 0.0025, 0.0004), C.bone, lx, 0.0025, lz, 0, 0, tilt);
  }
  p.addMesh(MAT.bone_wax, uvSphere(0.0105, 0.0052, 0.0048, 14, 10), C.bone, 0, 0.015, 0);
  p.addMesh(MAT.fabric_velvet, bevelBox(0.008, 0.003, 0.0102, 0.0008), C.velvetRed, 0, 0.018, 0);
  p.addMesh(MAT.brass_aged, bevelBox(0.002, 0.003, 0.003, 0.0003), C.brass, 0.0035, 0.0205, 0); // saddle pommel
  p.addMesh(MAT.wood_dark, bevelBox(0.005, 0.0026, 0.0024, 0.0004), C.walnutDark, -0.011, 0.014, 0, 0, 0, -0.5); // horsehair tail
  const neck = extrude2D([[0, 0], [0.007, 0], [0.011, 0.011], [0.015, 0.009], [0.014, 0.014], [0.007, 0.016], [0.002, 0.009]], 0.0045, 0.0006);
  p.addMesh(MAT.bone_wax, neck, C.bone, 0.004, 0.015, 0);
  p.scaleShift(1.85);
  bakePartAO(p, 0.03, 0, 0.48);
  return p;
}

function buildRoomKitchen() {
  const p = new PartBuilder('room_kitchen');
  // Cast-iron Victorian Coal Range Stove + Stovepipe Chimney + Copper Kettle + Stewpot + Butcher's Table
  const sx = -0.042, sz = -0.045;
  p.addMesh(MAT.iron_cast, bevelBox(0.034, 0.024, 0.022, 0.0008), C.iron, sx, 0, sz);
  p.addMesh(MAT.iron_cast, bevelBox(0.037, 0.0025, 0.025, 0.0005), C.iron, sx, 0.023, sz);
  p.addMesh(MAT.brass_aged, bevelBox(0.038, 0.0014, 0.002, 0.0003), C.brass, sx, 0.022, sz + 0.014);
  p.addMesh(MAT.brass_aged, bevelBox(0.011, 0.012, 0.0015, 0.0003), C.brassDark, sx + 0.008, 0.005, sz + 0.011);
  p.addMesh(MAT.fabric_velvet, bevelBox(0.01, 0.005, 0.0016, 0.0002), C.alarm, sx - 0.008, 0.012, sz + 0.011);
  p.addMesh(MAT.iron_cast, cylY(0.0036, 0.0036, 0.032, 12), C.iron, sx - 0.008, 0.025, sz - 0.006);
  p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.0052, 0], [0.0062, 0.0035], [0.0038, 0.007], [0, 0.008]], 14), C.copper, sx + 0.007, 0.0255, sz + 0.002);
  p.addMesh(MAT.iron_cast, cylY(0.0055, 0.0062, 0.0055, 14), C.iron, sx - 0.006, 0.0255, sz + 0.004); // cast-iron stewpot
  // Heavy Oak Butcher-Block Prep Table + Bowls + Rolling Pin (back-right)
  const tx = 0.038, tz = -0.042;
  p.addMesh(MAT.wood_dark, bevelBox(0.038, 0.004, 0.022, 0.0006), C.pine, tx, 0.014, tz);
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    p.addMesh(MAT.wood_dark, bevelBox(0.0032, 0.014, 0.0032, 0.0004), C.oak, tx + lx * 0.015, 0, tz + lz * 0.008);
  }
  p.addMesh(MAT.bone_wax, lathe([[0, 0], [0.0035, 0], [0.006, 0.0045], [0.005, 0.0045], [0.003, 0.001], [0, 0.001]], 14), C.bone, tx - 0.008, 0.018, tz);
  p.addMesh(MAT.wood_dark, cylY(0.0015, 0.0015, 0.014, 10), C.oak, tx + 0.002, 0.0195, tz + 0.004, Math.PI / 2, 0.4, 0); // rolling pin
  p.addMesh(MAT.iron_cast, cylY(0.0045, 0.005, 0.005, 12), C.iron, tx + 0.008, 0.018, tz - 0.003);
  p.scaleShift(1.85);
  bakePartAO(p, 0.044, 0, 0.54);
  return p;
}

function buildRoomHall() {
  const p = new PartBuilder('room_hall');
  // Balustraded Oak Staircase in back-left corner (after 1.85x -> sx = -0.085, sz = -0.096)
  const sx = -0.046, sz = -0.052;
  for (let i = 0; i < 6; i++) {
    const h = 0.0055 * (i + 1), z = sz + (5 - i) * 0.0068;
    p.addMesh(MAT.wood_dark, bevelBox(0.038, h, 0.0072, 0.0004), C.walnut, sx, 0, z);
    p.addMesh(MAT.fabric_velvet, bevelBox(0.022, 0.0008, 0.0074, 0.0002), C.velvetRed, sx, h, z);
    p.addMesh(MAT.wood_dark, cylY(0.0009, 0.0009, 0.013, 8), C.mahogany, sx + 0.017, h, z);
  }
  p.addMesh(MAT.wood_dark, tube([[sx + 0.017, 0.018, sz + 5 * 0.0068, 0.0015], [sx + 0.017, 0.046, sz, 0.0015]], 8), C.mahogany);
  p.addMesh(MAT.wood_dark, bevelBox(0.005, 0.021, 0.005, 0.0006), C.mahogany, sx + 0.017, 0, sz + 5 * 0.0068 + 0.002);
  p.addMesh(MAT.brass_aged, uvSphere(0.0024, 0.0028, 0.0024, 10, 8), C.brass, sx + 0.017, 0.0225, sz + 5 * 0.0068 + 0.002);

  // Tall Victorian Grandfather Longcase Clock in back-right corner (after 1.85x -> cx = +0.104, cz = -0.0925)
  const cx = 0.056, cz = -0.05;
  p.addMesh(MAT.wood_dark, bevelBox(0.015, 0.01, 0.012, 0.0006), C.walnutDark, cx, 0, cz);
  p.addMesh(MAT.wood_dark, bevelBox(0.012, 0.024, 0.004, 0.0004), C.ebony, cx, 0.01, cz - 0.003);
  for (const lx of [-1, 1]) p.addMesh(MAT.wood_dark, bevelBox(0.0028, 0.024, 0.01, 0.0004), C.walnut, cx + lx * 0.005, 0.01, cz);
  p.addMesh(MAT.wood_dark, bevelBox(0.016, 0.016, 0.013, 0.0006), C.mahogany, cx, 0.034, cz);
  p.addMesh(MAT.brass_aged, cylY(0.0052, 0.0052, 0.0012, 16), C.brass, cx, 0.042, cz + 0.0066, Math.PI / 2, 0, 0);
  p.addMesh(MAT.bone_wax, cylY(0.0042, 0.0042, 0.0014, 16), C.bone, cx, 0.042, cz + 0.0067, Math.PI / 2, 0, 0);
  p.addMesh(MAT.wood_dark, bevelBox(0.001, 0.0032, 0.0008, 0.0001), C.ink, cx, 0.042, cz + 0.0075);
  p.addMesh(MAT.wood_dark, bevelBox(0.0026, 0.0008, 0.0008, 0.0001), C.ink, cx + 0.001, 0.042, cz + 0.0075, 0, 0, 0.35);
  for (const px of [-0.006, 0, 0.006]) {
    p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.002, 0], [0.0008, 0.004], [0, 0.005]], 10), C.brass, cx + px, 0.05, cz);
  }
  p.scaleShift(1.85);
  bakePartAO(p, 0.044, 0, 0.55);
  return p;
}

function buildHallPendulum() {
  const p = new PartBuilder('hall_pendulum');
  // Brass pendulum rod & bob hanging from pivot y = 0 downward so rotation.z swings it inside the grandfather clock!
  p.addMesh(MAT.brass_aged, bevelBox(0.0008, 0.016, 0.0006, 0.0001), C.brass, 0, -0.016, 0);
  p.addMesh(MAT.brass_aged, uvSphere(0.003, 0.003, 0.0012, 12, 10), C.brass, 0, -0.0165, 0);
  p.scaleShift(1.85);
  return p;
}

function buildRoomCellar() {
  const p = new PartBuilder('room_cellar');
  // Stone Arch Pilasters against back wall + 3 Hooped Oak Wine Casks + Iron-Banded Trunk + Slatted Crate
  for (const sx of [-1, 1]) {
    p.addMesh(MAT.stone_slate, bevelBox(0.01, 0.038, 0.009, 0.0008), C.stone, sx * 0.054, 0, -0.056);
  }
  const barrel = lathe([
    [0, -0.011], [0.0075, -0.011], [0.0098, -0.005], [0.0104, 0], [0.0098, 0.005], [0.0075, 0.011], [0, 0.011],
  ], 16, 46);
  const hoop = lathe([[0.0096, -0.001], [0.0106, -0.001], [0.0106, 0.001], [0.0096, 0.001]], 16, 42);
  for (const [bx, by, bz, yaw] of [[-0.038, 0.012, -0.044, 0.08], [-0.012, 0.012, -0.046, -0.05], [-0.025, 0.029, -0.045, 0.02]]) {
    if (by < 0.015) p.addMesh(MAT.wood_dark, bevelBox(0.018, 0.004, 0.018, 0.0005), C.walnutDark, bx, 0, bz, 0, yaw, 0);
    p.addMesh(MAT.wood_dark, barrel, C.oak, bx, by, bz, Math.PI / 2, yaw, 0);
    for (const hz of [-0.006, 0.006]) p.addMesh(MAT.iron_cast, hoop, C.iron, bx + Math.sin(yaw) * hz, by, bz + Math.cos(yaw) * hz, Math.PI / 2, yaw, 0);
    p.addMesh(MAT.brass_aged, cylY(0.0011, 0.0008, 0.004, 8), C.brass, bx, by - 0.002, bz + 0.012, Math.PI / 2, 0, 0);
  }
  // Iron-strapped oak steamer trunk + slatted crate + cellar lantern (back-right)
  p.addMesh(MAT.wood_dark, bevelBox(0.024, 0.013, 0.015, 0.0008), C.mahogany, 0.018, 0, -0.048);
  for (const ix of [-0.007, 0.007]) p.addMesh(MAT.iron_cast, bevelBox(0.0018, 0.0135, 0.016, 0.0003), C.iron, 0.018 + ix, 0, -0.048);
  p.addMesh(MAT.brass_aged, bevelBox(0.003, 0.003, 0.0012, 0.0002), C.brass, 0.018, 0.007, -0.0402);
  p.addMesh(MAT.wood_dark, bevelBox(0.02, 0.016, 0.018, 0.0006), C.pine, 0.044, 0, -0.04, 0, -0.22, 0);
  p.addMesh(MAT.iron_cast, lathe([[0, 0], [0.0038, 0], [0.0032, 0.008], [0.0045, 0.009], [0, 0.012]], 10), C.iron, 0.044, 0.016, -0.04);
  p.scaleShift(1.85);
  bakePartAO(p, 0.044, 0, 0.58);
  return p;
}

// ------------------------------------------------------------------ 7. Floating 3D Spirit Clue Objects (1.5 m Ring)
function buildClueShard() {
  const p = new PartBuilder('clue_shard');
  const poly = [
    [-0.15, -0.17], [0.06, -0.19], [0.18, -0.09], [0.16, 0.11], [0.03, 0.19], [-0.14, 0.15], [-0.19, -0.01],
  ];
  const backing = extrude2D(poly, 0.014, 0.003);
  p.addMesh(MAT.wood_dark, backing, C.ebony, 0, 0, -0.008);
  const frameOuter = poly.map(([x, y]) => [x * 1.05, y * 1.05]);
  p.addMesh(MAT.silver_tarnished, extrude2D(frameOuter, 0.01, 0.0025), C.steel, 0, 0, -0.009);
  p.addMesh(MAT.glass_spectral, extrude2D(poly.map(([x, y]) => [x * 0.94, y * 0.94]), 0.006, 0.0015), C.mirror, 0, 0, -0.002, 0, 0, 0, 1, 1, 1, 0.72);
  p.addMesh(MAT.brass_aged, tube([
    [-0.02, 0.17, -0.006, 0.005], [0, 0.23, -0.006, 0.005], [0.02, 0.17, -0.006, 0.005],
  ], 8), C.brassDark);
  bakePartAO(p, 0.08, null, 0.42);
  return p;
}

function buildCluePlate() {
  const p = new PartBuilder('clue_plate');
  const W = 0.64, H = 0.17;
  p.addMesh(MAT.iron_cast, bevelBox(W + 0.03, H + 0.03, 0.016, 0.004), C.ironRust, 0, -(H + 0.03) / 2, -0.012);
  p.addMesh(MAT.iron_cast, bevelBox(W, H, 0.012, 0.003), C.ink, 0, -H / 2, -0.005);
  for (const sy of [-1, 1]) p.addMesh(MAT.brass_aged, bevelBox(W - 0.02, 0.008, 0.008, 0.002), C.brassDark, 0, sy * (H * 0.44), -0.001);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    p.addMesh(MAT.brass_aged, uvSphere(0.011, 0.011, 0.008, 12, 8), C.brassDark, sx * (W * 0.47), sy * (H * 0.38), 0.002);
  }
  bakePartAO(p, 0.08, null, 0.42);
  return p;
}

function buildClueSlip() {
  const p = new PartBuilder('clue_slip');
  const W = 0.62, H = 0.165;
  const sheet = surfaceSheet(16, 6, false, (u, v) => ({
    x: (u - 0.5) * W,
    y: (0.5 - v) * H,
    z: -0.006 - Math.sin(u * Math.PI * 2) * 0.008 - Math.pow(Math.max(0, u - 0.78) * 4, 2) * 0.018,
  }));
  p.addMesh(MAT.bone_wax, sheet, C.ebony);
  p.addMesh(MAT.fabric_velvet, cylY(0.022, 0.022, 0.006, 14), C.alarm, -W * 0.42, -H * 0.25, -0.002, Math.PI / 2, 0, 0);
  p.addMesh(MAT.brass_aged, lathe([[0, 0], [0.028, 0], [0.02, 0.012], [0.006, 0.025], [0, 0.025]], 16), C.brassDark, 0, 0.055, -0.035, Math.PI / 2, 0, 0);
  p.addMesh(MAT.silver_tarnished, cylY(0.0035, 0.0006, 0.075, 10), C.silver, 0, 0.055, -0.02, Math.PI / 2, 0, 0);
  bakePartAO(p, 0.08, null, 0.4);
  return p;
}

function buildClueCalendar() {
  const p = new PartBuilder('clue_calendar');
  const W = 0.33, H = 0.41;
  p.addMesh(MAT.wood_dark, bevelBox(W, H, 0.018, 0.005), C.walnutDark, 0, -H / 2, -0.016);
  p.addMesh(MAT.brass_aged, bevelBox(W + 0.012, 0.016, 0.022, 0.004), C.brassDark, 0, H * 0.48, -0.014);
  p.addMesh(MAT.brass_aged, bevelBox(W - 0.03, 0.028, 0.012, 0.003), C.brassDark, 0, H * 0.41, -0.006);
  for (const sx of [-1, 1]) {
    const ring = tube(Array.from({ length: 13 }, (_, i) => {
      const a = (i / 12) * Math.PI * 1.75;
      return [sx * 0.085, H * 0.41 + Math.sin(a) * 0.022, 0.002 + Math.cos(a) * 0.018, 0.004];
    }), 8);
    p.addMesh(MAT.brass_aged, ring, C.brass);
  }
  bakePartAO(p, 0.08, null, 0.44);
  return p;
}

// ------------------------------------------------------------------ glTF 2.0 Binary (.glb) Serializer
function writeGlb(parts, filePath) {
  const bufferViews = [], accessors = [], meshes = [], nodes = [];
  const binChunks = [];
  let byteOffset = 0;

  const appendAligned = (typedArr) => {
    const u8 = new Uint8Array(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
    const pad = (4 - (u8.byteLength % 4)) % 4;
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: u8.byteLength });
    binChunks.push(u8);
    if (pad) binChunks.push(new Uint8Array(pad));
    byteOffset += u8.byteLength + pad;
    return bvIdx;
  };

  const gltfMaterials = MATERIALS.map((m) => ({
    name: m.name,
    doubleSided: !!m.doubleSided,
    ...(m.alphaMode ? { alphaMode: m.alphaMode } : {}),
    ...(m.emissive ? { emissiveFactor: m.emissive } : {}),
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: m.metalness, roughnessFactor: m.roughness },
  }));

  let totalVerts = 0, totalTris = 0;
  for (const part of parts) {
    const primitives = [];
    for (const [matIdx, b] of part.buckets.entries()) {
      if (!b.idx.length) continue;
      const nVerts = b.pos.length / 3;
      totalVerts += nVerts;
      totalTris += b.idx.length / 3;

      const posArr = new Float32Array(b.pos);
      const normArr = new Float32Array(b.norm);
      // Store linear RGBA in UNSIGNED_SHORT normalized (5123, 8 bytes/vert) for zero dark-wood banding
      const colArr = new Uint16Array(nVerts * 4);
      for (let i = 0; i < colArr.length; i++) colArr[i] = Math.round(Math.min(1, Math.max(0, b.col[i])) * 65535);
      const useU32 = nVerts > 65535;
      const idxArr = useU32 ? new Uint32Array(b.idx) : new Uint16Array(b.idx);

      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < nVerts; i++) {
        const x = posArr[3 * i], y = posArr[3 * i + 1], z = posArr[3 * i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }

      const posAcc = accessors.length;
      accessors.push({ bufferView: appendAligned(posArr), componentType: 5126, count: nVerts, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
      const normAcc = accessors.length;
      accessors.push({ bufferView: appendAligned(normArr), componentType: 5126, count: nVerts, type: 'VEC3' });
      const colAcc = accessors.length;
      accessors.push({ bufferView: appendAligned(colArr), componentType: 5123, normalized: true, count: nVerts, type: 'VEC4' });
      const idxAcc = accessors.length;
      accessors.push({ bufferView: appendAligned(idxArr), componentType: useU32 ? 5125 : 5123, count: idxArr.length, type: 'SCALAR' });

      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: normAcc, COLOR_0: colAcc },
        indices: idxAcc,
        material: matIdx,
      });
    }
    const meshIdx = meshes.length;
    meshes.push({ name: part.name, primitives });
    nodes.push({ name: part.name, mesh: meshIdx });
  }

  const gltf = {
    asset: { version: '2.0', generator: 'Hauntology Spirit Table 3D Asset Builder' },
    scene: 0,
    scenes: [{ name: 'SpiritTableKit', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: gltfMaterials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLen = jsonBytes.length + jsonPad;
  const totalLen = 12 + 8 + jsonChunkLen + 8 + byteOffset;

  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonChunkLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBytes.copy(out, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;

  const binHead = 20 + jsonChunkLen;
  out.writeUInt32LE(byteOffset, binHead);
  out.writeUInt32LE(0x004e4942, binHead + 4); // 'BIN\0'
  let cur = binHead + 8;
  for (const chunk of binChunks) { out.set(chunk, cur); cur += chunk.byteLength; }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out);
  return { bytes: out.length, meshes: meshes.length, totalVerts, totalTris };
}

// ------------------------------------------------------------------ Build all 24 assets!
const parts = [
  buildDollhouse(),
  ...buildAllRelics(),
  buildWhisperShroud(),
  buildColdSpotFrost(),
  buildSuspectPlinth(),
  buildPawnLiving(),
  buildPawnPoltergeist(),
  buildPawnTurnRing(),
  buildMarkHatpin(),
  buildInspectedLens(),
  buildRoomLibrary(),
  buildRoomStudy(),
  buildRoomNursery(),
  buildNurseryHorse(),
  buildRoomKitchen(),
  buildRoomHall(),
  buildHallPendulum(),
  buildRoomCellar(),
  buildClueShard(),
  buildCluePlate(),
  buildClueSlip(),
  buildClueCalendar(),
];

const stats = writeGlb(parts, outFile);
console.log(`Built ${path.relative(root, outFile)}: ${stats.meshes} meshes, ${stats.totalVerts} verts, ${stats.totalTris} tris, ${(stats.bytes / 1024).toFixed(1)} kB`);
