#!/usr/bin/env node
// Builds and validates the Hauntology 3D print kit & tabletop prop assets
// (party-mode Requirement 8.1 to 8.5 and tools/prop-mockups/3D_BRIEF.md).
//
// Usage:
//   node tools/build-print.mjs           # generates the Suspect standees, compiles print/scad/*.scad, checks all STLs
//   node tools/build-print.mjs --check   # validates every STL (watertight, manifold, positive volume, piece count, bed contact, wide flat roofs)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findOverhangs, OVERHANG_DEG, BRIDGE_MAX_MM } from "./lib/stl-overhang.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const scadDir = path.join(root, "print", "scad");
const stlDir = path.join(root, "print", "stl");
const distDir = path.join(root, "dist", "print");
const checkOnly = process.argv.includes("--check");

const snap = (v) => Math.round(v * 1000) / 1000;

function writeMeshStl(vertices, faces, headerText = "Hauntology Print Kit STL") {
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.write(headerText.slice(0, 79), 0, "ascii");
  buf.writeUInt32LE(faces.length, 80);
  for (let i = 0; i < faces.length; i++) {
    const [a, b, c] = faces[i];
    const v0 = vertices[a], v1 = vertices[b], v2 = vertices[c];
    const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
    const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const off = 84 + i * 50;
    buf.writeFloatLE(nx / len, off + 0);
    buf.writeFloatLE(ny / len, off + 4);
    buf.writeFloatLE(nz / len, off + 8);
    buf.writeFloatLE(v0[0], off + 12);
    buf.writeFloatLE(v0[1], off + 16);
    buf.writeFloatLE(v0[2], off + 20);
    buf.writeFloatLE(v1[0], off + 24);
    buf.writeFloatLE(v1[1], off + 28);
    buf.writeFloatLE(v1[2], off + 32);
    buf.writeFloatLE(v2[0], off + 36);
    buf.writeFloatLE(v2[1], off + 40);
    buf.writeFloatLE(v2[2], off + 44);
    buf.writeUInt16LE(0, off + 48);
  }
  return buf;
}

const SUSPECT_SILHOUETTES = {
  "standee-s1-percy": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011100000000",
    "00000001111110000000",
    "00000001111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111100000000",
    "00000001111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000110100000000",
    "00000000000000000000",
    "00000000000000000000",
  ],
  "standee-s2-thorne": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000011100000000",
    "00000000111100000000",
    "00000000011100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000001111110000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111100000",
    "00000011111111100000",
    "00000011111111000000",
    "00000011111111000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111110000000",
    "00000000111110000000",
    "00000000100110000000",
    "00000000100110000000",
    "00000000100100000000",
    "00000000100110000000",
    "00000001100010000000",
    "00000000000000000000",
  ],
  "standee-s3-pike": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000111100000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000000111110000000",
    "00000000111110000000",
    "00000000111110000000",
    "00000000111100000000",
    "00000000011100000000",
    "00000000111100000000",
    "00000000111100000000",
    "00000000100100000000",
    "00000000000000000000",
    "00000000000000000000",
  ],
  "standee-s4-cora": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111111000000",
    "00000001111110000000",
    "00000001111000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
  ],
  "standee-s5-vane": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000001000000000",
    "00000000011100000000",
    "00000000011100000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111111000000",
    "00000011111111000000",
    "00000110111111000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000011111111000000",
    "00000011111111000000",
    "00000011111111100000",
    "00000011111111100000",
    "00000011111111100000",
    "00000011111111100000",
    "00000011111111100000",
    "00000000110110000000",
    "00000010010000000000",
    "00000000000000000000",
    "00000000000000000000",
  ],
  "standee-s6-dunmore": [
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000000000000000",
    "00000000011000000000",
    "00000000111100000000",
    "00000000011000000000",
    "00000000011000000000",
    "00000000111100000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111111000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000001111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000011111110000000",
    "00000001110110000000",
    "00000000100000000000",
    "00000000000000000000",
    "00000000000000000000",
  ],
};

