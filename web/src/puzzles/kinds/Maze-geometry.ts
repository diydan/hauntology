import type { Wall } from "@hauntology/shared/puzzles/tilt-ball";

/** The size of one maze cell in logical units: as big as the screen allows, between 24 and 40. */
export function mazeCellSize(cols: number, rows: number, viewportHeight: number): number {
  const fit = Math.min(360 / Math.max(1, cols), (viewportHeight - 270) / Math.max(1, rows));
  return Math.round(Math.min(40, Math.max(24, Number.isFinite(fit) ? fit : 24)));
}

export type MazeLayout = Readonly<{
  cs: number;
  w: number;
  h: number;
  walls: readonly Wall[];
  start: Readonly<{ x: number; y: number }>;
  goal: Readonly<{ x: number; y: number }>;
}>;

/** Walls, start and goal of a grid: `#` is wall, `S` the start, `G` the goal. A grid with no start or goal puts them in two corners. */
export function mazeLayout(grid: readonly string[], cs: number): MazeLayout {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const walls: Wall[] = [];
  let start = { x: 1.5 * cs, y: 1.5 * cs };
  let goal = { x: (cols - 1.5) * cs, y: (rows - 1.5) * cs };
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.push({ x: x * cs, y: y * cs, w: cs, h: cs });
      if (ch === "S") start = { x: (x + 0.5) * cs, y: (y + 0.5) * cs };
      if (ch === "G") goal = { x: (x + 0.5) * cs, y: (y + 0.5) * cs };
    });
  });
  return { cs, w: cols * cs, h: rows * cs, walls, start, goal };
}
