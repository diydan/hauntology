// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { polar } from "../art/ClockFace";
import { mountKind, pointer, stubGeometry, wait } from "../test-utils";
import Safe from "./Safe";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("safe", level, seed);
  if (lock.kind !== "safe") throw new Error("kind");
  return lock;
}
const shown = (): number => Number((screen.getByRole("img", { name: /Under the marker/ }).textContent ?? "").trim());
const slots = (): string => [...(screen.getByRole("img", { name: /Code so far/ }).children)].map((s) => s.textContent).join("");

/** Drag the dial (press near the top, move round) until the digit under the marker is `d`. */
function turnToDigit(d: number): void {
  const board = screen.getByRole("application", { name: "Safe dial" });
  const delta = -36 * (d - shown()); // the dial turns clockwise by the drag; digit d sits at 36 * d
  const [x0, y0] = polar(150, 150, 100, 0);
  const [x1, y1] = polar(150, 150, 100, ((delta % 360) + 360) % 360);
  pointer(board, "pointerdown", x0, y0);
  pointer(board, "pointermove", x1, y1);
  pointer(board, "pointerup", x1, y1);
}
const press = (name: string): boolean => fireEvent.click(screen.getByRole("button", { name }));

describe("Safe", () => {
  it("starts at 0 with every control named and the empty code shown", () => {
    const lock = lockOf("easy", 1);
    mountKind(Safe, lock.view);
    expect(shown()).toBe(0);
    expect(slots()).toBe("·".repeat(lock.view.digits));
    for (const name of ["Digit minus", "Digit plus", "Twist", "Undo", "Set"]) expect(screen.getByRole("button", { name }), name).toBeTruthy();
    expect(screen.getByRole("application", { name: "Safe dial" })).toBeTruthy();
  });

  it("is solved by dragging the dial and pressing Set, on both levels and several seeds", () => {
    for (const level of ["easy", "normal"] as const) {
      for (const seed of [3, 11, 42, 777]) {
        const lock = lockOf(level, seed);
        const { submits, unmount } = mountKind(Safe, lock.view);
        lock.secret.code.forEach((d, i) => {
          turnToDigit(d);
          expect(shown(), `${level} ${seed} digit ${i}`).toBe(d);
          press("Set");
        });
        expect(submits.length, `${level} ${seed}`).toBe(1);
        const p = submits[0];
        expect(p).toBeDefined();
        expect(p?.code).toEqual([...lock.secret.code]);
        expect(verify(lock, { kind: "safe", ...p, elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("can also be solved with the Digit buttons alone, which wrap round from 0 to 9 and back", () => {
    const lock = lockOf("normal", 5);
    const { submits } = mountKind(Safe, lock.view);
    press("Digit minus");
    expect(shown()).toBe(9);
    press("Digit plus");
    expect(shown()).toBe(0);
    for (const d of lock.secret.code) {
      while (shown() !== d) press("Digit plus");
      press("Set");
    }
    expect(verify(lock, { kind: "safe", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("buzzes and sounds a click at each digit and a thunk on Set", () => {
    const { feel } = mountKind(Safe, lockOf("easy", 2).view);
    press("Digit plus");
    press("Digit plus");
    expect(feel.haptics.buzzes).toEqual(["click", "click"]);
    expect(feel.synth.played).toEqual(["click", "click"]);
    press("Set");
    expect(feel.haptics.buzzes.at(-1)).toBe("thunk");
    expect(feel.synth.played.at(-1)).toBe("thunk");
  });

  it("submits a wrong code as given, clears it when the host raises resetKey, and lets the Player try again", () => {
    const lock = lockOf("easy", 9);
    const wrong = lock.secret.code.map((d) => (d + 1) % 10);
    const m = mountKind(Safe, lock.view);
    for (const d of wrong) { turnToDigit(d); press("Set"); }
    expect(m.submits).toEqual([{ code: wrong }]);
    expect(verify(lock, { kind: "safe", ...m.submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    m.reset(1);
    expect(slots()).toBe("·".repeat(lock.view.digits));
    for (const d of lock.secret.code) { turnToDigit(d); press("Set"); }
    expect(m.submits.length).toBe(2);
    expect(verify(lock, { kind: "safe", ...m.submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("takes no more digits once the code is full, and Undo takes the last one back", () => {
    const lock = lockOf("easy", 4);
    const m = mountKind(Safe, lock.view);
    const n = lock.view.digits;
    for (let i = 0; i < n - 1; i++) press("Set");
    expect(slots()).toBe("0".repeat(n - 1) + "·");
    press("Undo");
    expect(slots()).toBe("0".repeat(n - 2) + "··");
    press("Set");
    press("Set");
    expect(m.submits.length).toBe(1);
    press("Set"); // full: ignored until the host resets
    expect(m.submits.length).toBe(1);
    expect(slots()).toBe("0".repeat(n));
    press("Undo"); // the ignored press added nothing hidden: one Undo leaves exactly one empty slot
    expect(slots()).toBe("0".repeat(n - 1) + "·");
  });

  it("snaps to the digit when the finger lifts, and ignores a move when nothing is held", () => {
    mountKind(Safe, lockOf("easy", 6).view);
    const board = screen.getByRole("application");
    const [mx, my] = polar(150, 150, 100, 100);
    pointer(board, "pointermove", mx, my);
    expect(shown()).toBe(0);
    const [x0, y0] = polar(150, 150, 100, 0);
    const [x1, y1] = polar(150, 150, 100, 340); // the dial goes anticlockwise 20 degrees: nearer digit 1 than 0 would be 18
    pointer(board, "pointerdown", x0, y0);
    pointer(board, "pointermove", x1, y1);
    pointer(board, "pointerup", x1, y1);
    expect(shown()).toBe(1);
    const face = board.querySelector("g[transform]");
    expect(face?.getAttribute("transform")).toBe("rotate(-36 150 150)");
    pointer(board, "pointermove", mx, my); // lifted: no effect
    expect(shown()).toBe(1);
  });

  it("turns the dial with the phone when Twist is on, and says so when tilt is not available", async () => {
    const { feel } = mountKind(Safe, lockOf("easy", 8).view, { tilt: "on" });
    feel.motion.dial = 20;
    press("Twist");
    await wait(80);
    feel.motion.dial = 56; // 36 degrees round: the dial turns clockwise, so digit 9 comes under the marker
    await wait(80);
    expect(shown()).toBe(9);
    feel.motion.dial = -16; // 36 degrees the other way from the start
    await wait(80);
    expect(shown()).toBe(1);
    press("Twist: on"); // off again
    feel.motion.dial = 200;
    await wait(80);
    expect(shown()).toBe(1);

    cleanup();
    const off = mountKind(Safe, lockOf("easy", 8).view, { tilt: "unsupported" });
    off.feel.motion.enableResult = "unsupported";
    press("Twist");
    await wait(20);
    expect(off.announcements.at(-1)).toMatch(/not available/i);
    expect(screen.getByRole("button", { name: "Twist" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reads no sensor with tilt off, and stops reading when it unmounts", async () => {
    const off = mountKind(Safe, lockOf("easy", 8).view, { tilt: "off" });
    await wait(60);
    expect(off.feel.motion.enabled).toBe(0);
    cleanup();

    const m = mountKind(Safe, lockOf("easy", 8).view, { tilt: "on" });
    m.feel.motion.dial = 0;
    press("Twist");
    await wait(60);
    m.unmount();
    const before = m.feel.haptics.buzzes.length;
    m.feel.motion.dial = 100;
    await wait(80);
    expect(m.feel.haptics.buzzes.length).toBe(before);
  });
});
