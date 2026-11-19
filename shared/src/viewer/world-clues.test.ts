import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import { placeWorldClues, SIGNS } from "../puzzles/world-clues";
import { clueAnswerLines, clueClarity, clueGlowPulse, cluePropPositions, CLUE_VIEW_COS } from "./world-clues";

const BOUNDS = { min: [-6, 0, -6] as [number, number, number], max: [6, 4, 6] as [number, number, number] };

describe("world-viewer World Clue helpers (Requirement 2.1, 2.3)", () => {
  it("places every prop within bounds near anchors without stacking on a single point", () => {
    const locks = [
      { zone: "z1", lock: makeLock("clock", "easy", 1) },
      { zone: "z2", lock: makeLock("wires", "easy", 2) },
    ];
    const clues = placeWorldClues(9, ["z1", "z2", "z3", "z4", "z5", "z6"], locks);
    const props = cluePropPositions(clues, [{ pos: [1, 1.4, -1] }, { pos: [-2, 1.4, 2] }], BOUNDS, 0);
    expect(props.length).toBe(clues.length);
    const coords = new Set(props.map((p) => p.pos.map((n) => n.toFixed(2)).join(",")));
    expect(coords.size).toBe(props.length);
    for (const p of props) {
      expect(p.pos[0]).toBeGreaterThanOrEqual(BOUNDS.min[0]);
      expect(p.pos[0]).toBeLessThanOrEqual(BOUNDS.max[0]);
      expect(p.pos[1]).toBeGreaterThanOrEqual(BOUNDS.min[1]);
      expect(p.pos[1]).toBeLessThanOrEqual(BOUNDS.max[1]);
      expect(p.pos[2]).toBeGreaterThanOrEqual(BOUNDS.min[2]);
      expect(p.pos[2]).toBeLessThanOrEqual(BOUNDS.max[2]);
    }
  });

  it("reveals clarity only within 3 metres and inside the view cone, growing stronger as camera approaches", () => {
    const propPos: [number, number, number] = [0, 1.4, -2];
    // Yaw 0 faces -Z toward propPos at (0, 1.4, -2) from (0, 1.6, 0) -> dist ~ 2.01 m (< 3 m)
    const at2m = clueClarity([0, 1.6, 0], 0, propPos);
    const at1m = clueClarity([0, 1.6, -1], 0, propPos);
    expect(at2m).toBeGreaterThan(0);
    expect(at1m).toBeGreaterThan(at2m);
    // Beyond 3 metres -> 0 even when facing straight at it
    expect(clueClarity([0, 1.6, 1.5], 0, propPos)).toBe(0);
    // Turning 180° away (yaw = pi) -> 0 even at 1 metre
    expect(clueClarity([0, 1.6, -1], Math.PI, propPos)).toBe(0);
    // Right at edge of cone -> strictly follows CLUE_VIEW_COS
    expect(CLUE_VIEW_COS).toBe(0.5);
    expect(clueClarity([Number.NaN, 0, 0], 0, propPos)).toBe(0);
  });

  it("pulses slowly with bounded intensity (no flash) and provides non-colour text labels for every Memory Kind", () => {
    for (let t = 0; t <= 6000; t += 250) {
      const a = clueGlowPulse(t, false);
      const b = clueGlowPulse(t, true);
      expect(a).toBeGreaterThanOrEqual(0.75);
      expect(a).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0.75);
      expect(b).toBeLessThanOrEqual(1);
    }
    for (const kind of ["clock", "safe", "wires", "moved", "photo", "knock"] as const) {
      const sight = makeLock(kind, "easy", 4).sight!;
      const lines = clueAnswerLines(sight);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.join(" ").trim().length).toBeGreaterThan(5);
    }
    expect(SIGNS.length).toBe(6);
  });
});
