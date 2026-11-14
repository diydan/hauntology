// @vitest-environment jsdom
import type { ShellApi } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { ANCHORS } from "@hauntology/shared/app/fake-api";
import { OVERDUE_LINE, QUOTA_KEPT_LINE, QUOTA_RETURNED_LINE, STAGE_COPY } from "@hauntology/shared/app/haunt-copy";
import { LOCATION_FAILED_LINE, MEMORY_DAY_ERROR_COPY, SUGGESTED_DAY_LINE } from "@hauntology/shared/app/sky";
import { OVERDUE_MS } from "@hauntology/shared/app/stage";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi, type FakeApi, type FakeApiOptions } from "../FakeApi";
import { createPlayMemory, type PlayMemoryStore } from "../play/memory";
import type { PlatformKit } from "../platform";
import { manualClock } from "../../test/clock";
import { renderApp } from "../../test/harness";
import { goIn, live, press, testPlatform } from "../../test/play";

afterEach(() => {
  cleanup();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

const NOW = new Date(2026, 10, 15, 14, 30);

type Own = { fake: FakeApi; c: ReturnType<typeof manualClock>; id: string };

/** A world the visitor made: created through the fake API at the manual clock's time, so its Stage depends only on that clock. */
async function ownWorld(options: FakeApiOptions = {}): Promise<Own> {
  const c = manualClock(NOW.getTime());
  const fake = createFakeApi({ latencyMs: 0, now: c.now, sleep: async () => {}, stageMs: { queued: 1000, generating: 4000, ingesting: 2000 }, ...options });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const q = await fake.quote(up.value.imageId);
  if (!q.ok) throw new Error(q.code);
  const made = await fake.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
  if (!made.ok) throw new Error(made.code);
  return { fake, c, id: made.value.worldId };
}

function kitFor(c: ReturnType<typeof manualClock>, over: Partial<PlatformKit> = {}, disposeMs?: number) {
  const p = testPlatform({}, disposeMs === undefined ? {} : { disposeMs });
  return { p, kit: { ...p.kit, scheduler: c.scheduler, now: () => new Date(c.now()), ...over } as Partial<PlatformKit> };
}

/** Renders the App for an own world at `path`, on the manual clock. */
function open(path: string, w: Own, options: { api?: ShellApi; memory?: PlayMemoryStore; over?: Partial<PlatformKit>; disposeMs?: number } = {}) {
  const { p, kit } = kitFor(w.c, options.over, options.disposeMs);
  const memory = options.memory ?? createPlayMemory();
  const h = renderApp(path, { api: options.api ?? w.fake, platform: kit, memory });
  return { ...h, p, memory };
}

const tick = (w: Own, ms: number) => act(async () => { await w.c.advance(ms); });

/** The Gallery's attic room, on the real clock: it is ready at once. */
async function enterGalleryHaunt(options: { api?: ShellApi; memory?: PlayMemoryStore; fake?: FakeApiOptions; now?: () => Date } = {}) {
  const p = testPlatform();
  const memory = options.memory ?? createPlayMemory();
  const kit: Partial<PlatformKit> = { ...p.kit, ...(options.now ? { now: options.now } : { now: () => NOW }) };
  const h = renderApp("/gallery", { ...(options.api ? { api: options.api } : { fake: options.fake ?? {} }), platform: kit, memory });
  await screen.findByText("The attic room");
  fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
  await screen.findByRole("heading", { name: "Ready" });
  return { ...h, p, memory };
}

/** Opens the preset list and takes one. */
const pickPreset = async (name: string) => {
  await press("Use a preset ghost");
  const button = await screen.findByRole("button", { name });
  await act(async () => { fireEvent.click(button); });
};

const ghostState = () => document.querySelector("[data-ghost-state]")?.textContent ?? "";
const stepNow = () => document.querySelector('.stage-steps li[aria-current="step"]')?.textContent ?? "";
const isOff = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";

describe("Haunt: the Stage display", () => {
  it("shows each Stage with its label, steps and progress as the job moves, says when it is ready, and starts nothing", async () => {
    const w = await ownWorld();
    const h = open(`/haunt/${w.id}`, w);
    await screen.findByRole("heading", { name: STAGE_COPY.queued.label });
    expect(h.history.stack.at(-1)).toBe(`/haunt/${w.id}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your place");
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("1");
    expect(stepNow()).toBe("Queued");
    expect([...document.querySelectorAll(".stage-steps li")].map((li) => li.textContent)).toEqual(["Queued", "Dreaming", "Stitching", "Ready"]);
    expect(screen.queryByRole("button", { name: "Play a case" })).toBeNull();

    await tick(w, 3000);
    await screen.findByRole("heading", { name: "Dreaming" });
    expect(screen.getByText(STAGE_COPY.dreaming.line)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("2");
    expect(stepNow()).toBe("Dreaming");
    expect([...document.querySelectorAll(".stage-steps li")].map((li) => li.getAttribute("data-done"))).toEqual(["true", null, null, null]);
    expect(live()).toBe(`Dreaming. ${STAGE_COPY.dreaming.line}`);

    await tick(w, 3000);
    await screen.findByRole("heading", { name: "Stitching" });
    expect(stepNow()).toBe("Stitching");
    expect(live()).toBe(`Stitching. ${STAGE_COPY.stitching.line}`);

    await tick(w, 3000);
    await screen.findByRole("heading", { name: "Ready" });
    expect(document.querySelector(".stage")?.textContent).toContain(STAGE_COPY.ready.line);
    expect(live()).toBe("Your place is ready.");
    expect(screen.getByRole("button", { name: "Play a case" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wander" })).toBeTruthy();
    // It stopped asking, and began no Viewer and no Room by itself.
    expect(w.c.pending()).toEqual([]);
    expect(h.p.loadViewer).not.toHaveBeenCalled();
    expect(h.p.loadHost).not.toHaveBeenCalled();
    expect(h.history.stack.at(-1)).toBe(`/haunt/${w.id}`);
  });

  it("is ready at once for a Gallery place, with the same choice, and offers no delete", async () => {
    const h = await enterGalleryHaunt();
    expect(screen.getByText(STAGE_COPY.ready.line)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play a case" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use a preset ghost" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make a ghost" })).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Delete my place" })).toBeNull();
    expect(h.p.loadViewer).not.toHaveBeenCalled();
  });

  it("shows the ghost choice and the sky card while waiting, and the choice of how to play only when ready", async () => {
    const w = await ownWorld();
    open(`/haunt/${w.id}`, w);
    await screen.findByRole("heading", { name: "Queued" });
    expect(screen.getByRole("heading", { name: "Your ghost" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set the sky" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "How do you want to play?" })).toBeNull();
  });

  it("says the wait is long after 15 minutes, offers the Gallery, keeps asking and cancels nothing", async () => {
    const w = await ownWorld({ stageMs: { queued: 1000, generating: 10 * 60 * 60_000, ingesting: 1000 } });
    const deleteWorld = vi.fn(w.fake.deleteWorld);
    const api: ShellApi = { ...w.fake, deleteWorld };
    open(`/haunt/${w.id}`, w, { api });
    await screen.findByRole("heading", { name: "Queued" });
    await tick(w, 3000);
    await screen.findByRole("heading", { name: "Dreaming" });
    expect(document.querySelector("[data-overdue]")).toBeNull();
    await tick(w, OVERDUE_MS - 60_000);
    expect(document.querySelector("[data-overdue]")).toBeNull();
    await tick(w, 2 * 60_000);
    const note = document.querySelector("[data-overdue]") as HTMLElement;
    expect(note.textContent).toContain(OVERDUE_LINE);
    expect(within(note).getByRole("link", { name: "Visit a gallery place" }).getAttribute("href")).toBe("/gallery");
    expect(screen.getByRole("heading", { name: "Dreaming" })).toBeTruthy();
    expect(w.c.pending()).toHaveLength(1);
    expect(deleteWorld).not.toHaveBeenCalled();
  });

  it("pauses asking while the tab is hidden, and asks again when it is shown", async () => {
    const w = await ownWorld();
    const world = vi.fn(w.fake.world);
    const api: ShellApi = { ...w.fake, world };
    open(`/haunt/${w.id}`, w, { api });
    await screen.findByRole("heading", { name: "Queued" });
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    world.mockClear();
    visibility = "hidden";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await tick(w, 60_000);
    expect(world).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await w.c.advance(0); });
    await waitFor(() => expect(world).toHaveBeenCalled());
    await screen.findByRole("heading", { name: "Ready" });
  });

  it("goes to the Expired Screen when the place is gone", async () => {
    const w = await ownWorld();
    const h = open(`/haunt/${w.id}`, w);
    await screen.findByRole("heading", { name: "Queued" });
    w.fake.backend.failNext("world", "world_not_found");
    await tick(w, 3000);
    await screen.findByRole("heading", { name: "That place is gone" });
    expect(h.history.stack.at(-1)).toBe("/expired");
    // The place's own address is replaced, so Back does not return to a place that is gone.
    expect(h.history.stack).not.toContain(`/haunt/${w.id}`);
  });
});

describe("Haunt: when a check fails", () => {
  it("keeps the last Stage, says it could not check just now, and recovers by itself", async () => {
    const w = await ownWorld();
    open(`/haunt/${w.id}`, w);
    await screen.findByRole("heading", { name: "Queued" });
    w.fake.backend.failNext("world", "network_error");
    await tick(w, 3000);
    await screen.findByText("We could not check just now. We will try again.");
    expect(screen.getByRole("heading", { name: "Queued" })).toBeTruthy();
    await tick(w, 5000);
    await waitFor(() => expect(screen.queryByText("We could not check just now. We will try again.")).toBeNull());
    expect(screen.getByRole("heading", { name: "Ready" })).toBeTruthy();
  });
});

describe("Haunt: a place that did not work", () => {
  it("shows the typed reason, says the allowance came back, offers the Gallery and no retry the API did not allow", async () => {
    const w = await ownWorld({ worldOutcome: "failed" });
    open(`/haunt/${w.id}`, w);
    await screen.findByRole("heading", { name: "Queued" });
    await tick(w, 3000);
    await tick(w, 3000);
    await screen.findByRole("heading", { name: STAGE_COPY.failed.label });
    const copy = errorCopy("upstream_rejected");
    expect(screen.getByText(copy.title + ".", { exact: false })).toBeTruthy();
    expect(screen.getByText(QUOTA_RETURNED_LINE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visit a gallery place" }).getAttribute("href")).toBe("/gallery");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Your ghost" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Set the sky" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play a case" })).toBeNull();
    expect(w.c.pending()).toEqual([]);
  });

  it("offers Try again, which goes to the Confirm Gate, only when the API allows a retry, and says when the allowance was not returned", async () => {
    const w = await ownWorld();
    let polls = 0;
    const world: ShellApi["world"] = async (id) => {
      polls++;
      return polls < 3
        ? { ok: true, value: { id, status: "generating" } }
        : { ok: true, value: { id, status: "failed", failure: { code: "upstream_rejected", quotaReturned: false, retryAllowed: true } } };
    };
    const api: ShellApi = { ...w.fake, world };
    const h = open(`/haunt/${w.id}`, w, { api });
    await screen.findByRole("heading", { name: "Dreaming" });
    await tick(w, 3000);
    await screen.findByRole("heading", { name: STAGE_COPY.failed.label });
    expect(screen.getByText(QUOTA_KEPT_LINE)).toBeTruthy();
    await press("Try again");
    // With nothing picked, the Confirm Gate sends the visitor on to Create.
    await screen.findByRole("heading", { name: "Make a place" });
    expect(h.history.stack.at(-1)).toBe("/create");
  });
});

describe("Haunt: reloading while waiting", () => {
  it("comes back to Haunt for the same place when the job is still running", async () => {
    const w = await ownWorld();
    const h = open("/", w);
    await screen.findByRole("heading", { name: "Queued" });
    expect(h.history.stack.at(-1)).toBe(`/haunt/${w.id}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your place");
  });
});

describe("Haunt: the ghost choice", () => {
  it("lists the Preset Ghosts, and a chosen one is named, announced and makes Wander possible", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const playStart = vi.fn(base.playStart);
    const api: ShellApi = { ...base, playStart };
    const memory = createPlayMemory();
    const h = await enterGalleryHaunt({ api, memory });
    expect(ghostState()).toBe("No ghost chosen yet.");
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(true);
    await press("Use a preset ghost");
    for (const name of ["Maren", "Alder", "Wick", "Ines", "Tobias", "Odile"]) await screen.findByRole("button", { name });
    await press("Maren");
    expect(ghostState()).toBe("Your ghost: Maren.");
    expect(live()).toBe("Maren is your ghost.");
    expect(memory.get()).toMatchObject({ ghostPreset: "preset-maren", ghostName: "Maren" });
    expect(screen.queryByRole("button", { name: "Odile" })).toBeNull();
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(false);
    expect(h.p.loadViewer).not.toHaveBeenCalled();
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(playStart).toHaveBeenCalledTimes(1));
    expect(playStart.mock.calls[0]![0]).toMatchObject({ worldId: "attic-room", ghostPreset: "preset-maren" });
  });

  it("opens the Ghost Creator only on request, and a ghost made there is chosen and the Creator is released", async () => {
    const memory = createPlayMemory();
    memory.set({ ghostPreset: "preset-wick", ghostName: "Wick" });
    const h = await enterGalleryHaunt({ memory });
    expect(h.p.loadCreator).not.toHaveBeenCalled();
    await press("Make a ghost");
    await screen.findByText("Stand-in Ghost Creator. The Creator is not built yet.");
    expect(h.p.loadCreator).toHaveBeenCalledTimes(1);
    await press("Use the default ghost");
    await waitFor(() => expect(ghostState()).toBe("Your ghost is ready."));
    expect(live()).toBe("Your ghost is ready.");
    expect(document.querySelector("[data-creator]")).toBeNull();
    expect(h.p.log).toContain("creator dispose");
    // A ghost the Creator made is not the preset that was chosen before.
    expect(memory.get().ghostPreset).toBeUndefined();
    expect(memory.get().ghostName).toBeUndefined();
    expect(isOff(screen.getByRole("button", { name: "Wander" }))).toBe(false);
  });

  it("closes the Creator when its button is pressed again, and releases it", async () => {
    const h = await enterGalleryHaunt();
    await press("Make a ghost");
    await screen.findByText("Stand-in Ghost Creator. The Creator is not built yet.");
    await press("Make a ghost");
    await waitFor(() => expect(document.querySelector("[data-creator]")).toBeNull());
    expect(h.p.log).toContain("creator dispose");
    expect(ghostState()).toBe("No ghost chosen yet.");
  });

  it("says the preset list could not be fetched, keeps the Creator available, and loads it on Try again", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    const h = await enterGalleryHaunt({ api: fake });
    fake.backend.failNext("ghostPresets", "network_error");
    await press("Use a preset ghost");
    const copy = errorCopy("network_error");
    await screen.findByText(`${copy.title}. ${copy.body}`);
    expect(screen.getByRole("button", { name: "Make a ghost" })).toBeTruthy();
    await press("Try again");
    await screen.findByRole("button", { name: "Maren" });
    expect(screen.queryByText(`${copy.title}. ${copy.body}`)).toBeNull();
    expect(h.p.loadViewer).not.toHaveBeenCalled();
  });

  it("shows at most twelve Preset Ghosts", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `preset-${i}`, name: `Ghost ${i}`, spriteUrl: `/demo/ghosts/preset-maren.svg` }));
    await enterGalleryHaunt({ api: { ...base, ghostPresets: async () => ({ ok: true as const, value: many }) } });
    await press("Use a preset ghost");
    await screen.findByRole("button", { name: "Ghost 0" });
    expect(document.querySelectorAll("[data-presets] .preset")).toHaveLength(12);
  });

  it("asks for the list again when the preset card is closed and opened after a failure", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    await enterGalleryHaunt({ api: fake });
    fake.backend.failNext("ghostPresets", "network_error");
    await press("Use a preset ghost");
    const copy = errorCopy("network_error");
    await screen.findByText(`${copy.title}. ${copy.body}`);
    await press("Use a preset ghost");
    expect(screen.queryByText(`${copy.title}. ${copy.body}`)).toBeNull();
    await press("Use a preset ghost");
    await screen.findByRole("button", { name: "Maren" });
  });

  it("chooses a ghost only on a message that is exactly `chosen`", async () => {
    const memory = createPlayMemory();
    const h = await enterGalleryHaunt({ memory });
    let send!: (m: unknown) => void;
    h.p.loadCreator.mockImplementation(async () => ({
      async mountCreator({ onMessage }) {
        send = onMessage;
        return { async dispose() {} };
      },
    }));
    await press("Make a ghost");
    await waitFor(() => expect(send).toBeDefined());
    await act(async () => { for (const bad of [null, "chosen", { t: "pick" }, { t: "chosen", ghostId: "g1" }]) send(bad); });
    expect(ghostState()).toBe("No ghost chosen yet.");
    expect(document.querySelector("[data-creator]")).not.toBeNull();
    await act(async () => { send({ t: "chosen" }); });
    await waitFor(() => expect(ghostState()).toBe("Your ghost is ready."));
  });

  it("says so, and keeps the presets, when the Creator cannot load; it is not an error screen", async () => {
    const h = await enterGalleryHaunt();
    h.p.loadCreator.mockImplementation(async () => { throw new Error("chunk failed"); });
    await press("Make a ghost");
    await screen.findByText("The Ghost Creator could not load. You can use a preset ghost instead.");
    expect(screen.queryByRole("alert")).toBeNull();
    await press("Use a preset ghost");
    await screen.findByRole("button", { name: "Maren" });
  });
});

