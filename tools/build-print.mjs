#!/usr/bin/env node
// Builds and validates the Hauntology 3D print kit & tabletop prop assets
// (party-mode Requirement 8.1 to 8.5 and tools/prop-mockups/3D_BRIEF.md).
//
// Usage:
//   node tools/build-print.mjs           # generates QR plates, Suspect standees, compiles print/scad/*.scad, checks all STLs
//   node tools/build-print.mjs --check   # validates every STL (watertight, manifold, positive volume, <= 180 mm bed)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const scadDir = path.join(root, "print", "scad");
const stlDir = path.join(root, "print", "stl");
const distDir = path.join(root, "dist", "print");
const checkOnly = process.argv.includes("--check");

const RELIC_QR_ROWS = {
  r1: [
    "111111100010001111111",
    "100000101000001000001",
    "101110100010001011101",
    "101110101100101011101",
    "101110101001101011101",
    "100000100111001000001",
    "111111101010101111111",
    "000000001011000000000",
    "010111101010111011010",
    "001110001111001011110",
    "010110111101011010011",
    "101001010100000001100",
    "111010101001101000010",
    "000000001011000000010",
    "111111100100011110000",
    "100000101101110011111",
    "101110101011101100011",
    "101110101101100011100",
    "101110100010001111011",
    "100000101000011100111",
    "111111100001000111000",
  ],
  r2: [
    "111111101011001111111",
    "100000100010101000001",
    "101110100011001011101",
    "101110100100101011101",
    "101110101011101011101",
    "100000101001001000001",
    "111111101010101111111",
    "000000000011000000000",
    "011111110110000110001",
    "100011011001000101111",
    "110000100101010011010",
    "000100010000100110100",
    "011010110110110011001",
    "000000001100111100001",
    "111111101010001100010",
    "100000101111011101110",
    "101110101110000101010",
    "101110101110100100100",
    "101110101011010100000",
    "100000101100000110100",
    "111111100111010101010",
  ],
  r3: [
    "111111100100001111111",
    "100000101100001000001",
    "101110100011001011101",
    "101110101110101011101",
    "101110101110101011101",
    "100000100000101000001",
    "111111101010101111111",
    "000000001001000000000",
    "010111101000111011010",
    "011100011110101011110",
    "110000111101011010011",
    "101101001011000001100",
    "010000110010001000010",
    "000000001101100000010",
    "111111100110011110000",
    "100000101001110011111",
    "101110101000001100011",
    "101110101111100011100",
    "101110100100001111011",
    "100000101100011110111",
    "111111100101000111000",
  ],
  r4: [
    "111111100111001111111",
    "100000101101001000001",
    "101110101110001011101",
    "101110100010101011101",
    "101110100111101011101",
    "100000100010101000001",
    "111111101010101111111",
    "000000000111100000000",
    "011101100110100000110",
    "110000010001000101111",
    "001010110100011110111",
    "001110000110110000010",
    "001101110101110011001",
    "000000001000110001100",
    "111111100010011010100",
    "100000101010011101110",
    "101110100100101000111",
    "101110101110010010010",
    "101110101011010100000",
    "100000101001101001001",
    "111111100011100111100",
  ],
  r5: [
    "111111100011001111111",
    "100000101111101000001",
    "101110101100001011101",
    "101110100110101011101",
    "101110100011101011101",
    "100000100100001000001",
    "111111101010101111111",
    "000000000001100000000",
    "011101100010000000110",
    "000001011000100101111",
    "000011100101011110111",
    "100000011010010000010",
    "011100101010010011001",
    "000000001101110001100",
    "111111100100011010100",
    "100000101010111101110",
    "101110100011101000111",
    "101110101000010010010",
    "101110101111010100000",
    "100000101101101101001",
    "111111100011100111100",
  ],
  r6: [
    "111111100101001111111",
    "100000100000101000001",
    "101110101010001011101",
    "101110100011001011101",
    "101110101001001011101",
    "100000101111101000001",
    "111111101010101111111",
    "000000000011100000000",
    "010010101110010110100",
    "111110011100111001100",
    "100010111010010000110",
    "011111001100100101000",
    "111011110010001111010",
    "000000001111100000010",
    "111111100101001111110",
    "100000100101111110010",
    "101110101110111001001",
    "101110100110111000111",
    "101110100110110111100",
    "100000101011100101000",
    "111111100101001101001",
  ],
};

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

