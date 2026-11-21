// @vitest-environment jsdom
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineState } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "./Controller";
import { NOT_SEATED, type ControllerPort, type RoomView } from "./controller-port";

let sight: { onDone: () => void; title: string } | null = null;
vi.mock("../../puzzles/SightCard", () => ({ SightCard: (p: { onDone: () => void; title: string }) => { sight = p; return <div data-testid="sight" />; } }));
beforeEach(() => { localStorage.clear(); sight = null; });
afterEach(cleanup);

/** A real game from the Engine, seat 1 on turn (a phone's Room view of it). */
function game(over: (s: EngineState) => EngineState = (s) => s): EngineState {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "Ann" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  let r = step(createEngine({ seed: 7, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "medium" }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  let s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  return over(s);
}

function port(s: EngineState, patch: Partial<RoomView> = {}) {
  const acts: unknown[] = [];
  const view: RoomView = { ...NOT_SEATED, connection: "online", phase: "playing", code: "ABCD", seat: 1, nickname: "Ann", game: { pub: publicSnapshot(s, 0), priv: privateSnapshot(s, 1) }, ...patch };
  const p: ControllerPort = {
    getView: () => view, subscribe: () => () => {}, join: async () => ({ ok: false, code: "unreachable" }),
    attempt: () => ({ outcome: "failed", reason: "x" }), closeLock: () => {}, setPuzzles: () => {}, leave: async () => {},
    act: (m) => void acts.push(m),
    ackSight: (id) => void acts.push({ ack: id }),
  };
  return { p, acts };
}

describe("the Controller's panel plays the game (integration 5.1)", () => {
  it("shows the hand, notebook, turn and accusation from the Room's views in place of the empty slots, and keeps the Contributions slot", () => {
    const { p } = port(game());
    render(<Controller port={p} />);
    const names = ["Your turn", "Your cards and notebook", "Accuse"];
    for (const n of names) expect(screen.getByRole("region", { name: n })).toBeTruthy();
    expect(document.querySelector('[data-slot="hand"]')).toBeNull();
    expect(document.querySelector('[data-slot="notebook"]')).toBeNull();
    expect(document.querySelector('[data-slot="contributions"]')).not.toBeNull();
  });

  it("sends each press to the Room as one message through the port, and says a refusal in words", () => {
    const s = game();
    const { p, acts } = port(s, { refused: "not_your_turn" });
    render(<Controller port={p} />);
    expect(screen.getByRole("alert").textContent).toBe("It is not your turn.");
    const zone = s.pool.zones[0]!;
    fireEvent.click(within(screen.getByRole("group", { name: "Rooms" })).getByRole("button", { name: zone.name }));
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(acts).toEqual([{ t: "walk", zone: zone.id }, { t: "endTurn" }]);
  });

  it("offers a Haunting puzzle to a Player who joined the haunting, and not to a Detective", () => {
    const joined = game((s) => ({ ...s, players: s.players.map((q) => (q.seat === 1 ? { ...q, poltergeist: true } : q)) }));
    const a = port(joined);
    render(<Controller port={a.p} />);
    fireEvent.click(screen.getByRole("button", { name: "Haunt a puzzle" }));
    expect(a.acts).toEqual([{ t: "hauntPuzzle" }]);
    cleanup();
    render(<Controller port={port(game()).p} />);
    expect(screen.queryByRole("button", { name: "Haunt a puzzle" })).toBeNull();
  });

  it("shows the game only while it is on: the lobby and the ending keep their words", () => {
    for (const phase of ["lobby", "ended"] as const) {
      render(<Controller port={port(game(), { phase }).p} />);
      expect(screen.queryByRole("region", { name: "Your turn" })).toBeNull();
      cleanup();
    }
  });

  it("shows a Sight in place of the page, and tapping it done tells the Room which one", () => {
    const { p, acts } = port(game(), { sight: { id: "S1", sight: { showMs: 3000 } as never } });
    render(<Controller port={p} />);
    expect(screen.getByTestId("sight")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Your turn" })).toBeNull();
    expect(sight!.title).toBe("Something to remember");
    sight!.onDone();
    expect(acts).toEqual([{ ack: "S1" }]);
  });
});

