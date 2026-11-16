import type { Stroke } from "@hauntology/shared/app/sketch-pad";
import type { SketchSurface, SurfaceFactory } from "../app/create/surface";
import { vi } from "vitest";

/**
 * A software Sketch surface for tests (jsdom has no canvas): it rasterises strokes into a real bitmap,
 * black on white, so `inkGate` reads real pixels, and it records what the pad asked it to do.
 */
export function rasterSurfaceFactory() {
  const sizes: number[] = [];
  const made: Array<{ redraws: number; extends: number }> = [];
  const factory: SurfaceFactory = (canvas) => {
    const w = canvas.width;
    const h = canvas.height;
    const data = new Uint8ClampedArray(w * h * 4);
    const stats = { redraws: 0, extends: 0 };
    made.push(stats);
    const fill = () => data.fill(255);
    const disc = (cx: number, cy: number, r: number, v: number) => {
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(h - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
    };
    const paint = (s: Stroke, from: number) => {
      const v = s.tool === "eraser" ? 255 : 0;
      const r = s.width / 2;
      if (s.points.length === 1) {
        const [x, y] = s.points[0]!;
        disc(x, y, r, v);
        return;
      }
      for (let i = Math.max(1, from); i < s.points.length; i++) {
        const [ax, ay] = s.points[i - 1]!;
        const [bx, by] = s.points[i]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let k = 0; k <= steps; k++) disc(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, r, v);
      }
    };
    fill();
    const surface: SketchSurface = {
      redraw(strokes) {
        stats.redraws++;
        fill();
        for (const s of strokes) paint(s, 0);
      },
      extend(s, from) {
        stats.extends++;
        paint(s, from);
      },
      bitmap: () => ({ width: w, height: h, data }),
      png: async (maxSide) => {
        sizes.push(maxSide);
        return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
      },
    };
    return surface;
  };
  return { factory: vi.fn(factory), sizes, made };
}
