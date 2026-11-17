// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { knockPlayTimes } from "@hauntology/shared/puzzles/knock";
import { verify } from "@hauntology/shared/puzzles/verify";
import type { Level } from "@hauntology/shared/puzzles/types";
import { mountKind, stubGeometry } from "../test-utils";
import Knock from "./Knock";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

function lockOf(level: Level, seed: number) {
  const lock = makeLock("knock", level, seed);
  if (lock.kind !== "knock") throw new Error("kind");
  return lock;
}
const door = (): HTMLElement => screen.getByRole("button", { name: "Tap the door: one knock" });
const start = (): HTMLElement => screen.getByRole("button", { name: /^(Knock|Listening…)$/ });
const done = (): HTMLElement => screen.getByRole("button", { name: "Done" });

describe("Knock (the Secret knock, puzzles Requirement 24)", () => {
  it("says how many groups the knock has and whether a pause is long, never the counts, and the door waits for Knock", () => {
    const lock = lockOf("hard", 4);
    mountKind(Knock, lock.view);
    expect(screen.getByText(/3 groups, one long pause/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(lock.secret.groups.join(", "));
    expect((door() as HTMLButtonElement).disabled).toBe(true);
    expect((done() as HTMLButtonElement).disabled).toBe(true);
  });

  it("the touch path: Knock, then tap the door in the ghost's rhythm, then Done, sends knock times that open the door", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      const lock = lockOf(level, 7);
      const m = mountKind(Knock, lock.view);
      fireEvent.click(start());
      expect(start().textContent).toBe("Listening…");
      for (const t of knockPlayTimes(lock.secret)) { m.clock.ms = 1000 + t; fireEvent.click(door()); }
      expect(m.feel.synth.played.filter((n) => n === "thunk")).toHaveLength(knockPlayTimes(lock.secret).length);
      fireEvent.click(done());
      expect(m.submits).toHaveLength(1);
      const sent = m.submits[0]!;
      expect(verify(lock, { kind: "knock", ...sent, elapsedMs: 60_000 })).toEqual({ ok: true });
      expect(m.announcements.at(-1)).toBe(`You knocked ${lock.secret.groups.join(", ")}.`);
      cleanup();
    }
  });

  it("a knock too soon after the last counts once, and the dots follow the groups", () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Knock, lock.view);
    fireEvent.click(start());
    for (const t of [0, 50, 300, 600, 1700, 2000]) { m.clock.ms = t; fireEvent.click(door()); } // 50 is inside the debounce
    expect(screen.getByRole("img", { name: "Knocked so far: 3, 2" }).textContent).toBe("● ● ●   ● ●");
  });

  it("a wrong Attempt clears the knocks, and Knock starts a new try", () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Knock, lock.view);
    fireEvent.click(start());
    m.clock.ms = 100; fireEvent.click(door());
    fireEvent.click(done());
    act(() => { m.reset(1); });
    expect(screen.getByRole("img", { name: "No knocks yet" })).toBeTruthy();
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Knock: the phone feels and hears knocks on the table", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] }); });
  afterEach(() => { vi.useRealTimers(); });
  const frame = (): void => { act(() => { vi.advanceTimersByTime(17); }); };
  const marks = (): string => screen.getByRole("img", { name: /Knocked so far|No knocks yet/ }).getAttribute("aria-label") ?? "";

  it("asks for motion from the Knock tap, and with only motion on, a jolt is a knock and a small one is not", async () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Knock, lock.view);
    m.feel.breath.startResult = "denied";
    await act(async () => { fireEvent.click(start()); });
    expect(m.feel.motion.enabled).toBe(1);
    expect(m.feel.motion.state).toBe("on");
    m.feel.motion.jolt = 1.2; frame();
    expect(marks()).toBe("No knocks yet");
    m.clock.ms = 500; m.feel.motion.jolt = 4; frame();
    expect(marks()).toBe("Knocked so far: 1");
  });

  it("with motion and the microphone both on, a knock must be a jolt and a click together: talk alone or a bump alone is not", async () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Knock, lock.view);
    await act(async () => { fireEvent.click(start()); });
    expect(m.feel.breath.state).toBe("on");
    m.clock.ms = 100; m.feel.breath.level = 0.4; frame(); // a laugh: loud, no jolt
    m.feel.breath.level = 0; frame();
    m.clock.ms = 600; m.feel.motion.jolt = 5; frame(); // a cup put down: a jolt, no click
    expect(marks()).toBe("No knocks yet");
    m.clock.ms = 1200; m.feel.motion.jolt = 5; m.feel.breath.level = 0.4; frame(); // a knock: both at once
    expect(marks()).toBe("Knocked so far: 1");
    m.feel.breath.level = 0; frame();
    m.clock.ms = 1500; m.feel.motion.jolt = 5; frame(); m.clock.ms = 1550; m.feel.breath.level = 0.4; frame(); // both, 50 ms apart
    expect(marks()).toBe("Knocked so far: 2");
  });

  it("does not ask for motion again when the phone said no, and the door still takes taps", async () => {
    const lock = lockOf("easy", 3);
    const m = mountKind(Knock, lock.view);
    m.feel.motion.setState("denied");
    await act(async () => { fireEvent.click(start()); });
    expect(m.feel.motion.enabled).toBe(0);
    m.clock.ms = 10; fireEvent.click(door());
    expect(marks()).toBe("Knocked so far: 1");
  });
});
