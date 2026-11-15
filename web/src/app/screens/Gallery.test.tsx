// @vitest-environment jsdom
import type { ApiResult, GalleryItem, ShellApi } from "@hauntology/shared/app/api";
import { GALLERY } from "@hauntology/shared/app/fake-api";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { renderApp } from "../../test/harness";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const withGallery = (gallery: () => Promise<ApiResult<GalleryItem[]>>): ShellApi => ({ ...createFakeApi({ latencyMs: 0 }), gallery }) as ShellApi;

describe("Gallery: the main path", () => {
  it("lists every place with a thumbnail, a title and a short description", async () => {
    renderApp("/gallery");
    await screen.findByText("A kitchen at dusk");
    const cards = document.querySelectorAll(".gallery > li");
    expect(cards).toHaveLength(GALLERY.length);
    GALLERY.forEach((item, i) => {
      const card = within(cards[i] as HTMLElement);
      expect(card.getByRole("heading", { name: item.title })).toBeTruthy();
      expect(card.getByText(item.description)).toBeTruthy();
      expect(card.getByText(item.attribution)).toBeTruthy();
      const img = card.getByRole("img", { name: item.title }) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(item.thumbUrl);
    });
  });

  it("choosing a place records it and opens Haunt for that place", async () => {
    const h = renderApp("/gallery");
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "Your place" });
    expect(h.history.stack).toEqual(["/gallery", "/haunt/attic-room"]);
    expect(h.router.getSnapshot().flow).toMatchObject({ worldId: "attic-room", ghostReady: false, playEnded: false });
  });

  it("asks for no world, play session or asset before a place is chosen", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const spies = (["world", "playStart", "playGet", "createWorld", "quote", "uploadPhoto", "speak"] as const).map((m) => vi.spyOn(api, m));
    renderApp("/gallery", { api });
    await screen.findByText("A kitchen at dusk");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("a visit after an earlier one starts clean: no ghost and no ended game carried over", async () => {
    const h = renderApp("/gallery");
    await screen.findByText("The attic room");
    act(() => h.router.setFlow({ worldId: "greenhouse", ghostReady: true, playEnded: true }));
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "Your place" });
    expect(h.router.getSnapshot().flow).toMatchObject({ worldId: "attic-room", ghostReady: false, playEnded: false });
  });

  it("shows that it is loading, then the list", async () => {
    let release!: (r: ApiResult<GalleryItem[]>) => void;
    renderApp("/gallery", { api: withGallery(() => new Promise((r) => { release = r; })) });
    await screen.findByText("Loading places…");
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    await act(async () => release({ ok: true, value: GALLERY.slice(0, 2) as GalleryItem[] }));
    await screen.findByText("A kitchen at dusk");
    expect(document.querySelectorAll(".gallery > li")).toHaveLength(2);
  });
});

describe("Gallery: when it cannot load", () => {
  it("shows the message, the code and a Retry action, never an empty grid, and the list returns on retry", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("gallery", "network_error");
    renderApp("/gallery", { api });
    await screen.findByText("We could not reach the server");
    expect(screen.getByText("network_error")).toBeTruthy();
    expect(document.querySelector(".gallery")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("A kitchen at dusk");
    expect(document.querySelector(".gallery")).not.toBeNull();
    expect(screen.queryByText("network_error")).toBeNull();
  });

  it("announces the problem in the live region", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("gallery", "network_error");
    renderApp("/gallery", { api });
    await screen.findByText("We could not reach the server");
    await waitFor(() => expect(document.querySelector("[data-live-region]")?.textContent).toBe("We could not reach the server"));
  });

  it("after a rate limit, holds the Retry button for the advised seconds", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    renderApp("/gallery", { api: withGallery(async () => ({ ok: false, code: "rate_limited", retryAfterSec: 4 })) });
    const button = (await screen.findByRole("button", { name: /Try again/ })) as HTMLButtonElement;
    await act(async () => {});
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Try again in 4");
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(button.disabled).toBe(false);
  });

  it("says so, instead of showing nothing, when the Gallery is empty", async () => {
    renderApp("/gallery", { api: withGallery(async () => ({ ok: true, value: [] })) });
    await screen.findByText(/No places are in the Gallery right now/);
    expect(document.querySelector(".gallery")).toBeNull();
  });

  it("shows fixed copy and never the server's own text", async () => {
    renderApp("/gallery", { api: withGallery(async () => ({ ok: false, code: "shell_crash", message: "ECONNRESET 10.1.2.3" }) as never) });
    await screen.findByText("Something broke on our side");
    expect(document.body.textContent).not.toContain("ECONNRESET");
  });
});
