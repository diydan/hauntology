// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { createFakeFeel } from "./feel/fakes";
import { PuzzleHost } from "./PuzzleHost";
import { stubGeometry } from "./test-utils";

/** Integration 5.5 (design-system 4.1): one solid yellow button in a puzzle view, the puzzle's own Set or Check, and never two at once. */
let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

/** The solid yellow buttons on screen: primary, not disabled, and not inside the finished (done) puzzle. */
const solid = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(".ui-button--primary")].filter((b) => !(b as HTMLButtonElement).disabled && b.closest("[data-done]") === null);

function host(onAttempt: () => { outcome: "solved" } | { outcome: "wrong"; attemptsLeft: number }) {
  const lock = makeLock("clock", "easy", 4);
  return render(<PuzzleHost kind="clock" view={lock.view} faded={null} capMs={25_000} attempts={3} feel={createFakeFeel()} assist={false} reducedMotion={false} onAttempt={onAttempt} onGiveUp={() => {}} />);
}

describe("one solid yellow button in a puzzle view", () => {
  it("while playing: the puzzle's own button only", async () => {
    host(() => ({ outcome: "wrong", attemptsLeft: 2 }));
    await screen.findByRole("application", { name: "Clock to set" });
    expect(solid().map((b) => b.textContent)).toEqual(["Set this time"]);
  });

  it("asking to give up: still one, and Keep playing is not a second", async () => {
    host(() => ({ outcome: "wrong", attemptsLeft: 2 }));
    await screen.findByRole("application", { name: "Clock to set" });
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    expect(screen.getByRole("button", { name: "Keep playing" })).toBeTruthy();
    expect(solid()).toHaveLength(1);
  });

  it("with the result showing: Done is the one, and the finished puzzle's button is not solid", async () => {
    host(() => ({ outcome: "solved" }));
    await screen.findByRole("application", { name: "Clock to set" });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Set this time" })); });
    expect(solid().map((b) => b.textContent)).toEqual(["Done"]);
  });
});
