// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Level, PhotoLock } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { mountKind, pointer, stubGeometry } from "../test-utils";
import css from "./Photo.css?raw";
import Photo from "./Photo";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); });

function lockOf(level: Level, seed: number): PhotoLock {
  const lock = makeLock("photo", level, seed);
  if (lock.kind !== "photo") throw new Error("kind");
  return lock;
}
type Pt = { x: number; y: number };
const GAP = 24;
const sizeOf = (lock: PhotoLock): { W: number; H: number } => ({ W: lock.view.cols * 100, H: lock.view.rows * 200 + GAP });
const piece = (p: number): HTMLElement => screen.getByRole("button", { name: new RegExp(`^Piece ${p + 1},`) });
const slotBtn = (s: number): HTMLElement => screen.getByRole("button", { name: `Frame spot ${s + 1}, empty` });
const turnBtn = (): HTMLElement => screen.getByRole("button", { name: "Turn" });
const trayBtn = (): HTMLElement => screen.getByRole("button", { name: "Back to tray" });
const checkBtn = (): HTMLElement => screen.getByRole("button", { name: "Check the photo" });
const where = (p: number): string => piece(p).getAttribute("aria-label") ?? "";
/** The middle of a piece in board units, read from its percentages. */
function center(lock: PhotoLock, el: HTMLElement): Pt {
  const { W, H } = sizeOf(lock);
  const f = (v: string): number => parseFloat(v);
  return { x: ((f(el.style.left) + f(el.style.width) / 2) / 100) * W, y: ((f(el.style.top) + f(el.style.height) / 2) / 100) * H };
}
const slotCenter = (lock: PhotoLock, s: number): Pt => ({ x: (s % lock.view.cols) * 100 + 50, y: Math.floor(s / lock.view.cols) * 100 + 50 });
const rotation = (p: number): number => Number(/rotate\((-?[\d.]+)deg\)/.exec(piece(p).querySelector<HTMLElement>(".pz-piece-art")?.style.transform ?? "")?.[1]);
/** Finger down on a piece, then along to `to` in two moves, then up. */
function drag(lock: PhotoLock, p: number, to: Pt): void {
  const el = piece(p);
  const from = center(lock, el);
  pointer(el, "pointerdown", from.x, from.y);
  pointer(el, "pointermove", (from.x + to.x) / 2, (from.y + to.y) / 2);
  pointer(el, "pointermove", to.x, to.y);
  pointer(el, "pointerup", to.x, to.y);
}
const tap = (p: number): void => { const el = piece(p); const c = center(lockCur, el); pointer(el, "pointerdown", c.x, c.y); pointer(el, "pointerup", c.x, c.y); };
let lockCur = lockOf("easy", 1);
const need = (lock: PhotoLock, p: number): number => (4 - (lock.secret.turns0[p] ?? 0)) % 4;
const payloadOf = (lock: PhotoLock, p: unknown): unknown => verify(lock, { kind: "photo", ...(p as object), elapsedMs: 20_000 });

