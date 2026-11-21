// @vitest-environment jsdom
import { createEngine, privateSnapshot, publicSnapshot, step } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sight } from "@hauntology/shared/puzzles/types";
import { Controller } from "./Controller";
import { NOT_SEATED, type ControllerPort, type RoomView } from "./controller-port";
import { EMPTY_GAME } from "./game-view";

let restore: Array<() => void> = [];
beforeEach(() => {
  restore = []; localStorage.clear();
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => { cleanup(); for (const r of restore) r(); localStorage.clear(); });

const SAFE: Sight = { kind: "safe", payload: { kind: "safe", code: [4, 2, 7, 1] }, showMs: 5000 };
const CLOCK: Sight = { kind: "clock", payload: { kind: "clock", h: 3, m: 15 }, showMs: 5000 };

function livePort() {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "Ann" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  const s = step(createEngine({ seed: 7, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "medium" }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
  let view: RoomView = { ...NOT_SEATED, connection: "online", phase: "playing", code: "ABCD", seat: 1, nickname: "Ann", game: { ...EMPTY_GAME, pub: publicSnapshot(s, 0), priv: privateSnapshot(s, 1) } };
  const listeners = new Set<(v: RoomView) => void>();
  const acts: unknown[] = [];
  const port: ControllerPort = {
    getView: () => view, subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; }, join: async () => ({ ok: false, code: "unreachable" }),
    attempt: () => ({ outcome: "failed", reason: "x" }), closeLock: () => {}, setPuzzles: () => {}, leave: async () => {}, act: (m) => void acts.push(m), ackSight: (id) => void acts.push({ ack: id }),
  };
  return { port, acts, give(sight: { id: string; sight: Sight }) { view = { ...view, sight }; act(() => { for (const l of [...listeners]) l(view); }); } };
}
const spiritSwitch = (): HTMLElement => screen.getByRole("switch", { name: /Spirit clues/ });

describe("the Spirit clues switch and the ring in place of a Sight (puzzles 10.8, Requirement 15.1, 15.6)", () => {
  it("is a device switch in the menu, off by default, with no Master control, and the page has no ring until a Sight arrives", () => {
    const { port } = livePort();
    render(<Controller port={port} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(spiritSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByRole("switch", { name: /Spirit clues/ })).toHaveLength(1);
    expect(screen.queryByLabelText("Clues in the air")).toBeNull();
  });
  it("is turned on by the Player's own tap, which also asks for motion permission", async () => {
    const asked = vi.fn(async () => "granted" as const);
    const w = window as unknown as { DeviceOrientationEvent?: unknown };
    const had = w.DeviceOrientationEvent;
    w.DeviceOrientationEvent = Object.assign(class {}, { requestPermission: asked });
    restore.push(() => { if (had === undefined) delete w.DeviceOrientationEvent; else w.DeviceOrientationEvent = had; });
    const { port } = livePort();
    render(<Controller port={port} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(asked).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(spiritSwitch()); });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(spiritSwitch().getAttribute("aria-checked")).toBe("true");
  });
  it("shows the plain Sight while the switch is off, even for a Safe code", () => {
    const { port, give } = livePort();
    render(<Controller port={port} />);
    give({ id: "S1", sight: SAFE });
    expect(screen.getByRole("dialog", { name: "Something to remember" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
    expect(screen.queryByLabelText("Clues in the air")).toBeNull();
  });
  it("shows a Safe code as the Clue ring in place of the 5 seconds when the switch is on, and Done is the same acknowledgement a Sight gives", async () => {
    const { port, give, acts } = livePort();
    render(<Controller port={port} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await act(async () => { fireEvent.click(spiritSwitch()); });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    give({ id: "S2", sight: SAFE });
    await waitFor(() => expect(screen.getByLabelText("Clues in the air", { selector: "section" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    // every digit of the code is a clue with a text label, and nothing of it was sent
    expect(document.querySelectorAll("ul[aria-label='Clues in the air'] li").length).toBeGreaterThanOrEqual(4);
    expect(acts).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Done/ }));
    expect(acts).toEqual([{ ack: "S2" }]);
  });
  it("keeps every other Kind's Sight as the plain Sight with the switch on", async () => {
    const { port, give } = livePort();
    render(<Controller port={port} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await act(async () => { fireEvent.click(spiritSwitch()); });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    give({ id: "S3", sight: CLOCK });
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
    expect(screen.queryByLabelText("Clues in the air", { selector: "section" })).toBeNull();
  });
  it("the ring is a lazy chunk, and nothing of it, three.js or the camera is imported by the Controller's main code", async () => {
    const src = (await import("./SeatedFrame.tsx?raw")).default as string;
    expect(src).toMatch(/lazy\(\(\) => import\("\.\.\/\.\.\/puzzles\/clues\/SpiritSight"\)\)/);
    expect(/import\s+(?!type)[^;]*from\s+["'][^"']*(ClueRing|ringScene|SpiritSight)["']/.test(src)).toBe(false);
    expect(/from\s+["']three["']/.test(src)).toBe(false);
  });
});
