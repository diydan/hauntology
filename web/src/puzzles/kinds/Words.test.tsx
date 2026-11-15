// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { mountKind, pointer, stubGeometry, type Mounted } from "../test-utils";
import Words from "./Words";

const WALL = 320;
let gradients: Array<[number, number]> = [];
let fills = 0;
let restoreGeo = (): void => {};
let restoreCanvas: unknown;
beforeEach(() => {
  restoreGeo = stubGeometry();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  gradients = [];
  fills = 0;
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  restoreCanvas = proto.getContext;
  const noop = (): void => {};
  const c = new Proxy({}, {
    get: (t: Record<string, unknown>, k: string) => (k === "createRadialGradient" ? (x: number, y: number) => { gradients.push([x, y]); return { addColorStop: noop }; } : k === "fillRect" ? () => { fills++; } : k === "createLinearGradient" ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop),
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
  const lock = makeLock("words", level, seed);
  if (lock.kind !== "words") throw new Error("kind");
  return lock;
}
type M = Mounted<"words">;
function advance(m: M, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    m.clock.ms += 16;
    act(() => { vi.advanceTimersByTime(16); });
  }
}
const wall = (): Element => screen.getByRole("application", { name: /Dark wall/ });
const slots = (): string => [...(screen.getByRole("img", { name: /Letters so far/ }).children)].map((s) => s.textContent).join("");
const litText = (): string => document.querySelector(".pz-lit")?.textContent ?? "";
const pickButton = (): HTMLButtonElement => screen.getByRole("button", { name: /^Pick/ }) as HTMLButtonElement;
const beamAt = (): { x: number; y: number } => { const g = gradients.at(-1); return { x: g?.[0] ?? -1, y: g?.[1] ?? -1 }; };
const spot = (lock: ReturnType<typeof lockOf>, i: number) => ({ x: (lock.view.letters[i]?.x ?? 0) * WALL, y: (lock.view.letters[i]?.y ?? 0) * WALL });

/** Pull the torch to a spot with a finger (press, pull past the slop, lift): this never picks anything. */
function aim(m: M, x: number, y: number): void {
  pointer(wall(), "pointerdown", x, y);
  pointer(wall(), "pointermove", x + 14, y);
  pointer(wall(), "pointermove", x, y);
  pointer(wall(), "pointerup", x, y);
  advance(m, 480);
}
const tap = (x: number, y: number): void => { pointer(wall(), "pointerdown", x, y); pointer(wall(), "pointerup", x, y); };

describe("Words", () => {
  it("starts with a dark wall: no letter lit, nothing picked, every control named", () => {
    const lock = lockOf("medium", 3);
    mountKind(Words, lock.view);
    expect(litText()).toBe("No letter is lit");
    expect(slots()).toBe("·".repeat(lock.view.n));
    expect(pickButton().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(wall().getAttribute("aria-label")).toMatch(/hidden letters/);
  });

  it("is solved with touch alone on both levels: aim the torch, tap each lit letter in reading order, and the shared checker accepts it", () => {
    for (const level of ["easy", "medium"] as const) {
      for (const seed of [1, 6, 19, 250]) {
        const lock = lockOf(level, seed);
        const m = mountKind(Words, lock.view);
        for (const i of lock.secret.order) {
          const p = spot(lock, i);
          aim(m, p.x, p.y);
          tap(p.x, p.y);
        }
        expect(m.submits.length, `${level} ${seed}`).toBe(1);
        expect(m.submits[0]).toEqual({ letters: [...lock.secret.order] });
        expect(verify(lock, { kind: "words", ...m.submits[0], elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        expect(slots()).toBe(lock.secret.word);
        m.unmount();
      }
    }
  });

  it("is also solved with the Pick button: it picks the lit letter nearest the middle of the beam", () => {
    const lock = lockOf("medium", 12);
    const m = mountKind(Words, lock.view);
    for (const i of lock.secret.order) {
      const p = spot(lock, i);
      aim(m, p.x, p.y);
      expect(pickButton().textContent).toBe(`Pick ${lock.view.letters[i]?.ch}`);
      fireEvent.click(pickButton());
    }
    expect(verify(lock, { kind: "words", ...m.submits[0], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("only picks a letter the torch lights: a tap on a letter in the dark does nothing", () => {
    const lock = lockOf("easy", 4);
    const m = mountKind(Words, lock.view);
    const far = lock.view.letters.findIndex((_, i) => Math.hypot(spot(lock, i).x - WALL / 2, spot(lock, i).y - WALL / 2) > 110);
    expect(far).toBeGreaterThanOrEqual(0);
    const p = spot(lock, far);
    tap(p.x, p.y);
    expect(slots()).toBe("·".repeat(lock.view.n));
    advance(m, 16);
    expect(m.feel.haptics.buzzes).not.toContain("click");
  });

  it("buzzes and sounds a click when a letter is picked, and a tick once when a letter comes into the beam", () => {
    const lock = lockOf("easy", 5);
    const m = mountKind(Words, lock.view);
    const i = lock.secret.order[0] ?? 0;
    const p = spot(lock, i);
    aim(m, p.x, p.y);
    const ticks = (): number => m.feel.haptics.buzzes.filter((b) => b === "tick").length;
    expect(ticks()).toBeGreaterThanOrEqual(1);
    const before = ticks();
    advance(m, 400); // it stays in the beam: no more ticks
    expect(ticks()).toBe(before);
    expect(m.feel.synth.played).toContain("tick");
    tap(p.x, p.y);
    expect(m.feel.haptics.buzzes.at(-1)).toBe("click");
    expect(m.feel.synth.played.at(-1)).toBe("click");
    // away and back again ticks again
    aim(m, WALL - 10, WALL - 10);
    aim(m, p.x, p.y);
    expect(ticks()).toBeGreaterThan(before);
  });

  it("does not pick a letter twice, and an order that is wrong is sent as given", () => {
    const lock = lockOf("easy", 8);
    const m = mountKind(Words, lock.view);
    const wrongOrder = [...lock.secret.order].reverse();
    const first = spot(lock, wrongOrder[0] ?? 0);
    aim(m, first.x, first.y);
    tap(first.x, first.y);
    tap(first.x, first.y); // already picked: ignored
    expect(m.announcements.length).toBe(1);
    expect(pickButton().disabled).toBe(true); // nothing else is lit
    for (const i of wrongOrder.slice(1)) { const p = spot(lock, i); aim(m, p.x, p.y); tap(p.x, p.y); }
    expect(m.submits).toEqual([{ letters: wrongOrder }]);
    expect(verify(lock, { kind: "words", ...m.submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    m.reset(1);
    expect(slots()).toBe("·".repeat(lock.view.n));
    for (const i of lock.secret.order) { const p = spot(lock, i); aim(m, p.x, p.y); tap(p.x, p.y); }
    expect(verify(lock, { kind: "words", ...m.submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("takes no more letters once the word is full, and Clear starts the letters again", () => {
    const lock = lockOf("easy", 9);
    const m = mountKind(Words, lock.view);
    for (const i of lock.secret.order) { const p = spot(lock, i); aim(m, p.x, p.y); tap(p.x, p.y); }
    expect(m.submits.length).toBe(1);
    expect(m.announcements.length).toBe(lock.view.n);
    expect(pickButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(slots()).toBe("·".repeat(lock.view.n));
  });

  it("lights the wall and warms it with one torch: the mask that keeps only the beam's part of the lit wall and the warm halo are both centred on the beam", () => {
    const m = mountKind(Words, lockOf("easy", 6).view, { tilt: "on" });
    m.feel.motion.setTilt(30, -20);
    advance(m, 800);
    const [mask, halo] = gradients.slice(-2);
    expect(mask).toEqual(halo);
    expect(mask?.[0]).toBeCloseTo(beamAt().x, 5);
    expect(mask?.[1]).toBeCloseTo(beamAt().y, 5);
    expect(beamAt().x).toBeGreaterThan(WALL / 2 + 20); // and the beam really has moved
  });

  it("sweeps the torch with the tilt, and ignores the tilt when it is off or a finger is on the wall", () => {
    const m = mountKind(Words, lockOf("easy", 6).view, { tilt: "on" });
    m.feel.motion.setTilt(45, -45);
    advance(m, 800);
    expect(beamAt().x).toBeGreaterThan(WALL - 20);
    expect(beamAt().y).toBeLessThan(20);
    m.feel.motion.setTilt(-45, 45);
    advance(m, 800);
    expect(beamAt().x).toBeLessThan(20);
    expect(beamAt().y).toBeGreaterThan(WALL - 20);
    pointer(wall(), "pointerdown", 160, 160); // a finger takes the torch from the tilt
    advance(m, 800);
    expect(beamAt().x).toBeCloseTo(160, 0);
    expect(beamAt().y).toBeCloseTo(160, 0);
    pointer(wall(), "pointerup", 160, 160);
    cleanup();

    const off = mountKind(Words, lockOf("easy", 6).view, { tilt: "off" });
    off.feel.motion.setTilt(45, -45);
    advance(off, 400);
    expect(beamAt().x).toBeCloseTo(160, 0);
    expect(beamAt().y).toBeCloseTo(160, 0);
  });

  it("eases the beam to the target at the same speed on a slow or a fast screen", () => {
    vi.useRealTimers(); // this test drives the frames itself, at the rate it chooses
    const run = (stepMs: number): number => {
      cleanup();
      const queue: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { queue.push(cb); return queue.length; });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      const m = mountKind(Words, lockOf("easy", 6).view);
      pointer(wall(), "pointerdown", 40, 40);
      pointer(wall(), "pointermove", 54, 40);
      pointer(wall(), "pointermove", 40, 40);
      let t = performance.now();
      for (let done = 0; done < 160; done += stepMs) {
        t += stepMs;
        const callbacks = queue.splice(0);
        act(() => { for (const cb of callbacks) cb(t); });
      }
      m.unmount();
      vi.unstubAllGlobals();
      return beamAt().x;
    };
    const fast = run(16);
    const slow = run(32);
    expect(fast).toBeLessThan(60); // it has nearly arrived at x = 40 from the middle
    expect(Math.abs(fast - slow)).toBeLessThan(8);
  });

  it("shows the letters faintly all the time with Assist on, so they can be picked without the torch", () => {
    const lock = lockOf("easy", 4);
    const m = mountKind(Words, lock.view, { assist: true });
    const far = lock.view.letters.findIndex((_, i) => Math.hypot(spot(lock, i).x - WALL / 2, spot(lock, i).y - WALL / 2) > 110);
    const p = spot(lock, far);
    tap(p.x, p.y);
    expect(slots().includes(lock.view.letters[far]?.ch ?? "?")).toBe(true);
    expect(m.feel.haptics.buzzes.at(-1)).toBe("click");
  });

  it("can be played from the keyboard: arrow keys aim the torch, Enter picks the lit letter", () => {
    const lock = lockOf("easy", 2);
    const m = mountKind(Words, lock.view);
    const i = lock.secret.order[0] ?? 0;
    const p = spot(lock, i);
    let guard = 0;
    while (Math.abs(beamAt().x - p.x) > 12 && guard++ < 40) { fireEvent.keyDown(wall(), { key: p.x > beamAt().x ? "ArrowRight" : "ArrowLeft" }); advance(m, 200); }
    guard = 0;
    while (Math.abs(beamAt().y - p.y) > 12 && guard++ < 40) { fireEvent.keyDown(wall(), { key: p.y > beamAt().y ? "ArrowDown" : "ArrowUp" }); advance(m, 200); }
    expect(litText()).toBe(`Lit: ${lock.view.letters[i]?.ch}`);
    fireEvent.keyDown(wall(), { key: "Enter" });
    expect(slots()[0]).toBe(lock.view.letters[i]?.ch);
    fireEvent.keyDown(wall(), { key: "x" }); // other keys do nothing
    expect(slots().slice(1).includes("·") || lock.view.n === 1).toBe(true);
  });

  it("draws only when something changed, and ends a drag when the touch is cancelled", () => {
    const m = mountKind(Words, lockOf("easy", 6).view);
    advance(m, 400);
    const before = fills;
    expect(before).toBeGreaterThan(0);
    advance(m, 400);
    expect(fills).toBe(before);
    pointer(wall(), "pointermove", 20, 20); // nothing held: the torch does not follow
    advance(m, 200);
    expect(fills).toBe(before);
    pointer(wall(), "pointerdown", 100, 100);
    pointer(wall(), "pointermove", 130, 100);
    pointer(wall(), "pointercancel", 130, 100);
    pointer(wall(), "pointermove", 250, 250); // after the cancel: not followed
    advance(m, 600);
    expect(beamAt().x).toBeCloseTo(130, 0);
  });

  it("copes with a phone that gives no canvas, and stops its frame loop when it unmounts", () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () => null;
    const lock = lockOf("easy", 3);
    const m = mountKind(Words, lock.view, { tilt: "on" });
    m.feel.motion.setTilt(10, 10);
    advance(m, 100);
    expect(slots()).toBe("·".repeat(lock.view.n));
    m.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
