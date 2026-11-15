// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Level } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { createFakeFeel } from "../feel/fakes";
import { mountKind, stubGeometry, wait } from "../test-utils";
import css from "./Candles.css?raw";
import Candles from "./Candles";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("candles", level, seed);
  if (lock.kind !== "candles") throw new Error("kind");
  return lock;
}
const candle = (i: number): HTMLElement => screen.getByRole("button", { name: new RegExp(`^Candle ${i + 1},`) });
const flameOf = (i: number): string => candle(i).getAttribute("data-flame") ?? "";
const watchBtn = (): HTMLElement => screen.getByRole("button", { name: /^(Watch|No more shows)/ });
const micBtn = (): HTMLElement => screen.getByRole("button", { name: "Blow to snuff" });
const advance = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const outLine = (): string => screen.getByRole("img", { name: /Out so far/ }).getAttribute("aria-label") ?? "";

describe("Candles", () => {
  it("shows the candles told apart by number and by height, every control named, the microphone off", () => {
    const lock = lockOf("normal", 1);
    const { feel } = mountKind(Candles, lock.view);
    for (let i = 0; i < lock.view.n; i++) expect(candle(i).textContent).toBe(String(i + 1));
    const heights = Array.from({ length: lock.view.n }, (_, i) => candle(i).querySelector<HTMLElement>(".pz-wax")?.style.height);
    expect(new Set(heights).size).toBeGreaterThanOrEqual(4); // not all alike
    expect(watchBtn().textContent).toBe("Watch (2 left)");
    expect(screen.getByRole("button", { name: "Relight" })).toBeTruthy();
    expect(micBtn().getAttribute("aria-pressed")).toBe("false");
    expect(feel.breath.state).toBe("off"); // off until a tap
    expect(screen.queryByText(/Microphone on/)).toBeNull();
  });

  it("is solved by tapping the candles in the shown order, on both levels and several seeds, with a gutter and a tick at each", () => {
    for (const level of ["easy", "normal"] as const) {
      for (const seed of [1, 7, 23, 512]) {
        const lock = lockOf(level, seed);
        const { submits, feel, unmount } = mountKind(Candles, lock.view);
        lock.secret.order.forEach((c, k) => {
          expect(submits.length, `${level} ${seed} before ${k}`).toBe(0);
          fireEvent.click(candle(c));
          expect(feel.synth.played.filter((s) => s === "gutter").length).toBe(k + 1);
          expect(feel.haptics.buzzes.filter((b) => b === "tick").length).toBe(k + 1);
          expect(flameOf(c)).toBe("out");
        });
        expect(submits.length, `${level} ${seed}`).toBe(1);
        const p = submits[0];
        expect(p).toBeDefined();
        expect(verify(lock, { kind: "candles", ...p, elapsedMs: 9000 }), `${level} ${seed}`).toEqual({ ok: true });
        unmount();
      }
    }
  });

  it("puts a candle out once only, and says which are out in text", () => {
    const lock = lockOf("normal", 4);
    const { feel } = mountKind(Candles, lock.view);
    fireEvent.click(candle(2));
    fireEvent.click(candle(2));
    expect(feel.synth.played).toEqual(["gutter"]);
    expect(candle(2).hasAttribute("disabled")).toBe(true);
    expect(candle(2).getAttribute("aria-label")).toMatch(/, out$/);
    expect(outLine()).toBe("Out so far: 3");
  });

  it("submits a wrong order as given, relights every candle on resetKey, and can be tried again", () => {
    const lock = lockOf("easy", 15);
    const { submits, reset } = mountKind(Candles, lock.view);
    const wrong = [...lock.secret.order].reverse();
    wrong.forEach((c) => fireEvent.click(candle(c)));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.order).toEqual(wrong);
    expect(verify(lock, { kind: "candles", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: false, code: "wrong" });
    for (let i = 0; i < lock.view.n; i++) expect(flameOf(i)).toBe("out"); // all out until the host says it was wrong
    reset(1);
    for (let i = 0; i < lock.view.n; i++) { expect(flameOf(i)).toBe("lit"); expect(candle(i).hasAttribute("disabled")).toBe(false); }
    expect(outLine()).toBe("Out so far: none");
    lock.secret.order.forEach((c) => fireEvent.click(candle(c)));
    expect(submits).toHaveLength(2);
    expect(verify(lock, { kind: "candles", ...submits[1], elapsedMs: 9000 })).toEqual({ ok: true });
  });

  it("relights the candles from the Relight button, so a mis-tap does not cost an Attempt", () => {
    const lock = lockOf("easy", 15);
    const { submits } = mountKind(Candles, lock.view);
    fireEvent.click(candle(0));
    fireEvent.click(screen.getByRole("button", { name: "Relight" }));
    expect(flameOf(0)).toBe("lit");
    lock.secret.order.forEach((c) => fireEvent.click(candle(c)));
    expect(submits).toHaveLength(1);
    expect(submits[0]?.order).toEqual([...lock.secret.order]);
  });

  it("shows the order: each candle gutters in turn with a gutter sound and a tick, twice at most, and taps wait", () => {
    vi.useFakeTimers();
    const lock = lockOf("normal", 6);
    const { feel } = mountKind(Candles, lock.view);
    for (let show = 1; show <= 2; show++) {
      const before = feel.synth.played.length;
      fireEvent.click(watchBtn());
      expect(watchBtn().textContent).toBe("Watching…");
      expect(watchBtn().hasAttribute("disabled")).toBe(true);
      lock.view.order.forEach((c, k) => {
        expect(flameOf(c), `show ${show} step ${k}`).toBe("gutter");
        for (let i = 0; i < lock.view.n; i++) if (i !== c) expect(flameOf(i)).toBe("lit");
        expect(feel.synth.played.length).toBe(before + k + 1);
        expect(candle(c).hasAttribute("disabled")).toBe(true); // taps wait while the order is shown
        advance(519);
        expect(flameOf(c)).toBe("gutter");
        advance(1);
        expect(flameOf(c)).toBe("lit");
        advance(260);
      });
      expect(feel.synth.played.slice(before).every((s) => s === "gutter")).toBe(true);
      expect(feel.synth.played.length - before).toBe(lock.view.n);
      expect(feel.haptics.buzzes.length).toBe(show * lock.view.n);
      expect(watchBtn().textContent).toBe(show === 1 ? "Watch (1 left)" : "No more shows");
    }
    expect(watchBtn().hasAttribute("disabled")).toBe(true);
    fireEvent.click(watchBtn());
    advance(10_000);
    expect(feel.synth.played.length).toBe(2 * lock.view.n); // no third show
  });

  it("relights the candles when the order is shown again", () => {
    vi.useFakeTimers();
    const lock = lockOf("easy", 2);
    mountKind(Candles, lock.view);
    fireEvent.click(candle(1));
    expect(flameOf(1)).toBe("out");
    fireEvent.click(watchBtn());
    expect(flameOf(1)).not.toBe("out");
  });

  describe("Blow to snuff", () => {
    it("is off until tapped; then it starts the microphone, shows a microphone indicator with a stop control, and tapping a candle only picks it", async () => {
      const lock = lockOf("easy", 5);
      const { feel, submits } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      expect(feel.breath.state).toBe("on");
      expect(micBtn().getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("status").textContent).toMatch(/Microphone on/);
      expect(screen.getByRole("button", { name: "Stop listening" })).toBeTruthy();
      fireEvent.click(candle(2));
      expect(flameOf(2)).toBe("lit"); // picked, not put out
      expect(candle(2).getAttribute("aria-pressed")).toBe("true");
      expect(feel.synth.played).toEqual([]);
      expect(submits).toEqual([]);
      fireEvent.click(candle(0)); // picking another moves the pick
      expect(candle(2).getAttribute("aria-pressed")).toBe("false");
      expect(candle(0).getAttribute("aria-pressed")).toBe("true");
    });

    it("puts out the picked candle with a breath, leans its flame with the loudness, and puts all out in order", async () => {
      const lock = lockOf("easy", 5);
      const { feel, submits } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      for (const [k, c] of lock.secret.order.entries()) {
        fireEvent.click(candle(c));
        feel.breath.level = 0.2;
        await wait(60);
        expect(candle(c).querySelector<HTMLElement>(".pz-flame")?.style.transform, `lean ${k}`).toBe("skewX(24deg)");
        feel.breath.level = 0.5;
        await wait(60);
        expect(candle(c).querySelector<HTMLElement>(".pz-flame")?.style.transform).toBe("skewX(40deg)"); // never more than 40
        expect(flameOf(c)).toBe("lit");
        feel.breath.blowing = true;
        await wait(60);
        expect(flameOf(c), `out ${k}`).toBe("out");
        feel.breath.blowing = false; // the breath ends
        feel.breath.level = 0;
        await wait(40);
      }
      expect(feel.synth.played.filter((s) => s === "gutter")).toHaveLength(lock.view.n);
      expect(submits).toHaveLength(1);
      expect(verify(lock, { kind: "candles", ...submits[0], elapsedMs: 9000 })).toEqual({ ok: true });
    });

    it("counts one breath for one candle: a breath that goes on does not put out the next pick", async () => {
      const lock = lockOf("normal", 9);
      const { feel } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      fireEvent.click(candle(0));
      feel.breath.blowing = true;
      await wait(60);
      expect(flameOf(0)).toBe("out");
      fireEvent.click(candle(1)); // the same breath still goes on
      await wait(80);
      expect(flameOf(1)).toBe("lit");
      feel.breath.blowing = false;
      await wait(40);
      feel.breath.blowing = true; // a new breath
      await wait(60);
      expect(flameOf(1)).toBe("out");
    });

    it("does nothing for a breath when no candle is picked", async () => {
      const lock = lockOf("easy", 5);
      const { feel } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      feel.breath.blowing = true;
      await wait(80);
      for (let i = 0; i < lock.view.n; i++) expect(flameOf(i)).toBe("lit");
    });

    it("stops the microphone from the stop control and from the toggle, and tapping puts candles out again", async () => {
      const lock = lockOf("easy", 5);
      const { feel } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
      expect(feel.breath.state).toBe("off");
      expect(screen.queryByRole("button", { name: "Stop listening" })).toBeNull();
      expect(micBtn().getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(candle(1));
      expect(flameOf(1)).toBe("out"); // the touch path as before
      fireEvent.click(micBtn());
      await wait(20);
      expect(feel.breath.state).toBe("on");
      fireEvent.click(micBtn()); // the toggle itself switches it off
      expect(feel.breath.state).toBe("off");
      expect(screen.queryByText(/Microphone on/)).toBeNull();
    });

    it("says so when the microphone is denied or missing, and tapping works as before", async () => {
      const lock = lockOf("easy", 5);
      const denied = mountKind(Candles, lock.view);
      denied.feel.breath.startResult = "denied";
      fireEvent.click(micBtn());
      await wait(20);
      expect(denied.announcements.at(-1)).toMatch(/denied.*Tap the candles/);
      expect(micBtn().getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByText(/Microphone on/)).toBeNull();
      fireEvent.click(candle(0));
      expect(flameOf(0)).toBe("out");
      cleanup();
      const missing = mountKind(Candles, lock.view);
      missing.feel.breath.startResult = "unsupported";
      fireEvent.click(micBtn());
      await wait(20);
      expect(missing.announcements.at(-1)).toMatch(/no microphone.*Tap the candles/i);
      fireEvent.click(candle(1));
      expect(flameOf(1)).toBe("out");
    });

    it("stops the microphone when the screen goes", async () => {
      const lock = lockOf("easy", 5);
      const { feel, unmount } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      expect(feel.breath.state).toBe("on");
      unmount();
      expect(feel.breath.state).toBe("off");
    });

    it("stops a microphone that answers after the screen has gone", async () => {
      const lock = lockOf("easy", 5);
      const feel = createFakeFeel();
      let answer: (s: "on") => void = () => {};
      let stops = 0;
      feel.breath.start = () => new Promise((resolve) => { answer = (s) => { feel.breath.state = s; resolve(s); }; });
      const realStop = feel.breath.stop.bind(feel.breath);
      feel.breath.stop = () => { stops++; realStop(); };
      const { unmount } = mountKind(Candles, lock.view, { feel });
      fireEvent.click(micBtn());
      unmount();
      const before = stops;
      await act(async () => { answer("on"); await Promise.resolve(); });
      expect(stops).toBeGreaterThan(before);
      expect(feel.breath.state).toBe("off");
    });

    it("stops the microphone when the page is hidden", async () => {
      const lock = lockOf("easy", 5);
      const { feel } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      try {
        act(() => { document.dispatchEvent(new Event("visibilitychange")); });
        expect(feel.breath.state).toBe("off");
        expect(micBtn().getAttribute("aria-pressed")).toBe("false");
      } finally {
        delete (document as unknown as { hidden?: boolean }).hidden;
      }
    });

    it("follows the microphone when the host closes it", async () => {
      const lock = lockOf("easy", 5);
      const { feel } = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      act(() => { feel.closeLock(); });
      await wait(20);
      expect(micBtn().getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByText(/Microphone on/)).toBeNull();
    });

    it("keeps the flames still with reduced motion, and clears a lean when nobody listens", async () => {
      const lock = lockOf("easy", 5);
      const { feel } = mountKind(Candles, lock.view, { reducedMotion: true });
      fireEvent.click(micBtn());
      await wait(20);
      fireEvent.click(candle(1));
      feel.breath.level = 0.3;
      await wait(60);
      expect(candle(1).querySelector<HTMLElement>(".pz-flame")?.style.transform ?? "").toBe("");
      cleanup();
      const m = mountKind(Candles, lock.view);
      fireEvent.click(micBtn());
      await wait(20);
      fireEvent.click(candle(1));
      m.feel.breath.level = 0.3;
      await wait(60);
      expect(candle(1).querySelector<HTMLElement>(".pz-flame")?.style.transform).toBe("skewX(36deg)");
      fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
      expect(candle(1).querySelector<HTMLElement>(".pz-flame")?.style.transform ?? "").toBe("");
    });
  });

  it("clears every timer when the screen goes: no gutter, no buzz and no error after unmount", () => {
    vi.useFakeTimers();
    const lock = lockOf("normal", 3);
    const { feel, unmount } = mountKind(Candles, lock.view);
    fireEvent.click(watchBtn());
    advance(900); // one candle has guttered and the next has begun
    const heard = feel.synth.played.length;
    expect(heard).toBe(2);
    unmount();
    expect(() => advance(10_000)).not.toThrow();
    expect(feel.synth.played.length).toBe(heard);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses touch alone: no sensor and no microphone unless tapped, and the styles keep fades and 48 px", () => {
    const lock = lockOf("easy", 6);
    const { feel } = mountKind(Candles, lock.view, { tilt: "off" });
    lock.secret.order.forEach((c) => fireEvent.click(candle(c)));
    expect(feel.motion.enabled).toBe(0);
    expect(feel.breath.state).toBe("off");
    expect(css).toMatch(/\.pz-candle\s*{[^}]*min-width:\s*var\(--pz-target/);
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) expect(m[1]).toMatch(/var\(--fade\)|^none$/);
    expect(css).not.toMatch(/animation/);
  });
});
