// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEVICE_SETTINGS_KEY } from "../../device/device-settings";
import { ERRAND_RULE_LINE } from "@hauntology/shared/party/errands";
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

  it("has no bar of its own above the puzzle: the Menu is in the puzzle's bar, and the Controller's header and padding come back when the Lock is gone", async () => {
    const port = new StandInPort();
    const { container } = render(<Controller port={port} />);
    await seat(port);
    expect(container.querySelector(".pc-bar")).not.toBeNull();
    expect(container.querySelector(".pc-page--lock")).toBeNull();
    await lockUp(port);
    expect(container.querySelector(".pc-bar")).toBeNull(); // no Room Code, name or connection row above the puzzle
    expect(container.querySelector(".pc-page--lock")).not.toBeNull(); // and no padding of this page around it
    const bar = container.querySelector("header.pz-bar-row") as HTMLElement;
    expect(bar.contains(menuButton())).toBe(true); // the Menu sits in the puzzle's bar, after the time
    expect(bar.querySelector(".pz-bar-right .pz-timer")).not.toBeNull();
    expect(bar.querySelector(".pz-bar-extra")?.contains(menuButton())).toBe(true);
    expect(within(bar).queryByText("Connected")).toBeNull(); // a connection that is fine says nothing there
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, give up" })); await Promise.resolve(); });
    expect(container.querySelector(".pc-bar")).not.toBeNull();
    expect(container.querySelector(".pc-page--lock")).toBeNull();
  });

  it("opens the Menu from the puzzle's bar, closes it on Escape with focus back on that button, and the Menu is the same one as without a Lock", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    await lockUp(port);
    openMenu();
    const sheet = screen.getByRole("complementary", { name: "Menu" });
    expect(within(sheet).getByRole("switch", { name: /Touch only/ })).toBeTruthy();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it("says in the puzzle's bar when the connection is not fine, and no longer when it is", async () => {
    const port = new StandInPort();
    const { container } = render(<Controller port={port} />);
    await seat(port);
    await lockUp(port);
    const bar = container.querySelector("header.pz-bar-row") as HTMLElement;
    act(() => port.setConnection("reconnecting"));
    expect(within(bar).getByRole("status").textContent).toBe("Reconnecting…");
    act(() => port.setConnection("online"));
    expect(within(bar).queryByText("Reconnecting…")).toBeNull();
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

describe("World Clues UI and shared look (Group 5)", () => {
  it("shows Master-only Clue place setting in MenuSheet", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    const cluePlace = screen.getByRole("radiogroup", { name: "Clue place" });
    expect(within(cluePlace).getByRole("radio", { name: "Phone" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(cluePlace).getByRole("radio", { name: "World" }));
    expect(port.calls).toContain("setCluePlace world");
    expect(within(screen.getByRole("radiogroup", { name: "Clue place" })).getByRole("radio", { name: "World" }).getAttribute("aria-checked")).toBe("true");
    cleanup();

    const guest = new StandInPort({ master: false });
    render(<Controller port={guest} />);
    await seat(guest);
    openMenu();
    expect(screen.queryByRole("radiogroup", { name: "Clue place" })).toBeNull();
  });

  it("shows World Clue Sign chip and prompt with no answer, and gates See the clue again on Assist + canSeeAgain", async () => {
    stubCanvas();
    stubGeometry();
    const port = new StandInPort();
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ assist: true }));
    render(<Controller port={port} />);
    await seat(port);
    // Lock whose clue was NOT seen on the player's own turn (canSeeAgain: false)
    act(() => port.offerLock("clock", "easy", 1, false, { sign: "moon", canSeeAgain: false }));
    const note = screen.getByRole("note", { name: "World clue mark" });
    expect(note.querySelector(".ui-chip")?.textContent).toContain("Moon");
    expect(note.querySelector(".ui-prompt")?.textContent).toContain("moon");
    expect(note.querySelector(".ui-hint")?.textContent).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See the clue again" })).toBeNull();

    // Lock whose clue WAS seen on own turn (canSeeAgain: true) offers See the clue again when Assist is on
    act(() => port.offerLock("clock", "easy", 2, false, { sign: "star", canSeeAgain: true }));
    expect(screen.getByRole("note", { name: "World clue mark" }).querySelector(".ui-chip")?.textContent).toContain("Star");
    expect(screen.getByRole("button", { name: "See the clue again" })).toBeTruthy();
  });

  it("lists own-turn World Clues in Assist's ui-panel / ui-log notebook and leaves the empty slot when Assist is off", async () => {
    stubCanvas();
    stubGeometry();
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setWorldClues([{ zone: "Hall", sign: "bell", sight: { kind: "clock", h: 3, m: 15 } }]));
    // Assist off: empty notebook slot remains
    const nbOff = document.querySelector('[data-slot="notebook"]') as HTMLElement;
    expect(nbOff.querySelector(".ui-log")).toBeNull();

    // Turn Assist on in Menu: notebook renders ui-panel with ui-log / ui-log-row and clue picture
    openMenu();
    fireEvent.click(sw(/Assist/));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const nbOn = document.querySelector('[data-slot="notebook"]') as HTMLElement;
    expect(nbOn.className).toContain("ui-panel");
    expect(nbOn.querySelector(".ui-log .ui-log-row")).not.toBeNull();
    expect(within(nbOn).getByText("Bell")).toBeTruthy();
    expect(within(nbOn).getByText("Hall")).toBeTruthy();
    expect(within(nbOn).getByText("3:15")).toBeTruthy();
  });
});

