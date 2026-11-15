import { mulberry32 } from "@hauntology/shared/puzzles/rng";
import { speckle, type Ctx } from "./canvas-paint";
import { MATERIAL, mix, shade, tint, withAlpha } from "./palette";

/**
 * The wall of the hidden-words puzzle: courses of dressed stone with mortar, mottled blocks, bevelled edges, grit, cracks and damp. It is painted
 * twice, once in the dark and once in the torch's warm light (the puzzle shows the lit one only where the beam falls); the letters are
 * never part of it, they are chalked on top, and only where the torch shows them. Painted once; the same wall every time.
 */
export function paintWall(c: Ctx, size: number, lit: boolean): void {
  const rng = mulberry32(0x57a11);
  c.fillStyle = shade(MATERIAL.stone, 0.74);
  c.fillRect(0, 0, size, size);
  const courses = 8;
  const rowH = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * rowH;
    let x = -rng() * 60;
    while (x < size) {
      const bw = 54 + rng() * 56;
      const x0 = x + 1.6;
      const y0 = y + 1.6;
      const w = bw - 3.2;
      const h = rowH - 3.2 + (rng() - 0.5) * 1.2;
      const base = mix(shade(MATERIAL.stone, 0.1), shade(MATERIAL.stone, 0.44), rng());
      const g = c.createLinearGradient(x0, y0, x0 + w, y0 + h);
      g.addColorStop(0, tint(base, 0.08));
      g.addColorStop(1, shade(base, 0.2));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x0 + 2, y0);
      c.lineTo(x0 + w - 2, y0);
      c.lineTo(x0 + w, y0 + 2);
      c.lineTo(x0 + w, y0 + h - 2);
      c.lineTo(x0 + w - 2, y0 + h);
      c.lineTo(x0 + 2, y0 + h);
      c.lineTo(x0, y0 + h - 2);
      c.lineTo(x0, y0 + 2);
      c.closePath();
      c.fill();
      // mottling: a few soft darker and lighter patches
      for (let m = 0; m < 3; m++) {
        c.fillStyle = rng() < 0.6 ? withAlpha(MATERIAL.dark, 0.07) : withAlpha(MATERIAL.light, 0.04);
        c.beginPath();
        c.ellipse(x0 + rng() * w, y0 + rng() * h, 6 + rng() * 16, 4 + rng() * 8, rng() * 3, 0, Math.PI * 2);
        c.fill();
      }
      // the edges: lit on the top and the left, in shade on the bottom and the right
      c.lineWidth = 1.4;
      c.strokeStyle = withAlpha(tint(base, 0.5), 0.32);
      c.beginPath();
      c.moveTo(x0 + 2.5, y0 + 0.8);
      c.lineTo(x0 + w - 2.5, y0 + 0.8);
      c.moveTo(x0 + 0.8, y0 + 2.5);
      c.lineTo(x0 + 0.8, y0 + h - 2.5);
      c.stroke();
      c.strokeStyle = withAlpha(MATERIAL.dark, 0.5);
      c.beginPath();
      c.moveTo(x0 + 2.5, y0 + h - 0.8);
      c.lineTo(x0 + w - 2.5, y0 + h - 0.8);
      c.moveTo(x0 + w - 0.8, y0 + 2.5);
      c.lineTo(x0 + w - 0.8, y0 + h - 2.5);
      c.stroke();
      x += bw;
    }
  }
  speckle(c, rng, 0, 0, size, size, 650, MATERIAL.dark, 0.24);
  speckle(c, rng, 0, 0, size, size, 380, MATERIAL.light, 0.11);
  // cracks: jagged, dark, with a thin lit edge
  for (let k = 0; k < 6; k++) {
    let x = rng() * size;
    let y = rng() * size * 0.6;
    const pts: Array<[number, number]> = [[x, y]];
    for (let s = 0; s < 7; s++) {
      x += (rng() - 0.5) * 16;
      y += 4 + rng() * 9;
      pts.push([x, y]);
    }
    for (const [dx, colour, a, wd] of [[0.9, MATERIAL.light, 0.14, 1], [0, MATERIAL.dark, 0.62, 1.2]] as const) {
      c.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? c.moveTo(px + dx, py) : c.lineTo(px + dx, py)));
      c.strokeStyle = withAlpha(colour, a);
      c.lineWidth = wd;
      c.stroke();
    }
  }
  // damp stains
  for (let d = 0; d < 3; d++) {
    const x = rng() * size;
    const y = rng() * size;
    const g = c.createRadialGradient(x, y, 4, x, y, 40 + rng() * 34);
    g.addColorStop(0, withAlpha(MATERIAL.dark, 0.3));
    g.addColorStop(1, withAlpha(MATERIAL.dark, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  // the light: warm where the torch falls, none in the dark
  c.fillStyle = lit ? withAlpha(MATERIAL.flame, 0.17) : withAlpha(MATERIAL.dark, 0.56);
  c.fillRect(0, 0, size, size);
}
