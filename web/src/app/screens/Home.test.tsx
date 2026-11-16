// @vitest-environment jsdom
import { HOME_FACTS, HOME_PREMISE, REASON_COPY } from "@hauntology/shared/app/home-copy";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { renderApp } from "../../test/harness";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const flags = (over: object) => ({ worldGenEnabled: true, dayCapReached: false, totalCapReached: false, ...over });
const link = (name: string) => screen.getByText(name) as HTMLElement;

describe("Home: the main path", () => {
  it("shows the premise, the three actions and the three plain facts", async () => {
    renderApp("/");
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(screen.getByText(HOME_PREMISE)).toBeTruthy();
    for (const fact of HOME_FACTS) expect(screen.getByText(fact)).toBeTruthy();
    expect(link("Draw a place").getAttribute("href")).toBe("/create");
    expect(link("Upload a photo").getAttribute("href")).toBe("/create");
    expect(link("Visit a gallery place").getAttribute("href")).toBe("/gallery");
    expect(document.querySelector("#home-reason")).toBeNull();
    expect(document.querySelectorAll(".actions [aria-disabled]")).toHaveLength(0);
  });

  it("goes to Create from Draw and from Upload, and to the Gallery from Visit", async () => {
    const h = renderApp("/");
    await screen.findByRole("heading", { name: "Hauntology" });
    fireEvent.click(link("Draw a place"));
    await screen.findByRole("heading", { name: "Make a place" });
    expect(h.history.stack).toEqual(["/", "/create"]);
    act(() => h.history.back());
    await screen.findByRole("heading", { name: "Hauntology" });
    fireEvent.click(link("Visit a gallery place"));
    await screen.findByRole("heading", { name: "Visit a place" });
  });
});

describe("Home: when making places is off (the Zero-Quota Path)", () => {
  it("keeps Draw and Upload on the page but off, says why in one line, and leaves the Gallery open", async () => {
    const h = renderApp("/", { fake: { quota: { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 }, flags: flags({ worldGenEnabled: false }) } });
    await screen.findByRole("heading", { name: "Hauntology" });
    for (const name of ["Draw a place", "Upload a photo"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.getAttribute("aria-describedby")).toBe("home-reason");
      fireEvent.click(button);
    }
    expect(document.querySelector("#home-reason")?.textContent).toBe(REASON_COPY.kill_switch);
    expect(h.history.stack).toEqual(["/"]);
    expect(link("Visit a gallery place").getAttribute("href")).toBe("/gallery");
    fireEvent.click(link("Visit a gallery place"));
    await screen.findByRole("heading", { name: "Visit a place" });
  });

  it("gives the reason for a day cap and a total cap", async () => {
    for (const [over, reason] of [[{ dayCapReached: true }, "day_cap"], [{ totalCapReached: true }, "total_cap"]] as const) {
      renderApp("/", { fake: { flags: flags(over) } });
      await screen.findByRole("heading", { name: "Hauntology" });
      expect(document.querySelector("#home-reason")?.textContent).toBe(REASON_COPY[reason]);
      cleanup();
    }
  });

  it("with no sketch renders left, only Draw is off and Upload still works", async () => {
    renderApp("/", { fake: { quota: { world: 2, image: 0, llm: 10, tts: 10, stt: 10, live: 10 } } });
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(screen.getByRole("button", { name: "Draw a place" }).getAttribute("aria-disabled")).toBe("true");
    expect(link("Upload a photo").getAttribute("href")).toBe("/create");
    expect(document.querySelector("#home-reason")?.textContent).toBe(REASON_COPY.quota_image);
  });

  it("the off buttons can still be reached with the keyboard", async () => {
    renderApp("/", { fake: { flags: flags({ worldGenEnabled: false }) } });
    await screen.findByRole("heading", { name: "Hauntology" });
    const button = screen.getByRole("button", { name: "Draw a place" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});

describe("Home: prefetching the Gallery", () => {
  /** Stands in for the browser's idle callback, so the test decides when the page is idle. */
  function stubIdle() {
    const pending = new Map<number, () => void>();
    const cancelled: number[] = [];
    let next = 0;
    const g = globalThis as unknown as Record<string, unknown>;
    const calls: Array<{ timeout: number | undefined }> = [];
    g.requestIdleCallback = (cb: () => void, o?: { timeout: number }) => { pending.set(++next, cb); calls.push({ timeout: o?.timeout }); return next; };
    g.cancelIdleCallback = (id: number) => { cancelled.push(id); pending.delete(id); };
    return { pending, cancelled, calls, restore: () => { delete g.requestIdleCallback; delete g.cancelIdleCallback; } };
  }

  it("asks for the Gallery list once the page is idle, and for nothing else", async () => {
    const idle = stubIdle();
    try {
      const api = createFakeApi({ latencyMs: 0 });
      const gallery = vi.spyOn(api, "gallery");
      const others = (["world", "playStart", "playGet", "quote", "searchPlaces", "speak"] as const).map((m) => vi.spyOn(api, m));
      renderApp("/", { api });
      await screen.findByRole("heading", { name: "Hauntology" });
      expect(idle.calls).toEqual([{ timeout: 1000 }]);
      expect(gallery).not.toHaveBeenCalled();
      await act(async () => { for (const run of idle.pending.values()) run(); });
      expect(gallery).toHaveBeenCalledTimes(1);
      for (const spy of others) expect(spy).not.toHaveBeenCalled();
    } finally {
      idle.restore();
    }
  });

  it("does not prefetch if the visitor leaves before the page is idle", async () => {
    const idle = stubIdle();
    try {
      const api = createFakeApi({ latencyMs: 0 });
      const gallery = vi.spyOn(api, "gallery");
      const h = renderApp("/", { api });
      await screen.findByRole("heading", { name: "Hauntology" });
      act(() => h.router.navigate({ screen: "create" }));
      await screen.findByRole("heading", { name: "Make a place" });
      expect(idle.cancelled).toEqual([1]);
      expect(idle.pending.size).toBe(0);
      expect(gallery).not.toHaveBeenCalled();
    } finally {
      idle.restore();
    }
  });

  it("the Gallery screen then uses the list that was prefetched, without asking again", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const gallery = vi.spyOn(api, "gallery");
    renderApp("/", { api });
    await screen.findByRole("heading", { name: "Hauntology" });
    await waitFor(() => expect(gallery).toHaveBeenCalledTimes(1), { timeout: 2500 });
    fireEvent.click(link("Visit a gallery place"));
    await screen.findByText("A kitchen at dusk");
    expect(gallery).toHaveBeenCalledTimes(1);
  });
});
