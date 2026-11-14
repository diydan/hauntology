// @vitest-environment jsdom
import { CASE_REFUSAL_COPY, CASE_REFUSAL_FALLBACK } from "@hauntology/shared/app/case-setup";
import type { ShellApi } from "@hauntology/shared/app/api";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi, type FakeApiOptions } from "../FakeApi";
import { createPlayMemory } from "../play/memory";
import { CASE_LINE, GHOST_FIRST_LINE, WANDER_LINE } from "../case/PlayChoice";
import { renderApp } from "../../test/harness";
import { live, press, testPlatform } from "../../test/play";

afterEach(() => cleanup());

const NO_QUOTA = { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 };

/** Visits the attic room from the Gallery and waits for the choice on Haunt. */
async function enterHaunt(fake?: FakeApiOptions) {
  const p = testPlatform();
  const h = renderApp("/gallery", { ...(fake ? { fake } : {}), platform: p.kit });
  await screen.findByText("The attic room");
  fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
  await screen.findByRole("heading", { name: "How do you want to play?" });
  return { ...h, p };
}

const caseButton = () => screen.getByRole("button", { name: "Play a case" });
const caseLine = () => document.getElementById("case-line")?.textContent ?? "";
const wanderLine = () => document.getElementById("wander-line")?.textContent ?? "";
const isOff = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";

