// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEVICE_SETTINGS_KEY } from "../../device/device-settings";
import { stubCanvas, stubGeometry } from "../../puzzles/test-utils";
import { Controller } from "./Controller";
import { StandInPort, STANDIN_CODES } from "./standin-port";

let restore: Array<() => void> = [];
beforeEach(() => { restore = []; localStorage.clear(); });
afterEach(() => { cleanup(); for (const r of restore) r(); localStorage.clear(); });

const saved = (): Record<string, unknown> | null => JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "null") as Record<string, unknown> | null;

/** Join the stand-in Room as a Player and wait until the frame is there. */
async function seat(port: StandInPort, name = "Ann"): Promise<void> {
  fireEvent.change(screen.getByLabelText("Room Code"), { target: { value: STANDIN_CODES.open } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Join" })); await Promise.resolve(); await Promise.resolve(); });
  expect(port.getView().seat).toBe(1);
}
const menuButton = (): HTMLElement => screen.getByRole("button", { name: "Menu" });
const openMenu = (): void => { menuButton().focus(); fireEvent.click(menuButton()); };
const sw = (name: RegExp | string): HTMLElement => screen.getByRole("switch", { name });

/** A phone held upright or sideways, that can be turned. */
function stubOrientation(landscape: boolean): { turn: (to: boolean) => void } {
  const had = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const listeners = new Set<() => void>();
  let now = landscape;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({ matches: q.includes("landscape") ? now : false, media: q, addEventListener: (_: string, l: () => void) => { listeners.add(l); }, removeEventListener: (_: string, l: () => void) => { listeners.delete(l); } }),
  });
  restore.push(() => { if (had) Object.defineProperty(window, "matchMedia", had); else delete (window as { matchMedia?: unknown }).matchMedia; });
  return { turn: (to) => { now = to; act(() => { for (const l of [...listeners]) l(); }); } };
}

/** A phone with a motion sensor: the first reading comes within a few milliseconds of asking. Call it before the Controller mounts. */
function stubSensor(): void {
  const w = window as unknown as { DeviceOrientationEvent?: unknown };
  const had = w.DeviceOrientationEvent;
  w.DeviceOrientationEvent = class {};
  const id = setInterval(() => { window.dispatchEvent(Object.assign(new Event("deviceorientation"), { beta: 20, gamma: 5 })); }, 20);
  restore.push(() => { clearInterval(id); if (had === undefined) delete w.DeviceOrientationEvent; else w.DeviceOrientationEvent = had; });
}

describe("the join page, then the seated frame", () => {
  it("starts on the join page and, once the Room gives a seat, shows the Room Code, the name, the Master and the connection in words", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    expect(screen.getByRole("heading", { name: "Join a game" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    await seat(port);
    expect(screen.queryByRole("heading", { name: "Join a game" })).toBeNull();
    expect(screen.getByLabelText("Room Code K7M2")).toBeTruthy();
    expect(screen.getByText("Ann")).toBeTruthy();
    expect(screen.getByText("Master")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("In the lobby. The Master starts the game.")).toBeTruthy();
  });

  it("says the connection in words, not by colour alone, and the phase in words", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setConnection("reconnecting"));
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    act(() => port.setConnection("offline"));
    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
  });
});

