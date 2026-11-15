import type { Level } from "./types";

/**
 * Five authored mazes (frozen output of a seeded backtracker, with a few walls knocked out for easy): `#` is wall,
 * `S` the start and `G` the goal. Easy ones are 9 by 11, normal ones 9 by 13.
 */
export const MAZES: Readonly<Record<Level, readonly (readonly string[])[]>> = {
  easy: [
    ["#########", "#S#.....#", "#.#.#.###", "#.#.#...#", "#.#.#.#.#", "#.#...#.#", "#.#.###.#", "#.#...#.#", "#.#.#.#.#", "#...#..G#", "#########"],
    ["#########", "#S....#.#", "#####.#.#", "#.....#.#", "#.#.#.#.#", "#...#...#", "#.#####.#", "#.....#.#", "#.###.#.#", "#...#..G#", "#########"],
  ],
  normal: [
    ["#########", "#S......#", "#######.#", "#...#...#", "###.#.###", "#...#.#.#", "#.###.#.#", "#.#...#.#", "#.#.###.#", "#.#.#...#", "#.#.###.#", "#......G#", "#########"],
    ["#########", "#S#.....#", "#.#####.#", "#.......#", "#######.#", "#.....#.#", "#.###.#.#", "#...#...#", "###.#####", "#...#...#", "#.###.#.#", "#.....#G#", "#########"],
    ["#########", "#S....#.#", "#####.#.#", "#...#...#", "###.###.#", "#...#...#", "#.###.###", "#...#.#.#", "#.#.#.#.#", "#.#.#.#.#", "#.#.#.#.#", "#.#....G#", "#########"],
  ],
};

/** Breadth-first search over open cells: can the goal be reached from the start? */
export function mazeSolvable(grid: readonly string[]): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  let start: [number, number] | null = null;
  let goal: [number, number] | null = null;
  grid.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "S") start = [x, y];
    if (c === "G") goal = [x, y];
  }));
  if (start === null || goal === null) return false;
  const [gx, gy] = goal as [number, number];
  const seen = new Set<string>([`${(start as [number, number])[0]},${(start as [number, number])[1]}`]);
  const queue: Array<[number, number]> = [start as [number, number]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head] as [number, number];
    if (x === gx && y === gy) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || grid[ny]?.[nx] === "#" || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return false;
}
