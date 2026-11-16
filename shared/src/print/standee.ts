import { snapMicron, type Face, type Mesh, type Vec3 } from "./mesh";

/**
 * Extruded Suspect standee generator from an alpha silhouette mask (party-mode 8.4).
 * Produces a watertight 2-manifold tabletop standee with a bevelled plinth base (`40 x 15 mm` default)
 * and a vertical silhouette blade (`3 mm` thick, `70 mm` tall default) with the alpha mask embossed on the front.
 */

export type StandeeOptions = Readonly<{
  /** Total standee height in mm including base (default 70 mm). */
  heightMm?: number;
  /** Blade thickness in mm (default 3 mm). */
  thicknessMm?: number;
  /** Base width in mm (default 40 mm). */
  baseWidthMm?: number;
  /** Base depth in mm (default 15 mm). */
  baseDepthMm?: number;
  /** Base plinth thickness in mm (default 4 mm). */
  baseHeightMm?: number;
  /** Emboss depth of the foreground alpha silhouette in mm (default 0.6 mm). */
  reliefMm?: number;
}>;

export function standeeMesh(
  alphaMask: readonly (readonly boolean[])[],
  opts: StandeeOptions = {},
): Mesh {
  const nRows = alphaMask.length;
  const nCols = alphaMask[0]?.length ?? 0;
  if (nRows === 0 || nCols === 0 || alphaMask.some((r) => r.length !== nCols)) {
    throw new Error("standeeMesh requires a non-empty rectangular alphaMask");
  }

  const heightMm = snapMicron(opts.heightMm ?? 70);
  const thicknessMm = snapMicron(opts.thicknessMm ?? 3);
  const baseWidthMm = snapMicron(opts.baseWidthMm ?? 40);
  const baseDepthMm = snapMicron(opts.baseDepthMm ?? 15);
  const baseHeightMm = snapMicron(opts.baseHeightMm ?? 4);
  const reliefMm = snapMicron(opts.reliefMm ?? 0.6);

  if (heightMm <= baseHeightMm || thicknessMm <= 0 || baseWidthMm <= 0 || baseDepthMm <= thicknessMm) {
    throw new Error("standeeMesh invalid dimensions");
  }

  const bladeHeightMm = snapMicron(heightMm - baseHeightMm);
  const cellW = baseWidthMm / nCols;
  const cellH = bladeHeightMm / nRows;
  const halfDepth = snapMicron(baseDepthMm / 2);
  const halfBlade = snapMicron(thicknessMm / 2);

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
  for (let c = 0; c <= nCols; c++) xs.push(snapMicron(-baseWidthMm / 2 + c * cellW));
  const zs: number[] = [];
  for (let r = 0; r <= nRows; r++) zs.push(snapMicron(baseHeightMm + r * cellH));

  const xMin = xs[0] as number;
  const xMax = xs[nCols] as number;
  const zTop = zs[nRows] as number;

  // Y stations: [-halfDepth, -halfBlade, +halfBlade, +halfDepth]
  const y0 = -halfDepth;
  const y1 = -halfBlade;
  const y2 = halfBlade;
  const y3 = halfDepth;
  const yZones: readonly [number, number][] = [
    [y0, y1],
    [y1, y2],
    [y2, y3],
  ];

  // 1. Base bottom (z = 0, subdivided along xs and the 3 Y zones, outward normal -Z)
  for (const [ya, yb] of yZones) {
    for (let c = 0; c < nCols; c++) {
      const xa = xs[c] as number;
      const xb = xs[c + 1] as number;
      addQuad(vIdx(xa, ya, 0), vIdx(xa, yb, 0), vIdx(xb, yb, 0), vIdx(xb, ya, 0));
    }
  }

  // 2. Base front (y = y0) & back (y = y3) walls from z = 0 to baseHeightMm
  for (let c = 0; c < nCols; c++) {
    const xa = xs[c] as number;
    const xb = xs[c + 1] as number;
    addQuad(vIdx(xa, y0, 0), vIdx(xb, y0, 0), vIdx(xb, y0, baseHeightMm), vIdx(xa, y0, baseHeightMm));
    addQuad(vIdx(xb, y3, 0), vIdx(xa, y3, 0), vIdx(xa, y3, baseHeightMm), vIdx(xb, y3, baseHeightMm));
  }

  // 3. Base left (x = xMin) & right (x = xMax) walls from z = 0 to baseHeightMm across the 3 Y zones
  for (const [ya, yb] of yZones) {
    addQuad(vIdx(xMin, yb, 0), vIdx(xMin, ya, 0), vIdx(xMin, ya, baseHeightMm), vIdx(xMin, yb, baseHeightMm));
    addQuad(vIdx(xMax, ya, 0), vIdx(xMax, yb, 0), vIdx(xMax, yb, baseHeightMm), vIdx(xMax, ya, baseHeightMm));
  }

  // 4. Base front & back ledges at z = baseHeightMm ([y0..y1] and [y2..y3])
  for (let c = 0; c < nCols; c++) {
    const xa = xs[c] as number;
    const xb = xs[c + 1] as number;
    addQuad(vIdx(xa, y0, baseHeightMm), vIdx(xb, y0, baseHeightMm), vIdx(xb, y1, baseHeightMm), vIdx(xa, y1, baseHeightMm));
    addQuad(vIdx(xa, y2, baseHeightMm), vIdx(xb, y2, baseHeightMm), vIdx(xb, y3, baseHeightMm), vIdx(xa, y3, baseHeightMm));
  }

  // 5. Blade left, right and top rims ([y1..y2], z in [baseHeightMm..zTop])
  for (let r = 0; r < nRows; r++) {
    const za = zs[r] as number;
    const zb = zs[r + 1] as number;
    // Left wall (x = xMin, normal -X)
    addQuad(vIdx(xMin, y2, za), vIdx(xMin, y1, za), vIdx(xMin, y1, zb), vIdx(xMin, y2, zb));
    // Right wall (x = xMax, normal +X)
    addQuad(vIdx(xMax, y1, za), vIdx(xMax, y2, za), vIdx(xMax, y2, zb), vIdx(xMax, y1, zb));
  }
  for (let c = 0; c < nCols; c++) {
    const xa = xs[c] as number;
    const xb = xs[c + 1] as number;
    // Top cap (z = zTop, normal +Z)
    addQuad(vIdx(xa, y1, zTop), vIdx(xb, y1, zTop), vIdx(xb, y2, zTop), vIdx(xa, y2, zTop));
  }

  // 6. Blade back face (y = y2, normal +Y)
  for (let r = 0; r < nRows; r++) {
    const za = zs[r] as number;
    const zb = zs[r + 1] as number;
    for (let c = 0; c < nCols; c++) {
      const xa = xs[c] as number;
      const xb = xs[c + 1] as number;
      addQuad(vIdx(xb, y2, za), vIdx(xa, y2, za), vIdx(xa, y2, zb), vIdx(xb, y2, zb));
    }
  }

  // 7. Blade front face (y = y1, normal -Y) with embossed alpha silhouette relief (to y = y1 - reliefMm)
  const inset = 0.02;
  const yRelief = snapMicron(y1 - reliefMm);
  for (let r = 0; r < nRows; r++) {
    const za = zs[r] as number;
    const zb = zs[r + 1] as number;
    // Row 0 of alphaMask is the top of the sprite (r = nRows - 1)
    const mr = nRows - 1 - r;
    for (let c = 0; c < nCols; c++) {
      const xa = xs[c] as number;
      const xb = xs[c + 1] as number;
      const active = Boolean(alphaMask[mr]?.[c]);
      const b00 = vIdx(xa, y1, za);
      const b10 = vIdx(xb, y1, za);
      const b11 = vIdx(xb, y1, zb);
      const b01 = vIdx(xa, y1, zb);

      if (!active) {
        addQuad(b00, b10, b11, b01);
      } else {
        const t00 = vIdx(xa + inset, yRelief, za + inset);
        const t10 = vIdx(xb - inset, yRelief, za + inset);
        const t11 = vIdx(xb - inset, yRelief, zb - inset);
        const t01 = vIdx(xa + inset, yRelief, zb - inset);
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