describe("the two layouts", () => {
  it("is the panel held upright and the pad held sideways, named regions with nothing in them that does nothing", async () => {
    const port = new StandInPort();
    const phone = stubOrientation(false);
    render(<Controller port={port} />);
    await seat(port);
    expect(screen.getByRole("radio", { name: "Panel" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Pad" }).getAttribute("aria-checked")).toBe("false");
    expect([...document.querySelectorAll("[data-slot]")].map((s) => s.getAttribute("data-slot"))).toEqual(["hand", "notebook", "contributions"]);
    phone.turn(true); // the phone is turned sideways: the pad
    expect(screen.getByRole("radio", { name: "Pad" }).getAttribute("aria-checked")).toBe("true");
    expect([...document.querySelectorAll("[data-slot]")].map((s) => s.getAttribute("data-slot"))).toEqual(["stick", "look", "faces"]);
    for (const slot of document.querySelectorAll("[data-slot]")) {
      expect(slot.getAttribute("aria-label")).toBeTruthy();
      expect(slot.querySelectorAll("button, input, [role=button]").length).toBe(0); // no control that does nothing
    }
  });

  it("lets the Player choose, and the choice wins over the phone being turned", async () => {
    const port = new StandInPort();
    const phone = stubOrientation(true);
    render(<Controller port={port} />);
    await seat(port);
    expect(screen.getByRole("radio", { name: "Pad" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Panel" }));
    expect(screen.getByRole("radio", { name: "Panel" }).getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-layout]")?.getAttribute("data-layout")).toBe("panel");
    phone.turn(false);
    phone.turn(true);
    expect(screen.getByRole("radio", { name: "Panel" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Pad" }));
    expect(document.querySelector(".pc-pad")).not.toBeNull();
  });
});

describe("the menu", () => {
  it("opens as a sheet that takes focus, holds this phone's settings, and closes on Escape or Close with focus back on the Menu button", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    openMenu();
    const sheet = screen.getByRole("complementary", { name: "Menu" });
    expect(sheet.className).toContain("ui-sheet");
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: "Menu" }));
    for (const name of ["Touch only", "Tilt", "Buzz", "Sound", "Assist"]) expect(within(sheet).getByRole("switch", { name: new RegExp(name) }), name).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    openMenu();
    fireEvent.click(menuButton()); // the Menu button also closes it
    expect(screen.queryByRole("complementary", { name: "Menu" })).toBeNull();
  });

  it("gives the Master the Puzzle setting and nobody else, and sends the Master's choice to the Room", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    const group = screen.getByRole("radiogroup", { name: "Puzzles" });
    expect(within(group).getByRole("radio", { name: "Medium" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(group).getByRole("radio", { name: "Hard" }));
    expect(port.calls).toContain("setPuzzles hard");
    expect(within(screen.getByRole("radiogroup", { name: "Puzzles" })).getByRole("radio", { name: "Hard" }).getAttribute("aria-checked")).toBe("true");
    cleanup();

    const guest = new StandInPort({ master: false });
    render(<Controller port={guest} />);
    await seat(guest);
    expect(screen.queryByText("Master")).toBeNull();
    openMenu();
    expect(screen.queryByRole("radiogroup", { name: "Puzzles" })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Locks/ })).toBeNull(); // Wander's switch is not here
    expect(sw(/Tilt/)).toBeTruthy();
  });

  it("leaves the room from the menu: the seat is given up and the join page is back", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Leave room" })); await Promise.resolve(); await Promise.resolve(); });
    expect(port.calls).toContain("leave");
    expect(screen.getByRole("heading", { name: "Join a game" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Menu" })).toBeNull();
  });
});

describe("the settings of this phone are remembered", () => {
  it("saves a switch in the menu on the phone, and the next visit starts from it (a reload of the Controller)", async () => {
    const first = new StandInPort();
    const { unmount } = render(<Controller port={first} />);
    await seat(first);
    openMenu();
    expect(sw(/Touch only/).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw(/Assist/));
    fireEvent.click(sw(/Sound/));
    fireEvent.click(sw(/Touch only/));
    expect(saved()).toMatchObject({ touchOnly: true, soundConsent: false, assist: true, tilt: true });
    unmount();

    const second = new StandInPort();
    render(<Controller port={second} />);
    await seat(second);
    openMenu();
    expect(sw(/Touch only/).getAttribute("aria-checked")).toBe("true");
    expect(sw(/Assist/).getAttribute("aria-checked")).toBe("true");
  });

  it("writes nothing until the Player chooses something", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    expect(localStorage.getItem(DEVICE_SETTINGS_KEY)).toBeNull();
  });
});

describe("a Lock in front of the seat", () => {
  beforeEach(() => { restore.push(stubGeometry(), stubCanvas()); });
  const lockUp = async (port: StandInPort): Promise<void> => {
    act(() => port.offerLock("maze", "easy", 1, false));
    await screen.findByRole("application", { name: /^Maze\./ }, { timeout: 5000 });
  };

  it("replaces the pad and the panel with the puzzle, and puts them back when the Player gives up", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    expect(document.querySelector(".pc-pad, .pc-panel")).not.toBeNull();
    await lockUp(port);
    expect(document.querySelector(".pc-pad, .pc-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy(); // the menu stays in reach
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, give up" })); await Promise.resolve(); });
    expect(port.calls).toContain("closeLock maze-easy-1 gave_up");
    expect(document.querySelector(".pc-pad, .pc-panel")).not.toBeNull();
  });

  it("keeps a tilt choice made inside the Lock as the phone's setting, and it is there next time", async () => {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ tilt: false }));
    const port = new StandInPort();
    const { unmount } = render(<Controller port={port} />);
    await seat(port);
    await lockUp(port);
    expect(saved()).toEqual({ tilt: false }); // opening the Lock changed nothing
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tilt" })); await Promise.resolve(); });
    expect(saved()?.tilt).toBe(true);
    unmount();
    expect(JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "{}").tilt).toBe(true);
  });

  it("is one setting whether Tilt is changed in the Lock or in the menu (a phone with a motion sensor)", async () => {
    stubSensor();
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    await lockUp(port);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tilt: on" })).toBeTruthy(), { timeout: 3000 }); // on by itself where a sensor answers
    openMenu();
    await waitFor(() => expect(sw(/Tilt/).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw(/Tilt/)); // off in the menu ...
    expect(saved()?.tilt).toBe(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tilt" }).getAttribute("aria-pressed")).toBe("false")); // ... and off in the Lock
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tilt" })); await Promise.resolve(); }); // on in the Lock ...
    expect(saved()?.tilt).toBe(true);
    await waitFor(() => expect(sw(/Tilt/).getAttribute("aria-checked")).toBe("true"), { timeout: 3000 }); // ... and on in the menu
  });
});
