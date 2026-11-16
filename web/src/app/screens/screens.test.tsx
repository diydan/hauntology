// @vitest-environment jsdom
import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { ANCHORS } from "@hauntology/shared/app/fake-api";
import { REASON_COPY } from "@hauntology/shared/app/home-copy";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeApi, type FakeApi, type FakeApiOptions } from "../FakeApi";
import { createPlayMemory } from "../play/memory";
import type { PlatformKit } from "../platform";
import { manualClock } from "../../test/clock";
import { renderApp, type Harness } from "../../test/harness";
import { enterPlay, live, testPlatform } from "../../test/play";
import { SCREEN_TITLES } from "./index";

/**
 * Task 10.1 (Requirements 8.1, 8.2, 11.5): every Screen has a main-path test and a failure-path test, and
 * in each one focus is on the Screen's `h1` and the live region says the title or the error. A Screen
 * reached by a route change takes focus (the first page load does not, by design), and the title of the
 * Screen is announced once. Where a Screen can fail, the typed message is on the page and in the live region.
 *
 * The longer flows of each Screen are tested in its own file; this one is the matrix.
 */
afterEach(() => cleanup());

const h1 = () => screen.getByRole("heading", { level: 1 });
const focusedH1 = async (name: string) => {
  await waitFor(() => expect(document.activeElement).toBe(h1()));
  expect(h1().textContent).toBe(name);
};
const goTo = (h: Harness, route: Parameters<Harness["router"]["navigate"]>[0]) => act(() => h.router.navigate(route));

/** Opens the Gallery, so that the next route change is a real one. */
async function fromGallery(options: { fake?: FakeApiOptions; api?: ShellApi; platform?: Partial<PlatformKit> } = {}): Promise<Harness> {
  const h = renderApp("/gallery", { ...(options.api ? { api: options.api } : { fake: options.fake ?? {} }), ...(options.platform ? { platform: options.platform } : {}) });
  await screen.findByRole("heading", { name: "Visit a place" });
  return h;
}

describe("Home", () => {
  it("main path: reached by a route change it takes focus and says its title", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "home" });
    await focusedH1("Hauntology");
    expect(live()).toBe(SCREEN_TITLES.home);
  });

  it("failure path: with new places off it says why in one line, ties it to the actions, and keeps the Gallery", async () => {
    renderApp("/", { fake: { flags: { worldGenEnabled: false } } });
    await screen.findByRole("heading", { name: "Hauntology" });
    const reason = document.getElementById("home-reason");
    expect(reason?.textContent).toBe(REASON_COPY.kill_switch);
    for (const name of ["Draw a place", "Upload a photo"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.getAttribute("aria-describedby")).toBe("home-reason");
    }
    expect(screen.getByRole("link", { name: "Visit a gallery place" }).getAttribute("href")).toBe("/gallery");
  });
});

describe("Gallery", () => {
  it("main path: reached by a route change it takes focus and says its title", async () => {
    const h = renderApp("/");
    await screen.findByRole("heading", { name: "Hauntology" });
    await goTo(h, { screen: "gallery" });
    await screen.findByText("The attic room");
    await focusedH1("Visit a place");
    expect(live()).toBe(SCREEN_TITLES.gallery);
  });

  it("failure path: a list that cannot be loaded says why, offers Try again, and says so aloud", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    fake.backend.failNext("gallery", "network_error");
    const h = renderApp("/", { api: fake });
    await screen.findByRole("heading", { name: "Hauntology" });
    await goTo(h, { screen: "gallery" });
    const copy = errorCopy("network_error");
    await screen.findByText(copy.body);
    await focusedH1("Visit a place");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(live()).toContain(copy.title);
  });
});

describe("Create", () => {
  it("main path: reached by a route change it takes focus and says its title", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "create" });
    await screen.findByRole("heading", { name: "Make a place" });
    await focusedH1("Make a place");
    expect(live()).toBe(SCREEN_TITLES.create);
  });

  it("is built from the shared elements (world-pipeline 13.1): one yellow button, the pad's controls and the picker's are shared buttons, and the page has no old look class", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "create" });
    await screen.findByRole("heading", { name: "Make a place" });
    expect([...document.querySelectorAll(".ui-button--primary")].map((b) => b.textContent)).toEqual(["Make it real"]);
    for (const b of document.querySelectorAll("main button, main a[role=button]")) expect(b.classList.contains("ui-button"), b.textContent ?? "").toBe(true);
    expect(document.querySelector(".button, .banner, .card, .notice, .dialog")).toBeNull();
  });

  it("failure path: a file that cannot be used is refused with its own message, shown and said aloud", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "create" });
    await screen.findByRole("heading", { name: "Make a place" });
    const gif = new File([new Uint8Array(10)], "x.gif", { type: "image/gif" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { files: [gif] } }); });
    const copy = errorCopy("upload_bad_type");
    expect(document.querySelector("[data-photo-problem]")?.textContent).toBe(`${copy.title}. ${copy.body}`);
    expect(live()).toBe(`${copy.title}. ${copy.body}`);
  });
});