function buildStandeeStl(rows, headerText) {
  const nRows = rows.length;
  const nCols = rows[0].length;
  const heightMm = 70.0;
  const thicknessMm = 3.0;
  const baseWidthMm = 40.0;
  const baseDepthMm = 15.0;
  const baseHeightMm = 4.0;
  const reliefMm = 0.6;
  const bladeHeightMm = heightMm - baseHeightMm;
  const cellW = baseWidthMm / nCols;
  const cellH = bladeHeightMm / nRows;
  const halfDepth = baseDepthMm / 2;
  const halfBlade = thicknessMm / 2;

  const vertMap = new Map();
  const vertices = [];
  const faces = [];
  const vIdx = (x, y, z) => {
    const sx = snap(x), sy = snap(y), sz = snap(z);
    const key = `${Math.round(sx * 1000)},${Math.round(sy * 1000)},${Math.round(sz * 1000)}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = vertices.length;
      vertMap.set(key, idx);
      vertices.push([sx, sy, sz]);
    }
    return idx;
  };
  const addQuad = (a, b, c, d) => { faces.push([a, b, c], [a, c, d]); };

  const xs = Array.from({ length: nCols + 1 }, (_, c) => snap(-baseWidthMm / 2 + c * cellW));
  const zs = Array.from({ length: nRows + 1 }, (_, r) => snap(baseHeightMm + r * cellH));
  const xMin = xs[0], xMax = xs[nCols], zTop = zs[nRows];
  const y0 = -halfDepth, y1 = -halfBlade, y2 = halfBlade, y3 = halfDepth;
  const yZones = [[y0, y1], [y1, y2], [y2, y3]];

  for (const [ya, yb] of yZones) {
    for (let c = 0; c < nCols; c++) {
      addQuad(vIdx(xs[c], ya, 0), vIdx(xs[c], yb, 0), vIdx(xs[c + 1], yb, 0), vIdx(xs[c + 1], ya, 0));
    }
  }
  for (let c = 0; c < nCols; c++) {
    addQuad(vIdx(xs[c], y0, 0), vIdx(xs[c + 1], y0, 0), vIdx(xs[c + 1], y0, baseHeightMm), vIdx(xs[c], y0, baseHeightMm));
    addQuad(vIdx(xs[c + 1], y3, 0), vIdx(xs[c], y3, 0), vIdx(xs[c], y3, baseHeightMm), vIdx(xs[c + 1], y3, baseHeightMm));
  }
  for (const [ya, yb] of yZones) {
    addQuad(vIdx(xMin, yb, 0), vIdx(xMin, ya, 0), vIdx(xMin, ya, baseHeightMm), vIdx(xMin, yb, baseHeightMm));
    addQuad(vIdx(xMax, ya, 0), vIdx(xMax, yb, 0), vIdx(xMax, yb, baseHeightMm), vIdx(xMax, ya, baseHeightMm));
  }
  for (let c = 0; c < nCols; c++) {
    addQuad(vIdx(xs[c], y0, baseHeightMm), vIdx(xs[c + 1], y0, baseHeightMm), vIdx(xs[c + 1], y1, baseHeightMm), vIdx(xs[c], y1, baseHeightMm));
    addQuad(vIdx(xs[c], y2, baseHeightMm), vIdx(xs[c + 1], y2, baseHeightMm), vIdx(xs[c + 1], y3, baseHeightMm), vIdx(xs[c], y3, baseHeightMm));
  }
  for (let r = 0; r < nRows; r++) {
    addQuad(vIdx(xMin, y2, zs[r]), vIdx(xMin, y1, zs[r]), vIdx(xMin, y1, zs[r + 1]), vIdx(xMin, y2, zs[r + 1]));
    addQuad(vIdx(xMax, y1, zs[r]), vIdx(xMax, y2, zs[r]), vIdx(xMax, y2, zs[r + 1]), vIdx(xMax, y1, zs[r + 1]));
  }
  for (let c = 0; c < nCols; c++) {
    addQuad(vIdx(xs[c], y1, zTop), vIdx(xs[c + 1], y1, zTop), vIdx(xs[c + 1], y2, zTop), vIdx(xs[c], y2, zTop));
  }
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      addQuad(vIdx(xs[c + 1], y2, zs[r]), vIdx(xs[c], y2, zs[r]), vIdx(xs[c], y2, zs[r + 1]), vIdx(xs[c + 1], y2, zs[r + 1]));
    }
  }
  const inset = 0.02;
  const yRelief = snap(y1 - reliefMm);
  for (let r = 0; r < nRows; r++) {
    const za = zs[r], zb = zs[r + 1];
    const mr = nRows - 1 - r;
    for (let c = 0; c < nCols; c++) {
      const xa = xs[c], xb = xs[c + 1];
      const active = rows[mr][c] === "1";
      const b00 = vIdx(xa, y1, za), b10 = vIdx(xb, y1, za), b11 = vIdx(xb, y1, zb), b01 = vIdx(xa, y1, zb);
      if (!active) {
        addQuad(b00, b10, b11, b01);
      } else {
        const t00 = vIdx(xa + inset, yRelief, za + inset), t10 = vIdx(xb - inset, yRelief, za + inset);
        const t11 = vIdx(xb - inset, yRelief, zb - inset), t01 = vIdx(xa + inset, yRelief, zb - inset);
        addQuad(b00, b10, t10, t00);
        addQuad(b10, b11, t11, t10);
        addQuad(b11, b01, t01, t11);
        addQuad(b01, b00, t00, t01);
        addQuad(t00, t10, t11, t01);
      }
    }
  }
  return writeMeshStl(vertices, faces, headerText);
}

// Clean sub-micron collapsed sliver triangles produced by floating-point CSG export
function normalizeBinaryStl(buf) {
  const n = buf.readUInt32LE(80);
  const keep = [];
  const k = (v) => Math.round(v * 1000);
  for (let i = 0; i < n; i++) {
    const off = 84 + i * 50;
    const x0 = buf.readFloatLE(off + 12), y0 = buf.readFloatLE(off + 16), z0 = buf.readFloatLE(off + 20);
    const x1 = buf.readFloatLE(off + 24), y1 = buf.readFloatLE(off + 28), z1 = buf.readFloatLE(off + 32);
    const x2 = buf.readFloatLE(off + 36), y2 = buf.readFloatLE(off + 40), z2 = buf.readFloatLE(off + 44);
    const k0 = `${k(x0)},${k(y0)},${k(z0)}`;
    const k1 = `${k(x1)},${k(y1)},${k(z1)}`;
    const k2 = `${k(x2)},${k(y2)},${k(z2)}`;
    if (k0 === k1 || k1 === k2 || k2 === k0) continue;
    const tri = Buffer.from(buf.subarray(off, off + 50));
    tri.writeFloatLE(k(x0) / 1000, 12); tri.writeFloatLE(k(y0) / 1000, 16); tri.writeFloatLE(k(z0) / 1000, 20);
    tri.writeFloatLE(k(x1) / 1000, 24); tri.writeFloatLE(k(y1) / 1000, 28); tri.writeFloatLE(k(z1) / 1000, 32);
    tri.writeFloatLE(k(x2) / 1000, 36); tri.writeFloatLE(k(y2) / 1000, 40); tri.writeFloatLE(k(z2) / 1000, 44);
    keep.push(tri);
  }
  const out = Buffer.alloc(84 + keep.length * 50);
  buf.copy(out, 0, 0, 80);
  out.writeUInt32LE(keep.length, 80);
  keep.forEach((t, i) => t.copy(out, 84 + i * 50));
  return out;
}

function findOpenscad() {
  for (const p of ["/opt/homebrew/bin/openscad", "/usr/local/bin/openscad", "openscad"]) {
    const r = spawnSync(p, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return p;
  }
  return null;
}

// Parts that cannot print without supports, and why. Every other part must pass the support-free check in lib/stl-overhang.mjs
// (no flat roof wider than BRIDGE_MAX_MM and nothing facing down steeper than OVERHANG_DEG), and the README may only say
// "Supports needed" for the parts listed here. An entry that stops being true fails the build, so this list cannot go stale.
const SUPPORTS_NEEDED = {};

function checkBinaryStl(filePath, bedMm = 180) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 84) return { ok: false, errors: ["STL shorter than 84 bytes"] };
  const triCount = buf.readUInt32LE(80);
  if (buf.length < 84 + triCount * 50) {
    return { ok: false, errors: [`Expected ${84 + triCount * 50} bytes for ${triCount} triangles, got ${buf.length}`] };
  }
  if (triCount === 0) return { ok: false, errors: ["Zero triangles"] };

  const vertMap = new Map();
  const verts = [];
  const adj = [];
  const halfEdges = new Map();
  let signedVol6 = 0;
  let bedAreaMm2 = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let degenerate = 0;

  const weld = (x, y, z) => {
    const kx = Math.round(x * 1000);
    const ky = Math.round(y * 1000);
    const kz = Math.round(z * 1000);
    const key = `${kx},${ky},${kz}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = verts.length;
      vertMap.set(key, idx);
      const vx = kx / 1000, vy = ky / 1000, vz = kz / 1000;
      verts.push([vx, vy, vz]);
      adj.push([]);
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    return idx;
  };

  const addHalfEdge = (u, v) => {
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = `${a}:${b}`;
    let entry = halfEdges.get(key);
    if (!entry) {
      entry = [0, 0];
      halfEdges.set(key, entry);
    }
    if (u < v) entry[0]++;
    else entry[1]++;
  };

  for (let i = 0; i < triCount; i++) {
    const off = 84 + i * 50;
    const x0 = buf.readFloatLE(off + 12), y0 = buf.readFloatLE(off + 16), z0 = buf.readFloatLE(off + 20);
    const x1 = buf.readFloatLE(off + 24), y1 = buf.readFloatLE(off + 28), z1 = buf.readFloatLE(off + 32);
    const x2 = buf.readFloatLE(off + 36), y2 = buf.readFloatLE(off + 40), z2 = buf.readFloatLE(off + 44);
    const i0 = weld(x0, y0, z0);
    const i1 = weld(x1, y1, z1);
    const i2 = weld(x2, y2, z2);
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      degenerate++;
      continue;
    }
    addHalfEdge(i0, i1);
    addHalfEdge(i1, i2);
    addHalfEdge(i2, i0);
    adj[i0].push(i1, i2);
    adj[i1].push(i0, i2);
    adj[i2].push(i0, i1);
    const v0 = verts[i0], v1 = verts[i1], v2 = verts[i2];
    signedVol6 +=
      v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) -
      v0[1] * (v1[0] * v2[2] - v1[2] * v2[0]) +
      v0[2] * (v1[0] * v2[1] - v1[1] * v2[0]);
  }

  for (let i = 0; i < triCount; i++) {
    const off = 84 + i * 50;
    const z0 = buf.readFloatLE(off + 20), z1 = buf.readFloatLE(off + 32), z2 = buf.readFloatLE(off + 44);
    if (Math.abs(z0 - minZ) < 0.05 && Math.abs(z1 - minZ) < 0.05 && Math.abs(z2 - minZ) < 0.05) {
      const x0 = buf.readFloatLE(off + 12), y0 = buf.readFloatLE(off + 16);
      const x1 = buf.readFloatLE(off + 24), y1 = buf.readFloatLE(off + 28);
      const x2 = buf.readFloatLE(off + 36), y2 = buf.readFloatLE(off + 40);
      bedAreaMm2 += 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0));
    }
  }

  const vis = new Uint8Array(verts.length);
  let components = 0;
  for (let i = 0; i < verts.length; i++) {
    if (vis[i]) continue;
    components++;
    const stack = [i];
    vis[i] = 1;
    while (stack.length > 0) {
      const u = stack.pop();
      for (const v of adj[u]) {
        if (!vis[v]) {
          vis[v] = 1;
          stack.push(v);
        }
      }
    }
  }

  const EXPECTED_COMPONENTS = {
    "prop-09-rail-and-pulley.stl": 3,
    "prop-12-bats-mobile.stl": 4,
    "prop-15-vault-clasp.stl": 3,
    "prop-20-plug-heads.stl": 10,
    "prop-20-terminal-blocks.stl": 6,
  };
  const baseName = path.basename(filePath);
  const expectedComps = EXPECTED_COMPONENTS[baseName] ?? 1;

  const errors = [];
  if (degenerate > 0) errors.push(`${degenerate} degenerate triangle(s)`);
  if (components !== expectedComps) {
    errors.push(`Expected ${expectedComps} connected component(s), got ${components} (disconnected/floating island check)`);
  }
  if (bedAreaMm2 < 100) {
    errors.push(`Insufficient flat bed contact area at minZ: ${bedAreaMm2.toFixed(1)} mm^2`);
  }
  const overhangs = findOverhangs(buf);
  const supportsNote = SUPPORTS_NEEDED[baseName];
  if (overhangs.length > 0 && supportsNote === undefined) {
    for (const o of overhangs) {
      errors.push(
        `needs supports: ${o.widthMm.toFixed(1)} mm wide, ${o.areaMm2.toFixed(0)} mm^2 roof facing down steeper than ${OVERHANG_DEG} deg at z = ${o.zMm.toFixed(1)} mm (x ${o.xMm.map((v) => v.toFixed(0)).join("..")}, y ${o.yMm.map((v) => v.toFixed(0)).join("..")}); slope it to 45 deg, narrow it to ${BRIDGE_MAX_MM} mm, or list the file in SUPPORTS_NEEDED`,
      );
    }
  }
  if (overhangs.length === 0 && supportsNote !== undefined) {
    errors.push("is listed in SUPPORTS_NEEDED but has no wide roof any more; remove the entry and the README note");
  }
  let unmatchedEdges = 0;
  for (const [f, b] of halfEdges.values()) {
    if (f !== b || f === 0) unmatchedEdges++;
  }
  if (unmatchedEdges > 0) errors.push(`${unmatchedEdges} non-manifold / open boundary edge(s)`);
  const volumeMm3 = signedVol6 / 6;
  if (!(volumeMm3 > 0)) errors.push(`Non-positive volume: ${volumeMm3.toFixed(3)} mm^3`);
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
  if (sx > bedMm + 1e-3 || sy > bedMm + 1e-3 || sz > bedMm + 1e-3) {
    errors.push(`Bounds ${sx.toFixed(1)} x ${sy.toFixed(1)} x ${sz.toFixed(1)} mm exceed ${bedMm} mm bed`);
  }
  return {
    ok: errors.length === 0,
    errors,
    volumeMm3,
    sizeMm: [sx, sy, sz],
    triangleCount: triCount,
    supportsNote,
  };
}