describe("Errands Controller UI and Shared look (errands Groups 3 & 4)", () => {
  it("gives Master an Errands switch in MenuSheet (off by default) and any Player an opt-out checkbox", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    const errSwitch = sw(/^Errands/);
    expect(errSwitch.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(errSwitch);
    expect(port.calls).toContain("setErrands true");
    expect(sw(/^Errands/).getAttribute("aria-checked")).toBe("true");

    const optOut = screen.getByRole("checkbox", { name: "Do not pick me for errands" });
    expect(optOut.className).toContain("ui-check");
    fireEvent.click(optOut);
    expect(port.calls).toContain("errandOptOut true");
    cleanup();

    const guest = new StandInPort({ master: false });
    render(<Controller port={guest} />);
    await seat(guest);
    openMenu();
    expect(screen.queryByRole("switch", { name: /^Errands/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Do not pick me for errands" })).toBeTruthy();
  });

  it("shows Poltergeist's ui-card Errand card with Done button and safety line in ui-hint", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setErrandsView({
      on: true,
      optOut: false,
      poltergeist: true,
      errand: { id: "1:0", from: 1, target: 2, object: "mug", givenRound: 1, doneTriedRound: null, status: "open" },
      doneTriedThisRound: false,
      ask: null,
      poltergeists: [{ seat: 1, nickname: "Ann" }],
      caughtUsed: false,
      seatName: (s) => (s === 2 ? "Bob" : `P${s}`),
    }));
    const card = screen.getByRole("region", { name: "Errand" });
    expect(card.className).toContain("ui-card");
    expect(card.querySelector(".ui-hint")?.textContent).toBe(ERRAND_RULE_LINE);
    expect(within(card).getByText(/Bob/)).toBeTruthy();
    expect(within(card).getByText(/mug/)).toBeTruthy();
    const doneBtn = within(card).getByRole("button", { name: "Done" });
    expect(doneBtn.className).toContain("ui-button");
    fireEvent.click(doneBtn);
    expect(port.calls).toContain("errandDone");
    expect(doneBtn.hasAttribute("disabled")).toBe(true);
  });

  it("shows Detective's Caught picker with two ui-selects and one ui-button--primary, and Target Yes/No prompt", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setErrandsView({
      on: true,
      optOut: false,
      poltergeist: false,
      errand: null,
      doneTriedThisRound: false,
      ask: null,
      poltergeists: [{ seat: 2, nickname: "Bob" }],
      caughtUsed: false,
      seatName: (s) => `P${s}`,
    }));
    const caught = screen.getByRole("region", { name: "Call caught" });
    const poltSel = within(caught).getByLabelText("Poltergeist") as HTMLSelectElement;
    const objSel = within(caught).getByLabelText("Object") as HTMLSelectElement;
    expect(poltSel.className).toContain("ui-select");
    expect(objSel.className).toContain("ui-select");
    expect(document.querySelectorAll(".ui-button--primary").length).toBe(1);

    fireEvent.change(objSel, { target: { value: "spoon" } });
    fireEvent.click(within(caught).getByRole("button", { name: "Caught" }));
    expect(port.calls).toContain("errandCaught 2 spoon");

    // Target Yes/No prompt keeps at most one primary button on screen
    act(() => port.setErrandsView({
      on: true,
      optOut: false,
      poltergeist: false,
      errand: null,
      doneTriedThisRound: false,
      ask: { errandId: "2:0", object: "spoon", deadlineMs: 25_000 },
      poltergeists: [{ seat: 2, nickname: "Bob" }],
      caughtUsed: false,
      seatName: (s) => `P${s}`,
    }));
    const ask = screen.getByRole("region", { name: "Errand check" });
    expect(ask.textContent).toContain("Are you holding a spoon right now?");
    expect(document.querySelectorAll(".ui-button--primary").length).toBeLessThanOrEqual(1);
    fireEvent.click(within(ask).getByRole("button", { name: "Yes" }));
    expect(port.calls).toContain("errandAnswer true");
  });
});

