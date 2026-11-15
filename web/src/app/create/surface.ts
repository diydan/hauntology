import type { Stroke } from "@hauntology/shared/app/sketch-pad";
import { downscaleSize } from "@hauntology/shared/app/sketch-size";
import type { Bitmap } from "@hauntology/shared/sketch";

/**
 * Where the Sketch Pad's strokes are painted. The pad's model (`sketch-pad.ts`) is pure; this seam is the
 * one place that touches a canvas, so tests and the demo can swap it. The page is black ink on white,
 * and the eraser paints white, so the ink floor of `world-pipeline` Requirement 2.2 reads the same pixels
 * the API will.
 */
export type SketchSurface = {
  /** Paints the whole page again from `strokes`: after an undo, a redo, a clear, or when the pad opens. */
  redraw(strokes: readonly Stroke[]): void;
  /** Paints the part of the stroke being drawn from point `from` on, so a long stroke is not repainted at every move. */
  extend(stroke: Stroke, from: number): void;
  /** The pixels of the page, for `inkGate`. */
  bitmap(): Bitmap;
  /** The page as a PNG with no side longer than `maxSide`, or `null` if the browser cannot make one. */
  png(maxSide: number): Promise<Blob | null>;
};

export type SurfaceFactory = (canvas: HTMLCanvasElement) => SketchSurface;

const INK = "#000000";
const PAPER = "#ffffff";

export const canvasSurface: SurfaceFactory = (canvas) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const fillPaper = () => {
    if (ctx === null) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const paint = (s: Stroke, from: number) => {
    if (ctx === null || s.points.length === 0) return;
    const colour = s.tool === "eraser" ? PAPER : INK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    if (s.points.length === 1) {
      const [x, y] = s.points[0]!;
      ctx.beginPath();
      ctx.arc(x, y, s.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const start = Math.max(0, from - 1);
    ctx.beginPath();
    const [x0, y0] = s.points[start]!;
    ctx.moveTo(x0, y0);
    for (let i = start + 1; i < s.points.length; i++) {
      const [x, y] = s.points[i]!;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  fillPaper();
  return {
    redraw(strokes) {
      fillPaper();
      for (const s of strokes) paint(s, 0);
    },
    extend: paint,
    bitmap() {
      if (ctx === null) return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { width: d.width, height: d.height, data: d.data };
    },
    png(maxSide) {
      const size = downscaleSize(canvas.width, canvas.height, maxSide);
      const out = document.createElement("canvas");
      out.width = size.w;
      out.height = size.h;
      const c = out.getContext("2d");
      if (c === null) return Promise.resolve(null);
      c.fillStyle = PAPER;
      c.fillRect(0, 0, size.w, size.h);
      c.drawImage(canvas, 0, 0, size.w, size.h);
      return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
    },
  };
};
