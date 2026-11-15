// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { wireLook } from "../art/wires";
import { mountKind, pointer, stubGeometry } from "../test-utils";
import Wires from "./Wires";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("wires", level, seed);
  if (lock.kind !== "wires") throw new Error("kind");
  return lock;
}
const board = (): Element => screen.getByRole("group", { name: "Wires board" });
const handle = (w: number): Element => screen.getByRole("button", { name: new RegExp(`^Wire ${wireLook(w).name}`) });
const terminal = (t: number): Element => screen.getByRole("button", { name: new RegExp(`^Terminal ${t + 1}\\b`) });
const status = (): string => screen.getByRole("status").textContent ?? "";
const checkButton = (): HTMLButtonElement => screen.getByRole("button", { name: "Check the wires" }) as HTMLButtonElement;

/** The board is 340 wide and 70 + 62 n tall; wire ends sit at x 50, terminals at x 290. */
const ysOf = (n: number) => (i: number): number => 50 + i * ((70 + n * 62 - 100) / (n - 1));

function drag(lock: ReturnType<typeof lockOf>, w: number, toX: number, toY: number): void {
  const ys = ysOf(lock.view.n);
  const row = lock.view.leftOrder.indexOf(w);
  pointer(handle(w), "pointerdown", 50, ys(row));
  pointer(board(), "pointermove", (50 + toX) / 2, (ys(row) + toY) / 2);
  pointer(board(), "pointermove", toX, toY);
  pointer(board(), "pointerup", toX, toY);
}
const dragToTerminal = (lock: ReturnType<typeof lockOf>, w: number, t: number): void => drag(lock, w, 290, ysOf(lock.view.n)(t));

