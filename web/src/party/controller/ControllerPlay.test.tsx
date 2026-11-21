// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { game, lobby, priv, pub } from "../../test/party-fixtures";
import { Controller } from "./Controller";
import type { ControllerPort, RoomView } from "./controller-port";
import { NOT_SEATED } from "./controller-port";
import type { PlayExtras } from "./SeatedFrame";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

/** A Room that has already seated this phone: the view is set by the test, every message the phone sends is kept. */
class GamePort implements ControllerPort {
  view: RoomView;
  sent: Array<Readonly<{ t: string } & Record<string, unknown>>> = [];
  restored: Array<string | undefined> = [];
  listeners = new Set<(v: RoomView) => void>();
  constructor(over: Partial<RoomView> = {}) { this.view = { connection: "online", phase: "playing", code: "K7M2", seat: 1, nickname: "Ana", master: { puzzles: "off", preset: "classic" }, lock: null, game: game(), clock: { offsetMs: 0, errorMs: 0 }, ...over }; }
  async join(): Promise<never> { throw new Error("not used"); }
  getView(): RoomView { return this.view; }
  subscribe(l: (v: RoomView) => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  set(over: Partial<RoomView>): void { this.view = { ...this.view, ...over }; act(() => { for (const l of [...this.listeners]) l(this.view); }); }
  attempt(): never { throw new Error("not used"); }
  closeLock(): void { /* not used */ }
  setPuzzles(): void { /* not used */ }
  send(msg: Readonly<{ t: string } & Record<string, unknown>>): void { this.sent.push(msg); }
  async restore(code?: string): Promise<null> { this.restored.push(code); return null; }
  async leave(): Promise<void> { this.view = NOT_SEATED; }
}

const extras = (over: Partial<PlayExtras> = {}): PlayExtras => ({
  worlds: [{ id: "kitchen", name: "The kitchen", walkRadius: 9, authoredZones: false }],
  storage: localStorage,
  unlock: async () => true,
  now: () => 0,
  soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
  ...over,
});
const panelLayout = (): void => { fireEvent.click(screen.getByRole("radio", { name: "Panel" })); };

describe("the Controller with a real game behind its port (party-mode 9)", () => {
  it("asks the port to take the stored seat when the page opens, with the code in the address if there is one", () => {
    const port = new GamePort({ seat: null, game: undefined as never });
    port.view = NOT_SEATED;
    render(<Controller port={port} initialCode="K7M2" extras={extras()} />);
    expect(port.restored).toEqual(["K7M2"]);
    cleanup();
    render(<Controller port={port} extras={extras()} />);
    expect(port.restored.at(-1)).toBeUndefined();
  });
  it("shows the lobby before the game starts: the players, and the Master's controls to the Master", () => {
    const port = new GamePort({ phase: "lobby", game: game({ pub: null, priv: null, lobby: lobby({ started: false, worldId: null }) }) });
    render(<Controller port={port} extras={extras()} />);
    expect(screen.getByRole("region", { name: "Lobby" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Master controls" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("World"), { target: { value: "kitchen" } });
    expect(port.sent).toContainEqual({ t: "world", id: "kitchen", walkRadius: 9, authoredZones: false });
  });
  it("in the panel layout shows the clock, the actions, the hand, the notebook, the cue controls and the log, and walking sends a message", () => {
    const port = new GamePort({ game: { ...game(), log: [{ id: 1, text: "Ana's turn." }] } });
    render(<Controller port={port} extras={extras()} />);
    panelLayout();
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Actions" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your hand" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cues, nudges and frames" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "What is happening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Attic" }));
    expect(port.sent).toContainEqual({ t: "walk", zone: "z2" });
  });
  it("in the pad layout shows the stick and look area instead of the hand and notebook", () => {
    const port = new GamePort();
    render(<Controller port={port} extras={extras()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Pad" }));
    expect(screen.getByRole("group", { name: "Movement stick" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Look area" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Notebook" })).toBeNull();
  });
  it("puts the Room's question to the Player: which card to show, and which Haunt Event for a haunting Player", () => {
    const port = new GamePort({ game: game({ pub: pub({ active: 2 }), priv: priv({ answer: { eventId: 4, options: ["s1", "z3"], deadlineMs: 9000 } }) }) });
    render(<Controller port={port} extras={extras()} />);
    panelLayout();
    fireEvent.click(screen.getByRole("button", { name: "Parlour" }));
    expect(port.sent).toContainEqual({ t: "show", card: "z3" });
    port.set({ game: game({ pub: pub({ active: 2 }), priv: priv({ seat: 3, choose: { options: ["restless", "lull"], deadlineMs: 15_000 }, rattle: { allowed: true, on: false }, scare: 0 }) }), seat: 3 });
    expect(screen.getByRole("alertdialog", { name: /The house stirs/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "You are haunting now" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Notebook" })).toBeNull(); // a haunting Player has no notebook
  });
  it("the menu carries the sound and light switches and, for the Master, the Master controls", () => {
    const port = new GamePort();
    render(<Controller port={port} extras={extras()} />);
    const menu = screen.getByRole("button", { name: "Menu" });
    menu.focus();
    fireEvent.click(menu);
    const sheet = screen.getByRole("complementary");
    expect(within(sheet).getByRole("switch", { name: /Phone sounds/ })).toBeTruthy();
    expect(within(sheet).getByRole("region", { name: "Master controls" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Pause" }));
    expect(port.sent).toContainEqual({ t: "pause" });
  });
  it("a Player who is not the Master sees no Master controls in the menu", () => {
    const port = new GamePort({ seat: 2, nickname: "Ben", master: null });
    render(<Controller port={port} extras={extras()} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.queryByRole("region", { name: "Master controls" })).toBeNull();
  });
  it("shows the ending when the game is over, with no pad, no clock and no Display needed", () => {
    const ending = { solution: { suspect: "s1", zone: "z1", relic: "r1" }, residueAt: {}, winners: [1], houseWins: false, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], reveal: [] } };
    const port = new GamePort({ phase: "ended", game: game({ pub: pub({ phase: "ended", ending }) }) });
    render(<Controller port={port} extras={extras()} />);
    expect(screen.getByRole("heading", { name: "You solved it" })).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("group", { name: "Movement stick" })).toBeNull();
  });
  it("buzzes when the turn comes round, and pulses the page instead on a phone that cannot buzz", () => {
    const nav = navigator as unknown as { vibrate?: unknown };
    const had = nav.vibrate;
    const buzz = vi.fn(() => true);
    nav.vibrate = buzz;
    const port = new GamePort({ game: game({ pub: pub({ active: 2 }) }) });
    const { container, unmount } = render(<Controller port={port} extras={extras()} />);
    port.set({ game: game({ pub: pub({ active: 1 }) }) });
    expect(buzz).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".is-pulse")).toBeNull();
    unmount();
    delete nav.vibrate;
    const port2 = new GamePort({ game: game({ pub: pub({ active: 2 }) }) });
    const second = render(<Controller port={port2} extras={extras()} />);
    port2.set({ game: game({ pub: pub({ active: 1 }) }) });
    expect(second.container.querySelector(".is-pulse")).not.toBeNull();
    if (had !== undefined) nav.vibrate = had;
  });
  it("without extras the scripted stand-in screens stay as they were", () => {
    const port = new GamePort({ game: undefined as never });
    render(<Controller port={port} />);
    fireEvent.click(screen.getByRole("radio", { name: "Pad" }));
    expect(screen.getByText("Movement stick: not built yet.")).toBeTruthy();
  });
  it("draws the grey of the light bar over everything, hidden from assistive tech", () => {
    const g = game({ lights: [{ id: "l", cue: "glow", startAtMs: 0, durationMs: 4000, steps: [{ atMs: 0, level: 0.6 }] }] } as never);
    const port = new GamePort({ game: g });
    vi.useFakeTimers();
    render(<Controller port={port} extras={extras({ now: () => 100 })} />);
    expect(screen.getByTestId("pc-light").getAttribute("aria-hidden")).toBe("true");
    vi.useRealTimers();
  });
});
