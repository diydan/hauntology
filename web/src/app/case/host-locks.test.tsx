// @vitest-environment jsdom
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineState } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PuzzleHostProps } from "../../puzzles/PuzzleHost";
import { SoloTable } from "./host";
import type { RoomClient, RoomSnapshot } from "./room-client";

let host: PuzzleHostProps | null = null;
let sight: { onDone: () => void; title: string } | null = null;
vi.mock("../../puzzles/PuzzleHost", () => ({ PuzzleHost: (p: PuzzleHostProps) => { host = p; return <div data-testid="puzzle" />; } }));
vi.mock("../../puzzles/SightCard", () => ({ SightCard: (p: { onDone: () => void; title: string }) => { sight = p; return <div data-testid="sight" />; } }));
let settings: (() => { touchOnly: boolean }) | null = null;
vi.mock("../../puzzles/feel/create", async () => {
  const { createFakeFeel } = await import("../../puzzles/feel/fakes");
  return { createBrowserFeel: (get: () => { touchOnly: boolean }) => { settings = get; return createFakeFeel(); } };
});
afterEach(() => { cleanup(); host = null; sight = null; settings = null; });

function playing(): EngineState {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "You" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  let r = step(createEngine({ seed: 7, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "medium" }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  let s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  return s;
}

function client(over: Partial<RoomSnapshot>, mutate: (s: EngineState) => EngineState = (s) => s) {
  const s = mutate(playing());
  const calls: unknown[][] = [];
  const snap: RoomSnapshot = { status: "playing", code: "ABCD", seat: 1, public: publicSnapshot(s, 0), private: privateSnapshot(s, 1), refused: null, masterSeat: null, lock: null, sight: null, ...over };
  const c: RoomClient = {
    getSnapshot: () => snap, subscribe: () => () => {}, send: () => {}, close: () => {}, disconnect: () => {},
    attempt: async (...a) => { calls.push(["attempt", ...a]); return { outcome: "solved" }; },
    closeLock: (...a) => void calls.push(["closeLock", ...a]),
    ackSight: (...a) => void calls.push(["ackSight", ...a]),
  };
  return { c, calls };
}

const LOCK: NonNullable<RoomSnapshot["lock"]> = { id: "L1", kind: "safe", view: { kind: "safe" } as never, faded: null, attempts: 3, capMs: 45_000 };

describe("the solo table with a Lock or a Sight (integration 5.3)", () => {
  it("shows the Lock in place of the table, played by touch or mouse, and sends Attempts and the way it ended to the Room", async () => {
    const { c, calls } = client({ lock: LOCK });
    render(<SoloTable client={c} />);
    expect(screen.getByTestId("puzzle")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Rooms" })).toBeNull();
    expect(host).toMatchObject({ kind: "safe", attempts: 3, capMs: 45_000 });
    expect(host!.clue).toBeNull();
    const reply = await act(async () => host!.onAttempt({ kind: "safe" } as never));
    expect(reply).toEqual({ outcome: "solved" });
    host!.onGiveUp();
    host!.onTimeUp?.();
    host!.onFinish?.({ outcome: "solved" });
    expect(calls).toEqual([["attempt", "L1", { kind: "safe" }], ["closeLock", "L1", "gave_up"], ["closeLock", "L1", "time_up"], ["closeLock", "L1", "finished"]]);
  });

  it("the Lock is played Touch only here, with settings that are not saved to the device", () => {
    localStorage.clear();
    const { c } = client({ lock: LOCK });
    render(<SoloTable client={c} />);
    expect(host!.feel).toBeTruthy();
    expect(settings!().touchOnly).toBe(true);
    host!.onTiltChoice?.(false);
    expect(localStorage.length).toBe(0);
  });

  it("a Sight shows first, and tapping it done tells the Room which one", () => {
    const { c, calls } = client({ lock: LOCK, sight: { id: "S1", sight: { showMs: 3000 } as never } });
    render(<SoloTable client={c} />);
    expect(screen.getByTestId("sight")).toBeTruthy();
    expect(screen.queryByTestId("puzzle")).toBeNull();
    expect(sight!.title).toBe("Something to remember");
    sight!.onDone();
    expect(calls).toEqual([["ackSight", "S1"]]);
  });

  it("with no Lock and no Sight the table is as it was", () => {
    const { c } = client({});
    render(<SoloTable client={c} />);
    expect(screen.queryByTestId("puzzle")).toBeNull();
    expect(screen.getByRole("group", { name: "Rooms" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button")[0]!); // the table still takes clicks
  });

  const joined = (s: EngineState): EngineState => ({ ...s, players: s.players.map((p) => (p.seat === 1 ? { ...p, poltergeist: true } : p)) });
  const sendsOf = (c: RoomClient) => { const sent: unknown[] = []; const orig = c.send; c.send = (m) => { sent.push(m); orig(m); }; return sent; };

  it("a visitor who has joined the haunting can open a Haunting puzzle (5.7); a Detective has no such button", () => {
    const { c } = client({}, joined);
    const sent = sendsOf(c);
    render(<SoloTable client={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Haunt a puzzle" }));
    expect(sent).toEqual([{ t: "hauntPuzzle" }]);
    expect(document.body.textContent).not.toMatch(/poltergeist/i);
    cleanup();
    render(<SoloTable client={client({}).c} />);
    expect(screen.queryByRole("button", { name: "Haunt a puzzle" })).toBeNull();
  });

  it("offers no Haunting puzzle when the Puzzle setting is off", () => {
    const { c } = client({}, (s) => ({ ...joined(s), settings: { ...s.settings, puzzles: "off" } }));
    render(<SoloTable client={c} />);
    expect(screen.queryByRole("button", { name: "Haunt a puzzle" })).toBeNull();
  });

  it("says in words that a second Haunting puzzle in a Round waits for the next Round", () => {
    const { c } = client({ refused: "puzzle_attempts_spent" }, joined);
    render(<SoloTable client={c} />);
    expect(screen.getByRole("alert").textContent).toBe("You have haunted with a puzzle this round already. Another one opens next round.");
  });
});