describe("Wires", () => {
  it("shows every wire and terminal by name, with the check button waiting until all are joined", () => {
    const lock = lockOf("normal", 3);
    mountKind(Wires, lock.view);
    expect(lock.view.leftOrder.length).toBe(lock.view.n);
    for (const w of lock.view.leftOrder) expect(handle(w).getAttribute("aria-pressed")).toBe("false");
    for (let t = 0; t < lock.view.n; t++) expect(terminal(t)).toBeTruthy();
    expect(status()).toBe(`0 of ${lock.view.n} wires joined`);
    expect(checkButton().disabled).toBe(true);
  });

  it("is solved by dragging each wire to its terminal, on both levels and several seeds", () => {
    for (const level of ["easy", "normal"] as const) {
      for (const seed of [2, 9, 31, 600]) {
        const lock = lockOf(level, seed);
        const { submits, unmount } = mountKind(Wires, lock.view);
        lock.view.leftOrder.forEach((w, i) => {
          dragToTerminal(lock, w, lock.secret.terminalOf[w] ?? -1);
          if (i < lock.view.n - 1) expect(checkButton().disabled, `${level} ${seed} after ${i + 1}`).toBe(true); // not until every wire is joined
        });
        expect(status()).toBe(`${lock.view.n} of ${lock.view.n} wires joined`);
        expect(checkButton().disabled).toBe(false);
        fireEvent.click(checkButton());
        const p = submits[0];
        expect(p, `${level} ${seed}`).toBeDefined();
        expect(verify(lock, { kind: "wires", ...p, elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("is also solved by tapping a wire and then a terminal, and says which is picked", () => {
    const lock = lockOf("normal", 12);
    const { submits } = mountKind(Wires, lock.view);
    const ys = ysOf(lock.view.n);
    for (const w of lock.view.leftOrder) {
      const row = lock.view.leftOrder.indexOf(w);
      pointer(handle(w), "pointerdown", 50, ys(row));
      pointer(board(), "pointerup", 50, ys(row)); // a tap: the finger did not move
      expect(handle(w).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(terminal(lock.secret.terminalOf[w] ?? -1), { detail: 1 });
      expect(handle(w).getAttribute("aria-pressed")).toBe("false");
    }
    fireEvent.click(checkButton());
    expect(verify(lock, { kind: "wires", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("lets a keyboard or screen reader pick a wire (a click with no pointer), and does not count a finger's click twice", () => {
    const lock = lockOf("easy", 4);
    mountKind(Wires, lock.view);
    const w = lock.view.leftOrder[0] ?? 0;
    fireEvent.click(handle(w), { detail: 1 }); // the click that follows a tap: already handled by the pointer events
    expect(handle(w).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(handle(w)); // detail 0: from the keyboard or a screen reader
    expect(handle(w).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(handle(w), { key: "Enter" }); // toggles it off again
    expect(handle(w).getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(handle(w), { key: " " });
    expect(handle(w).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(terminal(1), { key: "Enter" });
    expect(terminal(1).getAttribute("aria-label")).toBe(`Terminal 2, holds ${wireLook(w).name}`);
  });

  it("frees the old wire when a second wire takes its terminal, frees a wire's old terminal, and unplugs on a drop far from every terminal", () => {
    const lock = lockOf("easy", 7);
    mountKind(Wires, lock.view);
    const [a, b] = lock.view.leftOrder as [number, number];
    dragToTerminal(lock, a, 0);
    expect(terminal(0).getAttribute("aria-label")).toContain(wireLook(a).name);
    dragToTerminal(lock, b, 0);
    expect(terminal(0).getAttribute("aria-label")).toContain(wireLook(b).name);
    expect(handle(a).getAttribute("aria-label")).toBe(`Wire ${wireLook(a).name}`); // a is free again
    expect(status()).toBe(`1 of ${lock.view.n} wires joined`);
    dragToTerminal(lock, b, 2); // moved: terminal 0 is empty again
    expect(terminal(0).getAttribute("aria-label")).toBe("Terminal 1");
    expect(terminal(2).getAttribute("aria-label")).toContain(wireLook(b).name);
    drag(lock, b, 150, 20); // dropped in the middle of nowhere
    expect(status()).toBe(`0 of ${lock.view.n} wires joined`);
    expect(terminal(2).getAttribute("aria-label")).toBe("Terminal 3");
  });

  it("submits a wrong joining as given and keeps the wiring so the Player can fix it", () => {
    const lock = lockOf("easy", 10);
    const m = mountKind(Wires, lock.view);
    const [a, b] = lock.view.leftOrder as [number, number];
    const swapped = (w: number): number => lock.secret.terminalOf[w === a ? b : w === b ? a : w] ?? -1; // a and b trade terminals
    for (const w of lock.view.leftOrder) dragToTerminal(lock, w, swapped(w));
    fireEvent.click(checkButton());
    expect(m.submits.length).toBe(1);
    expect(verify(lock, { kind: "wires", ...m.submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    m.reset(1);
    expect(status()).toBe(`${lock.view.n} of ${lock.view.n} wires joined`); // still wired
    dragToTerminal(lock, a, lock.secret.terminalOf[a] ?? -1);
    dragToTerminal(lock, b, lock.secret.terminalOf[b] ?? -1);
    fireEvent.click(checkButton());
    expect(verify(lock, { kind: "wires", ...m.submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("snaps a buzz and a sound when a wire connects, a tick when one is picked up, and nothing when it is dropped on nothing", () => {
    const lock = lockOf("easy", 5);
    const { feel } = mountKind(Wires, lock.view);
    const w = lock.view.leftOrder[0] ?? 0;
    drag(lock, w, 150, 20);
    expect(feel.haptics.buzzes).toEqual([]);
    expect(feel.synth.played).toEqual([]);
    dragToTerminal(lock, w, 1);
    expect(feel.haptics.buzzes).toEqual(["snap"]);
    expect(feel.synth.played).toEqual(["snap"]);
    const ys = ysOf(lock.view.n);
    pointer(handle(w), "pointerdown", 50, ys(0));
    pointer(board(), "pointerup", 50, ys(0));
    expect(feel.haptics.buzzes.at(-1)).toBe("tick");
  });

  it("draws the wire being dragged, and stops when the touch is cancelled or nothing is held", () => {
    const lock = lockOf("easy", 6);
    mountKind(Wires, lock.view);
    const ghost = (): string => board().querySelector(".pz-wire-ghost")?.getAttribute("d") ?? "";
    pointer(board(), "pointermove", 200, 100); // nothing held
    expect(ghost()).toBe("");
    const w = lock.view.leftOrder[0] ?? 0;
    pointer(handle(w), "pointerdown", 50, 50);
    pointer(board(), "pointermove", 200, 100);
    expect(ghost()).toContain("L 200 100");
    pointer(board(), "pointercancel", 200, 100);
    expect(ghost()).toBe("");
    pointer(board(), "pointerup", 290, 50); // after the cancel: nothing to drop
    expect(status()).toBe(`0 of ${lock.view.n} wires joined`);
  });

  it("leaves nothing behind when it unmounts in the middle of a drag", () => {
    const lock = lockOf("easy", 3);
    const { feel, unmount, submits } = mountKind(Wires, lock.view);
    const w = lock.view.leftOrder[0] ?? 0;
    pointer(handle(w), "pointerdown", 50, 50);
    pointer(board(), "pointermove", 200, 100);
    const b = board();
    unmount();
    expect(() => { pointer(b, "pointermove", 250, 120); pointer(b, "pointerup", 290, 50); }).not.toThrow();
    expect(feel.haptics.buzzes).toEqual([]);
    expect(submits).toEqual([]);
    expect(document.body.querySelector("svg")).toBeNull();
  });

  it("is an accessible touch screen: every control is a named button, wires differ by shape as well as colour", () => {
    const lock = lockOf("normal", 8);
    mountKind(Wires, lock.view);
    const names = lock.view.leftOrder.map((w) => wireLook(w));
    expect(new Set(names.map((l) => l.shape)).size).toBe(names.length);
    expect(new Set(names.map((l) => l.dash + l.shape)).size).toBe(names.length);
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("aria-label") ?? b.textContent, "named").toBeTruthy();
  });
});
