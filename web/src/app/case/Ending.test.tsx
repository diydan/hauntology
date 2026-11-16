// @vitest-environment jsdom
import { createEngine, publicSnapshot, step, type PublicSnapshot } from "@hauntology/shared/party/engine";
import { endingPayload } from "@hauntology/shared/party/ending";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ending, RECAP_STEP_MS } from "./Ending";
import { namesOf } from "./words";

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** A real game's public view, given an ending built by the real `endingPayload`. */
function ended(o: { houseWins: boolean; winners: number[]; poltergeist?: number }): PublicSnapshot {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "You" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  const s = step(createEngine({ seed: 3, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
  const sol = s.deal!.solution;
  const z = s.pool.zones;
  const log = [
    { id: 1, kind: "turn-start" as const, seat: 1 },
    { id: 2, kind: "suggest" as const, seat: 2, zone: z[0]!.id, suspect: s.pool.suspects[0]!.id, relic: s.pool.relics[0]!.id, passed: [], refuter: 1 },
    { id: 3, kind: "inspect" as const, seat: 3, zone: z[1]!.id },
  ];
  const players = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, poltergeist: seat === o.poltergeist, suggestions: seat === 2 ? 1 : 0, turnMsUsed: 1000 * seat }));
  const ending = endingPayload({ solution: sol, residueAt: { [z[1]!.id]: s.pool.relics[2]!.id }, winners: o.winners, houseWins: o.houseWins, players, log, sources: [], bluffs: new Set([2]) });
  const v = publicSnapshot(s, 0);
  return { ...v, phase: "ended", ending, seats: v.seats.map((x) => ({ ...x, poltergeist: x.seat === o.poltergeist })) };
}

describe("the ending screen", () => {
  it("ranks the winners, names the answer, the Residue and who joined the haunting, never the word Poltergeist", () => {
    const view = ended({ houseWins: false, winners: [2, 1], poltergeist: 3 });
    const n = namesOf(view, 1);
    render(<Ending view={view} n={n} reducedMotion />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The case is solved");
    const text = document.body.textContent ?? "";
    expect(text).toContain("First DetectiveYou"); // fewer Suggestions ranks first: seat 1 made none
    expect(text).toContain("Also rightBot2");
    expect(text).toContain("Joined the hauntingBot3");
    expect(text).toContain(`The ${n.card(view.relics[2]!.id)}, in the ${view.zones[1]!.name}.`);
    expect(text).toContain("It was a bluff.");
    expect(text).not.toMatch(/poltergeist/i);
  });

  it("says the haunting continues when the house wins, with no winners", () => {
    const view = ended({ houseWins: true, winners: [] });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The haunting continues");
    expect(document.body.textContent).not.toContain("First Detective");
    expect(document.body.textContent).toContain("Joined the hauntingNobody");
  });

  it("tells the recap one entry at a time, and Skip shows the rest at once", () => {
    vi.useFakeTimers();
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} />);
    const rows = () => document.querySelectorAll(".ui-log-row").length;
    expect(rows()).toBe(0);
    act(() => { vi.advanceTimersByTime(RECAP_STEP_MS); });
    expect(rows()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Skip to the end" }));
    expect(rows()).toBe(3);
    expect(screen.queryByRole("button", { name: "Skip to the end" })).toBeNull();
  });
});