/** A visit with a photo already picked, opened on Create so that going to Confirm is a route change. */
async function toConfirm(fake: FakeApi) {
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const h = renderApp("/create", { api: fake });
  await screen.findByRole("heading", { name: "Make a place" });
  act(() => {
    h.router.setFlow({ pickedImageId: up.value.imageId });
    h.router.navigate({ screen: "confirm" });
  });
  return h;
}

describe("Confirm", () => {
  it("main path: it takes focus, asks the question, and says the picture is ready", async () => {
    await toConfirm(createFakeApi({ latencyMs: 0 }));
    await screen.findByRole("button", { name: "Enter this place" });
    await focusedH1("Enter this place?");
    expect(live()).toBe("Your picture is ready to look at.");
  });

  it("failure path: a refused place shows the message of its code and says it aloud", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    await toConfirm(fake);
    await screen.findByRole("button", { name: "Enter this place" });
    fake.backend.failNext("createWorld", "quota_session");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enter this place" })); });
    const copy = errorCopy("quota_session");
    await screen.findByRole("heading", { name: copy.title });
    expect(live()).toBe(`${copy.title}. ${copy.body}`);
  });
});

/** A place the visitor made, on a clock the test moves, for the Haunt Screen. */
async function ownWorld(options: FakeApiOptions = {}) {
  const c = manualClock();
  const fake = createFakeApi({ latencyMs: 0, now: c.now, sleep: async () => {}, stageMs: { queued: 1000, generating: 4000, ingesting: 2000 }, ...options });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const q = await fake.quote(up.value.imageId);
  if (!q.ok) throw new Error(q.code);
  const made = await fake.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
  if (!made.ok) throw new Error(made.code);
  const p = testPlatform();
  const platform: Partial<PlatformKit> = { ...p.kit, scheduler: c.scheduler, now: () => new Date(c.now()) };
  return { c, fake, id: made.value.worldId, platform };
}

describe("Haunt", () => {
  it("main path: it takes focus and says its title, then each Stage as it changes", async () => {
    const w = await ownWorld();
    const h = renderApp("/gallery", { api: w.fake, platform: w.platform });
    await screen.findByRole("heading", { name: "Visit a place" });
    act(() => h.router.setFlow({ worldId: w.id }));
    await goTo(h, { screen: "haunt", worldId: w.id });
    await screen.findByRole("heading", { name: "Queued" });
    await focusedH1("Your place");
    expect(live()).toBe(SCREEN_TITLES.haunt);
    await act(async () => { await w.c.advance(3000); });
    await screen.findByRole("heading", { name: "Dreaming" });
    expect(live()).toMatch(/^Dreaming\./);
    // The progress is a gauge with its steps in a panel, made of shared elements, and no yellow button on a screen that only waits.
    expect(document.querySelector("section.ui-panel progress.ui-gauge")).not.toBeNull();
    expect(document.querySelectorAll("ol.ui-steps > li.ui-step")).toHaveLength(4);
    expect(document.querySelectorAll(".ui-button--primary")).toHaveLength(0);
  });

  it("failure path: a place that did not work shows the reason and says so aloud", async () => {
    const w = await ownWorld({ worldOutcome: "failed" });
    renderApp("/", { api: w.fake, platform: w.platform });
    await screen.findByRole("heading", { name: "Queued" });
    await act(async () => { await w.c.advance(3000); });
    await act(async () => { await w.c.advance(3000); });
    await screen.findByRole("heading", { name: "It did not work" });
    expect(live()).toMatch(/^It did not work\./);
    expect(screen.getByText(errorCopy("upstream_rejected").title, { exact: false })).toBeTruthy();
    expect(document.querySelector("section.ui-panel")).not.toBeNull();
    expect(document.querySelectorAll(".ui-button--primary")).toHaveLength(0);
  });
});

describe("Play (Wander)", () => {
  it("main path: it takes focus and says its title", async () => {
    await enterPlay();
    await focusedH1("Wander");
    expect(live()).toBe(SCREEN_TITLES.play);
  });

  it("failure path: a game that cannot be started shows the message of its code and says it aloud", async () => {
    const fake = createFakeApi({ latencyMs: 0 });
    fake.backend.failNext("playStart", "rate_limited");
    const p = testPlatform();
    const h = renderApp("/gallery", { api: fake, platform: p.kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "Your place" });
    act(() => h.router.setFlow({ ghostReady: true }));
    await goTo(h, { screen: "play", worldId: "attic-room" });
    const copy = errorCopy("rate_limited");
    await screen.findByRole("heading", { name: copy.title });
    expect(live()).toBe(`${copy.title}. ${copy.body}`);
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
  });
});

