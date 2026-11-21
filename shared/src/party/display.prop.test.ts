import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { effectLimits, fitTile, MAX_LUMINANCE_STEP_PCT, pyramidLayout, type ReactionKind } from "./display";

const layoutArb = fc.record({
  width: fc.integer({ min: 200, max: 4000 }), height: fc.integer({ min: 200, max: 4000 }),
  innerPx: fc.integer({ min: 1, max: 400 }), tilePx: fc.integer({ min: 1, max: 2000 }),
  orientation: fc.constantFrom<"inward" | "outward">("inward", "outward"), mirror: fc.boolean(),
});

describe("Property 18: The pyramid layout is symmetric and in bounds", () => {
  // Feature: party-mode, Property 18: The pyramid layout is symmetric and in bounds
  // Validates: Requirements 7.3
  it("gives four equal tiles, in bounds, symmetric about the centre and never overlapping", () => {
    fc.assert(fc.property(layoutArb, (i) => {
      const tiles = pyramidLayout(i);
      if (tiles.length === 0) return true;
      if (tiles.length !== 4 || new Set(tiles.map((t) => t.size)).size !== 1) return false;
      const cx = i.width / 2, cy = i.height / 2;
      const [top, right, bottom, left] = tiles as [typeof tiles[0], typeof tiles[0], typeof tiles[0], typeof tiles[0]];
      const eps = 1e-6;
      if (Math.abs(top.cx - cx) > eps || Math.abs(bottom.cx - cx) > eps || Math.abs(left.cy - cy) > eps || Math.abs(right.cy - cy) > eps) return false;
      if (Math.abs((top.cy - cy) + (bottom.cy - cy)) > eps || Math.abs((left.cx - cx) + (right.cx - cx)) > eps) return false;
      if (tiles.map((t) => t.rotationDeg).sort((a, b) => a - b).join() !== "0,90,180,270") return false;
      const box = (t: typeof top) => ({ x0: t.cx - t.size / 2, x1: t.cx + t.size / 2, y0: t.cy - t.size / 2, y1: t.cy + t.size / 2 });
      for (const t of tiles) { const b = box(t); if (b.x0 < -eps || b.y0 < -eps || b.x1 > i.width + eps || b.y1 > i.height + eps) return false; }
      for (let a = 0; a < 4; a++) for (let c = a + 1; c < 4; c++) {
        const p = box(tiles[a] as typeof top), q = box(tiles[c] as typeof top);
        if (p.x0 < q.x1 - eps && q.x0 < p.x1 - eps && p.y0 < q.y1 - eps && q.y0 < p.y1 - eps) return false;
      }
      return tiles.every((t) => t.size <= i.tilePx + eps);
    }), propParams());
  });
  it("flips every rotation by 180 degrees when the tops point outward, and carries the mirror toggle", () => {
    const base = { width: 1000, height: 800, innerPx: 100, tilePx: 200, mirror: true };
    const a = pyramidLayout({ ...base, orientation: "inward" }), b = pyramidLayout({ ...base, orientation: "outward" });
    expect(a.map((t) => t.rotationDeg)).toEqual([0, 90, 180, 270]);
    expect(b.map((t) => t.rotationDeg)).toEqual([180, 270, 0, 90]);
    expect(a.every((t) => t.mirror)).toBe(true);
  });
  it("leaves the tiles out when nothing fits, and treats NaN as zero", () => {
    expect(pyramidLayout({ width: 100, height: 100, innerPx: 80, tilePx: 50, orientation: "inward", mirror: false })).toEqual([]);
    expect(fitTile(Number.NaN, 10, 100)).toBe(0);
    expect(fitTile(500, 50, 300)).toBe(100); // capped by twice the inner gap, so neighbours cannot meet
  });
});

const eventsArb = fc.array(
  fc.record({ id: fc.nat(1000), atMs: fc.integer({ min: 0, max: 20_000 }), kind: fc.constantFrom<ReactionKind>("suggest", "shown", "accuse-wrong", "accuse-right", "achievement", "time-warning", "haunt-event", "blackout") }),
  { maxLength: 30 },
);

describe("Property 19: Display effects respect photosensitivity limits", () => {
  // Feature: party-mode, Property 19: Display effects respect photosensitivity limits
  // Validates: Requirements 7.4
  it("never flashes more than three times in any second, never steps luminance by more than 20%, and drops nothing", () => {
    fc.assert(fc.property(eventsArb, (events) => {
      const out = effectLimits(events, false);
      if (out.length !== events.length) return false;
      const flashes = out.flatMap((r) => r.flashes).sort((a, b) => a - b);
      for (let k = 0; k + 3 < flashes.length; k++) if ((flashes[k + 3] as number) - (flashes[k] as number) < 1000) return false;
      for (const r of out) {
        if (r.flashStepPct > MAX_LUMINANCE_STEP_PCT) return false;
        let prev = 100;
        for (const d of r.dim) { if (prev - d.levelPct > MAX_LUMINANCE_STEP_PCT || d.levelPct < 0) return false; prev = d.levelPct; }
      }
      return true;
    }), propParams());
  });
  it("returns nothing when reduced motion is preferred, and reveals the culprit only on a correct Accusation", () => {
    expect(effectLimits([{ id: 1, atMs: 0, kind: "haunt-event" }], true)).toEqual([]);
    const out = effectLimits([{ id: 1, atMs: 0, kind: "accuse-right" }, { id: 2, atMs: 0, kind: "accuse-wrong" }], false);
    expect(out.map((r) => r.reveal)).toEqual([true, false]);
  });
  it("dims a Blackout in steps from full to 40%", () => {
    const [r] = effectLimits([{ id: 1, atMs: 100, kind: "blackout" }], false);
    expect(r?.dim.map((d) => d.levelPct)).toEqual([80, 60, 40]);
  });
});
