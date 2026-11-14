// @vitest-environment jsdom
import { MEMORIES } from "@hauntology/shared/app/fake-api";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { renderApp } from "../../test/harness";
import { enterPlay, goIn, live, lookHere, press, testPlatform, walkTo } from "../../test/play";

afterEach(() => cleanup());

const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

async function finishGame(api = createFakeApi({ latencyMs: 0 })) {
  const h = await enterPlay({ api });
  await goIn();
  for (const n of [1, 2, 3]) await lookHere(n);
  await screen.findByRole("heading", { name: "You remembered" });
  return { ...h, api };
}

describe("Ending: the main path", () => {
  it("shows the ghost's last words and the three memories, with the card, Haunt again, Home and Gallery", async () => {
    const h = await finishGame();
    await screen.findByText(MEMORIES.a1);
    // The demo ghost's last line is the third memory, so it shows in the quote and in the list.
    const listed = [...document.querySelectorAll(".journal li")].map((li) => li.textContent);
    expect(listed).toEqual([MEMORIES.a1, MEMORIES.a2, MEMORIES.a3]);
    expect(document.querySelector(".farewell")?.textContent).toBe(MEMORIES.a3);
    expect(screen.getByRole("button", { name: "Save memory card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Haunt again" })).toBeTruthy();
    expect((screen.getByText("Home") as HTMLAnchorElement).getAttribute("href")).toBe("/");
    expect((screen.getByText("Gallery") as HTMLAnchorElement).getAttribute("href")).toBe("/gallery");
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    expect(h.history.stack.at(-1)).toBe("/end/attic-room");
  });

  it("saves the memory card as a picture that holds only the found memories, and says so", async () => {
    const h = await finishGame();
    await screen.findByText(MEMORIES.a1);
    await press("Save memory card");
    expect(h.p.saveFile).toHaveBeenCalledTimes(1);
    const [name, blob] = h.p.saveFile.mock.calls[0]! as [string, Blob];
    expect(name).toBe("hauntology-memory-card.svg");
    expect(blob.type).toBe("image/svg+xml");
    const svg = await readBlob(blob);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("3 memories came back");
    expect(svg).toContain("A low hum comes back to you");
    expect(svg).not.toMatch(/<script|<image|href=/);
    expect(live()).toBe("Memory card saved.");
  });

  it("Haunt again starts a new game in the same place, with nothing found and no notice", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const start = vi.spyOn(api, "playStart");
    const h = await finishGame(api);
    expect(start).toHaveBeenCalledTimes(1);
    await screen.findByText(MEMORIES.a1);
    const get = vi.spyOn(api, "playGet");
    get.mockClear();
    await press("Haunt again");
    await screen.findByRole("heading", { name: "Wander" });
    await screen.findByText("Stand-in view. The 3D Viewer is not built yet.");
    expect(start).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled(); // no look at the old, finished game
    expect(document.querySelector("[data-found]")?.textContent).toBe("Memories found: 0 of 3");
    expect(screen.queryByText("Before you go in")).toBeNull();
    expect(h.p.log.filter((l) => l === "mount")).toHaveLength(2);
    expect(h.history.stack.at(-1)).toBe("/play/attic-room");
    // The old game is over and cannot be played again.
    expect(h.router.getSnapshot().flow.playEnded).toBe(false);
  });

  it("Haunt again can be played to a second ending", async () => {
    const h = await finishGame();
    await screen.findByText(MEMORIES.a1);
    await press("Haunt again");
    await screen.findByText("Stand-in view. The 3D Viewer is not built yet.");
    for (const n of [1, 2, 3]) await lookHere(n);
    await screen.findByRole("heading", { name: "You remembered" });
    await screen.findByText(MEMORIES.a1);
    expect(h.history.stack.at(-1)).toBe("/end/attic-room");
    expect(document.querySelectorAll(".journal li")).toHaveLength(3);
  });

  it("a reload at the Ending address starts a new game, since the finished one is over", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await finishGame(api);
    cleanup();
    const start = vi.spyOn(api, "playStart");
    const p = testPlatform();
    const h = renderApp("/end/attic-room", { api, platform: p.kit });
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(h.history.stack).toEqual(["/play/attic-room"]);
  });
});

describe("Ending: when it cannot load", () => {
  it("shows fixed words, the code and Try again, then the card", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const h = await enterPlay({ api });
    await goIn();
    for (const n of [1, 2]) await lookHere(n);
    await press("Close chat");
    // The third look ends the game; the Ending's own load is the next playGet.
    api.backend.failNext("playGet", "network_error");
    await lookHere(3);
    await screen.findByText("We could not reach the server");
    expect(screen.getByText("network_error")).toBeTruthy();
    await press("Try again");
    await screen.findByText(MEMORIES.a2);
    void h;
  });

  it("goes to Expired when the place is gone", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const h = await enterPlay({ api });
    await goIn();
    for (const n of [1, 2]) await lookHere(n);
    await press("Close chat");
    api.backend.failNext("playGet", "world_not_found");
    await walkTo(3);
    await press("Talk");
    await press("Look");
    await screen.findByRole("heading", { name: "That place is gone" });
    await waitFor(() => expect(h.history.stack.at(-1)).toBe("/expired"));
    expect(document.querySelector("code")).toBeNull();
  });

  it("says the memories are gone, with a way home, when this tab has no game", async () => {
    const p = testPlatform();
    const h = renderApp("/gallery", { platform: p.kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "Your place" });
    act(() => h.router.setFlow({ ghostReady: true, playEnded: true }));
    act(() => h.router.navigate({ screen: "end", worldId: "attic-room" }));
    await screen.findByText("Your memories are not available any more. You can go home and start again.");
    expect(screen.queryByRole("button", { name: "Save memory card" })).toBeNull();
    expect(screen.getByText("Home")).toBeTruthy();
  });
});