/** A finished game for an own place whose Stages are instant, so that the Ending can be reached by a route change. */
async function endedGame(failure?: ApiResult<never>) {
  const fake = createFakeApi({ latencyMs: 0, stageMs: { queued: 0, generating: 0, ingesting: 0 } });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const q = await fake.quote(up.value.imageId);
  if (!q.ok) throw new Error(q.code);
  const made = await fake.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
  if (!made.ok) throw new Error(made.code);
  const id = made.value.worldId;
  const started = await fake.playStart({ worldId: id });
  if (!started.ok) throw new Error(started.code);
  for (const a of ANCHORS) await fake.playTurn(started.value.playId, { input: { button: "look" }, pose: { pos: [a.pos[0], 0, a.pos[2]], yaw: 0 } });
  const api: ShellApi = failure === undefined ? fake : { ...fake, playGet: async () => failure };
  const memory = createPlayMemory();
  memory.set({ playId: started.value.playId });
  const h = renderApp("/gallery", { api, memory, platform: testPlatform().kit });
  await screen.findByRole("heading", { name: "Visit a place" });
  act(() => h.router.setFlow({ worldId: id, ghostReady: true, playEnded: true }));
  await goTo(h, { screen: "end", worldId: id });
  return h;
}

describe("Ending", () => {
  it("main path: it takes focus and says its title", async () => {
    await endedGame();
    await screen.findByRole("heading", { name: "You remembered" });
    await focusedH1("You remembered");
    expect(live()).toBe(SCREEN_TITLES.end);
  });

  it("failure path: memories that cannot be read show the message and a way to try again, and say so aloud", async () => {
    await endedGame({ ok: false, code: "network_error" });
    const copy = errorCopy("network_error");
    await screen.findByRole("heading", { name: copy.title });
    expect(live()).toBe(`${copy.title}. ${copy.body}`);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("Shared (a place somebody shared)", () => {
  const FRIEND = "w-friendfriendfriendfr";
  const friendsWorld = (world: ShellApi["world"]): ShellApi => ({ ...createFakeApi({ latencyMs: 0 }), world });

  it("main path: reached by a route change it takes focus and says its title", async () => {
    const api = friendsWorld(async (id): Promise<ApiResult<import("@hauntology/shared/app/api").WorldStatus>> => ({ ok: true, value: { id, status: "ready", title: "A friend's kitchen" } }));
    const h = await fromGallery({ api });
    await goTo(h, { screen: "shared", worldId: FRIEND });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    await focusedH1("A shared place");
    expect(live()).toBe(SCREEN_TITLES.shared);
  });

  it("failure path: a place that cannot be opened says why, offers Try again, and says so aloud", async () => {
    const api = friendsWorld(async () => ({ ok: false, code: "network_error" }));
    const h = await fromGallery({ api });
    await goTo(h, { screen: "shared", worldId: FRIEND });
    const copy = errorCopy("network_error");
    await screen.findByText(copy.body);
    await focusedH1("A shared place");
    expect(live()).toBe(copy.title);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("NotFound", () => {
  it("main path: an address that is not a route says so, takes focus, and offers the way out", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "not_found" });
    await screen.findByRole("heading", { name: "There is nothing here" });
    await focusedH1("There is nothing here");
    expect(live()).toBe(SCREEN_TITLES.not_found);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Gallery" }).getAttribute("href")).toBe("/gallery");
  });

  it("failure path: a world address that cannot be one (a bad id) is nothing here, not a crash", async () => {
    const h = renderApp("/play/bad%20id");
    await screen.findByRole("heading", { name: "There is nothing here" });
    expect(h.history.stack.at(-1)).toBe("/play/bad%20id");
    expect(screen.getByRole("link", { name: "Gallery" })).toBeTruthy();
  });
});

describe("Expired", () => {
  it("main path: a place that is gone says so calmly, takes focus, and offers the way out", async () => {
    const h = await fromGallery();
    await goTo(h, { screen: "expired" });
    await screen.findByRole("heading", { name: "That place is gone" });
    await focusedH1("That place is gone");
    expect(live()).toBe(SCREEN_TITLES.expired);
    expect(screen.getByText(/Nothing is wrong on your side/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
  });

  it("failure path: a world the server no longer knows, or a Session that ended, lands here from Haunt", async () => {
    for (const code of ["world_not_found", "session_expired"] as const) {
      const w = await ownWorld();
      const h = renderApp("/", { api: w.fake, platform: w.platform });
      await screen.findByRole("heading", { name: "Queued" });
      w.fake.backend.failNext("world", code);
      await act(async () => { await w.c.advance(3000); });
      await screen.findByRole("heading", { name: "That place is gone" });
      expect(h.history.stack.at(-1), code).toBe("/expired");
      expect(live(), code).toBe(SCREEN_TITLES.expired);
      cleanup();
    }
  });
});
