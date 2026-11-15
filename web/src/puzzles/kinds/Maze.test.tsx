// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { MAZES } from "@hauntology/shared/puzzles/mazes";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { mountKind, pointer, stubGeometry, type Mounted } from "../test-utils";
import Maze from "./Maze";
import { mazeCellSize, mazeLayout } from "./Maze-geometry";

type Arc = [number, number, number];
let arcs: Arc[] = [];
let images = 0;
let restoreGeo = (): void => {};
let restoreCanvas: unknown;
beforeEach(() => {
  restoreGeo = stubGeometry();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  arcs = [];
  images = 0;
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  restoreCanvas = proto.getContext;
  const noop = (): void => {};
  const c = new Proxy({}, {
    get: (t: Record<string, unknown>, k: string) => (k === "arc" ? (x: number, y: number, r: number) => { arcs.push([x, y, r]); } : k === "drawImage" ? () => { images++; } : k in t ? t[k] : noop),
    set: (t: Record<string, unknown>, k: string, v: unknown) => { t[k] = v; return true; },
  });
  proto.getContext = () => c;
});
afterEach(() => {
  cleanup();
  restoreGeo();
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = restoreCanvas;
  vi.useRealTimers();
});

function lockOf(level: Level, seed: number) {
  const lock = makeLock("maze", level, seed);
  if (lock.kind !== "maze") throw new Error("kind");
  return lock;
}
type M = Mounted<"maze">;
function advance(m: M, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    m.clock.ms += 16;
    act(() => { vi.advanceTimersByTime(16); });
  }
}
const board = (): Element => screen.getByRole("application", { name: /Maze/ });
const status = (): string => screen.getByRole("status").textContent ?? "";
const layoutOf = (grid: readonly string[]) => mazeLayout(grid, mazeCellSize(grid[0]?.length ?? 0, grid.length, window.innerHeight));
const ballAt = (grid: readonly string[]): { x: number; y: number } => {
  const r = layoutOf(grid).cs * 0.3;
  const a = arcs.filter((q) => Math.abs(q[2] - r) < 1e-6).at(-1);
  return { x: a?.[0] ?? -1, y: a?.[1] ?? -1 };
};

/** The cell centres from start to goal, shortest way (breadth first). */
function route(grid: readonly string[]): Array<{ x: number; y: number }> {
  const L = layoutOf(grid);
  const cell = (x: number, y: number) => ({ x: (x + 0.5) * L.cs, y: (y + 0.5) * L.cs });
  let from: [number, number] = [1, 1];
  let to: [number, number] = [1, 1];
  grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "S") from = [x, y]; if (ch === "G") to = [x, y]; }));
  const prev = new Map<string, string>();
  const queue: Array<[number, number]> = [from];
  const key = (x: number, y: number): string => `${x},${y}`;
  prev.set(key(...from), "");
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head] as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid[ny]?.[nx] === undefined || grid[ny]?.[nx] === "#" || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  const out: Array<{ x: number; y: number }> = [];
  for (let k = key(...to); k !== ""; k = prev.get(k) ?? "") { const [x, y] = k.split(",").map(Number) as [number, number]; out.unshift(cell(x, y)); }
  return out;
}

/** Hold a finger on the orb and pull it along the route, one cell at a time. */
function followRoute(m: M, grid: readonly string[]): void {
  const path = route(grid);
  const already = m.submits.length;
  const first = path[0] ?? { x: 0, y: 0 };
  pointer(board(), "pointerdown", first.x, first.y);
  for (const p of path.slice(1)) {
    pointer(board(), "pointermove", p.x, p.y);
    for (let guard = 0; guard < 150 && m.submits.length === already; guard++) {
      const b = ballAt(grid);
      if (Math.hypot(b.x - p.x, b.y - p.y) < 8) break;
      advance(m, 16);
    }
    if (m.submits.length > already) break;
  }
  pointer(board(), "pointerup", 0, 0);
}

