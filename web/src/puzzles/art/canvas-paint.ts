import type { Rng } from "@hauntology/shared/puzzles/rng";
import { MATERIAL, shade, tint, withAlpha } from "./palette";

/**
 * Small brushes for the canvas objects (the spirit board, the stone wall, the labyrinth). The light always comes from the top left: a
 * lit edge on the top and the left, a shaded one on the bottom and the right, and a soft shadow falling to the bottom right. Anything
 * random is drawn from a seeded generator, so the same puzzle always looks the same. Everything static is painted once, into a layer.
 */
export type Ctx = CanvasRenderingContext2D;

/** An offscreen layer `w` by `h` logical units at pixel density `dpr`, painted once by `draw`; null when the browser gives no canvas. */
export function layer(w: number, h: number, dpr: number, draw: (c: Ctx) => void): HTMLCanvasElement | null {
  const off = document.createElement("canvas");
  off.width = Math.round(w * dpr);
  off.height = Math.round(h * dpr);
  const c = off.getContext("2d");
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(c);
  return off;
}

/** Varnished wood: a gradient of the base colour, long wavy grain, a knot or two. It fills the rectangle (and nothing outside it). */
export function woodGrain(c: Ctx, rng: Rng, x: number, y: number, w: number, h: number, base: string, lines = 64): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, tint(base, 0.1));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, 0.24));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  for (let i = 0; i < lines; i++) {
    const y0 = y + rng() * h;
    const amp = 1 + rng() * 4;
    const phase = rng() * 6;
    c.beginPath();
    c.moveTo(x - 4, y0);
    for (let sx = x; sx <= x + w + 8; sx += 14) c.lineTo(sx, y0 + Math.sin(sx * 0.03 + phase) * amp + (rng() - 0.5) * 0.8);
    c.strokeStyle = rng() < 0.62 ? withAlpha(MATERIAL.dark, 0.06 + rng() * 0.14) : withAlpha(MATERIAL.light, 0.03 + rng() * 0.06);
    c.lineWidth = 0.6 + rng() * 1.5;
    c.stroke();
  }
  const knots = 1 + Math.floor(rng() * 2);
  for (let k = 0; k < knots; k++) {
    const kx = x + rng() * w;
    const ky = y + rng() * h;
    for (let ring = 1; ring <= 4; ring++) {
      c.beginPath();
      c.ellipse(kx, ky, 2 + ring * 3, 1.2 + ring * 1.5, 0, 0, Math.PI * 2);
      c.strokeStyle = withAlpha(MATERIAL.dark, 0.16 - ring * 0.025);
      c.lineWidth = 1;
      c.stroke();
    }
  }
  c.restore();
}

/** A bevel round a rectangle: the top and left edges catch the light (`hi`), the bottom and right edges are in shade (`lo`). */
export function bevelRect(c: Ctx, x: number, y: number, w: number, h: number, depth: number, hi: string, lo: string): void {
  const d = depth;
  c.fillStyle = hi;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w - d, y + d);
  c.lineTo(x + d, y + d);
  c.lineTo(x + d, y + h - d);
  c.lineTo(x, y + h);
  c.closePath();
  c.fill();
  c.fillStyle = lo;
  c.beginPath();
  c.moveTo(x + w, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x + d, y + h - d);
  c.lineTo(x + w - d, y + h - d);
  c.lineTo(x + w - d, y + d);
  c.lineTo(x + w, y);
  c.closePath();
  c.fill();
}

/** A soft shadow under a round thing: a few stacked ellipses of low alpha (cheap enough to draw every frame, unlike a blur). */
export function softShadow(c: Ctx, x: number, y: number, rx: number, ry: number, alpha: number): void {
  for (let i = 3; i >= 1; i--) {
    c.fillStyle = withAlpha(MATERIAL.dark, alpha / 3 + 0.02);
    c.beginPath();
    c.ellipse(x, y, rx * (0.7 + i * 0.16), ry * (0.7 + i * 0.16), 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** Fine dust and grain: `n` tiny dots of `colour` at random places in the rectangle. */
export function speckle(c: Ctx, rng: Rng, x: number, y: number, w: number, h: number, n: number, colour: string, alpha: number): void {
  c.fillStyle = withAlpha(colour, alpha);
  for (let i = 0; i < n; i++) c.fillRect(x + rng() * w, y + rng() * h, 0.6 + rng() * 1.2, 0.6 + rng() * 1.2);
}

/** A round brass nail or rivet with a highlight. */
export function rivet(c: Ctx, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, tint(MATERIAL.brass, 0.7));
  g.addColorStop(0.5, MATERIAL.brass);
  g.addColorStop(1, shade(MATERIAL.brass, 0.6));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
