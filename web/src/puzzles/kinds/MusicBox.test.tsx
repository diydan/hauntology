// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Level } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { mountKind, stubGeometry } from "../test-utils";
import css from "./MusicBox.css?raw";
import MusicBox from "./MusicBox";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("musicbox", level, seed);
  if (lock.kind !== "musicbox") throw new Error("kind");
  return lock;
}
const key = (i: number): HTMLElement => screen.getByRole("button", { name: new RegExp(`^Key ${i + 1},`) });
const wind = (): HTMLElement => screen.getByRole("button", { name: /^(Wind|Playing|No winds)/ });
const lit = (): number[] => [0, 1, 2, 3, 4].filter((i) => key(i).getAttribute("data-lit") === "true");
const played = (): string => screen.getByRole("img", { name: /Played so far/ }).textContent ?? "";
const advance = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const SHAPES = ["●", "■", "▲", "◆", "★"];

describe("MusicBox", () => {
  it("shows five keys told apart by shape and number, a Wind button and Clear, all named", () => {
    const lock = lockOf("easy", 1);
    mountKind(MusicBox, lock.view);
    expect(wind().textContent).toBe("Wind (3 left)");
    const names = ["Key 1, circle", "Key 2, square", "Key 3, triangle", "Key 4, diamond", "Key 5, star"];
    names.forEach((name, i) => {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
      expect(key(i).textContent).toBe(`${SHAPES[i]}${i + 1}`); // the shape AND the number, not a colour
    });
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(played()).toBe("···");
  });

  it("is solved on the keys alone (no sound, no buzz needed) and answers by itself at the last note, on both levels and several seeds", () => {
    for (const level of ["easy", "medium"] as const) {
      for (const seed of [2, 9, 31, 640]) {
        const lock = lockOf(level, seed);
        const { submits, unmount } = mountKind(MusicBox, lock.view);
        lock.secret.tune.forEach((n, i) => {
          expect(submits.length, `${level} ${seed} before note ${i}`).toBe(0);
          fireEvent.click(key(n));
        });
        expect(submits.length, `${level} ${seed}`).toBe(1);
        const p = submits[0];
        expect(p).toBeDefined();
        expect(verify(lock, { kind: "musicbox", ...p, elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("plays every tap: its note, one tick buzz, and lights its key for a moment, also with the sound muted", () => {
    vi.useFakeTimers();
    const lock = lockOf("medium", 5);
    const { feel } = mountKind(MusicBox, lock.view);
    feel.synth.state = "locked"; // the Player has not unlocked sound: the twin must still show
    fireEvent.click(key(3));
    expect(feel.synth.played).toEqual(["note3"]);
    expect(feel.haptics.buzzes).toEqual(["tick"]);
    expect(feel.events).toContainEqual({ type: "sound", name: "note3", muted: true });
    expect(lit()).toEqual([3]);
    advance(300);
    expect(lit()).toEqual([]);
    expect(played()).toContain(SHAPES[3]);
  });

  it("winds the tune: a note every 650 ms, each lighting its key and buzzing a tick, Wind disabled meanwhile", () => {
    vi.useFakeTimers();
    const lock = lockOf("medium", 5);
    const tune = lock.view.tune;
    const { feel } = mountKind(MusicBox, lock.view);
    feel.synth.state = "locked"; // muted: the keys still have to show the tune
    fireEvent.click(wind());
    expect(wind().textContent).toBe("Playing…");
    expect(wind().hasAttribute("disabled")).toBe(true);
    tune.forEach((n, k) => {
      if (k > 0) {
        advance(649);
        expect(feel.synth.played.length, `before note ${k}`).toBe(k);
        advance(1);
      }
      expect(feel.synth.played.length, `note ${k}`).toBe(k + 1);
      expect(feel.synth.played[k]).toBe(`note${n}`);
      expect(lit(), `lit at ${k}`).toEqual([n]);
      expect(feel.haptics.buzzes.length).toBe(k + 1);
      expect(wind().hasAttribute("disabled")).toBe(true);
    });
    advance(650); // after the last note
    expect(feel.synth.played.length).toBe(tune.length);
    expect(feel.haptics.buzzes.every((b) => b === "tick")).toBe(true);
    expect(wind().textContent).toBe("Wind (2 left)");
    expect(wind().hasAttribute("disabled")).toBe(false);
  });

  it("allows three winds and no more, and the keys wait while the tune plays", () => {
    vi.useFakeTimers();
    const lock = lockOf("easy", 8);
    const { feel, submits } = mountKind(MusicBox, lock.view);
    for (let w = 1; w <= 3; w++) {
      fireEvent.click(wind());
      fireEvent.click(key(0)); // pressed while the tune plays: ignored
      advance(650 * lock.view.n + 10);
      expect(feel.synth.played.length, `after wind ${w}`).toBe(lock.view.tune.length * w);
    }
    expect(played()).toBe("···");
    expect(submits).toEqual([]);
    expect(wind().textContent).toBe("No winds left");
    expect(wind().hasAttribute("disabled")).toBe(true);
    fireEvent.click(wind());
    advance(5000);
    expect(feel.synth.played.length).toBe(lock.view.tune.length * 3);
  });

  it("submits a wrong tune as given, clears the notes on resetKey, keeps the winds used, and can be tried again", () => {
    vi.useFakeTimers();
    const lock = lockOf("easy", 12);
    const { submits, reset, feel } = mountKind(MusicBox, lock.view);
    fireEvent.click(wind());
    advance(650 * lock.view.n + 10);
    const wrong = lock.secret.tune.map((n) => (n + 1) % 5);
    wrong.forEach((n) => fireEvent.click(key(n)));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.notes).toEqual(wrong);
    expect(verify(lock, { kind: "musicbox", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    expect(played()).not.toBe("···"); // still shown until the host says it was wrong
    reset(1);
    expect(played()).toBe("···");
    expect(wind().textContent).toBe("Wind (2 left)"); // winds are not given back
    lock.secret.tune.forEach((n) => fireEvent.click(key(n)));
    expect(submits).toHaveLength(2);
    expect(verify(lock, { kind: "musicbox", ...submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
    expect(feel.haptics.attempts).toBe(0); // the host starts a new Attempt, not the screen
  });

  it("stops at the last note until the host answers, and Clear starts the notes over", () => {
    const lock = lockOf("easy", 12);
    const { submits } = mountKind(MusicBox, lock.view);
    expect(screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(key(1));
    fireEvent.click(key(2));
    expect(played()).toBe(`${SHAPES[1]}${SHAPES[2]}·`);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(played()).toBe("···");
    fireEvent.click(key(4));
    fireEvent.click(key(4));
    fireEvent.click(key(4));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.notes).toEqual([4, 4, 4]);
    fireEvent.click(key(0)); // a fourth note is not taken: the answer is in
    expect(submits).toHaveLength(1);
    expect(played()).toBe(`${SHAPES[4]}${SHAPES[4]}${SHAPES[4]}`);
  });

  it("does the same with reduced motion on", () => {
    vi.useFakeTimers();
    const lock = lockOf("easy", 3);
    const { feel } = mountKind(MusicBox, lock.view, { reducedMotion: true });
    fireEvent.click(wind());
    expect(lit()).toEqual([lock.view.tune[0]]);
    advance(650 * lock.view.n);
    expect(feel.synth.played.length).toBe(lock.view.n);
  });

  it("clears every timer when the screen goes: no note, no buzz and no error after unmount", () => {
    vi.useFakeTimers();
    const lock = lockOf("medium", 4);
    const { feel, unmount } = mountKind(MusicBox, lock.view);
    fireEvent.click(wind());
    advance(700); // two notes so far
    const heard = feel.synth.played.length;
    expect(heard).toBe(2);
    unmount();
    expect(() => advance(10_000)).not.toThrow();
    expect(feel.synth.played.length).toBe(heard);
    expect(feel.haptics.buzzes.length).toBe(heard);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses touch alone: nothing asks for tilt or the microphone", () => {
    const lock = lockOf("easy", 6);
    const { feel } = mountKind(MusicBox, lock.view, { tilt: "off" });
    lock.secret.tune.forEach((n) => fireEvent.click(key(n)));
    expect(feel.motion.enabled).toBe(0);
    expect(feel.breath.state).toBe("off");
  });

  it("styles its keys at least 48 px, with fades only", () => {
    expect(css).toMatch(/\.pz-key\s*{[^}]*min-height:\s*max\(4\.5rem/);
    expect(css).toMatch(/\.pz-key\s*{[^}]*min-width:\s*var\(--pz-target/);
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) expect(m[1]).toMatch(/var\(--fade\)|^none$/);
    expect(css).not.toMatch(/animation/);
  });
});