describe("Haunt: Set the sky", () => {
  it("is closed and says the usual sky applies, and nothing waits for it: Wander and a case start without it", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const playStart = vi.fn(base.playStart);
    const memory = createPlayMemory();
    await enterGalleryHaunt({ api: { ...base, playStart }, memory });
    expect(document.querySelector("[data-sky-state]")?.textContent).toBe("The usual sky.");
    expect(screen.queryByRole("search")).toBeNull();
    expect(memory.get().conditions).toBeUndefined();
    await pickPreset("Wick");
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(playStart).toHaveBeenCalledTimes(1));
    expect(playStart.mock.calls[0]![0]).not.toHaveProperty("conditions");
  });

  it("searches cities, shows at most five matches, and keeps only the chosen place as a label and a rounded position", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const eight = Array.from({ length: 8 }, (_, i) => ({ label: `Town ${i}`, lat: 10.123456 + i, lon: 20.987654, tz: "Europe/Paris" }));
    const searchPlaces = vi.fn(async (q: string) => (q === "town" ? ({ ok: true as const, value: eight }) : base.searchPlaces(q)));
    const memory = createPlayMemory();
    await enterGalleryHaunt({ api: { ...base, searchPlaces }, memory });
    await press("Set the sky (optional)");
    const search = screen.getByRole("search", { name: "Find a city" });
    expect(within(search).getByRole("button", { name: "Search" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(within(search).getByLabelText("City"), { target: { value: "town" } });
    await act(async () => { fireEvent.submit(search); });
    const list = await screen.findByRole("list", { name: "Matches" });
    expect(within(list).getAllByRole("button")).toHaveLength(5);
    expect(live()).toBe("5 places found.");
    await act(async () => { fireEvent.click(within(list).getByRole("button", { name: "Town 2" })); });
    expect(document.querySelector("[data-sky-place]")?.textContent).toBe("Town 2");
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    expect(memory.get().conditions).toEqual({ place: { lat: 12.12, lon: 20.99, tz: "Europe/Paris", label: "Town 2" }, hostHour: 14 });
    expect(document.querySelector("[data-sky-state]")?.textContent).toBe("Sky: Town 2");
    await press("Remove place");
    expect(memory.get().conditions).toBeUndefined();
    expect(document.querySelector("[data-sky-place]")).toBeNull();
  });

  it("says when nothing matched, and when the search failed, and stays usable", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    await enterGalleryHaunt({ api: fake });
    await press("Set the sky (optional)");
    const search = screen.getByRole("search", { name: "Find a city" });
    fireEvent.change(within(search).getByLabelText("City"), { target: { value: "zzzz" } });
    await act(async () => { fireEvent.submit(search); });
    await screen.findByText("No places found. Try another name.");
    expect(live()).toBe("No places found.");

    fake.backend.failNext("searchPlaces", "geocode_unavailable");
    fireEvent.change(within(search).getByLabelText("City"), { target: { value: "lyon" } });
    await act(async () => { fireEvent.submit(search); });
    const copy = errorCopy("geocode_unavailable");
    await screen.findByText(`${copy.title}. ${copy.body}`);
    await act(async () => { fireEvent.submit(search); });
    await screen.findByRole("button", { name: "Lyon, France" });
    expect(screen.queryByText(`${copy.title}. ${copy.body}`)).toBeNull();
  });

  it("asks the browser for a location only after the tap, and keeps two decimals and no time zone", async () => {
    const memory = createPlayMemory();
    const h = await enterGalleryHaunt({ memory });
    await press("Set the sky (optional)");
    expect(h.p.locate).not.toHaveBeenCalled();
    await press("Use my location");
    await waitFor(() => expect(document.querySelector("[data-sky-place]")?.textContent).toBe("Your location"));
    expect(h.p.locate).toHaveBeenCalledTimes(1);
    expect(memory.get().conditions).toEqual({ place: { lat: 51.51, lon: -0.13, tz: null, label: "Your location" }, hostHour: 14 });
  });

  it("falls back to a plain line when the location is refused, and the card stays usable", async () => {
    const memory = createPlayMemory();
    const h = await enterGalleryHaunt({ memory });
    h.p.locate.mockImplementation(async () => { throw new Error("denied"); });
    await press("Set the sky (optional)");
    await press("Use my location");
    await screen.findByText(LOCATION_FAILED_LINE);
    expect(memory.get().conditions).toBeUndefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("search", { name: "Find a city" })).toBeTruthy();
  });

  it("takes a Memory Day from 1940 to yesterday with a time of day, and refuses a day outside that", async () => {
    const memory = createPlayMemory();
    await enterGalleryHaunt({ memory });
    await press("Set the sky (optional)");
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.getAttribute("min")).toBe("1940-01-01");
    expect(date.getAttribute("max")).toBe("2026-11-14");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Dawn", "Day", "Dusk", "Night"]);

    fireEvent.change(date, { target: { value: "1939-12-31" } });
    expect(screen.getByText(MEMORY_DAY_ERROR_COPY.range)).toBeTruthy();
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(memory.get().conditions).toBeUndefined();

    fireEvent.change(date, { target: { value: "2026-11-15" } });
    expect(screen.getByText(MEMORY_DAY_ERROR_COPY.range)).toBeTruthy();
    expect(memory.get().conditions).toBeUndefined();

    fireEvent.change(date, { target: { value: "1999-10-31" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "night" } });
    expect(screen.queryByText(MEMORY_DAY_ERROR_COPY.range)).toBeNull();
    expect(date.getAttribute("aria-invalid")).toBe("false");
    expect(memory.get().conditions).toEqual({ memoryDay: { date: "1999-10-31", timeOfDay: "night" }, hostHour: 14 });
    expect(document.querySelector("[data-sky-state]")?.textContent).toBe("Sky: 1999-10-31");

    await press("Clear the date");
    expect(memory.get().conditions).toBeUndefined();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("");
  });

  it("keeps a place and a day together, and either one alone", async () => {
    const memory = createPlayMemory();
    await enterGalleryHaunt({ memory });
    await press("Set the sky (optional)");
    await press("Use my location");
    await waitFor(() => expect(memory.get().conditions?.place).toBeDefined());
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2001-09-09" } });
    expect(memory.get().conditions).toMatchObject({ place: { label: "Your location" }, memoryDay: { date: "2001-09-09", timeOfDay: "dusk" } });
    await press("Clear the date");
    expect(Object.keys(memory.get().conditions ?? {}).sort()).toEqual(["hostHour", "place"]);
  });

  it("offers a photo's date as the Memory Day, which the visitor can change or clear", async () => {
    const memory = createPlayMemory();
    memory.set({ suggestedDay: { date: "1987-06-21", timeOfDay: "dawn" } });
    await enterGalleryHaunt({ memory });
    await press("Set the sky (optional)");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("1987-06-21");
    expect((screen.getByLabelText("Time") as HTMLSelectElement).value).toBe("dawn");
    expect(screen.getByText(SUGGESTED_DAY_LINE)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "1988-01-02" } });
    expect(screen.queryByText(SUGGESTED_DAY_LINE)).toBeNull();
    expect(memory.get().conditions?.memoryDay).toEqual({ date: "1988-01-02", timeOfDay: "dawn" });
    await press("Clear the date");
    expect(memory.get().conditions).toBeUndefined();
  });

  it("remembers what was chosen when the card is closed and opened again", async () => {
    const memory = createPlayMemory();
    await enterGalleryHaunt({ memory });
    await press("Set the sky (optional)");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2010-04-05" } });
    await press("Hide the sky card");
    expect(screen.queryByRole("search")).toBeNull();
    await press("Set the sky (optional)");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2010-04-05");
  });

  it("goes with the game: Wander starts with the chosen sky", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const playStart = vi.fn(base.playStart);
    await enterGalleryHaunt({ api: { ...base, playStart } });
    await press("Set the sky (optional)");
    await press("Use my location");
    await waitFor(() => expect(document.querySelector("[data-sky-place]")).not.toBeNull());
    await pickPreset("Ines");
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(playStart).toHaveBeenCalledTimes(1));
    expect(playStart.mock.calls[0]![0]).toMatchObject({ conditions: { place: { label: "Your location" }, hostHour: 14 } });
  });
});