describe("Maze", () => {
  it("draws the maze at a size that fits, with the orb at the start and the hit count in text", () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Maze, lock.view);
    advance(m, 32);
    const L = layoutOf(lock.view.grid);
    expect(ballAt(lock.view.grid).x).toBeCloseTo(L.start.x, 0);
    expect(ballAt(lock.view.grid).y).toBeCloseTo(L.start.y, 0);
    expect(status()).toBe("Walls hit: 0");
    expect(board().getAttribute("aria-label")).toMatch(/Maze/);
    expect((board() as HTMLElement).style.width).toBe(`${L.w}px`);
  });

  it("sizes cells between 24 and 40 units, smaller for a tall maze on a short screen", () => {
    expect(mazeCellSize(9, 11, 900)).toBe(40);
    expect(mazeCellSize(9, 13, 768)).toBe(38);
    expect(mazeCellSize(9, 13, 560)).toBe(24);
    expect(mazeCellSize(9, 13, 100)).toBe(24);
    expect(mazeCellSize(20, 11, 900)).toBe(24);
    expect(mazeCellSize(0, 0, 640)).toBeGreaterThanOrEqual(24);
    expect(mazeCellSize(9, 11, Number.NaN)).toBe(24);
    const L = mazeLayout(["###", "#S#", "#G#", "###"], 30);
    expect(L.walls.length).toBe(10);
    expect(L.start).toEqual({ x: 45, y: 45 });
    expect(L.goal).toEqual({ x: 45, y: 75 });
    expect(L.w).toBe(90);
    expect(L.h).toBe(120);
    const blank = mazeLayout(["...", "..."], 20); // no S or G: two corners
    expect(blank.start).toEqual({ x: 30, y: 30 });
  });

  it("is solved with touch alone on both levels: hold a finger along the way and the orb is pulled to the ring", () => {
    for (const level of ["easy", "medium"] as const) {
      for (const seed of [1, 4, 9]) {
        const lock = lockOf(level, seed);
        const m = mountKind(Maze, lock.view);
        m.clock.ms = 5000;
        followRoute(m, lock.view.grid);
        expect(m.submits.length, `${level} ${seed}`).toBe(1);
        const p = m.submits[0];
        expect(p?.reachedAtMs).toBeGreaterThanOrEqual(5000);
        expect(p?.reachedAtMs).toBeLessThanOrEqual(m.clock.ms);
        expect(verify(lock, { kind: "maze", ...p, elapsedMs: m.clock.ms + 100 }), `${level} ${seed}`).toEqual({ ok: true });
        const L = layoutOf(lock.view.grid);
        expect(Math.hypot(ballAt(lock.view.grid).x - L.goal.x, ballAt(lock.view.grid).y - L.goal.y)).toBeLessThan(L.cs * 0.4); // it really is at the ring
        expect(status()).toBe(`You reached the ring. Walls hit: ${p?.hits}`); // the answer carries the count the Player saw
        expect(m.announcements.at(-1)).toMatch(/reached the ring/);
        m.unmount();
      }
    }
  });

  it("bumps and buzzes on a wall hit, and counts the hits as text and in the answer", () => {
    const lock = lockOf("easy", 2);
    const grid = MAZES.easy[0] ?? lock.view.grid;
    const m = mountKind(Maze, { kind: "maze", grid });
    const L = layoutOf(grid);
    pointer(board(), "pointerdown", L.start.x, L.start.y);
    pointer(board(), "pointermove", L.start.x - 3 * L.cs, L.start.y); // pull hard into the left wall
    advance(m, 800);
    expect(m.feel.haptics.buzzes).toContain("bump");
    expect(m.feel.synth.played).toContain("bump");
    expect(status()).toMatch(/Walls hit: [1-9]/);
  });

  it("sends the number of wall hits in the answer, the same number the Player saw", () => {
    const lock = lockOf("easy", 2);
    const m = mountKind(Maze, lock.view);
    const grid = lock.view.grid;
    const L = layoutOf(grid);
    m.clock.ms = 5000;
    pointer(board(), "pointerdown", L.start.x, L.start.y);
    pointer(board(), "pointermove", L.start.x - 3 * L.cs, L.start.y); // hard into the wall first
    advance(m, 600);
    pointer(board(), "pointerup", 0, 0);
    const seen = Number(/Walls hit: (\d+)/.exec(status())?.[1]);
    expect(seen).toBeGreaterThan(0);
    followRoute(m, grid);
    expect(m.submits.length).toBe(1);
    const p = m.submits[0];
    expect(p?.hits).toBeGreaterThanOrEqual(seen);
    expect(status()).toBe(`You reached the ring. Walls hit: ${p?.hits}`);
    expect(verify(lock, { kind: "maze", ...p, elapsedMs: m.clock.ms + 100 })).toEqual({ ok: true });
  });

  it("rolls with the tilt when tilt is on, and ignores it when tilt is off", () => {
    const grid = MAZES.easy[1] ?? [];
    const on = mountKind(Maze, { kind: "maze", grid }, { tilt: "on" });
    const L = layoutOf(grid);
    on.feel.motion.setTilt(25, 0); // along the first corridor
    advance(on, 600);
    expect(ballAt(grid).x).toBeGreaterThan(L.start.x + 10);
    cleanup();
    arcs = [];
    const off = mountKind(Maze, { kind: "maze", grid }, { tilt: "off" });
    off.feel.motion.setTilt(25, 0);
    advance(off, 600);
    expect(ballAt(grid).x).toBeCloseTo(L.start.x, 0);
  });

  it("moves with the arrow keys, and stops when a key is lifted or focus leaves", () => {
    const grid = MAZES.easy[1] ?? [];
    const m = mountKind(Maze, { kind: "maze", grid });
    const L = layoutOf(grid);
    fireEvent.keyDown(board(), { key: "ArrowRight" });
    advance(m, 400);
    const x1 = ballAt(grid).x;
    expect(x1).toBeGreaterThan(L.start.x + 5);
    fireEvent.keyUp(board(), { key: "ArrowRight" });
    advance(m, 3000);
    const x2 = ballAt(grid).x;
    advance(m, 400);
    expect(Math.abs(ballAt(grid).x - x2)).toBeLessThan(1);
    fireEvent.keyDown(board(), { key: "ArrowLeft" });
    advance(m, 100);
    fireEvent.blur(board()); // focus leaves: the key counts as lifted
    advance(m, 3000); // it coasts to a stop
    const x3 = ballAt(grid).x;
    advance(m, 400);
    expect(Math.abs(ballAt(grid).x - x3)).toBeLessThan(1);
    expect(x3).toBeGreaterThan(x2 - 60); // and was not pushed all the way back by a key nobody holds
    fireEvent.keyDown(board(), { key: "q" }); // other keys do nothing
  });

  it("draws only while the orb moves, from a layer drawn once", () => {
    const grid = MAZES.easy[1] ?? [];
    const m = mountKind(Maze, { kind: "maze", grid });
    advance(m, 200);
    const before = images;
    expect(before).toBeGreaterThan(0);
    advance(m, 400);
    expect(images).toBe(before);
    fireEvent.keyDown(board(), { key: "ArrowDown" });
    advance(m, 100);
    expect(images).toBeGreaterThan(before);
  });

  it("sends the answer once, stops its frame loop at the ring, and starts again at the start when the host raises resetKey", () => {
    const lock = lockOf("easy", 5);
    const m = mountKind(Maze, lock.view);
    m.clock.ms = 5000;
    followRoute(m, lock.view.grid);
    expect(m.submits.length).toBe(1);
    advance(m, 200);
    expect(m.submits.length).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    m.reset(1);
    expect(status()).toBe("Walls hit: 0");
    expect(vi.getTimerCount()).toBe(1);
    advance(m, 32);
    const L = layoutOf(lock.view.grid);
    expect(ballAt(lock.view.grid).x).toBeCloseTo(L.start.x, 0);
    expect(ballAt(lock.view.grid).y).toBeCloseTo(L.start.y, 0);
    m.clock.ms += 5000;
    followRoute(m, lock.view.grid);
    expect(m.submits.length).toBe(2);
  });

  it("lets go of the orb when the touch ends or is cancelled, and ignores a move with nothing held", () => {
    const grid = MAZES.easy[1] ?? [];
    const m = mountKind(Maze, { kind: "maze", grid });
    const L = layoutOf(grid);
    pointer(board(), "pointermove", L.start.x + 100, L.start.y); // nothing held
    advance(m, 300);
    expect(ballAt(grid).x).toBeCloseTo(L.start.x, 0);
    pointer(board(), "pointerdown", L.start.x, L.start.y);
    pointer(board(), "pointermove", L.start.x + 4 * L.cs, L.start.y); // the far end of the first corridor
    advance(m, 100);
    pointer(board(), "pointercancel", 0, 0);
    advance(m, 3000); // let go: it coasts to a stop, it is not pulled on to the finger
    const x = ballAt(grid).x;
    expect(x).toBeLessThan(L.start.x + 4 * L.cs - 30);
    pointer(board(), "pointermove", L.start.x + 4 * L.cs, L.start.y); // after the cancel: not followed
    advance(m, 500);
    expect(Math.abs(ballAt(grid).x - x)).toBeLessThan(1);
  });

  it("copes with a phone that gives no canvas, and stops its frame loop when it unmounts", () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () => null;
    const grid = MAZES.easy[1] ?? [];
    const m = mountKind(Maze, { kind: "maze", grid }, { tilt: "on" });
    m.feel.motion.setTilt(0, 20);
    advance(m, 100);
    expect(status()).toMatch(/Walls hit/);
    m.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
