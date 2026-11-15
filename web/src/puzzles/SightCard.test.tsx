// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { fadedFor, sightFor } from "@hauntology/shared/puzzles/sight";
import type { Kind } from "@hauntology/shared/puzzles/types";
import { createFakeFeel } from "./feel/fakes";
import { SightCard } from "./SightCard";

afterEach(() => cleanup());

function sightOf(kind: Kind) {
  const s = sightFor(makeLock(kind, "easy", 3));
  if (s === null) throw new Error("no sight");
  return s;
}

describe("SightCard", () => {
  it.each([
    ["wires", /Fuse box/],
    ["clock", /A stopped clock showing/],
    ["safe", /Code:/],
    ["moved", /Spot 1:/],
    ["photo", /The whole photo/],
  ] as const)("shows the %s clue", (kind, label) => {
    render(<SightCard sight={sightOf(kind)} title="You notice something…" feel={createFakeFeel()} onDone={() => {}} />);
    expect(screen.getByRole("dialog", { name: "You notice something…" })).toBeTruthy();
    expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
  });

  it("buzzes a heartbeat when it appears, and closes once on a tap", () => {
    const feel = createFakeFeel();
    const done = vi.fn();
    render(<SightCard sight={sightOf("clock")} title="t" feel={feel} onDone={done} />);
    expect(feel.haptics.buzzes).toEqual(["heartbeat"]);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("closes by itself when its time is up, once, using the clock it is given", async () => {
    let t = 0;
    const done = vi.fn();
    const sight = { ...sightOf("safe"), showMs: 300 };
    render(<SightCard sight={sight} title="t" feel={createFakeFeel()} onDone={done} now={() => t} />);
    t = 100;
    await new Promise((r) => setTimeout(r, 130));
    expect(done).not.toHaveBeenCalled();
    t = 400;
    await new Promise((r) => setTimeout(r, 130));
    expect(done).toHaveBeenCalledTimes(1);
    t = 900;
    await new Promise((r) => setTimeout(r, 130));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("keeps a faded clue shorter than a Sight, and longer with Assist", () => {
    const lock = makeLock("wires", "normal", 5);
    expect((fadedFor(lock)?.showMs ?? 0)).toBeLessThan(sightFor(lock)?.showMs ?? 0);
    expect(fadedFor(lock, true)?.showMs).toBe(8000);
  });
});
