// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectLimits, pyramidLayout } from "@hauntology/shared/party/display";
import { game, pub } from "../../test/party-fixtures";
import { EMPTY_HOST } from "../host/host-view";
import { IDLE_HOST, type HostState } from "../phone/host-port";
import { culpritOf, FRESH_DISPLAY, reactionsFor } from "./display-model";
import { DEFAULT_CALIBRATION, DisplayPage, loadCalibration } from "./DisplayPage";

afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
const P = (over: Record<string, unknown> = {}) => pub(over) as never;

describe("display model (party-mode 10.2)", () => {
  it("makes one reaction for each new Suggestion, Accusation and Haunt Event once, and a Blackout for its own option", () => {
    const events = [{ id: 1, kind: "turn-start", seat: 1 }, { id: 2, kind: "suggest", seat: 1 }, { id: 3, kind: "accuse", seat: 2, right: false }, { id: 4, kind: "accuse", seat: 3, right: true }, { id: 5, kind: "haunt-event", option: "blackout" }, { id: 6, kind: "haunt-event", option: "lull" }];
    const r = reactionsFor(P({ events }), FRESH_DISPLAY, 1000, null);
    expect(r.events.map((e) => e.kind)).toEqual(["suggest", "accuse-wrong", "accuse-right", "blackout", "haunt-event"]);
    expect(r.memory.seen).toBe(6);
    expect(reactionsFor(P({ events }), r.memory, 2000, null).events).toEqual([]);
  });
  it("warns once for a Turn in its last ten seconds, not when paused or with no clock", () => {
    const a = reactionsFor(P({ round: 2, active: 3 }), FRESH_DISPLAY, 0, 8000);
    expect(a.events.map((e) => e.kind)).toEqual(["time-warning"]);
    expect(reactionsFor(P({ round: 2, active: 3 }), a.memory, 100, 7000).events).toEqual([]);
    expect(reactionsFor(P({ round: 2, active: 4 }), a.memory, 100, 7000).events.map((e) => e.kind)).toEqual(["time-warning"]);
    expect(reactionsFor(P({ paused: true }), FRESH_DISPLAY, 0, 5000).events).toEqual([]);
    expect(reactionsFor(P(), FRESH_DISPLAY, 0, null).events).toEqual([]);
    expect(reactionsFor(P(), FRESH_DISPLAY, 0, 20_000).events).toEqual([]);
  });
  it("names the culprit only once the ending is out", () => {
    expect(culpritOf(P())).toBeNull();
    expect(culpritOf(P({ phase: "ended", ending: { solution: { suspect: "s2", zone: "z1", relic: "r1" } } }))).toBe("Miss Pike");
  });
});

describe("calibration storage", () => {
  it("reads back a saved setup, clamps nonsense, and falls back to the default", () => {
    const st = { getItem: (k: string) => (k === "hauntology.party.display" ? JSON.stringify({ innerPx: 99999, tilePx: -4, orientation: "outward", mirror: true, single: true }) : null) };
    expect(loadCalibration(st)).toEqual({ innerPx: 600, tilePx: 60, orientation: "outward", mirror: true, single: true });
    expect(loadCalibration({ getItem: () => "{" })).toEqual(DEFAULT_CALIBRATION);
    expect(loadCalibration({ getItem: () => null })).toEqual(DEFAULT_CALIBRATION);
  });
});