describe("Doors Controller UI (knock-door 1.4, 3.3, 4.2, 11.1)", () => {
  it("shows Heavy door 'n of need' in a live region with Push together, Knock touch taps with Faded clue, and Master door problems", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);

    act(() => port.setDoorsView({
      doors: [
        { id: "iron-door", at: { x: 1, z: 1 }, width: 1.4, a: "z0", b: "z1", lock: "heavy", open: false, need: 2, have: 1 },
      ],
      doorProblems: ["0:width"],
      doorLock: {
        doorId: "cellar-door",
        triesLeft: 3,
        faded: { kind: "knock", payload: { kind: "knock", groups: [2, 1], long: null }, showMs: 8000 },
      },
    }));

    expect(screen.getByRole("region", { name: "Door notice" }).textContent).toContain("Door 1 width must be between");
    const heavy = screen.getByRole("region", { name: "Heavy door iron-door" });
    expect(within(heavy).getByRole("status").textContent).toContain("1 of 2");
    fireEvent.click(within(heavy).getByRole("button", { name: "Push together" }));
    expect(port.calls).toContain("doorAct iron-door");
    // Live announcement after iron-door opens
    expect(screen.getByText("The door iron-door opens.")).toBeTruthy();

    const knock = screen.getByRole("region", { name: "Knock door cellar-door" });
    expect(knock.querySelector(".ui-hint")?.textContent).toContain("2, 1 knocks");
    const tap = within(knock).getByRole("button", { name: /^Tap/ });
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(within(knock).getByRole("button", { name: "Send knock" }));
    expect(port.calls).toContain("doorKnock cellar-door 2");
  });
});

describe("the Sound switch and the Room's sound consent (puzzles 5.6)", () => {
  it("turning the Sound switch tells the Room this seat's consent, and the Room's answer comes back in the view", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    fireEvent.click(sw(/^Sound/));
    expect(port.calls).toContain("setSound false");
    expect(port.getView().soundConsent).toBe(false);
    fireEvent.click(sw(/^Sound/));
    expect(port.calls).toContain("setSound true");
    expect(port.getView().soundConsent).toBe(true);
  });
});

describe("the Assist switch and the Room (puzzles 8.3)", () => {
  it("turning Assist on or off tells the Room this seat's setting", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    openMenu();
    fireEvent.click(sw(/^Assist/));
    expect(port.calls).toContain("setAssist true");
    fireEvent.click(sw(/^Assist/));
    expect(port.calls).toContain("setAssist false");
  });
});

describe("Knocking back at the TV after a Slam (knock-door 5.3, 9.2, 9.3)", () => {
  it("offers touch-only taps while the ghost's knock is unanswered, sends them, and says the result in a live region", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);

    act(() => port.setDoorsView({ tvKnock: { answeredBy: null } }));
    const region = screen.getByRole("region", { name: "Knock back at the TV" });
    expect(region.textContent).toContain("The ghost is knocking at the TV");
    const tap = within(region).getByRole("button", { name: /^Tap/ });
    expect(within(region).getByRole("button", { name: "Send knock" }).hasAttribute("disabled")).toBe(true); // nothing to send yet
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(within(region).getByRole("button", { name: "Send knock" }));
    expect(port.calls).toContain("tvKnock 3");
    expect(within(region).getByRole("button", { name: "Tap (0)" })).toBeTruthy(); // the taps start again after a send

    act(() => port.setDoorsView({ tvKnock: { answeredBy: null, lastResult: { outcome: "wrong", heard: "You knocked 1, 1." } } }));
    expect(within(screen.getByRole("region", { name: "Knock back at the TV" })).getByRole("status").textContent).toContain("You knocked 1, 1.");
  });

  it("says who won in words: you get the Help, or somebody else did, and the taps go away", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    const me = port.getView().seat as number;

    act(() => port.setDoorsView({ tvKnock: { answeredBy: me } }));
    expect(screen.getByRole("status", { name: "Knock back result" }).textContent).toContain("You knocked it back");
    expect(screen.queryByRole("button", { name: /^Tap/ })).toBeNull();

    act(() => port.setDoorsView({ tvKnock: { answeredBy: me + 1 } }));
    expect(screen.getByRole("status", { name: "Knock back result" }).textContent).toContain("Someone else knocked it back");
    expect(screen.queryByRole("button", { name: /^Tap/ })).toBeNull();
  });

  it("shows nothing when there has been no Slam", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setDoorsView({}));
    expect(screen.queryByRole("region", { name: "Knock back at the TV" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Knock back result" })).toBeNull();
  });
});
