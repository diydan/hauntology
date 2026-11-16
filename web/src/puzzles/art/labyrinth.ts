import { mulberry32 } from "@hauntology/shared/puzzles/rng";
import type { MazeLayout } from "../kinds/Maze-geometry";
import { rivet, softShadow, woodGrain, type Ctx } from "./canvas-paint";
import { CANVAS, MATERIAL, shade, tint, withAlpha } from "./palette";

/**
 * The marble maze as the toy it is: a wooden labyrinth box. A dark, grained floor; walls of lighter wood with a lit top edge, a shaded
 * bottom and right edge and a shadow on the floor; brass nails in the corners; a hole with a lip and a painted green ring round it (the goal);
 * and a steel marble with a highlight and a shadow that moves with it. The box is painted once into a layer; only the marble is drawn each frame.
 */

/** The goal: a hole in the floor with a turned lip, and the green ring painted round it. */
function hole(c: Ctx, x: number, y: number, cs: number): void {
  const r = cs * 0.28;
  c.strokeStyle = CANVAS.ring;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, cs * 0.34, 0, Math.PI * 2);
  c.stroke();
  const lip = c.createLinearGradient(x - r, y - r, x + r, y + r);
  lip.addColorStop(0, shade(MATERIAL.wood, 0.62));
  lip.addColorStop(1, tint(MATERIAL.wood, 0.1));
  c.fillStyle = lip;
  c.beginPath();
  c.arc(x, y, r * 1.2, 0, Math.PI * 2);
  c.fill();
  const well = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  well.addColorStop(0, withAlpha(MATERIAL.dark, 0.88));
  well.addColorStop(1, withAlpha(MATERIAL.dark, 1));
  c.fillStyle = well;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = withAlpha(MATERIAL.dark, 0.7);
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
}

/** The whole box, once. */
export function paintLabyrinth(c: Ctx, layout: MazeLayout): void {
  const { cs, w, h, walls, start, goal } = layout;
  const rng = mulberry32(0x1abc);
  woodGrain(c, rng, 0, 0, w, h, shade(MATERIAL.wood, 0.58), 72);
  // the shadow of every wall falls on the floor to the bottom right (one path, so overlaps do not darken twice)
  c.beginPath();
  for (const wall of walls) c.rect(wall.x + cs * 0.1, wall.y + cs * 0.14, wall.w, wall.h);
  c.fillStyle = withAlpha(MATERIAL.dark, 0.4);
  c.fill();
  // where the marble starts: a shallow dimple
  c.strokeStyle = withAlpha(MATERIAL.dark, 0.4);
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(start.x, start.y, cs * 0.36, 0, Math.PI * 2);
  c.stroke();
  hole(c, goal.x, goal.y, cs);
  // the walls: the top faces are lighter wood, cut from one piece of grain
  c.save();
  c.beginPath();
  for (const wall of walls) c.rect(wall.x, wall.y, wall.w, wall.h);
  c.clip();
  woodGrain(c, rng, 0, 0, w, h, MATERIAL.wood, 96);
  c.restore();
  const solid = new Set(walls.map((wall) => `${Math.round(wall.x / cs)},${Math.round(wall.y / cs)}`));
  const has = (cx: number, cy: number): boolean => solid.has(`${cx},${cy}`);
  const hi = withAlpha(tint(MATERIAL.wood, 0.5), 0.6);
  const lo = withAlpha(MATERIAL.dark, 0.55);
  const face = shade(MATERIAL.wood, 0.5);
  for (const wall of walls) {
    const cx = Math.round(wall.x / cs);
    const cy = Math.round(wall.y / cs);
    if (!has(cx, cy + 1)) { // the side of the wall that faces us, in shade
      c.fillStyle = face;
      c.fillRect(wall.x, wall.y + wall.h, wall.w, Math.max(3, cs * 0.12));
    }
    c.lineWidth = 1.6;
    c.beginPath();
    if (!has(cx, cy - 1)) { c.moveTo(wall.x, wall.y + 0.8); c.lineTo(wall.x + wall.w, wall.y + 0.8); }
    if (!has(cx - 1, cy)) { c.moveTo(wall.x + 0.8, wall.y); c.lineTo(wall.x + 0.8, wall.y + wall.h); }
    c.strokeStyle = hi;
    c.stroke();
    c.beginPath();
    if (!has(cx, cy + 1)) { c.moveTo(wall.x, wall.y + wall.h - 0.8); c.lineTo(wall.x + wall.w, wall.y + wall.h - 0.8); }
    if (!has(cx + 1, cy)) { c.moveTo(wall.x + wall.w - 0.8, wall.y); c.lineTo(wall.x + wall.w - 0.8, wall.y + wall.h); }
    c.strokeStyle = lo;
    c.stroke();
  }
  const nail = Math.max(2.4, cs * 0.1);
  for (const [x, y] of [[cs / 2, cs / 2], [w - cs / 2, cs / 2], [cs / 2, h - cs / 2], [w - cs / 2, h - cs / 2]] as const) rivet(c, x, y, nail);
}

/** The steel marble: a soft shadow that falls to the bottom right, a ball lit from the top left, a dark rim and a bright highlight. */
export function paintMarble(c: Ctx, x: number, y: number, r: number): void {
  softShadow(c, x + r * 0.5, y + r * 0.62, r * 1.0, r * 0.82, 0.4);
  const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r * 1.08);
  g.addColorStop(0, tint(MATERIAL.steel, 0.85));
  g.addColorStop(0.35, MATERIAL.steel);
  g.addColorStop(0.78, shade(MATERIAL.steel, 0.5));
  g.addColorStop(1, shade(MATERIAL.steel, 0.8));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = withAlpha(MATERIAL.dark, 0.6);
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = withAlpha(MATERIAL.light, 0.88);
  c.beginPath();
  c.ellipse(x - r * 0.4, y - r * 0.44, r * 0.3, r * 0.18, -0.7, 0, Math.PI * 2);
  c.fill();
}
