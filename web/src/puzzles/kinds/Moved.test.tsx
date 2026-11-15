// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worstChangesPerSecond, dimPlan } from "@hauntology/shared/puzzles/dim";
import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Level } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { createFakeFeel } from "../feel/fakes";
import { mountKind, stubGeometry } from "../test-utils";
import css from "./Moved.css?raw";
import Moved from "./Moved";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("moved", level, seed);
  if (lock.kind !== "moved") throw new Error("kind");
  return lock;
}
const advance = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const spot = (i: number): HTMLElement => screen.getByRole("button", { name: new RegExp(`^Spot ${i + 1}:`) });
const phase = (c: Element): string | null => c.querySelector("[data-phase]")?.getAttribute("data-phase") ?? null;
const darkEl = (): HTMLElement | null => document.querySelector<HTMLElement>(".pz-moved-dark");
const chosen = (): string => document.querySelector(".pz-moved-count")?.textContent ?? "";
const submitBtn = (): HTMLElement => screen.getByRole("button", { name: "These changed" });

describe("Moved", () => {
  it("goes dark at once: one rumble and a creak, no shelf shown, then the shelf after two seconds", () => {
    const lock = lockOf("easy", 3);
    const { container, feel, announcements } = mountKind(Moved, lock.view);
    expect(phase(container)).toBe("dark");
    expect(feel.haptics.buzzes).toEqual(["rumble"]);
    expect(feel.synth.played).toEqual(["creak"]);
    expect(screen.queryByRole("button", { name: /^Spot/ })).toBeNull(); // nothing of the shelf in the dark
    expect(screen.queryByRole("button", { name: "These changed" })).toBeNull();
    expect(screen.getByText("The lights go out…")).toBeTruthy();
    expect(announcements[0]).toMatch(/lights go out for 2 seconds/);
    advance(1999);
    expect(phase(container)).toBe("dark");
    advance(1);
    expect(phase(container)).toBe("lit");
    expect(announcements.at(-1)).toMatch(/lights are back/);
    expect(feel.haptics.buzzes).toEqual(["rumble"]); // once, not again
    expect(feel.synth.played).toEqual(["creak"]);
    expect(screen.getAllByRole("button", { name: /^Spot/ })).toHaveLength(lock.view.slots);
  });

  it("dims in fades that follow the shared light plan: never white, never a flash", () => {
    const lock = lockOf("medium", 3);
    mountKind(Moved, lock.view);
    const plan = dimPlan(false);
    expect(worstChangesPerSecond(plan)).toBeLessThanOrEqual(2);
    const seen: number[] = [];
    for (let t = 0; t < 2000; t += 20) {
      const el = darkEl();
      if (el) seen.push(Number(el.style.opacity));
      advance(20);
    }
    expect(seen[0]).toBe(plan[0]?.lum); // starts lit
    expect(Math.min(...seen)).toBe(plan[1]?.lum); // goes down to the dark level
    expect(Math.max(...seen)).toBeLessThan(1); // the peak is under white
    const levels = seen.filter((v, i) => i === 0 || v !== seen[i - 1]);
    expect(levels).toEqual([0.9, 0.12, 0.9]); // two changes in two seconds, each a CSS fade
    expect(css).toMatch(/\.pz-moved-dark\s*{[^}]*transition:\s*opacity var\(--fade\)/);
  });

  it("keeps one still dim step for reduced motion: no fade, no change", () => {
    const lock = lockOf("easy", 3);
    const { container } = mountKind(Moved, lock.view, { reducedMotion: true });
    const still = dimPlan(true)[0]?.lum;
    expect(still).toBeDefined();
    const seen = new Set<string>();
    for (let t = 0; t < 1990; t += 50) {
      const el = darkEl();
      if (el) { seen.add(el.style.opacity); expect(el.className).toContain("pz-moved-still"); }
      advance(50);
    }
    expect([...seen]).toEqual([String(still)]);
    advance(20);
    expect(phase(container)).toBe("lit");
    expect(css).toMatch(/\.pz-moved-dark\.pz-moved-still\s*{[^}]*transition:\s*none/);
  });

  it("is solved by tapping the changed spots and pressing These changed, on both levels and several seeds", () => {
    for (const level of ["easy", "medium"] as const) {
      for (const seed of [1, 5, 19, 404]) {
        const lock = lockOf(level, seed);
        const { submits, unmount } = mountKind(Moved, lock.view);
        advance(2000);
        [...lock.secret.changed].reverse().forEach((i) => fireEvent.click(spot(i))); // any order
        expect(chosen()).toBe(`${lock.secret.changed.length} chosen`);
        fireEvent.click(submitBtn());
        expect(submits.length, `${level} ${seed}`).toBe(1);
        const p = submits[0];
        expect(p).toBeDefined();
        expect(p?.changed).toEqual([...lock.secret.changed]); // sorted
        expect(verify(lock, { kind: "moved", ...p, elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("shows a missing thing as an empty dashed spot that can still be tapped", () => {
    let found: { level: Level; seed: number } | null = null;
    for (let seed = 1; seed < 300 && found === null; seed++) for (const level of ["easy", "medium"] as const) if (found === null && lockOf(level, seed).view.after.includes(-1)) found = { level, seed };
    expect(found).not.toBeNull();
    const lock = lockOf(found?.level ?? "easy", found?.seed ?? 1);
    const hole = lock.view.after.indexOf(-1);
    const { submits } = mountKind(Moved, lock.view);
    advance(2000);
    expect(spot(hole).getAttribute("aria-label")).toBe(`Spot ${hole + 1}: empty spot`);
    expect(spot(hole).className).toContain("pz-slot-empty");
    expect(spot(hole).querySelector("svg")).toBeNull();
    lock.secret.changed.forEach((i) => fireEvent.click(spot(i)));
    fireEvent.click(submitBtn());
    expect(verify(lock, { kind: "moved", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("toggles a spot with aria-pressed, counts the chosen ones, and ticks", () => {
    const lock = lockOf("medium", 8);
    const { feel } = mountKind(Moved, lock.view);
    advance(2000);
    expect(chosen()).toBe("0 chosen");
    expect(spot(1).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(spot(1));
    fireEvent.click(spot(4));
    expect(spot(1).getAttribute("aria-pressed")).toBe("true");
    expect(spot(4).getAttribute("aria-pressed")).toBe("true");
    expect(spot(0).getAttribute("aria-pressed")).toBe("false");
    expect(chosen()).toBe("2 chosen");
    fireEvent.click(spot(1)); // chosen by mistake: tap again
    expect(spot(1).getAttribute("aria-pressed")).toBe("false");
    expect(chosen()).toBe("1 chosen");
    expect(feel.haptics.buzzes.filter((b) => b === "tick")).toHaveLength(3);
    expect(feel.synth.played.filter((s) => s === "tick")).toHaveLength(3);
  });

  it("lays the shelf in 3 columns for six spots and 4 for eight", () => {
    for (const [level, cols] of [["easy", 3], ["medium", 4]] as const) {
      const { unmount } = mountKind(Moved, lockOf(level, 2).view);
      advance(2000);
      expect(document.querySelector<HTMLElement>(".pz-shelf")?.style.gridTemplateColumns).toBe(`repeat(${cols}, 1fr)`);
      unmount();
    }
  });

  it("submits a wrong set as given, clears the chosen spots on resetKey without a second dark, and can be tried again", () => {
    const lock = lockOf("easy", 14);
    const { submits, reset, feel, container } = mountKind(Moved, lock.view);
    advance(2000);
    const wrong = [0, 1, 2, 3, 4, 5].filter((i) => !lock.secret.changed.includes(i)).slice(0, 2);
    wrong.forEach((i) => fireEvent.click(spot(i)));
    fireEvent.click(submitBtn());
    expect(submits).toHaveLength(1);
    expect(submits[0]?.changed).toEqual(wrong);
    expect(verify(lock, { kind: "moved", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    expect(spot(wrong[0] ?? 0).getAttribute("aria-pressed")).toBe("true"); // kept until the host says so
    reset(1);
    expect(phase(container)).toBe("lit"); // no new dark
    expect(chosen()).toBe("0 chosen");
    for (let i = 0; i < 6; i++) expect(spot(i).getAttribute("aria-pressed")).toBe("false");
    advance(5000);
    expect(feel.haptics.buzzes.filter((b) => b === "rumble")).toHaveLength(1);
    lock.secret.changed.forEach((i) => fireEvent.click(spot(i)));
    fireEvent.click(submitBtn());
    expect(submits).toHaveLength(2);
    expect(verify(lock, { kind: "moved", ...submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("sends an empty choice as it is: the screen never judges", () => {
    const lock = lockOf("easy", 14);
    const { submits } = mountKind(Moved, lock.view);
    advance(2000);
    fireEvent.click(submitBtn());
    expect(submits).toEqual([{ changed: [] }]);
  });

  it("rumbles once even when development mounts the screen twice", () => {
    const lock = lockOf("easy", 3);
    const feel = createFakeFeel();
    render(<StrictMode><Moved view={lock.view} feel={feel} assist={false} reducedMotion={false} elapsed={() => 0} resetKey={0} submit={() => {}} announce={() => {}} /></StrictMode>);
    advance(2000);
    expect(feel.haptics.buzzes.filter((b) => b === "rumble")).toHaveLength(1);
    expect(feel.synth.played.filter((s) => s === "creak")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Spot/ })).toHaveLength(lock.view.slots); // and the shelf still comes
  });

  it("clears its timers when the screen goes in the dark: nothing announced or changed after unmount", () => {
    const lock = lockOf("medium", 3);
    const { unmount, announcements, feel } = mountKind(Moved, lock.view);
    advance(500);
    const said = announcements.length;
    unmount();
    expect(() => advance(10_000)).not.toThrow();
    expect(announcements.length).toBe(said);
    expect(feel.haptics.buzzes).toEqual(["rumble"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is touch alone and named: nothing reads tilt or the microphone, every control has a name", () => {
    const lock = lockOf("easy", 6);
    const { feel } = mountKind(Moved, lock.view, { tilt: "off" });
    advance(2000);
    for (const b of screen.getAllByRole("button")) expect((b.getAttribute("aria-label") ?? b.textContent ?? "").length, b.className).toBeGreaterThan(0);
    expect(submitBtn()).toBeTruthy();
    expect(feel.motion.enabled).toBe(0);
    expect(feel.breath.state).toBe("off");
  });

  it("keeps the shelf as the picture of the puzzle in both phases, so a phone held sideways puts it on the left in the dark and in the light", () => {
    const lock = lockOf("easy", 3);
    const { container } = mountKind(Moved, lock.view);
    expect(container.querySelectorAll(".pz-visual")).toHaveLength(1);
    expect(container.querySelector(".pz-visual")?.className).toContain("pz-moved-dark");
    advance(2000);
    expect(container.querySelectorAll(".pz-visual")).toHaveLength(1);
    expect(container.querySelector(".pz-visual .pz-shelf")).toBeTruthy();
  });
});
