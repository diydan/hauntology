// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { sightFor } from "@hauntology/shared/puzzles/sight";
import { MEMORY_KINDS, type Sight } from "@hauntology/shared/puzzles/types";
import { SightsPage } from "./SightsPage";

afterEach(cleanup);

const sights = (): Sight[] => MEMORY_KINDS.map((k) => {
  const lock = makeLock(k, "easy", 4);
  return sightFor(lock);
}).filter((s): s is Sight => s !== null);

describe("SightsPage", () => {
  it("keeps every clue the Player saw, in the order they were shown, only where Assist is on", () => {
    const list = sights();
    expect(list.length).toBe(MEMORY_KINDS.length);
    render(<SightsPage assist sights={list} />);
    expect(screen.getByRole("region", { name: "Clues" })).toBeTruthy();
    const names = [...document.querySelectorAll(".pz-sight-name")].map((n) => n.textContent);
    expect(names).toEqual(MEMORY_KINDS.map((k) => ({ wires: "The fuse box", clock: "The stopped clock", safe: "The brass plaque", moved: "The shelf", photo: "The photo" })[k as "wires"]));
    expect(document.querySelectorAll(".pz-sight-item").length).toBe(MEMORY_KINDS.length);
  });

  it("shows each clue exactly: the safe's code and the clock's time are readable", () => {
    const safe = makeLock("safe", "easy", 9);
    const clock = makeLock("clock", "easy", 9);
    const list = [sightFor(safe), sightFor(clock)].filter((s): s is Sight => s !== null);
    if (safe.kind !== "safe" || clock.kind !== "clock") throw new Error("kind");
    render(<SightsPage assist sights={list} />);
    expect(screen.getByRole("img", { name: `Code: ${safe.secret.code.join(" ")}` })).toBeTruthy();
    expect(screen.getByRole("img", { name: new RegExp(`stopped clock showing ${clock.secret.h}:`) })).toBeTruthy();
  });

  it("says there are no clues yet when none was seen", () => {
    render(<SightsPage assist sights={[]} />);
    expect(screen.getByText(/No clues yet/)).toBeTruthy();
    expect(document.querySelector(".pz-sight-list")).toBeNull();
  });

  it("shows no clue at all with Assist off, even when it is given some, and says how to keep them", () => {
    render(<SightsPage assist={false} sights={sights()} />);
    expect(document.querySelectorAll(".pz-sight-item").length).toBe(0);
    expect(document.querySelector("svg")).toBeNull();
    expect(screen.getByText(/Turn on Assist/)).toBeTruthy();
  });
});
