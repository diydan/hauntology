// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { renderApp } from "../../test/harness";
import { enterPlay, goIn, testPlatform, walkTo } from "../../test/play";
import { ANCHORS, createFakeBackend } from "@hauntology/shared/app/fake-api";
import { createPlayMemory } from "./memory";
import { createPlayController, type ViewerPort } from "./controller";
import type { Route } from "@hauntology/shared/app/types";

afterEach(() => {
  cleanup();
});

describe("Wander locks in UI and PlayController (puzzles 4.3, 4.4, 4.5)", () => {
  it("shows the Wander locks switch off by default on Haunt and hides it when PUZZLES_ENABLED is false", async () => {
    const memory = createPlayMemory();
    renderApp("/gallery", { memory });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });

    const toggle = await screen.findByRole("switch", { name: /Wander locks/i });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(memory.get().wanderLocks).toBe(true);

    cleanup();
    renderApp("/gallery", { fake: { flags: { puzzlesEnabled: false } } });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });
    expect(screen.queryByRole("switch", { name: /Wander locks/i })).toBeNull();
  });

  it("suspends viewer movement with chat mode while a Lock or Sight is open and restores play mode on close", async () => {
    const sent: unknown[] = [];
    const memory = createPlayMemory();
    memory.set({ wanderLocks: true });
    const api = createFakeApi({ latencyMs: 0 });
    const nowSpy = { t: 10_000 };
    const navigated: Route[] = [];
    const port: ViewerPort = {
      start: async () => undefined,
      send: (m) => {
        sent.push(m);
      },
      dispose: async () => undefined,
    };
    const ctrl = createPlayController({
      api,
      worldId: "attic-room",
      memory,
      session: { ackNotice: true },
      port,
      navigate: (r) => navigated.push(r),
      setFlow: () => undefined,
      onNoticeAcked: () => undefined,
    });
    await ctrl.begin();
    await ctrl.settled();
    sent.length = 0;

    ctrl.onViewerMessage({ t: "pose", pos: [ANCHORS[0]!.pos[0], 1.6, ANCHORS[0]!.pos[2]], yaw: 0 });
    await ctrl.submit({ button: "touch" });
    await ctrl.settled();

    expect(ctrl.getSnapshot().activeLock).not.toBeNull();
    expect(sent).toContainEqual({ t: "set_input_mode", mode: "chat" });

    // Wrong attempts / skip restore play input once closed
    vi.spyOn(api as Required<typeof api>, "playLockSkip").mockResolvedValueOnce({
      ok: true,
      value: {
        reply: { text: "Memory revealed.", scripted: true },
        view: {
          found: ["a1"],
          anchors: [...ANCHORS],
          hauntLevel: 0.43,
          ghostVisible: true,
          ended: false,
          journal: [{ anchorId: "a1", text: "Memory revealed." }],
          atmosphere: null,
        },
        sight: { kind: "clock", payload: { kind: "clock", h: 3, m: 15 }, showMs: 5000 },
      },
    });
    sent.length = 0;
    await ctrl.skipLock();
    await ctrl.settled();

    // Sight stays open -> movement still suspended in chat mode
    expect(ctrl.getSnapshot().activeLock).toBeNull();
    expect(ctrl.getSnapshot().pendingSight).not.toBeNull();
    expect(sent).toContainEqual({ t: "set_input_mode", mode: "chat" });

    sent.length = 0;
    ctrl.dismissSight();
    expect(ctrl.getSnapshot().pendingSight).toBeNull();
    expect(sent).toContainEqual({ t: "set_input_mode", mode: "play" });
    expect(nowSpy.t).toBeGreaterThan(0);
    expect(navigated).toEqual([]);
  });

  it("opens PuzzleHost in Play screen when walking to an anchor with Wander locks toggled on", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const p = testPlatform();
    renderApp("/gallery", { api, platform: p.kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "How do you want to play?" });

    fireEvent.click(screen.getByRole("button", { name: "Use a preset ghost" }));
    fireEvent.click(await screen.findByRole("button", { name: "Maren" }));
    fireEvent.click(await screen.findByRole("switch", { name: /Wander locks/i }));
    fireEvent.click(screen.getByRole("button", { name: "Wander" }));
    await screen.findByRole("heading", { name: "Wander" });

    await goIn();
    await walkTo(1);

    fireEvent.click(screen.getByRole("button", { name: "Talk" }));
    fireEvent.click(await screen.findByRole("button", { name: "Touch" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Puzzle")).toBeTruthy();
    });
    expect(enterPlay).toBeDefined();
    expect(createFakeBackend).toBeDefined();
  });
});
