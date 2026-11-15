// Feature: party-mode, Property 20: Printed meshes are valid and QR plates round-trip
// Validates: Requirements 8.2
// Feature: party-mode, Property 21: Pyramid faces are consistent
// Validates: Requirements 8.3

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RELICS } from "../party/pool";
import { checkMesh, readStl, writeStl } from "./mesh";
import { DEFAULT_PYRAMID_BASE_MM, DEFAULT_PYRAMID_TOP_MM, holderParams, pyramidTrapezoid } from "./pyramid";
import { MAX_PLATE_MM, MIN_MODULE_MM, qrMatrixForRelic, qrPlateMesh, rasterTop } from "./qr-plate";
import { standeeMesh } from "./standee";

describe("Property 20: Printed meshes are valid and QR plates round-trip", () => {
  it("generates watertight, positive-volume, <= 40 mm plates for all six canonical relics that round-trip via STL and rasterTop", () => {
    for (const relic of RELICS) {
      const mat = qrMatrixForRelic(relic.id);
      const mesh = qrPlateMesh(mat, { moduleMm: 1.44, baseMm: 3.0, reliefMm: 1.0, quietModules: 2 });
      const report = checkMesh(mesh, { bedMm: 180 });
      expect(report.ok, report.errors.join("; ")).toBe(true);
      expect(report.sizeMm[0]).toBeLessThanOrEqual(MAX_PLATE_MM);
      expect(report.sizeMm[1]).toBeLessThanOrEqual(MAX_PLATE_MM);
      expect(report.volumeMm3).toBeGreaterThan(0);

      const stlBytes = writeStl(mesh, `Relic Token ${relic.id}`);
      const parsed = readStl(stlBytes);
      const parsedReport = checkMesh(parsed, { bedMm: 180 });
      expect(parsedReport.ok, parsedReport.errors.join("; ")).toBe(true);

      const decoded = rasterTop(parsed, mat.length, { quietModules: 2, baseMm: 3.0, reliefMm: 1.0 });
      expect(decoded).toEqual(mat);
    }
  });

  it("round-trips any arbitrary square boolean matrix at moduleMm >= 1.2 into a watertight manifold mesh within the 40 mm plate rule", () => {
    const arbSquareMatrix = fc
      .integer({ min: 3, max: 21 })
      .chain((n) =>
        fc.tuple(
          fc.constant(n),
          fc.array(fc.array(fc.boolean(), { minLength: n, maxLength: n }), { minLength: n, maxLength: n }),
          fc.integer({ min: 1200, max: Math.floor((MAX_PLATE_MM / (n + 4)) * 1000) }),
        ),
      );

    fc.assert(
      fc.property(arbSquareMatrix, ([n, mat, modMicrons]) => {
        const moduleMm = modMicrons / 1000;
        expect(moduleMm).toBeGreaterThanOrEqual(MIN_MODULE_MM);
        const mesh = qrPlateMesh(mat, { moduleMm, baseMm: 2.4, reliefMm: 0.8, quietModules: 2 });
        const report = checkMesh(mesh, { bedMm: 180 });
        expect(report.ok).toBe(true);
        expect(report.openEdges).toBe(0);
        expect(report.nonManifoldEdges).toBe(0);
        expect(report.volumeMm3).toBeGreaterThan(0);
        expect(report.sizeMm[0]).toBeLessThanOrEqual(MAX_PLATE_MM + 1e-3);
        expect(report.sizeMm[1]).toBeLessThanOrEqual(MAX_PLATE_MM + 1e-3);

        const roundTripped = rasterTop(mesh, n, { quietModules: 2, baseMm: 2.4, reliefMm: 0.8 });
        expect(roundTripped).toEqual(mat);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects non-manifold or open meshes and oversize beds in checkMesh, and validates standeeMesh", () => {
    const openTri = {
      vertices: [
        [0, 0, 0],
        [10, 0, 0],
        [0, 10, 0],
      ] as const,
      faces: [[0, 1, 2]] as const,
    };
    expect(checkMesh(openTri).ok).toBe(false);

    const mask = [
      [false, true, true, false],
      [true, true, true, true],
      [false, true, true, false],
      [true, true, true, true],
    ];
    const standee = standeeMesh(mask, { heightMm: 70, thicknessMm: 3, baseWidthMm: 40, baseDepthMm: 15 });
    const sReport = checkMesh(standee, { bedMm: 180 });
    expect(sReport.ok, sReport.errors.join("; ")).toBe(true);
  });
});

describe("Property 21: Pyramid faces are consistent", () => {
  it("defaults to a 60 mm base and 10 mm top with faces at 45 degrees to the screen", () => {
    const def = pyramidTrapezoid();
    expect(def.baseMm).toBe(DEFAULT_PYRAMID_BASE_MM);
    expect(def.topMm).toBe(DEFAULT_PYRAMID_TOP_MM);
    expect(Math.abs(def.angleDeg - 45)).toBeLessThanOrEqual(1);
    expect(def.slantMm).toBeCloseTo(((60 - 10) / 2) * Math.SQRT2, 5);
  });

  it("returns an isosceles trapezoid within 1 degree of 45 degrees whose slant height increases with the base for any 0 < top < base", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 4, max: 140, noNaN: true }),
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 1, max: 40, noNaN: true }),
        (topMm, delta1, delta2) => {
          const base1 = topMm + delta1;
          const base2 = base1 + delta2;
          const t1 = pyramidTrapezoid({ baseMm: base1, topMm });
          const t2 = pyramidTrapezoid({ baseMm: base2, topMm });

          expect(Math.abs(t1.angleDeg - 45)).toBeLessThanOrEqual(1);
          expect(Math.abs(t2.angleDeg - 45)).toBeLessThanOrEqual(1);
          expect(t2.slantMm).toBeGreaterThan(t1.slantMm);

          // Isosceles check: bottom vertices symmetric, top vertices symmetric, equal side legs
          const [v0, v1, v2, v3] = t1.vertices2d;
          expect(v1[0] - v0[0]).toBeCloseTo(base1, 6);
          expect(v2[0] - v3[0]).toBeCloseTo(topMm, 6);
          const legLeft = Math.hypot(v3[0] - v0[0], v3[1] - v0[1]);
          const legRight = Math.hypot(v2[0] - v1[0], v2[1] - v1[1]);
          expect(legLeft).toBeCloseTo(legRight, 6);

          const hp = holderParams(base1);
          expect(hp.frameOuterMm).toBeLessThanOrEqual(180);
        },
      ),
      { numRuns: 120 },
    );
  });
});
