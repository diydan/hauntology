import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED, propParams } from "./prop-config";
import {
  CAPTION_REASON, INK_REASON, MAX_STROKE_POINTS, PAD_HEIGHT, PAD_SIZES, PAD_TOOLS, PAD_WIDTH, PAD_WIDTHS, UNDO_STEPS, canRedo, canUndo,
  captionTooShort, clampPoint, clearPage, commitStroke, emptyHistory, makeItRealGate, makeStroke, redo, undo, type PadHistory, type Stroke,
} from "./sketch-pad";

const stroke = (n: number, tool: "brush" | "eraser" = "brush"): Stroke => makeStroke(tool, "medium", [[n, n], [n + 1, n + 1]]);
const commitN = (h: PadHistory, n: number) => Array.from({ length: n }, (_, i) => i).reduce((acc, i) => commitStroke(acc, stroke(i)), h);

describe("the tools", () => {
  it("has a brush and an eraser and three sizes, wider each time", () => {
    expect([...PAD_TOOLS]).toEqual(["brush", "eraser"]);
    expect([...PAD_SIZES]).toEqual(["small", "medium", "large"]);
    expect(PAD_WIDTHS.small).toBeLessThan(PAD_WIDTHS.medium);
    expect(PAD_WIDTHS.medium).toBeLessThan(PAD_WIDTHS.large);
  });

  it("makes a stroke with the width of its size and at most the point cap", () => {
    const s = makeStroke("eraser", "large", Array.from({ length: MAX_STROKE_POINTS + 50 }, (_, i) => [i, i] as const));
    expect(s.tool).toBe("eraser");
    expect(s.width).toBe(PAD_WIDTHS.large);
    expect(s.points).toHaveLength(MAX_STROKE_POINTS);
  });

  it("keeps a point on the page, to one decimal, and a point that is not a number at the corner", () => {
    expect(clampPoint(-5, 9999)).toEqual([0, PAD_HEIGHT]);
    expect(clampPoint(PAD_WIDTH + 1, -1)).toEqual([PAD_WIDTH, 0]);
    expect(clampPoint(10.26, 20.24)).toEqual([10.3, 20.2]);
    expect(clampPoint(NaN, Infinity)).toEqual([0, 0]);
  });
});

describe("undo, redo and clear", () => {
  it("undoes at least 30 steps, and exactly as many as the limit after that", () => {
    expect(UNDO_STEPS).toBeGreaterThanOrEqual(30);
    let h = commitN(emptyHistory, 30);
    for (let i = 0; i < 30; i++) h = undo(h);
    expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);

    let long = commitN(emptyHistory, UNDO_STEPS + 20);
    let steps = 0;
    while (canUndo(long)) {
      long = undo(long);
      steps++;
    }
    expect(steps).toBe(UNDO_STEPS);
    expect(long.present).toHaveLength(20);
  });

  it("redoes what was undone, in order, until a new stroke ends the redo", () => {
    let h = commitN(emptyHistory, 3);
    const full = h.present;
    h = undo(undo(h));
    expect(h.present).toHaveLength(1);
    expect(canRedo(h)).toBe(true);
    h = redo(redo(h));
    expect(h.present).toEqual(full);
    expect(canRedo(h)).toBe(false);
    h = undo(h);
    h = commitStroke(h, stroke(9));
    expect(canRedo(h)).toBe(false);
    expect(h.present).toHaveLength(3);
  });

  it("clears the page as a step that can be undone, and clearing an empty page is nothing", () => {
    const h = commitN(emptyHistory, 4);
    const cleared = clearPage(h);
    expect(cleared.present).toEqual([]);
    expect(canUndo(cleared)).toBe(true);
    expect(undo(cleared).present).toEqual(h.present);
    expect(clearPage(emptyHistory)).toBe(emptyHistory);
    expect(clearPage(cleared).past).toHaveLength(cleared.past.length);
  });

  it("does nothing for a stroke with no points, an undo with no past and a redo with no future", () => {
    expect(commitStroke(emptyHistory, makeStroke("brush", "small", []))).toBe(emptyHistory);
    expect(undo(emptyHistory)).toBe(emptyHistory);
    expect(redo(emptyHistory)).toBe(emptyHistory);
  });

  it("never holds more than the step limit, whatever is done", () => {
    type Op = "stroke" | "undo" | "redo" | "clear";
    fc.assert(
      fc.property(fc.array(fc.constantFrom<Op>("stroke", "stroke", "stroke", "undo", "redo", "clear"), { maxLength: 200 }), (ops) => {
        let h: PadHistory = emptyHistory;
        let n = 0;
        for (const op of ops) {
          h = op === "stroke" ? commitStroke(h, stroke(n++)) : op === "undo" ? undo(h) : op === "redo" ? redo(h) : clearPage(h);
          if (h.past.length > UNDO_STEPS) return false;
        }
        return true;
      }),
      propParams(DEFAULT_SEED),
    );
  });

  it("undo then redo gives back the same page, for any history", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 60 }), (strokes, ups) => {
        let h = commitN(emptyHistory, strokes);
        const before = h;
        const k = Math.min(ups, h.past.length);
        for (let i = 0; i < k; i++) h = undo(h);
        for (let i = 0; i < k; i++) h = redo(h);
        return JSON.stringify(h.present) === JSON.stringify(before.present);
      }),
      propParams(DEFAULT_SEED),
    );
  });
});

describe("Make it real", () => {
  it("is off, with one line, first for the world switch or quota, then for too little ink, then for a short caption", () => {
    const on = { drawReason: null, ink: { enabled: true }, caption: "an attic" };
    expect(makeItRealGate(on)).toEqual({ enabled: true });
    expect(makeItRealGate({ ...on, drawReason: "Making new places is switched off." })).toEqual({ enabled: false, reason: "Making new places is switched off." });
    expect(makeItRealGate({ ...on, ink: { enabled: false } })).toEqual({ enabled: false, reason: INK_REASON });
    expect(makeItRealGate({ ...on, caption: "ab" })).toEqual({ enabled: false, reason: CAPTION_REASON });
    expect(makeItRealGate({ drawReason: "no", ink: { enabled: false }, caption: "a" })).toEqual({ enabled: false, reason: "no" });
    expect(makeItRealGate({ drawReason: null, ink: { enabled: false }, caption: "a" })).toEqual({ enabled: false, reason: INK_REASON });
  });

  it("treats an empty caption, and spaces only, as no caption, and a caption of 3 characters as enough", () => {
    expect(captionTooShort("")).toBe(false);
    expect(captionTooShort("   ")).toBe(false);
    expect(captionTooShort(" a ")).toBe(true);
    expect(captionTooShort("abc")).toBe(false);
    expect(captionTooShort("  abc  ")).toBe(false);
  });
});