describe("Photo", () => {
  it("draws every piece of the picture, turned as the view says, in a shuffled tray, with the frame spots empty and named", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      const lock = lockOf(level, 4);
      const n = lock.view.cols * lock.view.rows;
      const { unmount } = mountKind(Photo, lock.view);
      expect(n).toBe({ easy: 4, medium: 6, hard: 9 }[level]);
      const trayIndex: number[] = [];
      for (let p = 0; p < n; p++) {
        expect(where(p)).toBe(`Piece ${p + 1}, in the tray`);
        expect(rotation(p)).toBe((lock.secret.turns0[p] ?? 0) * 90);
        expect(piece(p).querySelector("svg")?.getAttribute("viewBox")).toBe(`${(p % lock.view.cols) * 100} ${Math.floor(p / lock.view.cols) * 100} 100 100`);
        const c = center(lock, piece(p));
        trayIndex[p] = Math.round(((c.y - 50 - lock.view.rows * 100 - GAP) / 100)) * lock.view.cols + Math.round((c.x - 50) / 100);
        expect(slotBtn(p)).toBeTruthy();
      }
      expect([...trayIndex].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i)); // every tray cell used once
      expect(trayIndex.some((t, p) => t !== p)).toBe(true); // never in frame order
      if (level === "easy") expect(screen.queryByRole("button", { name: "Turn" })).toBeNull(); // no turning on easy
      else expect(turnBtn().hasAttribute("disabled")).toBe(true);
      expect(trayBtn().hasAttribute("disabled")).toBe(true);
      expect(checkBtn().hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("status").textContent).toBe(`0 of ${n} in the frame`);
      unmount();
    }
  });

  it("on easy has no turning: every piece starts the right way up, a second tap does not turn it, and there is no Turn button", () => {
    const lock = lockOf("easy", 6);
    expect(lock.view.turning).toBe(false);
    mountKind(Photo, lock.view);
    for (let p = 0; p < 4; p++) expect(rotation(p)).toBe(0);
    fireEvent.click(piece(0));
    fireEvent.click(piece(0));
    expect(rotation(0)).toBe(0);
    expect(screen.queryByRole("button", { name: "Turn" })).toBeNull();
    expect(checkBtn().parentElement?.className).toMatch(/pz-grid2/);
    expect(document.body.textContent).not.toMatch(/turn it/);
  });

  it("keeps Turn, Back to tray and Check side by side in one row, never stacked", () => {
    mountKind(Photo, lockOf("hard", 2).view);
    const row = checkBtn().parentElement;
    expect(row?.className).toMatch(/pz-grid3/);
    expect([screen.getByRole("button", { name: "Turn" }).parentElement, trayBtn().parentElement]).toEqual([row, row]);
    expect(checkBtn().textContent).toBe("Check");
  });

  it("lays the tray out the same way every time for one photo", () => {
    const lock = lockOf("medium", 4);
    const first = mountKind(Photo, lock.view);
    const a = Array.from({ length: 6 }, (_, p) => `${piece(p).style.left} ${piece(p).style.top}`);
    first.unmount();
    mountKind(Photo, lock.view);
    expect(Array.from({ length: 6 }, (_, p) => `${piece(p).style.left} ${piece(p).style.top}`)).toEqual(a);
  });

  it("is solved with no dragging: pick a piece, Turn it, tap an empty spot; on both levels and several seeds", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      for (const seed of [1, 6, 22, 909]) {
        const lock = lockOf(level, seed);
        const n = lock.view.cols * lock.view.rows;
        const { submits, feel, unmount } = mountKind(Photo, lock.view);
        for (let p = 0; p < n; p++) {
          fireEvent.click(piece(p)); // picks it
          expect(piece(p).getAttribute("aria-pressed")).toBe("true");
          for (let k = 0; k < need(lock, p); k++) fireEvent.click(turnBtn());
          expect(rotation(p) % 360, `${level} ${seed} piece ${p} upright`).toBe(0);
          expect(checkBtn().hasAttribute("disabled")).toBe(true);
          fireEvent.click(slotBtn(p));
          expect(where(p)).toBe(`Piece ${p + 1}, in frame spot ${p + 1}`);
        }
        expect(feel.haptics.buzzes.filter((b) => b === "click")).toHaveLength(n); // a click as each piece fitted
        expect(feel.synth.played.filter((s) => s === "click")).toHaveLength(n);
        expect(checkBtn().hasAttribute("disabled")).toBe(false);
        fireEvent.click(checkBtn());
        expect(submits, `${level} ${seed}`).toHaveLength(1);
        const p = submits[0];
        expect(p?.placed).toEqual(Array.from({ length: n }, (_, piece) => ({ piece, slot: piece, turns: need(lock, piece) })));
        expect(payloadOf(lock, p), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("is solved by touch with dragging too: tap to pick and turn, drag onto the frame; both levels, several seeds", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      for (const seed of [2, 8, 31, 777]) {
        const lock = lockOf(level, seed);
        lockCur = lock;
        const n = lock.view.cols * lock.view.rows;
        const { submits, feel, unmount } = mountKind(Photo, lock.view);
        for (let p = 0; p < n; p++) {
          tap(p); // the first tap picks it ...
          for (let k = 0; k < need(lock, p); k++) tap(p); // ... each tap after that turns it
          expect(rotation(p) % 360, `${level} ${seed} piece ${p}`).toBe(0);
          drag(lock, p, slotCenter(lock, p));
          expect(where(p)).toBe(`Piece ${p + 1}, in frame spot ${p + 1}`);
        }
        expect(feel.haptics.buzzes.filter((b) => b === "click")).toHaveLength(n);
        fireEvent.click(checkBtn());
        expect(payloadOf(lock, submits[0]), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("clicks only when a piece fits: right spot AND the right way up; any other drop is a rustle", () => {
    const lock = lockOf("medium", 3);
    lockCur = lock;
    const p = lock.secret.turns0.findIndex((t) => t !== 0);
    expect(p).toBeGreaterThanOrEqual(0);
    const wrongSlot = (p + 1) % 4;
    const { feel } = mountKind(Photo, lock.view);
    drag(lock, p, slotCenter(lock, wrongSlot)); // wrong spot
    expect(feel.synth.played).toEqual(["rustle"]);
    expect(feel.haptics.buzzes).toEqual([]);
    drag(lock, p, slotCenter(lock, p)); // the right spot, still turned
    expect(feel.synth.played).toEqual(["rustle", "rustle"]);
    expect(feel.haptics.buzzes).toEqual([]);
    for (let k = 0; k < need(lock, p) - 1; k++) fireEvent.click(turnBtn()); // turning on the way: a tick and a rustle
    expect(feel.haptics.buzzes.every((b) => b === "tick")).toBe(true);
    expect(feel.synth.played.every((s) => s === "rustle")).toBe(true);
    fireEvent.click(turnBtn()); // now it fits
    expect(feel.haptics.buzzes.at(-1)).toBe("click");
    expect(feel.synth.played.at(-1)).toBe("click");
    expect(feel.events.at(-1)).toMatchObject({ type: "sound", name: "click" }); // the twin
    fireEvent.click(turnBtn()); // turned away again: no click
    expect(feel.haptics.buzzes.at(-1)).toBe("tick");
  });

  it("does not click for a piece that is the right way up but in the wrong spot", () => {
    const lock = lockOf("easy", 3);
    lockCur = lock;
    const q = 1;
    const { feel } = mountKind(Photo, lock.view);
    fireEvent.click(piece(q));
    for (let k = 0; k < need(lock, q); k++) fireEvent.click(turnBtn()); // upright, still in the tray
    expect(rotation(q) % 360).toBe(0);
    expect(feel.haptics.buzzes.includes("click")).toBe(false);
    drag(lock, q, slotCenter(lock, 3)); // upright, but spot 4 is not its place
    expect(feel.haptics.buzzes.includes("click")).toBe(false);
    expect(feel.synth.played.at(-1)).toBe("rustle");
    expect(feel.synth.played.includes("click")).toBe(false);
    drag(lock, q, slotCenter(lock, q)); // its own spot: now it fits
    expect(feel.haptics.buzzes.at(-1)).toBe("click");
    expect(feel.synth.played.at(-1)).toBe("click");
  });

  it("swaps with whoever is in the spot: a piece from the tray sends the sitter to the tray, a piece from a spot trades places", () => {
    const lock = lockOf("easy", 3);
    lockCur = lock;
    mountKind(Photo, lock.view);
    drag(lock, 0, slotCenter(lock, 1));
    expect(where(0)).toBe("Piece 1, in frame spot 2");
    drag(lock, 1, slotCenter(lock, 1)); // from the tray onto the taken spot
    expect(where(1)).toBe("Piece 2, in frame spot 2");
    expect(where(0)).toBe("Piece 1, in the tray");
    drag(lock, 0, slotCenter(lock, 0));
    expect(where(0)).toBe("Piece 1, in frame spot 1");
    drag(lock, 0, slotCenter(lock, 1)); // from spot 1 onto spot 2: they trade
    expect(where(0)).toBe("Piece 1, in frame spot 2");
    expect(where(1)).toBe("Piece 2, in frame spot 1");
    expect(screen.getByRole("status").textContent).toBe("2 of 4 in the frame");
  });

  it("puts the nearest spot in range under the piece, and a drop outside any spot returns the piece to the tray", () => {
    const lock = lockOf("medium", 5);
    lockCur = lock;
    mountKind(Photo, lock.view);
    const near = slotCenter(lock, 4);
    drag(lock, 2, { x: near.x + 40, y: near.y - 30 }); // off-centre but close enough: spot 5
    expect(where(2)).toBe("Piece 3, in frame spot 5");
    drag(lock, 2, { x: 150, y: 405 }); // down in the tray
    expect(where(2)).toBe("Piece 3, in the tray");
    drag(lock, 2, { x: near.x + 70, y: near.y + 70 }); // 99 away from the middle of spot 5: too far
    expect(where(2)).toBe("Piece 3, in the tray");
    expect(screen.getByRole("status").textContent).toBe("0 of 6 in the frame");
  });

  it("tells a tap from a drag by how far the finger went, and ignores a cancelled touch", () => {
    const lock = lockOf("medium", 3);
    lockCur = lock;
    const { feel } = mountKind(Photo, lock.view);
    const el = piece(1);
    fireEvent.click(el); // pick it
    const r0 = rotation(1);
    pointer(el, "pointerdown", 50, 50);
    pointer(el, "pointermove", 54, 50); // 4 px: still a tap
    expect(el.className).not.toContain("pz-piece-drag");
    pointer(el, "pointerup", 54, 50);
    expect(rotation(1)).toBe(r0 + 90);
    pointer(el, "pointerdown", 50, 50);
    pointer(el, "pointermove", 60, 50); // 10 px: a drag
    expect(el.className).toContain("pz-piece-drag");
    expect(el.style.translate).toBe("10px 0px");
    pointer(el, "pointerup", 60, 50);
    expect(el.className).not.toContain("pz-piece-drag");
    expect(el.style.translate).toBe(""); // set down: the straight-onto-the-element offset is gone
    expect(rotation(1)).toBe(r0 + 90); // a drag does not turn
    // a cancelled touch: back where it was, nothing placed, no sound
    feel.synth.played.length = 0;
    pointer(el, "pointerdown", 50, 50);
    pointer(el, "pointermove", 90, 50);
    expect(el.style.translate).toBe("40px 0px");
    pointer(el, "pointercancel", 0, 0);
    expect(el.style.translate).toBe("");
    expect(el.className).not.toContain("pz-piece-drag");
    expect(where(1)).toBe("Piece 2, in the tray");
    expect(rotation(1)).toBe(r0 + 90);
    pointer(el, "pointerup", 0, 0); // a late up after the cancel does nothing
    expect(rotation(1)).toBe(r0 + 90);
    expect(feel.synth.played).toEqual([]);
  });

  it("moves with the finger without drawing again for every move", () => {
    const lock = lockOf("easy", 3);
    lockCur = lock;
    mountKind(Photo, lock.view);
    const el = piece(0);
    const style = el.getAttribute("style");
    pointer(el, "pointerdown", 0, 0);
    pointer(el, "pointermove", 20, 0);
    pointer(el, "pointermove", 40, 5);
    pointer(el, "pointermove", 80, 9);
    expect(el.style.translate).toBe("80px 9px");
    expect(el.style.left + el.style.top).toBe(/left: ([^;]+); top: ([^;]+)/.exec(style ?? "")?.slice(1).join("") ?? ""); // its own place is untouched until it lands
    pointer(el, "pointerup", 80, 9);
  });

  it("answers the Player's own turns, 0 to 3, and a wrong photo is sent as given and keeps its pieces for the next try", () => {
    const base = lockOf("easy", 10); // four pieces, made to turn for this test
    const turns0 = [1, 2, 3, 1];
    const lock: PhotoLock = { ...base, view: { ...base.view, turning: true, turns0 }, secret: { kind: "photo", turns0 } };
    lockCur = lock;
    const { submits, reset } = mountKind(Photo, lock.view);
    // pieces 0 and 1 swapped; every piece turned right; piece 2 turned four extra times (a full circle)
    const order = [1, 0, 2, 3];
    order.forEach((slot, p) => {
      fireEvent.click(piece(p));
      for (let k = 0; k < need(lock, p) + (p === 2 ? 4 : 0); k++) fireEvent.click(turnBtn());
      fireEvent.click(slotBtn(slot));
    });
    expect(rotation(2)).toBe(((lock.secret.turns0[2] ?? 0) + need(lock, 2) + 4) * 90); // the picture goes on round, never back
    fireEvent.click(checkBtn());
    expect(submits).toHaveLength(1);
    expect(submits[0]?.placed).toEqual(order.map((slot, piece) => ({ piece, slot, turns: need(lock, piece) }))); // 0 to 3, never 4 and up
    expect(payloadOf(lock, submits[0])).toEqual({ ok: false, code: "wrong" });
    reset(1); // a wrong Attempt: nothing moves
    order.forEach((slot, p) => expect(where(p)).toBe(`Piece ${p + 1}, in frame spot ${slot + 1}`));
    expect(rotation(2)).toBe(((lock.secret.turns0[2] ?? 0) + need(lock, 2) + 4) * 90);
    expect(checkBtn().hasAttribute("disabled")).toBe(false);
    // fix it: piece 0 back to the tray, then piece 1 into spot 2 first, 0 into spot 1
    fireEvent.click(piece(0));
    fireEvent.click(trayBtn());
    fireEvent.click(piece(1));
    fireEvent.click(trayBtn());
    fireEvent.click(piece(0));
    fireEvent.click(slotBtn(0));
    fireEvent.click(piece(1));
    fireEvent.click(slotBtn(1));
    fireEvent.click(checkBtn());
    expect(submits).toHaveLength(2);
    expect(payloadOf(lock, submits[1])).toEqual({ ok: true });
  });

  it("enables Check only when every spot has a piece", () => {
    const lock = lockOf("medium", 12);
    mountKind(Photo, lock.view);
    for (let p = 0; p < 6; p++) {
      expect(checkBtn().hasAttribute("disabled"), `with ${p} placed`).toBe(true);
      fireEvent.click(piece(p));
      fireEvent.click(slotBtn(p));
    }
    expect(checkBtn().hasAttribute("disabled")).toBe(false);
    fireEvent.click(piece(5));
    fireEvent.click(trayBtn());
    expect(checkBtn().hasAttribute("disabled")).toBe(true);
  });

  it("keeps one piece picked at a time, turns only the picked piece, and gives the spot back with Back to tray", () => {
    const lock = lockOf("medium", 3);
    const { announcements } = mountKind(Photo, lock.view);
    fireEvent.click(piece(0));
    fireEvent.click(piece(2));
    expect(piece(0).getAttribute("aria-pressed")).toBe("false");
    expect(piece(2).getAttribute("aria-pressed")).toBe("true");
    const r0 = rotation(0);
    const r2 = rotation(2);
    fireEvent.click(turnBtn());
    expect(rotation(2)).toBe(r2 + 90);
    expect(rotation(0)).toBe(r0);
    fireEvent.click(piece(2)); // a tap on the picked piece turns it too
    expect(rotation(2)).toBe(r2 + 180);
    expect(trayBtn().hasAttribute("disabled")).toBe(true); // it is in the tray already
    fireEvent.click(slotBtn(3));
    expect(trayBtn().hasAttribute("disabled")).toBe(false);
    expect(piece(2).getAttribute("aria-pressed")).toBe("true"); // still the picked one: Turn goes on working
    fireEvent.click(trayBtn());
    expect(where(2)).toBe("Piece 3, in the tray");
    expect(screen.getByRole("button", { name: "Frame spot 4, empty" })).toBeTruthy();
    expect(announcements.some((a) => /Piece 3 picked/.test(a))).toBe(true);
    expect(announcements.some((a) => /Piece 3 in frame spot 4/.test(a))).toBe(true);
  });

  it("asks for a piece when an empty spot is tapped with none picked, and does not fill a spot that is taken", () => {
    const lock = lockOf("easy", 3);
    const { announcements } = mountKind(Photo, lock.view);
    fireEvent.click(slotBtn(0));
    expect(announcements.at(-1)).toMatch(/Pick a piece first/);
    expect(screen.getByRole("status").textContent).toBe("0 of 4 in the frame");
    fireEvent.click(piece(0));
    fireEvent.click(slotBtn(0));
    expect(screen.queryByRole("button", { name: "Frame spot 1, empty" })).toBeNull(); // taken: no longer a button
  });

  it("takes a click that a pointer made once only, and a click from a keyboard or a screen reader as a tap", () => {
    const lock = lockOf("medium", 3);
    mountKind(Photo, lock.view);
    fireEvent.click(piece(0), { detail: 1 }); // the click after a pointer tap: pointerup already did the work
    expect(piece(0).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(piece(0)); // Enter or Space, or a screen reader's activate
    expect(piece(0).getAttribute("aria-pressed")).toBe("true");
    const r = rotation(0);
    fireEvent.click(piece(0));
    expect(rotation(0)).toBe(r + 90);
  });

  it("turns without a transition when motion is reduced, and the CSS keeps fades, 48 px pieces and a 320 px layout", () => {
    const lock = lockOf("medium", 3);
    mountKind(Photo, lock.view, { reducedMotion: true });
    expect(document.querySelector(".pz-photo-board")?.className).toContain("pz-photo-still");
    expect(css).toMatch(/\.pz-photo-still \.pz-piece-art\s*{\s*transition:\s*none/);
    expect(css).toMatch(/\.pz-piece\s*{[^}]*min-width:\s*48px;\s*min-height:\s*48px/);
    expect(css).toMatch(/\.pz-photo-board\s*{[^}]*touch-action:\s*none/);
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) expect(m[1]).toMatch(/var\(--fade\)|^none$/);
    expect(css).not.toMatch(/animation|url\(|@import/);
    // at 320 px wide a piece is still big enough: board 270 px at most (phone minus the host's padding), 92 of 300 units
    expect((270 * 92) / 300).toBeGreaterThanOrEqual(48);
    expect((13 * 16 * 92) / 200).toBeGreaterThanOrEqual(48); // the 2-column board is capped at 13rem
  });

  it("goes quietly when the screen goes in the middle of a drag, and asks for no sensor", () => {
    const lock = lockOf("easy", 3);
    lockCur = lock;
    const add = vi.spyOn(window, "addEventListener");
    const addDoc = vi.spyOn(document, "addEventListener");
    const { unmount, feel } = mountKind(Photo, lock.view, { tilt: "off" });
    const el = piece(0);
    pointer(el, "pointerdown", 0, 0);
    pointer(el, "pointermove", 30, 0);
    unmount();
    expect(() => { pointer(el, "pointermove", 60, 0); pointer(el, "pointerup", 60, 0); }).not.toThrow();
    expect(add).not.toHaveBeenCalledWith("pointermove", expect.anything());
    expect(addDoc).not.toHaveBeenCalledWith("pointermove", expect.anything());
    expect(feel.motion.enabled).toBe(0);
    expect(feel.breath.state).toBe("off");
    expect(feel.synth.played).toEqual([]);
  });
});
