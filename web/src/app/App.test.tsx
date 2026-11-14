// @vitest-environment jsdom
import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/harness";
import { createFakeApi } from "./FakeApi";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const heading = () => document.querySelector("h1");
const liveText = () => document.querySelector("[data-live-region]")?.textContent ?? "";
const photo = new Blob([new Uint8Array(10)], { type: "image/jpeg" });

describe("App boot", () => {
  it("shows a loading line, then Home, and does not move focus on the first load", async () => {
    const h = renderApp("/");
    expect(screen.getByText("Loading…")).toBeTruthy();
    await screen.findByText("Draw a place");
    expect(heading()?.textContent).toBe("Hauntology");
    expect(document.activeElement).toBe(document.body);
    expect(liveText()).toBe(""); // nothing is announced for the first page
    expect(document.title).toBe("Home · Hauntology");
    expect(h.history.stack).toEqual(["/"]);
  });

  it("asks for the session and the quota once, however often it renders", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const session = vi.spyOn(api, "session");
    const quota = vi.spyOn(api, "quota");
    renderApp("/gallery", { api });
    await screen.findByText("Visit a place");
    expect(session).toHaveBeenCalledTimes(1);
    expect(quota).toHaveBeenCalledTimes(1);
  });

  it("opens a deep link that passes its guard", async () => {
    renderApp("/gallery");
    await screen.findByText("Visit a place");
  });

  it("sends a guarded route to its redirect and rewrites the address", async () => {
    const h = renderApp("/confirm");
    await screen.findByText("Make a place");
    expect(h.history.stack).toEqual(["/create"]);
  });

  it("shows the not-found Screen for an address that is not a route, and leaves the address", async () => {
    const h = renderApp("/no/such/place");
    await screen.findByText("There is nothing here");
    expect(h.history.stack).toEqual(["/no/such/place"]);
  });

  it("opens the last world on `/`: Haunt while it is being made", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const up = await api.uploadPhoto(photo);
    if (!up.ok) throw new Error("upload");
    const q = await api.quote(up.value.imageId);
    if (!q.ok) throw new Error("quote");
    const made = await api.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
    if (!made.ok) throw new Error("create");
    const h = renderApp("/", { api });
    await screen.findByText("Your place is coming");
    expect(h.history.stack).toEqual([`/haunt/${made.value.worldId}`]);
  });

  it("sends a world the server no longer has to the Expired Screen", async () => {
    // The Session still names the world, but it ran out of time on the server.
    const base = createFakeApi({ latencyMs: 0 });
    const flags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false };
    const api = {
      ...base,
      session: async () => ({ ok: true, value: { ackNotice: false, flags, lastWorldId: "w-gone", lastPlayId: "p-gone" } }),
      world: async () => ({ ok: false, code: "world_not_found" }),
    } as ShellApi;
    const h = renderApp("/play/w-gone", { api });
    await screen.findByRole("heading", { name: "That place is gone" });
    expect(h.history.stack).toEqual(["/expired"]);
  });
});

describe("App boot, once", () => {
  it("starts the router once under StrictMode, which runs effects twice", async () => {
    const { StrictMode } = await import("react");
    const { render } = await import("@testing-library/react");
    const { App } = await import("./App");
    const { createDebugStore } = await import("./debugStore");
    const { createQuotaStore } = await import("./QuotaStore");
    const { createRouter } = await import("./router");
    const { fakeHistory } = await import("../test/harness");
    const api = createFakeApi({ latencyMs: 0 });
    const router = createRouter(fakeHistory("/gallery"));
    const start = vi.spyOn(router, "start");
    render(<StrictMode><App api={api} router={router} quota={createQuotaStore(api)} debugStore={createDebugStore()} /></StrictMode>);
    await screen.findByText("Visit a place");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("does not start the router if the App is gone before the boot data arrives", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const api = { ...base, session: async () => { await gate; return base.session(); } } as ShellApi;
    const h = renderApp("/gallery", { api });
    cleanup();
    release();
    await h.quota.load();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.router.getSnapshot().ready).toBe(false);
  });
});