describe("DisplayPage (party-mode 10.1, 10.2)", () => {
  class FakePort {
    state: HostState;
    listeners = new Set<() => void>();
    constructor(g = game(), over: Partial<HostState> = {}) { this.state = { ...IDLE_HOST, connection: "online", view: { ...EMPTY_HOST, game: g }, ...over }; }
    getState() { return this.state; }
    subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    set(o: Partial<HostState>) { this.state = { ...this.state, ...o }; act(() => { for (const l of [...this.listeners]) l(); }); }
  }
  const mount = (p: FakePort, reduced = false, size = { width: 1000, height: 800 }) => render(<DisplayPage port={p as never} reducedMotion={reduced} storage={localStorage} size={size} />);

  it("lays the game out four times by the shared pyramid layout, at the calibrated gap and size, one tile at each side", () => {
    const { container } = mount(new FakePort());
    const tiles = [...container.querySelectorAll<HTMLElement>(".pd-tile")];
    const want = pyramidLayout({ width: 1000, height: 800, ...{ innerPx: 120, tilePx: 320 }, orientation: "inward", mirror: false });
    expect(tiles.map((t) => t.dataset.tile)).toEqual(want.map((t) => t.id));
    tiles.forEach((el, i) => {
      expect(parseFloat(el.style.left)).toBeCloseTo(want[i]!.cx - want[i]!.size / 2, 3);
      expect(parseFloat(el.style.width)).toBeCloseTo(want[i]!.size, 3);
      expect(el.style.transform).toContain(`rotate(${want[i]!.rotationDeg}deg)`);
    });
    expect(tiles).toHaveLength(4);
    expect(container.querySelector(".pd-pyramid")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("The game is showing four times.");
  });
  it("calibrates on the screen: the gap and the size move the tiles, orientation flips them, mirror flips each, and the setup is remembered", () => {
    const { container, unmount } = mount(new FakePort());
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    fireEvent.change(screen.getByLabelText(/Gap in the middle/), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText(/Size of each picture/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("radio", { name: "Tops outward" }));
    fireEvent.click(screen.getByRole("switch", { name: /Mirror/ }));
    const want = pyramidLayout({ width: 1000, height: 800, innerPx: 200, tilePx: 500, orientation: "outward", mirror: true });
    const top = container.querySelector<HTMLElement>('[data-tile="top"]')!;
    expect(top.style.transform).toBe(`rotate(${want[0]!.rotationDeg}deg) scaleX(-1)`);
    expect(parseFloat(top.style.width)).toBeCloseTo(want[0]!.size, 3);
    expect(JSON.parse(localStorage.getItem("hauntology.party.display")!)).toEqual({ innerPx: 200, tilePx: 500, orientation: "outward", mirror: true, single: false });
    unmount();
    const again = mount(new FakePort());
    expect(again.container.querySelector<HTMLElement>('[data-tile="top"]')!.style.transform).toContain("scaleX(-1)");
  });
  it("has a one-picture mode for a plain second screen, and shows 'waiting' before any game", () => {
    const { container } = mount(new FakePort());
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    fireEvent.click(screen.getByRole("switch", { name: /One picture only/ }));
    expect(container.querySelectorAll(".pd-tile")).toHaveLength(0);
    expect(container.querySelectorAll(".pd-single")).toHaveLength(1);
    cleanup();
    const w = mount(new FakePort(undefined, { view: EMPTY_HOST }));
    expect(w.container.textContent).toContain("Waiting for the game…");
  });
  it("falls back to one picture when four will not fit the screen", () => {
    const { container } = mount(new FakePort(), false, { width: 100, height: 100 });
    expect(container.querySelectorAll(".pd-tile")).toHaveLength(0);
    expect(container.querySelectorAll(".pd-single")).toHaveLength(1);
  });
  it("flashes for a Suggestion inside the limits, and never under reduced motion", () => {
    vi.useFakeTimers({ now: 10_000 });
    const g = (events: unknown[]) => game({ pub: pub({ events }) });
    const p = new FakePort(g([]));
    const { container } = mount(p);
    p.set({ view: { ...EMPTY_HOST, game: g([{ id: 1, kind: "suggest", seat: 1 }]) } });
    act(() => { vi.advanceTimersByTime(20); });
    expect(container.querySelector<HTMLElement>(".pd-page")!.dataset.flash).toBe("on");
    act(() => { vi.advanceTimersByTime(200); });
    expect(container.querySelector<HTMLElement>(".pd-page")!.dataset.flash).toBe("off"); // a flash is 150 ms
    cleanup();
    const q = new FakePort(g([]));
    const calm = mount(q, true);
    q.set({ view: { ...EMPTY_HOST, game: g([{ id: 1, kind: "accuse", seat: 1, right: true }]) } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(calm.container.querySelector<HTMLElement>(".pd-page")!.dataset.flash).toBe("off");
  });
  it("names the culprit on every picture once the game ends, and not before", () => {
    const ending = { solution: { suspect: "s2", zone: "z1", relic: "r1" } };
    const p = new FakePort(game());
    const { container } = mount(p);
    expect(container.textContent).not.toContain("It was Miss Pike");
    p.set({ view: { ...EMPTY_HOST, game: game({ pub: pub({ phase: "ended", active: null, ending }) }) } });
    expect([...container.querySelectorAll(".pd-who")].map((e) => e.textContent)).toEqual(Array(4).fill("It was Miss Pike."));
  });
  it("says in a live region when the connection is lost, and takes no input of the game", () => {
    const p = new FakePort();
    mount(p);
    p.set({ connection: "reconnecting" });
    expect(screen.getByText("Connection lost. Trying again…")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1); // only the setup button: no game control
  });
  it("keeps the flashes of any burst of events at three a second or fewer", () => {
    const evs = Array.from({ length: 12 }, (_, i) => ({ id: i, atMs: 0, kind: "accuse-right" as const }));
    const flashes = effectLimits(evs, false).flatMap((r) => r.flashes).sort((a, b) => a - b);
    for (let i = 3; i < flashes.length; i++) expect(flashes[i]! - flashes[i - 3]!).toBeGreaterThanOrEqual(1000);
  });
});