function buildQrPlateStl(rows, headerText) {
  const nRows = rows.length;
  const quiet = 2;
  const total = nRows + 2 * quiet;
  const moduleMm = 1.44; // 25 * 1.44 = 36.0 mm (<= 40 mm plate, >= 1.2 mm module)
  const baseMm = 3.0;
  const reliefMm = 1.0;
  const zTop = snap(baseMm + reliefMm);
  const inset = 0.02;

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
  const xs = Array.from({ length: total + 1 }, (_, i) => snap(i * moduleMm));
  const pMax = xs[total];

  for (let gy = 0; gy < total; gy++) {
    for (let gx = 0; gx < total; gx++) {
      addQuad(vIdx(xs[gx], xs[gy], 0), vIdx(xs[gx], xs[gy + 1], 0), vIdx(xs[gx + 1], xs[gy + 1], 0), vIdx(xs[gx + 1], xs[gy], 0));
    }
  }
  for (let i = 0; i < total; i++) {
    const u0 = xs[i], u1 = xs[i + 1];
    addQuad(vIdx(u0, 0, 0), vIdx(u1, 0, 0), vIdx(u1, 0, baseMm), vIdx(u0, 0, baseMm));
    addQuad(vIdx(u1, pMax, 0), vIdx(u0, pMax, 0), vIdx(u0, pMax, baseMm), vIdx(u1, pMax, baseMm));
    addQuad(vIdx(0, u1, 0), vIdx(0, u0, 0), vIdx(0, u0, baseMm), vIdx(0, u1, baseMm));
    addQuad(vIdx(pMax, u0, 0), vIdx(pMax, u1, 0), vIdx(pMax, u1, baseMm), vIdx(pMax, u0, baseMm));
  }
  for (let gy = 0; gy < total; gy++) {
    const y0 = xs[gy], y1 = xs[gy + 1];
    const mr = total - 1 - gy - quiet;
    for (let gx = 0; gx < total; gx++) {
      const x0 = xs[gx], x1 = xs[gx + 1];
      const mc = gx - quiet;
      const dark = mr >= 0 && mr < nRows && mc >= 0 && mc < nRows && rows[mr][mc] === "1";
      const b00 = vIdx(x0, y0, baseMm), b10 = vIdx(x1, y0, baseMm), b11 = vIdx(x1, y1, baseMm), b01 = vIdx(x0, y1, baseMm);
      if (!dark) {
        addQuad(b00, b10, b11, b01);
      } else {
        const t00 = vIdx(x0 + inset, y0 + inset, zTop), t10 = vIdx(x1 - inset, y0 + inset, zTop);
        const t11 = vIdx(x1 - inset, y1 - inset, zTop), t01 = vIdx(x0 + inset, y1 - inset, zTop);
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
  const halfEdges = new Map();
  let signedVol6 = 0;
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
    const v0 = verts[i0], v1 = verts[i1], v2 = verts[i2];
    signedVol6 +=
      v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) -
      v0[1] * (v1[0] * v2[2] - v1[2] * v2[0]) +
      v0[2] * (v1[0] * v2[1] - v1[1] * v2[0]);
  }

  const errors = [];
  if (degenerate > 0) errors.push(`${degenerate} degenerate triangle(s)`);
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
  };
}

fs.mkdirSync(stlDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// 1. Always ensure the 6 Relic Token QR relief plates and 6 Preset Suspect Standees exist
for (const [rid, rows] of Object.entries(RELIC_QR_ROWS)) {
  const outName = `relic-token-${rid}.stl`;
  const stlPath = path.join(stlDir, outName);
  const distPath = path.join(distDir, outName);
  if (!checkOnly || !fs.existsSync(stlPath)) {
    const buf = buildQrPlateStl(rows, `Hauntology Relic Token hw:${rid}`);
    fs.writeFileSync(stlPath, buf);
    fs.writeFileSync(distPath, buf);
  } else if (!fs.existsSync(distPath)) {
    fs.copyFileSync(stlPath, distPath);
  }
}

for (const [sid, rows] of Object.entries(SUSPECT_SILHOUETTES)) {
  const outName = `${sid}.stl`;
  const stlPath = path.join(stlDir, outName);
  const distPath = path.join(distDir, outName);
  if (!checkOnly || !fs.existsSync(stlPath)) {
    const buf = buildStandeeStl(rows, `Hauntology Suspect Standee ${sid}`);
    fs.writeFileSync(stlPath, buf);
    fs.writeFileSync(distPath, buf);
  } else if (!fs.existsSync(distPath)) {
    fs.copyFileSync(stlPath, distPath);
  }
}

// 2. Compile print/scad/*.scad when OpenSCAD is present
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

// 3. Validate every STL in print/stl/
const files = fs.readdirSync(stlDir).filter((f) => f.endsWith(".stl")).sort();
let failed = 0;
for (const f of files) {
  const full = path.join(stlDir, f);
  const maxBed = f.startsWith("relic-token-r") ? 40 : 180;
  const res = checkBinaryStl(full, maxBed);
  if (!res.ok) {
    failed++;
    console.error(`FAIL ${f}: ${res.errors.join("; ")}`);
  } else if (!process.argv.includes("--quiet")) {
    const [sx, sy, sz] = res.sizeMm;
    console.log(
      `ok   ${f.padEnd(34)} ${sx.toFixed(1).padStart(5)} x ${sy.toFixed(1).padStart(5)} x ${sz.toFixed(1).padStart(5)} mm  (${String(res.triangleCount).padStart(5)} tris, ${(res.volumeMm3 / 1000).toFixed(2).padStart(6)} cm³)`,
    );
  }
}

if (failed > 0) {
  console.error(`${failed} of ${files.length} STL file(s) failed validation.`);
  process.exit(1);
}
console.log(`build-print: ${files.length} STL file(s) verified OK (watertight, manifold, positive volume, <= 180 mm bed).`);
