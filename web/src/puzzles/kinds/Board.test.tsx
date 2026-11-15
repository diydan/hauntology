// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { mountKind, pointer, stubGeometry, type Mounted } from "../test-utils";
import Board from "./Board";
import { BOARD_H, BOARD_W, LETTER_POS, PLANCHETTE_R, START } from "./Board-geometry";

type Arc = [number, number, number];
let arcs: Arc[] = [];
let fills = 0;
let restoreGeo = (): void => {};
let restoreCanvas: unknown;
beforeEach(() => {
  restoreGeo = stubGeometry();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  arcs = [];
  fills = 0;
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  restoreCanvas = proto.getContext;
  const noop = (): void => {};
  const c = new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (k === "arc" ? (x: number, y: number, r: number) => { arcs.push([x, y, r]); } : k === "fillRect" ? () => { fills++; } : k in t ? t[k] : noop), set: (t: Record<string, unknown>, k: string, v: unknown) => { t[k] = v; return true; } });
  proto.getContext = () => c;
});
afterEach(() => {
  cleanup();
  restoreGeo();
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = restoreCanvas;
  vi.useRealTimers();
});

function lockOf(level: Level, seed: number) {
  const lock = makeLock("board", level, seed);
  if (lock.kind !== "board") throw new Error("kind");
  return lock;
}
type M = Mounted<"board">;
function advance(m: M, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    m.clock.ms += 16;
    act(() => { vi.advanceTimersByTime(16); });
  }
}
const board = (): Element => screen.getByRole("application", { name: /Spirit board/ });
const letterPos = (ch: string) => LETTER_POS.find((p) => p.ch === ch) ?? { ch, x: 0, y: 0 };
const slots = (): string => [...(screen.getByRole("img", { name: /Letters so far/ }).children)].map((s) => s.textContent).join("");
const under = (): string => document.querySelector(".pz-under")?.textContent ?? "";
const pickButton = (): HTMLButtonElement => screen.getByRole("button", { name: /^Pick/ }) as HTMLButtonElement;
const planchette = (): { x: number; y: number } => { const a = arcs.filter((q) => q[2] === PLANCHETTE_R).at(-1); return { x: a?.[0] ?? -1, y: a?.[1] ?? -1 }; };

/** A finger drags the planchette: press, pull past the slop, lift. */
function dragTo(x: number, y: number, from: { x: number; y: number } = START): void {
  pointer(board(), "pointerdown", from.x, from.y);
  pointer(board(), "pointermove", (from.x + x) / 2, (from.y + y) / 2);
  pointer(board(), "pointermove", x, y);
  pointer(board(), "pointerup", x, y);
}
const tap = (x: number, y: number): void => { pointer(board(), "pointerdown", x, y); pointer(board(), "pointerup", x, y); };

/** Spell a word with the touch path: drag the planchette onto each letter and press Pick. */
function spellByDrag(m: M, word: string): void {
  let at: { x: number; y: number } = START;
  for (const ch of word) {
    const p = letterPos(ch);
    if (under() !== `On the letter ${ch}`) { dragTo(p.x, p.y, at); advance(m, 32); at = p; }
    expect(pickButton().textContent).toBe(`Pick ${ch}`);
    fireEvent.click(pickButton());
  }
}