describe("App boot failure", () => {
  const failing = (result: ApiResult<never>): ShellApi => {
    const base = createFakeApi({ latencyMs: 0 });
    return { ...base, session: async () => result } as ShellApi;
  };

  it("shows fixed copy and the code, never server text, and a Try again button", async () => {
    renderApp("/", { api: failing({ ok: false, code: "network_error", message: "ECONNREFUSED 10.0.0.1" } as never) });
    await screen.findByText("We could not reach the server");
    expect(screen.getByText("network_error")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    const button = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("holds the button for the advised delay after a 429, then boots on Try again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    let attempts = 0;
    const base = createFakeApi({ latencyMs: 0 });
    const api = { ...base, session: async () => (attempts++ === 0 ? ({ ok: false, code: "rate_limited", retryAfterSec: 3 } as const) : base.session()) } as ShellApi;
    renderApp("/", { api });
    const button = (await screen.findByRole("button", { name: /Try again/ })) as HTMLButtonElement;
    await act(async () => {}); // let React run the effect that starts the countdown
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Try again in 3");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(button.textContent).toBe("Try again in 2");
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Try again");
    await act(async () => { fireEvent.click(button); });
    await screen.findByText("Draw a place");
    expect(attempts).toBe(2);
  });
});

describe("route changes", () => {
  it("moves focus to the heading, sets the title and announces it, and keeps the history in step", async () => {
    const h = renderApp("/no/such/place");
    await screen.findByText("There is nothing here");
    fireEvent.click(screen.getByText("Gallery"));
    await screen.findByText("Visit a place");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(document.title).toBe("Gallery · Hauntology");
    expect(liveText()).toBe("Gallery");
    expect(h.history.stack).toEqual(["/no/such/place", "/gallery"]);

    act(() => h.history.back());
    await screen.findByText("There is nothing here");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(liveText()).toBe("Nothing here");
    expect(document.title).toBe("Nothing here · Hauntology");
  });

  it("loads Create with a dynamic import and focuses its heading when it arrives", async () => {
    const h = renderApp("/gallery");
    await screen.findByText("Visit a place");
    act(() => h.router.navigate({ screen: "create" }));
    await screen.findByRole("heading", { name: "Make a place" });
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(liveText()).toBe("Make a place");
  });

  it("a plain click on a link goes through the router; a modified click does not", async () => {
    const h = renderApp("/no/such/place");
    await screen.findByText("There is nothing here");
    const link = screen.getByText("Home") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/");
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(fireEvent.click(link, { button: 1 })).toBe(true);
    expect(fireEvent.click(link, { shiftKey: true })).toBe(true);
    expect(fireEvent.click(link, { altKey: true })).toBe(true);
    expect(h.history.stack).toEqual(["/no/such/place"]);
    expect(fireEvent.click(link)).toBe(false);
    await screen.findByText("Draw a place");
    expect(h.history.stack).toEqual(["/no/such/place", "/"]);
  });

  it("never shows a Screen its guard refuses, even when the flow changes under it", async () => {
    const h = renderApp("/gallery");
    await screen.findByText("Visit a place");
    act(() => h.router.navigate({ screen: "confirm" }));
    await screen.findByRole("heading", { name: "Make a place" });
    act(() => h.router.setFlow({ pickedImageId: "img-1" }));
    act(() => h.router.navigate({ screen: "confirm" }));
    await screen.findByRole("heading", { name: "Enter this place?" });
    act(() => h.router.setFlow({ pickedImageId: undefined as never }));
    await screen.findByRole("heading", { name: "Make a place" });
    expect(h.history.stack).not.toContain("/confirm");
  });
});

describe("debug overlay", () => {
  it("is off unless asked for, and then shows the quota, the stage and the frame rate", async () => {
    const off = renderApp("/gallery");
    await screen.findByText("Visit a place");
    expect(document.querySelector("[data-debug-overlay]")).toBeNull();
    cleanup();

    const on = renderApp("/gallery", { debug: true });
    await screen.findByText("Visit a place");
    expect(document.querySelector("[data-debug='quota']")?.textContent).toBe("world 2 · image 8 · llm 40 · tts 40 · stt 20 · live 30");
    expect(document.querySelector("[data-debug='stage']")?.textContent).toBe("none");
    act(() => { on.debug.setStage("dreaming"); on.debug.setFps(59.6); });
    expect(document.querySelector("[data-debug='stage']")?.textContent).toBe("dreaming");
    expect(document.querySelector("[data-debug='fps']")?.textContent).toBe("60");
    expect(off.history.stack).toEqual(["/gallery"]);
  });
});
