import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { chainUnrest, deformVertices, linkStretch, makeChain, stepChain } from "./rag";

const N = 7, H = 0.105, TOP = H + 0.003, FLOOR = 0.004, HEAD_Y = FLOOR + 0.03 + TOP;
/** A finger path at up to 1.5 metres a second (0.025 m per 1/60 s step), the speed of a quick drag. */
const pathArb = fc.array(fc.record({ dx: fc.double({ min: -0.025, max: 0.025, noNaN: true }), dy: fc.double({ min: -0.01, max: 0.01, noNaN: true }) }), { minLength: 1, maxLength: 150 });

describe("Property 8: The rag doll keeps its shape and stands back up", () => {
  // Feature: spirit-table, Property 8: The rag doll keeps its shape and stands back up
  // Validates: Requirements 8.1, 8.4
  it("keeps every link within 8 percent of its length while held, with no point below the floor or not a number", () => {
    fc.assert(
      fc.property(pathArb, (path) => {
        const c = makeChain(N, H, 0, HEAD_Y);
        let x = 0, y = HEAD_Y;
        for (const { dx, dy } of path) {
          x += dx; y = Math.min(0.2, Math.max(FLOOR + TOP, y + dy));
          stepChain(c, 1 / 60, { holdX: x, holdY: y, floorY: FLOOR });
          if (linkStretch(c) > 0.08) return false;
          for (let i = 0; i < 2 * N; i++) { if (!Number.isFinite(c.p[i] ?? NaN)) return false; if (i % 2 === 1 && (c.p[i] ?? 0) < FLOOR - 1e-9) return false; }
        }
        return true;
      }),
      propParams(),
    );
  });

  it("bends a chain hanging straight into exactly the flat picture", () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: 0, max: 0.3, noNaN: true }), fc.integer({ min: 2, max: 20 }), (ox, oy, rows) => {
        const w = 0.04, orig = new Float32Array(rows * 2 * 3);
        let k = 0;
        for (let r = 0; r < rows; r++) for (const sx of [-0.5, 0.5]) { orig[k++] = sx * w; orig[k++] = 0.003 + H * (1 - r / (rows - 1)); orig[k++] = 0; }
        const c = makeChain(N, H, ox, oy + TOP), out = new Float32Array(orig.length);
        deformVertices(c, orig, out, TOP, H, ox, oy);
        return orig.every((v, i) => Math.abs(v - (out[i] ?? NaN)) < 1e-5);
      }),
      propParams(),
    );
  });

  it("stands back up and is still within two seconds of landing, whatever the finger did before it let go", () => {
    fc.assert(
      fc.property(pathArb, (path) => {
        const c = makeChain(N, H, 0, HEAD_Y);
        let x = 0, y = HEAD_Y;
        for (const { dx, dy } of path) { x += dx; y = Math.min(0.2, Math.max(FLOOR + TOP, y + dy)); stepChain(c, 1 / 60, { holdX: x, holdY: y, floorY: FLOOR }); }
        for (let i = 0; i < 120; i++) { // two seconds after landing, with the same stand-up spring the table uses
          stepChain(c, 1 / 60, { pinned: false, restoreK: Math.min(1, i / 27), restTopX: x, restTopY: FLOOR + TOP, floorY: FLOOR });
          for (let k = 0; k < N; k++) if ((c.p[2 * k + 1] ?? 0) < FLOOR - 1e-9) return false;
        }
        const { off, speed } = chainUnrest(c, x, FLOOR + TOP);
        return off < 0.002 && speed < 2e-4;
      }),
      propParams(),
    );
  });

  it("never gives a point that is not a number for broken input, and does nothing for a broken finger position", () => {
    const c = makeChain(N, H, 0, HEAD_Y), before = Array.from(c.p);
    stepChain(c, 1 / 60, { holdX: Number.NaN, holdY: 1 });
    stepChain(c, Number.NaN, { holdX: 0, holdY: 1 });
    expect(Array.from(c.p)).toEqual(before);
    for (const dt of [-1, 0, 5, 1e9, Number.POSITIVE_INFINITY]) stepChain(c, dt, { holdX: 100, holdY: 100 });
    expect(Array.from(c.p).every(Number.isFinite)).toBe(true);
  });
});
