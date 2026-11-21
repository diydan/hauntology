import { PerspectiveCamera, Scene, WebGLRenderer } from "three";

/**
 * The drawing surface of the Table, behind a small port (spirit-table 6.1): the real one is three.js's WebGL renderer; tests give a fake.
 * No WebGL gives `null`, and the Table then shows only the Table list (6.3). Drawing for real needs a GPU, so this file is the one part
 * of the Table that a jsdom test cannot prove: it is checked by hand on a real phone (Spike spirit-table 1.1, task 1.2).
 */
export interface TableRenderer {
  render(scene: Scene, camera: PerspectiveCamera): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}
export type RendererFactory = (canvas: HTMLCanvasElement) => TableRenderer | null;

/** Whether this browser can make a WebGL context at all (a throwaway canvas, thrown away at once). */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/** The real renderer: transparent so the camera shows through, low-power, pixel ratio capped at 2 to keep a phone cool. */
export const createWebGLRenderer: RendererFactory = (canvas) => {
  if (!webglAvailable()) return null;
  try {
    const r = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    r.setClearColor(0x000000, 0);
    return {
      render: (s, c) => r.render(s, c),
      resize: (w, h, dpr) => { r.setPixelRatio(Math.min(2, Number.isFinite(dpr) && dpr > 0 ? dpr : 1)); r.setSize(Math.max(1, w), Math.max(1, h), false); },
      dispose: () => { r.dispose(); r.forceContextLoss(); },
    };
  } catch {
    return null;
  }
};
