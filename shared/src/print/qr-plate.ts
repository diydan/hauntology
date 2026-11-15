import type { RELICS } from "../party/pool";
import { snapMicron, type Face, type Mesh, type Vec3 } from "./mesh";

type RelicId = (typeof RELICS)[number]["id"];

/**
 * Watertight heightfield QR plate generator and top-surface rasteriser (party-mode 8.2).
 * Also holds the exact Version 1-Q (21 x 21) QR matrices for `hw:r1` through `hw:r6`.
 */

export const MIN_MODULE_MM = 1.2;
export const MAX_PLATE_MM = 40.0;

const RELIC_QR_ROWS: Readonly<Record<RelicId, readonly string[]>> = {
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

/** Return the 21 x 21 Version 1-Q QR boolean matrix for `hw:<relicId>`. */
export function qrMatrixForRelic(relicId: RelicId): boolean[][] {
  const rows = RELIC_QR_ROWS[relicId];
  if (!rows) throw new Error(`Unknown relic id: ${String(relicId)}`);
  return rows.map((r) => [...r].map((ch) => ch === "1"));
}

export type QrPlateOptions = Readonly<{
  /** Size of one QR module in mm (must be >= 1.2 mm; default 1.44 mm). */
  moduleMm?: number;
  /** Thickness of the solid base plate in mm (default 3.0 mm). */
  baseMm?: number;
  /** Raised height of dark modules above the base plate in mm (default 1.0 mm). */
  reliefMm?: number;
  /** Quiet-zone border in modules around the matrix (default 2). */
  quietModules?: number;
}>;

/**
 * Build a watertight 2-manifold heightfield solid for a QR boolean matrix.
 * Enforces `moduleMm >= 1.2` and overall plate width `<= 40 mm` (party-mode Requirement 8.2).
 */
export function qrPlateMesh(
  matrix: readonly (readonly boolean[])[],
  opts: QrPlateOptions = {},
): Mesh {
  const nRows = matrix.length;
  if (nRows === 0) throw new Error("qrPlateMesh requires a non-empty matrix");
  const nCols = matrix[0]?.length ?? 0;
  if (nCols !== nRows || matrix.some((row) => row.length !== nCols)) {
    throw new Error("qrPlateMesh requires a square matrix");
  }

  const moduleMm = snapMicron(opts.moduleMm ?? 1.44);
  if (!(moduleMm >= MIN_MODULE_MM - 1e-6)) {
    throw new Error(`qrPlateMesh requires moduleMm >= ${MIN_MODULE_MM}, got ${moduleMm}`);
  }
  const baseMm = snapMicron(opts.baseMm ?? 3.0);
  const reliefMm = snapMicron(opts.reliefMm ?? 1.0);
  if (!(baseMm > 0) || !(reliefMm > 0)) {
    throw new Error("qrPlateMesh requires positive baseMm and reliefMm");
  }

  const quietModules = Math.max(0, Math.trunc(opts.quietModules ?? 2));
  const totalModules = nRows + 2 * quietModules;
  const plateMm = snapMicron(totalModules * moduleMm);
  if (plateMm > MAX_PLATE_MM + 1e-6) {
    throw new Error(`qrPlateMesh plate size ${plateMm.toFixed(2)} mm exceeds ${MAX_PLATE_MM} mm limit`);
  }

  const vertMap = new Map<string, number>();
  const vertices: Vec3[] = [];
  const faces: Face[] = [];

  const vIdx = (x: number, y: number, z: number): number => {
    const sx = snapMicron(x);
    const sy = snapMicron(y);
    const sz = snapMicron(z);
    const key = `${Math.round(sx * 1000)},${Math.round(sy * 1000)},${Math.round(sz * 1000)}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = vertices.length;
      vertMap.set(key, idx);
      vertices.push([sx, sy, sz]);
    }
    return idx;
  };

  const addQuad = (a: number, b: number, c: number, d: number): void => {
    faces.push([a, b, c], [a, c, d]);
  };

  const xs: number[] = [];
  for (let i = 0; i <= totalModules; i++) {
    xs.push(snapMicron(i * moduleMm));
  }

  // 1. Bottom grid at z = 0 (outward normal -Z)
  for (let gy = 0; gy < totalModules; gy++) {
    const y0 = xs[gy] as number;
    const y1 = xs[gy + 1] as number;
    for (let gx = 0; gx < totalModules; gx++) {
      const x0 = xs[gx] as number;
      const x1 = xs[gx + 1] as number;
      addQuad(vIdx(x0, y0, 0), vIdx(x0, y1, 0), vIdx(x1, y1, 0), vIdx(x1, y0, 0));
    }
  }

  // 2. Outer perimeter walls from z = 0 to z = baseMm
  const pMax = xs[totalModules] as number;
  for (let i = 0; i < totalModules; i++) {
    const u0 = xs[i] as number;
    const u1 = xs[i + 1] as number;
    // South wall (y = 0, normal -Y)
    addQuad(vIdx(u0, 0, 0), vIdx(u1, 0, 0), vIdx(u1, 0, baseMm), vIdx(u0, 0, baseMm));
    // North wall (y = pMax, normal +Y)
    addQuad(vIdx(u1, pMax, 0), vIdx(u0, pMax, 0), vIdx(u0, pMax, baseMm), vIdx(u1, pMax, baseMm));
    // West wall (x = 0, normal -X)
    addQuad(vIdx(0, u1, 0), vIdx(0, u0, 0), vIdx(0, u0, baseMm), vIdx(0, u1, baseMm));
    // East wall (x = pMax, normal +X)
    addQuad(vIdx(pMax, u0, 0), vIdx(pMax, u1, 0), vIdx(pMax, u1, baseMm), vIdx(pMax, u0, baseMm));
  }

  // 3. Top surface & dark-module relief frustums (20 µm draft prevents diagonal pinch non-manifold edges)
  const inset = 0.02;
  const zTop = snapMicron(baseMm + reliefMm);

  for (let gy = 0; gy < totalModules; gy++) {
    const y0 = xs[gy] as number;
    const y1 = xs[gy + 1] as number;
    // Map gy = 0 (south) -> matrix row (nRows - 1); gy = totalModules - 1 (north) -> matrix row 0
    const mr = totalModules - 1 - gy - quietModules;
    for (let gx = 0; gx < totalModules; gx++) {
      const x0 = xs[gx] as number;
      const x1 = xs[gx + 1] as number;
      const mc = gx - quietModules;
      const dark =
        mr >= 0 && mr < nRows && mc >= 0 && mc < nCols && Boolean(matrix[mr]?.[mc]);

      const b00 = vIdx(x0, y0, baseMm);
      const b10 = vIdx(x1, y0, baseMm);
      const b11 = vIdx(x1, y1, baseMm);
      const b01 = vIdx(x0, y1, baseMm);

      if (!dark) {
        addQuad(b00, b10, b11, b01);
      } else {
        const t00 = vIdx(x0 + inset, y0 + inset, zTop);
        const t10 = vIdx(x1 - inset, y0 + inset, zTop);
        const t11 = vIdx(x1 - inset, y1 - inset, zTop);
        const t01 = vIdx(x0 + inset, y1 - inset, zTop);
        // Four sloped sides + top cap
        addQuad(b00, b10, t10, t00);
        addQuad(b10, b11, t11, t10);
        addQuad(b11, b01, t01, t11);
        addQuad(b01, b00, t00, t01);
        addQuad(t00, t10, t11, t01);
      }
    }
  }

  return { vertices, faces };
}

export type RasterTopOptions = Readonly<{
  quietModules?: number;
  baseMm?: number;
  reliefMm?: number;
}>;

/**
 * Rasterise the top relief of a `qrPlateMesh` back into a `rows x rows` boolean matrix.
 */
export function rasterTop(
  mesh: Mesh,
  rows: number,
  opts: RasterTopOptions = {},
): boolean[][] {
  if (rows <= 0) return [];
  const quietModules = Math.max(0, Math.trunc(opts.quietModules ?? 2));
  const totalModules = rows + 2 * quietModules;
  const baseMm = opts.baseMm ?? 3.0;
  const reliefMm = opts.reliefMm ?? 1.0;
  const zThreshold = baseMm + reliefMm * 0.5;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of mesh.vertices) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const moduleX = (maxX - minX) / totalModules;
  const moduleY = (maxY - minY) / totalModules;

  const grid: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: rows }, () => false),
  );

  // Check raised top faces whose vertices lie above zThreshold
  for (const [ia, ib, ic] of mesh.faces) {
    const va = mesh.vertices[ia];
    const vb = mesh.vertices[ib];
    const vc = mesh.vertices[ic];
    if (!va || !vb || !vc) continue;
    if (va[2] > zThreshold && vb[2] > zThreshold && vc[2] > zThreshold) {
      const cx = (va[0] + vb[0] + vc[0]) / 3;
      const cy = (va[1] + vb[1] + vc[1]) / 3;
      const gx = Math.floor((cx - minX) / moduleX);
      const gy = Math.floor((cy - minY) / moduleY);
      const mr = totalModules - 1 - gy - quietModules;
      const mc = gx - quietModules;
      if (mr >= 0 && mr < rows && mc >= 0 && mc < rows) {
        const row = grid[mr];
        if (row) row[mc] = true;
      }
    }
  }
  return grid;
}
