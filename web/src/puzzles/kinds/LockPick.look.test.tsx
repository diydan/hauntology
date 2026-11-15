// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { LIFT, PICK_MAX, SLICE } from "../art/lock";
import { mountKind, pointer, stubGeometry, type Mounted } from "../test-utils";
import LockPick from "./LockPick";

// The look of the lock while it is played: a pin-tumbler cylinder in cut-away, the pin being picked following the pick, the set pins up on the shear line.
let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] }); });
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); });

const lockOf = (seed: number) => { const l = makeLock("lockpick", "medium", seed); if (l.kind !== "lockpick") throw new Error("kind"); return l; };
const advance = (m: Mounted<"lockpick">, ms: number): void => { for (let t = 0; t < ms; t += 16) { m.clock.ms += 16; act(() => { vi.advanceTimersByTime(16); }); } };
const slider = (): HTMLInputElement => screen.getByRole("slider", { name: /^Pick position/ }) as HTMLInputElement;
const lift = (i: number): number => {
  const t = document.querySelectorAll(".pz-pin")[i]?.querySelector<SVGGElement>(".pz-key-stack")?.style.transform ?? "";
  return Math.abs(Number(/translateY\((-?[\d.]+)px\)/.exec(t)?.[1])); // how far up, units
};
const pickD = (): string => document.querySelector(".pz-pick path.pz-rod-pick")?.getAttribute("d") ?? "";

describe("the lock pick, as a lock", () => {
  it("draws one pin to a pin in a cylinder, and the pins stay named for a screen reader", () => {
    const lock = lockOf(3);
    mountKind(LockPick, lock.view);
    expect(document.querySelectorAll(".pz-pin svg.pz-lock-slice")).toHaveLength(lock.view.pins);
    expect(document.querySelectorAll(".pz-pin .pz-sr")).toHaveLength(lock.view.pins);
    expect(document.querySelector(".pz-lock")?.getAttribute("style")).toContain(`--n: ${lock.view.pins}`);
    expect(screen.getByRole("list", { name: "Pins" })).toBeTruthy();
    expect(document.querySelector(".pz-lock-tools")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("the pin being picked rises and falls with the slider, never to the shear line; the waiting ones stay down", () => {
    const lock = lockOf(3);
    const [lo, hi] = lock.view.range;
    mountKind(LockPick, lock.view);
    expect(lift(1)).toBe(0);
    fireEvent.change(slider(), { target: { value: String(hi) } });
    expect(lift(0)).toBeCloseTo(LIFT * PICK_MAX, 5);
    expect(lift(0)).toBeLessThan(LIFT);
    fireEvent.change(slider(), { target: { value: String(lo) } });
    expect(lift(0)).toBeCloseTo(0, 5);
    expect(lift(1)).toBe(0);
    expect(lift(lock.view.pins - 1)).toBe(0);
  });

  it("the pick follows the pin being picked: under the first at the start, and the tip rises with the pin", () => {
    const lock = lockOf(3);
    const [, hi] = lock.view.range;
    mountKind(LockPick, lock.view);
    const low = pickD();
    expect(low.startsWith(`M ${28} `)).toBe(true);
    fireEvent.change(slider(), { target: { value: String(hi) } });
    const high = pickD();
    expect(high.startsWith("M 28 ")).toBe(true);
    expect(Number(/^M 28 ([\d.]+)/.exec(high)?.[1])).toBeLessThan(Number(/^M 28 ([\d.]+)/.exec(low)?.[1])); // the tip is higher
  });

  it("a set pin goes up to the shear line with a click, the pick moves on to the next pin, and the heat colours the bore of the pin being picked", () => {
    const lock = lockOf(3);
    const m = mountKind(LockPick, lock.view);
    const c0 = lock.secret.centers[0] ?? 0;
    pointer(screen.getByRole("button", { name: /Tension/ }), "pointerdown");
    fireEvent.change(slider(), { target: { value: String(c0) } });
    advance(m, 480);
    expect(document.querySelectorAll(".pz-pin-set")).toHaveLength(1);
    expect(lift(0)).toBe(LIFT); // exactly on the shear line
    expect(lift(1)).toBeGreaterThanOrEqual(0);
    expect(pickD().startsWith(`M ${SLICE + 28} `)).toBe(true);
    expect(document.querySelector("ol.pz-pins")?.getAttribute("data-heat")).toMatch(/^(idle|cold|cool|warm|hot)$/);
    fireEvent.change(slider(), { target: { value: String(lock.secret.centers[1] ?? 0) } });
    advance(m, 100);
    expect(document.querySelector("ol.pz-pins")?.getAttribute("data-heat")).toBe("hot");
  });

  it("no longer draws the old bars: a pin is a spring, a driver pin and a key pin in a bore", () => {
    mountKind(LockPick, lockOf(3).view);
    expect(document.querySelector(".pz-pin > i")).toBeNull();
    for (const part of [".pz-spring", ".pz-driver", ".pz-keypin", ".pz-bore"]) expect(document.querySelector(`.pz-pin ${part}`), part).not.toBeNull();
  });
});
