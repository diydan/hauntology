// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { SIGNS } from "@hauntology/shared/puzzles/world-clues";
import { buildAnswerTexture, buildSignTexture } from "./world-clue-props";

describe("world-clue-props", () => {
  it("draws Sign plaques and Sight answer overlays across all 6 signs and Memory Kinds", () => {
    const fillText = vi.fn();
    const fakeCtx = {
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      rect() {},
      roundRect() {},
      quadraticCurveTo() {},
      fillRect() {},
      strokeRect() {},
      fill() {},
      stroke() {},
      fillText,
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      font: "",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => fakeCtx) as never;
    try {
      const kinds = ["wires", "clock", "safe", "moved", "photo", "knock"] as const;
      kinds.forEach((kind, i) => {
        const sign = SIGNS[i]!;
        const sight = makeLock(kind, "easy", 5).sight!;
        const clue = { zone: `z${i + 1}`, sign, sight };
        const signTex = buildSignTexture(clue);
        const ansTex = buildAnswerTexture(clue);
        expect(signTex.image).toBeTruthy();
        expect(ansTex.image).toBeTruthy();
        signTex.dispose();
        ansTex.dispose();
      });
      expect(fillText).toHaveBeenCalled();
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });
});
