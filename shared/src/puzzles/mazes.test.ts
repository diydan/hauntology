import { describe, expect, it } from "vitest";
import { MAZES, mazeSolvable } from "./mazes";

describe("mazes", () => {
  it("are all solvable, 9 wide, with one start and one goal and a wall all round", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      expect(MAZES[level].length).toBeGreaterThanOrEqual(2);
      for (const grid of MAZES[level]) {
        expect(mazeSolvable(grid)).toBe(true);
        expect(grid.length).toBe({ easy: 11, medium: 13, hard: 15 }[level]);
        expect(grid.every((row) => row.length === 9)).toBe(true);
        expect(grid.join("").split("S")).toHaveLength(2);
        expect(grid.join("").split("G")).toHaveLength(2);
        expect(grid[0]).toBe("#########");
        expect(grid.at(-1)).toBe("#########");
        expect(grid.every((row) => row.startsWith("#") && row.endsWith("#"))).toBe(true);
      }
    }
  });

  it("the search says no for a closed-off goal and for a missing start", () => {
    expect(mazeSolvable(["#####", "#S#G#", "#####"])).toBe(false);
    expect(mazeSolvable(["#####", "#..G#", "#####"])).toBe(false);
    expect(mazeSolvable(["#####", "#S.G#", "#####"])).toBe(true);
  });
});
