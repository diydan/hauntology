// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { mountKind, pointer, stubGeometry, type Mounted } from "../test-utils";
import LockPick from "./LockPick";

let restore = (): void => {};
beforeEach(() => {
  restore = stubGeometry();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("lockpick", level, seed);
  if (lock.kind !== "lockpick") throw new Error("kind");
  return lock;
}
type M = Mounted<"lockpick">;
/** Let `ms` of frames pass (16 ms each) and keep the host's clock in step. */
function advance(m: M, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    m.clock.ms += 16;
    act(() => { vi.advanceTimersByTime(16); });
  }
}
const slider = (): HTMLInputElement => screen.getByRole("slider", { name: /^Pick position/ }) as HTMLInputElement;
const tensionButton = (): Element => screen.getByRole("button", { name: /Tension/ });
const slideTo = (deg: number): void => { fireEvent.change(slider(), { target: { value: String(deg) } }); };
const heat = (): string => document.querySelector(".pz-heat")?.textContent ?? "";
const pinStates = (): string[] => [...document.querySelectorAll(".pz-pin")].map((p) => p.querySelector(".pz-sr")?.textContent?.split(": ")[1] ?? "");
/** A spot `dist` degrees from `c`, on the side that stays inside the slider's range. */
const away = (c: number, dist: number): number => (c > 0 ? c - dist : c + dist);
const holdTension = (): void => pointer(tensionButton(), "pointerdown");
const releaseTension = (): void => pointer(tensionButton(), "pointerup");

/** Solve every pin with touch: slide to the pin's centre while holding the tension. */
function solveByTouchFrom(m: M, centers: readonly number[], first: number): void {
  for (const c of centers.slice(first)) {
    slideTo(c);
    advance(m, 480);
  }
}
function solveByTouch(m: M, centers: readonly number[]): void {
  holdTension();
  solveByTouchFrom(m, centers, 0);
}