fs.mkdirSync(stlDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// 1. Compile print/scad/*.scad when OpenSCAD is present (covers all 44 STLs including the 6 Ghost Standees)
const openscad = findOpenscad();
if (openscad && fs.existsSync(scadDir)) {
  const scadFiles = fs.readdirSync(scadDir).filter((f) => f.endsWith(".scad") && !f.startsWith("_")).sort();
  for (const f of scadFiles) {
    const base = f.replace(/\.scad$/, "");
    const scadPath = path.join(scadDir, f);
    const stlPath = path.join(stlDir, `${base}.stl`);
    const distPath = path.join(distDir, `${base}.stl`);
    const needsBuild =
      !checkOnly ||
      !fs.existsSync(stlPath) ||
      fs.statSync(scadPath).mtimeMs > fs.statSync(stlPath).mtimeMs;
    if (needsBuild) {
      const r = spawnSync(openscad, ["--export-format", "binstl", "-o", stlPath, scadPath], { encoding: "utf8" });
      if (r.status !== 0) {
        console.error(`OpenSCAD failed on ${f}:\n${r.stderr}`);
        process.exit(1);
      }
      const cleaned = normalizeBinaryStl(fs.readFileSync(stlPath));
      fs.writeFileSync(stlPath, cleaned);
      fs.writeFileSync(distPath, cleaned);
    } else if (!fs.existsSync(distPath)) {
      fs.copyFileSync(stlPath, distPath);
    }
  }
}

// 2. Fallback: ensure the 6 Preset Suspect Standees exist even if OpenSCAD is absent
for (const [sid, rows] of Object.entries(SUSPECT_SILHOUETTES)) {
  const outName = `${sid}.stl`;
  const stlPath = path.join(stlDir, outName);
  const distPath = path.join(distDir, outName);
  if (!fs.existsSync(stlPath)) {
    const buf = buildStandeeStl(rows, `Hauntology Suspect Standee ${sid}`);
    fs.writeFileSync(stlPath, buf);
    fs.writeFileSync(distPath, buf);
  } else if (!fs.existsSync(distPath)) {
    fs.copyFileSync(stlPath, distPath);
  }
}

// 3. Validate every STL in print/stl/
const files = fs.readdirSync(stlDir).filter((f) => f.endsWith(".stl")).sort();
let failed = 0;
for (const f of files) {
  const full = path.join(stlDir, f);
  const res = checkBinaryStl(full, 180);
  if (!res.ok) {
    failed++;
    console.error(`FAIL ${f}: ${res.errors.join("; ")}`);
  } else if (!process.argv.includes("--quiet")) {
    const [sx, sy, sz] = res.sizeMm;
    console.log(
      `ok   ${f.padEnd(34)} ${sx.toFixed(1).padStart(5)} x ${sy.toFixed(1).padStart(5)} x ${sz.toFixed(1).padStart(5)} mm  (${String(res.triangleCount).padStart(5)} tris, ${(res.volumeMm3 / 1000).toFixed(2).padStart(6)} cm³)${res.supportsNote === undefined ? "" : "  SUPPORTS NEEDED"}`,
    );
  }
}

// 4. The README must say "Supports needed" for exactly the parts in SUPPORTS_NEEDED (it used to say "None" for every part)
const readmePath = path.join(root, "print", "README.md");
if (fs.existsSync(readmePath)) {
  const rows = fs.readFileSync(readmePath, "utf8").split("\n").filter((l) => l.startsWith("|"));
  for (const f of files) {
    const mine = rows.filter((l) => l.includes(`\`${f}\``));
    const says = mine.some((l) => /supports needed/i.test(l));
    if (f in SUPPORTS_NEEDED && !says) {
      failed++;
      console.error(`FAIL ${f}: README.md must say "Supports needed" in its table row (${SUPPORTS_NEEDED[f]})`);
    }
    if (!(f in SUPPORTS_NEEDED) && says) {
      failed++;
      console.error(`FAIL ${f}: README.md says "Supports needed" but the file passes the support-free check`);
    }
  }
}

if (failed > 0) {
  console.error(`${failed} of ${files.length} STL file(s) failed validation.`);
  process.exit(1);
}
console.log(`build-print: ${files.length} STL file(s) verified OK (watertight, manifold, positive volume, piece count, <= 180 mm bed, support-free apart from the listed parts).`);
