// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableFeed } from "./controller-port";
import { spiritTableOffered, SPIRIT_TABLE_ENABLED } from "../../table/flag";
import { Controller } from "./Controller";
import { StandInPort, STANDIN_CODES } from "./standin-port";

let restore: Array<() => void> = [];
beforeEach(() => {
  restore = []; localStorage.clear();
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => { cleanup(); for (const r of restore) r(); localStorage.clear(); });

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"].map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) }));
const feed = (over: Partial<TableFeed> = {}, pool = true): TableFeed => ({
  pub: {
    phase: "playing", active: 1, seats: [{ seat: 1, nickname: "Ann", poltergeist: false }, { seat: 2, nickname: "Bo", poltergeist: false }],
    haunt: { level: 1, max: 6, coldSpot: null }, zones: pool ? zones : [],
    suspects: pool ? [{ id: "cora", name: "Cora Bell" }, { id: "vane", name: "Lady Vane" }] : [], relics: pool ? [{ id: "music_box", name: "Music Box" }] : [],
    events: [], ending: null,
  },
  priv: { seat: 1 }, solo: false, ...over,
});

async function seat(port: StandInPort): Promise<void> {
  fireEvent.change(screen.getByLabelText("Room Code"), { target: { value: STANDIN_CODES.open } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ann" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Join" })); await Promise.resolve(); await Promise.resolve(); });
  expect(port.getView().seat).toBe(1);
}
const openMenu = (): void => { fireEvent.click(screen.getByRole("button", { name: "Menu" })); };
const spiritSwitch = (): HTMLElement | null => screen.queryByRole("switch", { name: /Spirit table/ });

describe("the Spirit table switch on the Controller (spirit-table 1.1 to 1.4, 3.5)", () => {
  it("is not offered when the Room gave no view to draw, in a solo case, or with SPIRIT_TABLE_ENABLED off", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    expect(spiritSwitch()).toBeNull();
    act(() => port.setTable(feed({ solo: true })));
    expect(spiritSwitch()).toBeNull();
    act(() => port.setTable(feed()));
    expect(spiritSwitch()).not.toBeNull();
    expect(SPIRIT_TABLE_ENABLED).toBe(true);
    expect(spiritTableOffered({ solo: false })).toBe(true);
    expect(spiritTableOffered({ solo: false, enabled: false })).toBe(false);
    expect(spiritTableOffered({ solo: true, enabled: true })).toBe(false);
  });

  it("is off by default, and the Table is not on the page until the Player turns it on; the Master has the same device switch and nothing more", async () => {
    const port = new StandInPort(); // seats this phone as the Master
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setTable(feed()));
    openMenu();
    expect(spiritSwitch()!.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Spirit table")).toBeNull();
    expect(screen.getAllByRole("switch", { name: /Spirit table/ })).toHaveLength(1);
  });

  it("turns on from the Player's own tap, which asks for motion; shows the Table list where there is no WebGL; and keeps the Theory mark only on this page, sending nothing", async () => {
    const asked = vi.fn(async () => "granted" as const);
    const w = window as unknown as { DeviceOrientationEvent?: unknown };
    const had = w.DeviceOrientationEvent;
    w.DeviceOrientationEvent = Object.assign(class {}, { requestPermission: asked });
    restore.push(() => { if (had === undefined) delete w.DeviceOrientationEvent; else w.DeviceOrientationEvent = had; });

    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setTable(feed()));
    const callsBefore = [...port.calls];
    openMenu();
    expect(asked).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(spiritSwitch()!); });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(spiritSwitch()!.getAttribute("aria-checked")).toBe("true");
    // the lazy chunk arrives; jsdom has no WebGL, so the Table list is the view, with one line of why
    await waitFor(() => expect(screen.getByText(/cannot draw the table/)).toBeTruthy());
    expect(screen.getByRole("region", { name: "Spirit table" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cora Bell"), { target: { value: "hall" } });
    expect((screen.getByLabelText("Cora Bell") as HTMLSelectElement).value).toBe("hall");
    expect(document.querySelector('[data-piece="room:hall"]')!.textContent).toContain("Cora Bell");
    expect(port.calls).toEqual(callsBefore); // nothing was sent to the Room
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("hall"); // nothing was stored
    // off again: the section goes
    await act(async () => { fireEvent.click(spiritSwitch()!); });
    expect(screen.queryByRole("region", { name: "Spirit table" })).toBeNull();
  });

  it("waits for the game to start when the pool is not there yet (the lobby)", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setTable(feed({}, false)));
    openMenu();
    await act(async () => { fireEvent.click(spiritSwitch()!); });
    await waitFor(() => expect(screen.getByText("The table waits for the game to start.")).toBeTruthy());
  });

  it("does not touch the game's rules: the phase line and the Lock path are the same with the Table on", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setTable(feed()));
    openMenu();
    await act(async () => { fireEvent.click(spiritSwitch()!); });
    act(() => port.offerLock("safe", "easy", 3));
    expect(port.getView().lock).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Spirit table" })).toBeNull(); // a Lock takes the whole screen, as before
  });
});