describe("Board", () => {
  it("shows the clue as text, the empty letters, and tells the Player where the planchette is", () => {
    const lock = lockOf("normal", 3);
    mountKind(Board, lock.view);
    expect(screen.getByText(new RegExp(`Clue: ${lock.view.clue}`))).toBeTruthy();
    expect(slots()).toBe("·".repeat(lock.view.length));
    expect(under()).toMatch(/Move the planchette/);
    expect(pickButton().disabled).toBe(true);
    expect(pickButton().textContent).toBe("Pick the letter");
  });

  it("is solved with touch alone on both levels: drag the planchette to each letter, press Pick, and the shared checker accepts it", () => {
    for (const level of ["easy", "normal"] as const) {
      for (const seed of [1, 7, 23, 140]) {
        const lock = lockOf(level, seed);
        const m = mountKind(Board, lock.view);
        spellByDrag(m, lock.secret.word);
        expect(m.submits.length, `${level} ${seed}`).toBe(1);
        expect(m.submits[0]).toEqual({ letters: lock.secret.word });
        expect(verify(lock, { kind: "board", ...m.submits[0], elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        m.unmount();
      }
    }
  });

  it("is also solved by tapping each letter directly", () => {
    const lock = lockOf("normal", 12);
    const m = mountKind(Board, lock.view);
    for (const ch of lock.secret.word) { const p = letterPos(ch); tap(p.x + 4, p.y - 3); }
    expect(m.submits).toEqual([{ letters: lock.secret.word }]);
  });

  it("buzzes and sounds a thunk when a letter is picked, and a tick when the planchette meets a letter", () => {
    const lock = lockOf("easy", 5);
    const m = mountKind(Board, lock.view);
    const ch = lock.secret.word[0] ?? "A";
    const p = letterPos(ch);
    dragTo(p.x, p.y);
    advance(m, 32);
    expect(m.feel.haptics.buzzes).toContain("tick");
    expect(m.feel.synth.played).toContain("tick");
    fireEvent.click(pickButton());
    expect(m.feel.haptics.buzzes.at(-1)).toBe("thunk");
    expect(m.feel.synth.played.at(-1)).toBe("thunk");
  });

  it("pulls a slow planchette onto a nearby letter, so resting on one is easy", () => {
    const m = mountKind(Board, lockOf("easy", 2).view);
    const n = letterPos("N");
    dragTo(n.x, n.y - 33);
    expect(under()).toMatch(/Move the planchette/);
    advance(m, 400);
    expect(under()).toBe("On the letter N");
  });

  it("with touch alone resting on a letter picks nothing: only Pick or a tap does", () => {
    const lock = lockOf("easy", 2);
    const m = mountKind(Board, lock.view);
    const p = letterPos(lock.secret.word[0] ?? "A");
    dragTo(p.x, p.y);
    advance(m, 1500);
    expect(slots()).toBe("·".repeat(lock.view.length));
    tap(5, 5); // a tap on empty wall does nothing with tilt off
    expect(slots()).toBe("·".repeat(lock.view.length));
  });

  it("with tilt on, a tap anywhere picks the letter under the planchette, and resting on it picks it after the dwell time", () => {
    const lock = lockOf("easy", 4);
    const m = mountKind(Board, lock.view, { tilt: "on" });
    const first = letterPos(lock.secret.word[0] ?? "A");
    dragTo(first.x, first.y);
    advance(m, 100);
    tap(5, 5);
    expect(slots()[0]).toBe(lock.secret.word[0]);
    // rest on the next letter: just under the dwell time nothing, then it is picked
    const second = letterPos(lock.secret.word[1] ?? "B");
    dragTo(second.x, second.y, first);
    advance(m, lock.view.dwellMs - 120);
    expect(slots()[1]).toBe("·");
    advance(m, 200);
    expect(slots()[1]).toBe(lock.secret.word[1]);
    expect(m.feel.haptics.buzzes).toContain("thunk");
  });

  it("starts the dwell again when the planchette leaves a letter, and does not pick a letter twice by resting", () => {
    const lock = lockOf("easy", 4);
    const m = mountKind(Board, lock.view, { tilt: "on" });
    const a = letterPos("C");
    const b = letterPos("T");
    dragTo(a.x, a.y);
    advance(m, lock.view.dwellMs - 100);
    dragTo(b.x, b.y, a);
    advance(m, 100);
    dragTo(a.x, a.y, b);
    advance(m, lock.view.dwellMs - 100);
    expect(slots()).toBe("·".repeat(lock.view.length)); // not C, T or anything: each visit started again from zero
    advance(m, 200);
    expect(slots()[0]).toBe("C");
    advance(m, 1500); // still resting on C: it is picked once, not again
    expect(slots()[1]).toBe("·");
  });

  it("rolls with the tilt: lean right and up and the planchette goes right and up; level and it settles", () => {
    const m = mountKind(Board, lockOf("easy", 6).view, { tilt: "on" });
    advance(m, 32);
    const start = planchette();
    expect(start.x).toBeCloseTo(START.x, 0);
    expect(start.y).toBeCloseTo(START.y, 0);
    m.feel.motion.setTilt(25, -25);
    advance(m, 600);
    const moved = planchette();
    expect(moved.x).toBeGreaterThan(start.x + 5);
    expect(moved.y).toBeLessThan(start.y - 5);
    m.feel.motion.setTilt(0, 0);
    advance(m, 3000);
    const settled = planchette();
    advance(m, 200);
    expect(Math.hypot(planchette().x - settled.x, planchette().y - settled.y)).toBeLessThan(1); // it has all but stopped
    expect(settled.x).toBeLessThanOrEqual(BOARD_W - PLANCHETTE_R);
    expect(settled.y).toBeGreaterThanOrEqual(PLANCHETTE_R);
    expect(settled.y).toBeLessThanOrEqual(BOARD_H - PLANCHETTE_R);
  });

  it("ignores the tilt when tilt is off", () => {
    const m = mountKind(Board, lockOf("easy", 6).view, { tilt: "off" });
    m.feel.motion.setTilt(30, -30);
    advance(m, 600);
    expect(planchette().x).toBeCloseTo(START.x, 0);
    expect(planchette().y).toBeCloseTo(START.y, 0);
  });

  it("draws only when something changed: a still board asks for no more drawing", () => {
    const m = mountKind(Board, lockOf("easy", 6).view);
    advance(m, 200);
    const before = fills;
    expect(before).toBeGreaterThan(0);
    advance(m, 400);
    expect(fills).toBe(before);
    dragTo(100, 100);
    advance(m, 32);
    expect(fills).toBeGreaterThan(before);
  });

  it("can be played from the keyboard: arrow keys jump between letters and Enter picks; a jump never picks by resting", () => {
    const lock = lockOf("easy", 8);
    const m = mountKind(Board, lock.view, { tilt: "on" });
    fireEvent.keyDown(board(), { key: "ArrowRight" });
    expect(under()).toBe("On the letter A");
    fireEvent.keyDown(board(), { key: "ArrowRight" });
    expect(under()).toBe("On the letter B");
    fireEvent.keyDown(board(), { key: "ArrowLeft" });
    fireEvent.keyDown(board(), { key: "ArrowLeft" });
    expect(under()).toBe("On the letter Z"); // wraps round
    advance(m, 1200);
    expect(slots()).toBe("·".repeat(lock.view.length)); // rested a long time on Z with tilt on: nothing picked
    fireEvent.keyDown(board(), { key: "Enter" });
    expect(slots()[0]).toBe("Z");
    fireEvent.keyDown(board(), { key: " " });
    expect(slots().slice(0, 2)).toBe("ZZ");
    fireEvent.keyDown(board(), { key: "q" }); // other keys do nothing
    expect(slots().slice(0, 2)).toBe("ZZ");
  });

  it("whispers the word through hear, twice at most, and says so when the phone has no voice", async () => {
    const lock = lockOf("normal", 9);
    let said = 0;
    let result: boolean | void = true;
    const m = mountKind(Board, lock.view, { hear: () => { said++; return result; } });
    const button = (): HTMLButtonElement => screen.getByRole("button", { name: /Hear the word|No more whispers/ }) as HTMLButtonElement;
    expect(button().textContent).toBe("Hear the word (2 left)");
    await act(async () => { fireEvent.click(button()); });
    expect(said).toBe(1);
    expect(button().textContent).toBe("Hear the word (1 left)");
    await act(async () => { button().click(); button().click(); }); // a double tap in one go: the last whisper is spent once
    expect(said).toBe(2);
    expect(button().textContent).toBe("No more whispers");
    expect(button().disabled).toBe(true);
    await act(async () => { fireEvent.click(button()); });
    expect(said).toBe(2);
    cleanup();

    result = false;
    const m2 = mountKind(Board, lock.view, { hear: () => { said++; return result; } });
    await act(async () => { fireEvent.click(button()); });
    expect(m2.announcements.at(-1)).toMatch(/no speech voice/i);
    expect(button().textContent).toBe("Hear the word (2 left)"); // nothing was said, so the whisper is given back
    expect(m.submits.length).toBe(0);
  });

  it("has no hear button to press when the Room gives no voice, and the clue is still there", () => {
    mountKind(Board, lockOf("easy", 1).view);
    const b = screen.getByRole("button", { name: "No voice here" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText(/Clue:/)).toBeTruthy();
  });

  it("submits a wrong word as given, clears the letters when the host raises resetKey, and lets the Player try again", () => {
    const lock = lockOf("easy", 10);
    const m = mountKind(Board, lock.view);
    const wrong = lock.secret.word === "AAA" ? "BBB" : "AAA";
    for (const ch of wrong) { const p = letterPos(ch); tap(p.x, p.y); }
    expect(m.submits).toEqual([{ letters: wrong }]);
    expect(verify(lock, { kind: "board", ...m.submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    m.reset(1);
    expect(slots()).toBe("·".repeat(lock.view.length));
    for (const ch of lock.secret.word) { const p = letterPos(ch); tap(p.x, p.y); }
    expect(verify(lock, { kind: "board", ...m.submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("takes no more letters once the word is full, and Clear starts the letters again", () => {
    const lock = lockOf("easy", 11);
    const m = mountKind(Board, lock.view);
    const a = letterPos("A");
    for (let i = 0; i < lock.view.length + 2; i++) tap(a.x, a.y);
    expect(slots()).toBe("A".repeat(lock.view.length));
    expect(m.submits.length).toBe(1);
    expect(m.announcements.length).toBe(lock.view.length); // the extra taps were not taken as letters
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(slots()).toBe("·".repeat(lock.view.length));
    tap(a.x, a.y);
    expect(slots()[0]).toBe("A");
  });

  it("ends a drag when the touch is cancelled, and ignores a move with nothing held", () => {
    const m = mountKind(Board, lockOf("easy", 1).view);
    pointer(board(), "pointermove", 50, 50); // nothing held
    advance(m, 32);
    expect(planchette().x).toBeCloseTo(START.x, 0);
    pointer(board(), "pointerdown", START.x, START.y);
    pointer(board(), "pointermove", 100, 100);
    pointer(board(), "pointercancel", 100, 100);
    pointer(board(), "pointermove", 200, 200); // after the cancel: no longer carried
    advance(m, 32);
    expect(planchette().x).toBeCloseTo(100, 0);
    pointer(board(), "pointerup", 200, 200); // nothing held: no pick
    expect(slots().includes("·")).toBe(true);
  });

  it("copes with a phone that gives no canvas, and stops its frame loop when it unmounts", () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () => null;
    const m = mountKind(Board, lockOf("easy", 3).view, { tilt: "on" });
    m.feel.motion.setTilt(10, 10);
    advance(m, 100);
    expect(slots().includes("·")).toBe(true);
    m.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
