// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountCreator } from "./creator-ui";

const handles: { dispose(): Promise<void> }[] = [];
afterEach(async () => {
  for (const h of handles.splice(0)) await act(async () => { await h.dispose(); });
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubApi() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/api/worlds/w1/ghost")) return json({ name: "Nobody", spriteUrl: "/ghosts/percy.webp", voice: "dry" }, 404);
    if (url.includes("/api/ghosts/portraits")) {
      return json({ candidates: [{ candidateId: "c1", imageUrl: "/api/images/c1" }, { candidateId: "c2", imageUrl: "/api/images/c2" }], quota: { image: 3 } });
    }
    if (url.includes("/api/ghosts/sprite")) {
      return json({ profile: { persona: { name: "Wren", voice: "soft" }, spriteUrl: "/api/ghosts/sprite/w1" }, fallback: false });
    }
    return json({}, 404);
  }));
  return calls;
}

describe("Ghost Creator (ghost-creator group 4)", () => {
  it("walks form → candidates → cut-out → meet your ghost, and reports chosen", async () => {
    stubApi();
    const messages: unknown[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    let handle: Awaited<ReturnType<typeof mountCreator>> | undefined;
    await act(async () => {
      handle = await mountCreator({ container, worldId: "w1", onMessage: (m) => messages.push(m) }); handles.push(handle);
    });

    expect(screen.getByLabelText("Era")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/optional, one short line/i), { target: { value: "kept the lighthouse stairs swept" } });
    fireEvent.click(screen.getByRole("button", { name: "Randomise" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generate" })); });
    const candidates = await screen.findAllByAltText("A possible ghost");
    expect(candidates).toHaveLength(2);
    expect(screen.getByText(/Pictures left today: 3/)).toBeTruthy();

    await act(async () => { fireEvent.click(candidates[0]!.closest("button")!); });
    await screen.findByText(/practising how to be found/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Meet Wren/ })); });
    expect(messages).toEqual([{ t: "chosen" }]);
    await act(async () => { await handle!.dispose(); });
  });

  it("marks the detail field when the API refuses it as unsafe, and still offers presets", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/portraits")) return json({ ok: false, code: "detail_unsafe" }, 422);
      if (url.includes("/preset")) return json({ profile: { persona: { name: "Percy", voice: "dry" }, spriteUrl: "/ghosts/percy.webp" }, fallback: true });
      return json({}, 404);
    }));
    const messages: unknown[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    let handle: Awaited<ReturnType<typeof mountCreator>> | undefined;
    await act(async () => {
      handle = await mountCreator({ container, worldId: "w1", onMessage: (m) => messages.push(m) }); handles.push(handle);
    });
    fireEvent.change(screen.getByPlaceholderText(/optional, one short line/i), { target: { value: "something unkind" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generate" })); });
    await screen.findByText(/cannot be used for a ghost/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Percy/ })); });
    await screen.findByText(/You may begin/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Meet Percy/ })); });
    expect(messages).toEqual([{ t: "chosen" }]);
    await act(async () => { await handle!.dispose(); });
  });
});