describe("LockPick", () => {
  it("starts with every pin waiting but the first, and says to hold the tension", () => {
    const lock = lockOf("normal", 3);
    mountKind(LockPick, lock.view);
    expect(pinStates()).toEqual(["picking", ...Array<string>(lock.view.pins - 1).fill("waiting")]);
    expect(heat()).toMatch(/Hold Tension/);
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
    expect(slider().getAttribute("min")).toBe(String(lock.view.range[0]));
    expect(slider().getAttribute("max")).toBe(String(lock.view.range[1]));
  });

  it("is solved with touch alone on both levels: slide to each pin's sweet spot, and the shared checker accepts it", () => {
    for (const level of ["easy", "normal"] as const) {
      for (const seed of [1, 8, 20, 99]) {
        const lock = lockOf(level, seed);
        const m = mountKind(LockPick, lock.view);
        solveByTouch(m, lock.secret.centers);
        expect(m.submits.length, `${level} ${seed}`).toBe(1);
        const p = m.submits[0];
        expect(p?.sets.map((s) => s.pin)).toEqual(lock.secret.centers.map((_, i) => i));
        expect(verify(lock, { kind: "lockpick", ...p, elapsedMs: Math.max(m.clock.ms, 20_000) }), `${level} ${seed}`).toEqual({ ok: true });
        m.unmount();
      }
    }
  });

  it("needs the tension: in the window with no tension nothing sets, and the slider touch is the tension", () => {
    const lock = lockOf("easy", 2);
    const m = mountKind(LockPick, lock.view);
    slideTo(lock.secret.centers[0] ?? 0);
    advance(m, 1000);
    expect(pinStates()[0]).toBe("picking");
    pointer(slider(), "pointerdown"); // a finger on the slider holds the tension
    expect(tensionButton().getAttribute("aria-pressed")).toBe("true");
    advance(m, 480);
    expect(pinStates()[0]).toBe("set");
    pointer(slider(), "pointerup");
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("sets a pin only after the dwell time inside its window, and leaving the window starts the count again", () => {
    const lock = lockOf("easy", 5);
    const m = mountKind(LockPick, lock.view);
    const c = lock.secret.centers[0] ?? 0;
    holdTension();
    slideTo(c);
    advance(m, 300); // 300 of 400 ms
    expect(pinStates()[0]).toBe("picking");
    slideTo(away(c, lock.view.windowDeg)); // out of the window
    advance(m, 100);
    slideTo(c);
    advance(m, 300); // starts from zero again
    expect(pinStates()[0]).toBe("picking");
    advance(m, 160);
    expect(pinStates()[0]).toBe("set");
  });

  it("records the sets at least one dwell apart on the host's clock, even when that clock runs a little behind the frames", () => {
    const lock = lockOf("easy", 14);
    const m = mountKind(LockPick, lock.view);
    holdTension();
    slideTo(lock.secret.centers[0] ?? 0);
    advance(m, 480);
    expect(pinStates()[0]).toBe("set");
    slideTo(lock.secret.centers[1] ?? 0);
    for (let i = 0; i < 26; i++) { m.clock.ms += 10; act(() => { vi.advanceTimersByTime(16); }); } // 416 ms of frames, 260 ms of host clock
    expect(pinStates()[1]).toBe("picking"); // the frames say the dwell is done, the host's clock does not: wait
    advance(m, 160);
    expect(pinStates()[1]).toBe("set");
    solveByTouchFrom(m, lock.secret.centers, 2);
    const p = m.submits[0];
    expect(p?.sets.slice(1).every((s, i) => s.atMs - (p?.sets[i]?.atMs ?? 0) >= lock.view.dwellMs)).toBe(true);
    expect(verify(lock, { kind: "lockpick", ...p, elapsedMs: Math.max(m.clock.ms, 20_000) })).toEqual({ ok: true });
  });

  it("releasing the tension drops the count", () => {
    const lock = lockOf("normal", 6);
    const m = mountKind(LockPick, lock.view);
    holdTension();
    slideTo(lock.secret.centers[0] ?? 0);
    advance(m, 300);
    releaseTension();
    advance(m, 300);
    holdTension();
    advance(m, 300);
    expect(pinStates()[0]).toBe("picking");
    advance(m, 160);
    expect(pinStates()[0]).toBe("set");
  });

  it("counts a spot just inside the window's edge, and not a spot just outside it", () => {
    for (const level of ["easy", "normal"] as const) {
      const lock = lockOf(level, 6);
      const half = lock.view.windowDeg / 2;
      const c = lock.secret.centers[0] ?? 0;
      const m = mountKind(LockPick, lock.view);
      holdTension();
      slideTo(away(c, half + 0.5));
      advance(m, 800);
      expect(pinStates()[0], `${level} outside`).toBe("picking");
      slideTo(away(c, half - 0.5));
      advance(m, 480);
      expect(pinStates()[0], `${level} inside`).toBe("set");
      m.unmount();
    }
  });

  it("sets the pins in order: a later pin's window does nothing until its turn", () => {
    const lock = lockOf("normal", 6);
    const m = mountKind(LockPick, lock.view);
    const c0 = lock.secret.centers[0] ?? 0;
    const far = lock.secret.centers.findIndex((c, i) => i > 0 && Math.abs(c - c0) > lock.view.windowDeg + 1);
    expect(far).toBeGreaterThan(0);
    holdTension();
    slideTo(lock.secret.centers[far] ?? 0);
    advance(m, 1000);
    expect(pinStates()[0]).toBe("picking");
    expect(pinStates()[far]).toBe("waiting");
  });

  it("buzzes and sounds a click on entering the window, hot and cold ticks that follow the distance, and a thunk when a pin sets", () => {
    const lock = lockOf("easy", 7);
    const m = mountKind(LockPick, lock.view);
    const c = lock.secret.centers[0] ?? 0;
    holdTension();
    slideTo(away(c, 30));
    advance(m, 64);
    const far = m.feel.haptics.hotColds.at(-1);
    expect(far?.[0]).toBeCloseTo(30, 0);
    expect(far?.[1]).toBe(lock.view.windowDeg);
    expect(heat()).toBe("Cold");
    slideTo(away(c, 20));
    advance(m, 32);
    expect(heat()).toBe("Cool");
    slideTo(away(c, 10));
    advance(m, 32);
    expect(heat()).toBe("Warm");
    expect(m.feel.haptics.buzzes).not.toContain("click");
    slideTo(c);
    advance(m, 32);
    expect(heat()).toMatch(/^Hot/);
    expect(m.feel.haptics.buzzes).toContain("click");
    expect(m.feel.synth.played).toContain("click");
    expect(m.feel.haptics.hotColds.at(-1)?.[0]).toBe(0);
    advance(m, 450);
    expect(m.feel.haptics.buzzes).toContain("thunk");
    expect(m.feel.synth.played).toContain("thunk");
    slideTo(away(lock.secret.centers[1] ?? 0, 40)); // pin 1 is the turn now: a far spot reads as cold
    advance(m, 32);
    expect(heat()).toBe("Cold");
  });

  it("follows the tilt while the tension is held, and ignores it when the tension is not", () => {
    const lock = lockOf("easy", 9);
    const m = mountKind(LockPick, lock.view, { tilt: "on" });
    const [lo, hi] = lock.view.range;
    const c = lock.secret.centers[0] ?? 0;
    const tiltFor = (deg: number): number => ((deg - lo) / (hi - lo)) * 90 - 45; // the inverse of the shared mapping
    m.feel.motion.setTilt(tiltFor(c), 0);
    advance(m, 800); // no tension: the pick does not move and nothing sets
    expect(pinStates()[0]).toBe("picking");
    expect(Number(slider().value)).toBe(0);
    holdTension();
    advance(m, 32);
    expect(Number(slider().value)).toBeCloseTo(c, 3);
    advance(m, 480);
    expect(pinStates()[0]).toBe("set");
    m.feel.motion.setTilt(tiltFor(lock.secret.centers[1] ?? 0), 0);
    advance(m, 480);
    expect(pinStates().slice(0, 2)).toEqual(["set", "set"]);
  });

  it("holds the tension from a keyboard or screen reader (a click with no pointer), and a finger's click does not flip it", () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(LockPick, lock.view);
    fireEvent.click(tensionButton(), { detail: 1 });
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tensionButton());
    expect(tensionButton().getAttribute("aria-pressed")).toBe("true");
    slideTo(lock.secret.centers[0] ?? 0);
    advance(m, 480);
    expect(pinStates()[0]).toBe("set");
    fireEvent.click(tensionButton());
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("lets go of the tension when the touch is cancelled", () => {
    const m = mountKind(LockPick, lockOf("easy", 3).view);
    holdTension();
    expect(tensionButton().getAttribute("aria-pressed")).toBe("true");
    pointer(tensionButton(), "pointercancel");
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
    pointer(slider(), "pointerdown");
    pointer(slider(), "pointercancel");
    expect(tensionButton().getAttribute("aria-pressed")).toBe("false");
    advance(m, 64);
  });

  it("starts the pins again when the host raises resetKey, and the second try is accepted too", () => {
    const lock = lockOf("easy", 11);
    const m = mountKind(LockPick, lock.view);
    solveByTouch(m, lock.secret.centers);
    expect(m.submits.length).toBe(1);
    m.reset(1);
    expect(pinStates()[0]).toBe("picking");
    solveByTouch(m, lock.secret.centers);
    expect(m.submits.length).toBe(2);
    expect(verify(lock, { kind: "lockpick", ...m.submits[1], elapsedMs: Math.max(m.clock.ms, 20_000) })).toEqual({ ok: true });
  });

  it("stops its frame loop when it unmounts, and when the last pin is set", () => {
    const lock = lockOf("easy", 12);
    const m = mountKind(LockPick, lock.view);
    solveByTouch(m, lock.secret.centers);
    expect(m.submits.length).toBe(1);
    const calls = m.feel.haptics.hotColds.length;
    advance(m, 200); // done: no more hot and cold, and no frame is asked for any more
    expect(m.feel.haptics.hotColds.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
    m.reset(1); // a new Attempt starts the frame loop again
    expect(vi.getTimerCount()).toBe(1);
    m.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the pins without a fade when the Player prefers reduced motion", () => {
    mountKind(LockPick, lockOf("easy", 2).view, { reducedMotion: true });
    expect(screen.getByRole("list", { name: "Pins" }).classList.contains("pz-pins-still")).toBe(true);
    cleanup();
    mountKind(LockPick, lockOf("easy", 2).view);
    expect(screen.getByRole("list", { name: "Pins" }).classList.contains("pz-pins-still")).toBe(false);
  });

  it("is accessible: the controls are named, and the pin states are text", () => {
    mountKind(LockPick, lockOf("normal", 2).view);
    expect(screen.getByRole("list", { name: "Pins" })).toBeTruthy();
    expect(screen.getByLabelText("Pick position: slide left or right")).toBe(slider()); // a visible label, not a hidden one
    expect(document.querySelector(".pz-track")).toBeNull(); // one position control, not two
    expect(tensionButton().textContent).toMatch(/Tension/);
    expect(pinStates().every((s) => s.length > 0)).toBe(true);
  });
});