/** Opens the setup card, picks a preset and a Bot count, and presses Start. */
async function pressStart(preset: string, bots: number) {
  await press("Play a case");
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(preset) }));
  fireEvent.click(screen.getByRole("radio", { name: String(bots) }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start" })); });
}

/** ...and waits for the Case Screen. */
async function startCase(preset: string, bots: number) {
  await pressStart(preset, bots);
  await screen.findByRole("heading", { name: "Play a case" });
}

describe("Haunt: Play a case and Wander", () => {
  it("offers both, each with its one line, and starts no Viewer and no Room", async () => {
    const h = await enterHaunt();
    expect(screen.getByRole("button", { name: "Play a case" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wander" })).toBeTruthy();
    expect(caseLine()).toBe(CASE_LINE);
    expect(CASE_LINE).toBe("Work out who is haunting it, against Bots on this screen");
    expect(WANDER_LINE).toBe("Walk in and let the ghost lead you to three memories");
    expect(isOff(caseButton())).toBe(false);
    expect(h.p.loadHost).not.toHaveBeenCalled();
    expect(h.p.loadViewer).not.toHaveBeenCalled();
    expect(h.history.stack.at(-1)).toBe("/haunt/attic-room");
  });

  it("keeps Wander off, with its reason, until a ghost is chosen, then Wander goes to the Play screen as before", async () => {
    const h = await enterHaunt();
    const wander = screen.getByRole("button", { name: "Wander" });
    expect(isOff(wander)).toBe(true);
    expect(wanderLine()).toContain(GHOST_FIRST_LINE);
    fireEvent.click(wander);
    expect(h.history.stack.at(-1)).toBe("/haunt/attic-room");
    act(() => h.router.setFlow({ ghostReady: true }));
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(false);
    expect(wanderLine()).toBe(WANDER_LINE);
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    expect(h.history.stack.at(-1)).toBe("/play/attic-room");
  });

  it("keeps a case needing no ghost: it is offered while Wander still waits for one", async () => {
    await enterHaunt();
    expect(isOff(caseButton())).toBe(false);
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(true);
  });

  it("turns Play a case off with one line when party mode is off, and does nothing when it is pressed; Wander stays", async () => {
    const h = await enterHaunt({ flags: { partyEnabled: false } });
    expect(isOff(caseButton())).toBe(true);
    expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_COPY.party_disabled}`);
    expect(caseButton().getAttribute("aria-describedby")).toBe("case-line");
    fireEvent.click(caseButton());
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Set up your case" })).toBeNull();
    act(() => h.router.setFlow({ ghostReady: true }));
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the setup card", () => {
  it("opens with Classic and two Bots, focuses itself, offers two to five Bots and Cancel closes it", async () => {
    await enterHaunt();
    await press("Play a case");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Set up your case" })));
    expect((screen.getByRole("radio", { name: /Classic/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "2" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("radio", { name: /^[0-9]$/ }).map((r) => r.getAttribute("value"))).toEqual(["2", "3", "4", "5"]);
    expect(screen.getAllByRole("radio", { name: /Classic|Relaxed|Quick/ })).toHaveLength(3);
    expect(caseButton().getAttribute("aria-expanded")).toBe("true");
    await press("Cancel");
    expect(screen.queryByRole("heading", { name: "Set up your case" })).toBeNull();
    expect(caseButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("starts nothing until Start is pressed", async () => {
    const h = await enterHaunt();
    await press("Play a case");
    fireEvent.click(screen.getByRole("radio", { name: /Quick/ }));
    expect(h.p.loadHost).not.toHaveBeenCalled();
    expect(h.history.stack.at(-1)).toBe("/haunt/attic-room");
  });
});

describe("the Case Screen: the main path", () => {
  it("opens at its own address with the chosen preset and Bots, an Exit, and the scripted indicator, even with no quota at all", async () => {
    const h = await enterHaunt({ quota: NO_QUOTA });
    await startCase("Relaxed", 4);
    expect(h.history.stack.at(-1)).toBe("/case/attic-room");
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    await screen.findByText("Relaxed, with 4 Bots.");
    expect(screen.getByRole("button", { name: "Exit" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".scripted")?.textContent).toBe("scripted ghost"));
    expect(live()).toBe("The case has begun.");
    expect(h.p.loadHost).toHaveBeenCalledTimes(1);
    // A case is not Wander: no Viewer, no play session.
    expect(h.p.loadViewer).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();
  });

  it("at the end shows Play again, Home and the Gallery, and Play again starts the next game in the same Room", async () => {
    const h = await enterHaunt();
    await startCase("Classic", 2);
    await press("End the case");
    await screen.findByRole("button", { name: "Play again" });
    expect(live()).toBe("The case is over.");
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gallery" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exit" })).toBeTruthy();
    await press("Play again");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Play again" })).toBeNull());
    expect(h.p.loadHost).toHaveBeenCalledTimes(1);
    expect(h.p.log.filter((l) => l === "host mount")).toHaveLength(1);
    await press("End the case");
    await screen.findByRole("button", { name: "Play again" });
  });

  it("Home and Gallery end the Room and release the Viewer before the next Screen mounts", async () => {
    for (const [name, heading, path] of [["Home", "Hauntology", "/"], ["Gallery", "Visit a place", "/gallery"]] as const) {
      const h = await enterHaunt();
      await startCase("Classic", 2);
      await press("End the case");
      await press(name);
      await screen.findByRole("heading", { name: heading });
      expect(h.history.stack.at(-1)).toBe(path);
      const log = h.p.log;
      expect(log.indexOf("host disposed")).toBeGreaterThan(log.indexOf("host dispose"));
      expect(log.at(-1)).toBe("host disposed");
      expect(document.querySelector("[data-standin-host]")).toBeNull();
      cleanup();
    }
  });

  it("Exit goes back to Haunt with the Room ended, and the setup card remembers the choice", async () => {
    const h = await enterHaunt();
    await startCase("Quick", 5);
    await press("Exit");
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(h.p.log.slice(-2)).toEqual(["host dispose", "host disposed"]);
    expect(h.history.stack.at(-1)).toBe("/haunt/attic-room");
    await press("Play a case");
    expect((screen.getByRole("radio", { name: /Quick/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "5" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("the Case Screen: when a case cannot start", () => {
  it("shows the setup again, and opens no Room, when the Screen is reached without pressing Start (a reload, or Back)", async () => {
    const h = await enterHaunt();
    act(() => h.router.navigate({ screen: "case", worldId: "attic-room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(h.p.loadHost).not.toHaveBeenCalled();
    expect(h.history.stack).not.toContain("/case/attic-room");
    expect(screen.queryByRole("heading", { name: "Play a case" })).toBeNull();
  });

  it("goes back after Exit and then Back without opening a Room by itself", async () => {
    const h = await enterHaunt();
    await startCase("Classic", 3);
    await press("Exit");
    await screen.findByRole("heading", { name: "How do you want to play?" });
    act(() => h.router.navigate({ screen: "case", worldId: "attic-room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(h.p.loadHost).toHaveBeenCalledTimes(1);
  });

  it("is not an error screen when the Host says the place is too small: Haunt says why, and Wander and the Gallery stay", async () => {
    const h = await enterHaunt();
    await startCase("Classic", 2);
    await press("Say the place is too small");
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(isOff(caseButton())).toBe(true);
    expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_COPY.world_too_small}`);
    expect(h.history.stack).not.toContain("/case/attic-room");
    expect(h.p.log.slice(-2)).toEqual(["host dispose", "host disposed"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    act(() => h.router.setFlow({ ghostReady: true }));
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(false);
    fireEvent.click(caseButton());
    expect(screen.queryByRole("heading", { name: "Set up your case" })).toBeNull();
  });

  it("falls back to a plain line, not an error screen, when the Host cannot load", async () => {
    const p = testPlatform();
    p.loadHost.mockImplementation(async () => { throw new Error("chunk failed"); });
    const h = renderApp("/gallery", { platform: p.kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    await pressStart("Classic", 2);
    await waitFor(() => expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_FALLBACK}`));
    expect(p.loadHost).toHaveBeenCalledTimes(1);
    expect(isOff(caseButton())).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.history.stack).not.toContain("/case/attic-room");
  });

  it("asks for no Room when party mode is off, even if Start was somehow pressed, and Haunt says why", async () => {
    const p = testPlatform();
    const memory = createPlayMemory();
    memory.set({ caseStart: true, caseSetup: { preset: "classic", bots: 2 } });
    const h = renderApp("/gallery", { fake: { flags: { partyEnabled: false } }, platform: p.kit, memory });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    act(() => h.router.navigate({ screen: "case", worldId: "attic-room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(p.loadHost).not.toHaveBeenCalled();
    expect(h.history.stack).not.toContain("/case/attic-room");
    expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_COPY.party_disabled}`);
    // The controller took the Start away, so Back or a reload cannot open a Room either.
    expect(memory.get().caseStart).toBe(false);
  });

  it("keeps a too-small place off for the visit, even after leaving Haunt and coming back", async () => {
    const h = await enterHaunt();
    await startCase("Classic", 2);
    await press("Say the place is too small");
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(isOff(caseButton())).toBe(true);
    act(() => h.router.navigate({ screen: "gallery" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(isOff(caseButton())).toBe(true);
    expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_COPY.world_too_small}`);
  });

  it("shows any other refusal once, and offers the case again the next time Haunt opens", async () => {
    const h = await enterHaunt();
    h.p.loadHost.mockImplementation(async () => ({
      async mountHost({ onMessage }) {
        queueMicrotask(() => onMessage({ t: "refused", code: "rooms_full" }));
        return { playAgain() {}, async dispose() {} };
      },
    }));
    await pressStart("Classic", 2);
    await waitFor(() => expect(caseLine()).toBe(`${CASE_LINE}. ${CASE_REFUSAL_COPY.rooms_full}`));
    expect(isOff(caseButton())).toBe(true);
    act(() => h.router.navigate({ screen: "gallery" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(isOff(caseButton())).toBe(false);
    expect(caseLine()).toBe(CASE_LINE);
  });
});

describe("Haunt: when the world is not ready", () => {
  it("offers no way to play yet: a world still being made, or one that failed, shows no choice", async () => {
    for (const status of ["generating", "failed"] as const) {
      const base = createFakeApi({ latencyMs: 0 });
      const world = vi.fn(async (id: string) => ({ ok: true as const, value: { id, status } }));
      const api: ShellApi = { ...base, world };
      renderApp("/gallery", { api, platform: testPlatform().kit });
      await screen.findByText("The attic room");
      fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
      await screen.findByRole("heading", { name: "Your place" });
      await waitFor(() => expect(world).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByRole("heading", { name: "How do you want to play?" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Play a case" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Wander" })).toBeNull();
      cleanup();
    }
  });
});

describe("Wander and the page titles", () => {
  it("starts a new game when Wander is chosen, even if the Session still names an earlier one for this place", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    await base.playStart({ worldId: "attic-room" }); // an earlier game the Session still names
    const playStart = vi.fn(base.playStart);
    const playGet = vi.fn(base.playGet);
    const api: ShellApi = { ...base, playStart, playGet };
    const h = renderApp("/gallery", { api, platform: testPlatform().kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    act(() => h.router.setFlow({ ghostReady: true }));
    // Booting asked about the earlier game; what matters is what Wander does.
    playGet.mockClear();
    playStart.mockClear();
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(playStart).toHaveBeenCalledTimes(1));
    expect(playGet).not.toHaveBeenCalled();
  });

  it("names the Screens Wander and Play a case in the page title", async () => {
    const h = await enterHaunt();
    act(() => h.router.setFlow({ ghostReady: true }));
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    expect(document.title).toBe("Wander · Hauntology");
    act(() => h.router.navigate({ screen: "haunt", worldId: "attic-room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    await startCase("Classic", 2);
    expect(document.title).toBe("Play a case · Hauntology");
  });
});