describe("Delete my place", () => {
  const trigger = () => screen.getByRole("button", { name: "Delete my place" });

  async function ownReady(options: { disposeMs?: number } = {}) {
    const w = await ownWorld({ stageMs: { queued: 0, generating: 0, ingesting: 0 } });
    const memory = createPlayMemory();
    memory.set({ ghostPreset: "preset-maren", ghostName: "Maren", playId: "p1", conditions: { hostHour: 3, memoryDay: { date: "2001-01-01", timeOfDay: "night" } } });
    const deleteWorld = vi.fn(w.fake.deleteWorld);
    const api: ShellApi = { ...w.fake, deleteWorld };
    const h = open(`/haunt/${w.id}`, w, { api, memory, ...(options.disposeMs === undefined ? {} : { disposeMs: options.disposeMs }) });
    await screen.findByRole("heading", { name: "Ready" });
    return { ...w, h, memory, deleteWorld };
  }

  it("asks first, keeps the place on Keep it, and gives focus back to the button", async () => {
    const { deleteWorld } = await ownReady();
    await screen.findByRole("button", { name: "Delete my place" });
    trigger().focus();
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog", { name: "Delete this place?" });
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
    await press("Keep it");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteWorld).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it("deletes the place, goes Home, and forgets the place, the ghost, the sky and the play session", async () => {
    const { h, memory, deleteWorld, id } = await ownReady();
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete my place" })); });
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(deleteWorld).toHaveBeenCalledTimes(1);
    expect(deleteWorld).toHaveBeenCalledWith(id);
    expect(h.history.stack.at(-1)).toBe("/");
    // It left first and forgot afterwards: the place's own screen was never bounced to the Gallery on the way out.
    expect(h.history.stack).toEqual([`/haunt/${id}`, "/"]);
    expect(memory.get()).toEqual({ startFresh: false, caseStart: false });
    const flow = h.router.getSnapshot().flow;
    expect(flow.worldId).toBeUndefined();
    expect(flow.pickedImageId).toBeUndefined();
    expect(flow).toMatchObject({ ghostReady: false, playEnded: false });
    expect(live()).toBe("Your place was deleted.");
    // The place is gone for good: its address no longer lets the visitor in.
    act(() => h.router.navigate({ screen: "haunt", worldId: id }));
    await screen.findByRole("heading", { name: "Visit a place" });
  });

  it("says why and stays open when the delete fails, and keeps everything", async () => {
    const { memory, deleteWorld, h } = await ownReady();
    deleteWorld.mockImplementationOnce(async () => ({ ok: false, code: "network_error" }));
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    const dialog = screen.getByRole("dialog");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete my place" })); });
    const copy = errorCopy("network_error");
    await screen.findByText(`${copy.title}. ${copy.body}`);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((within(screen.getByRole("dialog")).getByRole("button", { name: "Delete my place" }) as HTMLButtonElement).disabled).toBe(false);
    expect(memory.get().ghostName).toBe("Maren");
    expect(h.history.stack.at(-1)).not.toBe("/");
  });

  it("shows the Expired Screen, and forgets the place, when the place was already gone", async () => {
    const { memory, deleteWorld, h } = await ownReady();
    deleteWorld.mockImplementationOnce(async () => ({ ok: false, code: "world_not_found" }));
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete my place" })); });
    await screen.findByRole("heading", { name: "That place is gone" });
    expect(h.history.stack.at(-1)).toBe("/expired");
    expect(memory.get()).toEqual({ startFresh: false, caseStart: false });
  });

  it("also closes on Escape, and cannot be closed while it is deleting", async () => {
    const { deleteWorld } = await ownReady();
    let finish!: () => void;
    deleteWorld.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ ok: true, value: null }); }));
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger());
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete my place" })); });
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Deleting…" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => { finish(); });
    await screen.findByRole("heading", { name: "Hauntology" });
  });

  it("is also offered on Play, where it releases the Viewer before going Home", async () => {
    // A Viewer that takes a moment to let go: Home must not mount before it has.
    const { h, id } = await ownReady({ disposeMs: 40 });
    await pickPreset("Odile");
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await goIn();
    expect(h.p.log).toContain("mount");
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete my place" })); });
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(h.p.log.slice(-2)).toEqual(["dispose", "disposed"]);
    expect(h.history.stack.at(-1)).toBe("/");
    expect(h.router.getSnapshot().flow.worldId).toBeUndefined();
    void id;
  });

  it("is also offered on the Ending", async () => {
    const w = await ownWorld({ stageMs: { queued: 0, generating: 0, ingesting: 0 } });
    const started = await w.fake.playStart({ worldId: w.id });
    if (!started.ok) throw new Error(started.code);
    for (const a of ANCHORS) {
      const r = await w.fake.playTurn(started.value.playId, { input: { button: "look" }, pose: { pos: [a.pos[0], 0, a.pos[2]], yaw: 0 } });
      if (!r.ok) throw new Error(r.code);
    }
    const memory = createPlayMemory();
    memory.set({ playId: started.value.playId });
    const h = open(`/haunt/${w.id}`, w, { memory });
    await screen.findByRole("heading", { name: "Ready" });
    act(() => {
      h.router.setFlow({ ghostReady: true, playEnded: true });
      h.router.navigate({ screen: "end", worldId: w.id });
    });
    await screen.findByRole("heading", { name: "You remembered" });
    await screen.findByRole("button", { name: "Delete my place" });
    fireEvent.click(trigger());
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete my place" })); });
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(memory.get()).toEqual({ startFresh: false, caseStart: false });
  });

  it("is not offered for a Gallery place on Play", async () => {
    const h = await enterGalleryHaunt();
    await pickPreset("Tobias");
    await press("Wander");
    await screen.findByRole("heading", { name: "Wander" });
    await goIn();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Delete my place" })).toBeNull();
    void h;
  });
});
