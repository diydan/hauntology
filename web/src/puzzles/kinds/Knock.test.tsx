// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
