// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { knockPlayTimes } from "@hauntology/shared/puzzles/knock";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { fadedFor, sightFor } from "@hauntology/shared/puzzles/sight";
import type { Kind } from "@hauntology/shared/puzzles/types";
import { createFakeFeel } from "./feel/fakes";
import { SightCard } from "./SightCard";

afterEach(() => { cleanup(); vi.useRealTimers(); });

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
    const lock = makeLock("wires", "medium", 5);
    expect((fadedFor(lock)?.showMs ?? 0)).toBeLessThan(sightFor(lock)?.showMs ?? 0);
    expect(fadedFor(lock, true)?.showMs).toBe(8000);
  });
  describe("the secret knock clue", () => {
    const knockSight = () => { const s = sightOf("knock"); if (s.payload.kind !== "knock") throw new Error("not a knock"); return s; };
    const knocks = () => knockPlayTimes(knockSight().payload as never).length;
    const draw = (feel = createFakeFeel()) => { render(<SightCard sight={knockSight()} title="t" feel={feel} onDone={() => {}} now={() => 0} />); return feel; };
    const BUTTON = { name: "Tap to hear the knock" };

    it("plays by itself when the phone's sound is already on, and offers no button", async () => {
      vi.useFakeTimers();
      const feel = draw();
      expect(screen.queryByRole("button", BUTTON)).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(feel.synth.played).toEqual(Array(knocks()).fill("thunk"));
    });

    it("offers a tap while the sound is locked, and the tap unlocks it and plays the knock where it can be heard", async () => {
      vi.useFakeTimers();
      const feel = createFakeFeel();
      feel.synth.state = "locked";
      draw(feel);
      fireEvent.click(screen.getByRole("button", BUTTON));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(feel.synth.state).toBe("on");
      expect(screen.queryByRole("button", BUTTON)).toBeNull();
      expect(feel.synth.played).toEqual([]); // nothing yet: the knock starts a moment after the tap
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(feel.synth.played).toEqual(Array(knocks()).fill("thunk")); // once each, not once from the card and again from the tap
      expect(feel.events.filter((e) => e.type === "sound" && !e.muted)).toHaveLength(knocks());
    });

    it("says so when the phone will not play sound, and nothing is heard", async () => {
      vi.useFakeTimers();
      const feel = createFakeFeel();
      feel.synth.state = "locked";
      feel.synth.unlock = async () => "locked";
      draw(feel);
      fireEvent.click(screen.getByRole("button", BUTTON));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByText(/Sound is off here/)).toBeTruthy();
      expect(screen.queryByRole("button", BUTTON)).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(feel.synth.played).toHaveLength(knocks()); // only the card's own pass, as silent twins: the tap added no second pass
      expect(feel.events.filter((e) => e.type === "sound" && !e.muted)).toEqual([]);
    });

    it("plays nothing when the card closes while the phone is unlocking", async () => {
      vi.useFakeTimers();
      const feel = createFakeFeel();
      feel.synth.state = "locked";
      draw(feel);
      fireEvent.click(screen.getByRole("button", BUTTON));
      cleanup(); // the card closes in the same moment
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(feel.synth.played).toEqual([]);
    });

    it("offers no button on a clue that has no sound", () => {
      const feel = createFakeFeel();
      feel.synth.state = "locked";
      render(<SightCard sight={sightOf("clock")} title="t" feel={feel} onDone={() => {}} />);
      expect(screen.queryByRole("button", BUTTON)).toBeNull();
    });
  });
});
