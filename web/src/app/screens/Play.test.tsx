// @vitest-environment jsdom
import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { renderApp } from "../../test/harness";
import { enterPlay, foundText, goIn, live, lookHere, press, testPlatform, walkTo } from "../../test/play";
import { NOTICE_TEXT } from "../play/ContentNotice";
import type { ViewerSetup } from "../viewer/types";
import { DEGRADED_TEXT } from "./Play";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Play: the content notice and the Viewer", () => {
  it("shows the notice and the HUD first, and does not load the Viewer until the visitor goes in", async () => {
    const h = await enterPlay();
    await screen.findByText("Before you go in");
    expect(screen.getByText(NOTICE_TEXT)).toBeTruthy();
    expect(foundText()).toBe("Memories found: 0 of 3");
    expect(screen.getByRole("button", { name: "Exit" })).toBeTruthy();
    expect(h.p.loadViewer).not.toHaveBeenCalled();
    expect(document.querySelector("[data-standin-viewer]")).toBeNull();
  });

  it("loads the Viewer after Go in, tells the API the notice was seen, and never shows the notice again this visit", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const ack = vi.spyOn(api, "ackNotice");
    const h = await enterPlay({ api });
    await goIn();
    expect(h.p.loadViewer).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Before you go in")).toBeNull();
    expect(h.p.log.filter((l) => l === "mount")).toHaveLength(1);
    expect(h.p.log).toContain("unlock");
  });

  it("skips the notice when the Session says it was acknowledged", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await api.ackNotice();
    const h = await enterPlay({ api });
    await screen.findByText("Stand-in view. The 3D Viewer is not built yet.");
    expect(screen.queryByText("Before you go in")).toBeNull();
    expect(h.p.loadViewer).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the heading when Play opens, and shows the Exit control at all times", async () => {
    await enterPlay();
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    expect(screen.getByRole("button", { name: "Exit" })).toBeTruthy();
    await goIn();
    expect(screen.getByRole("button", { name: "Exit" })).toBeTruthy();
  });
});

describe("Play: the interaction prompt and the Chat", () => {
  it("offers to talk when the Viewer reports a prompt, opens the Chat when accepted, and sets the Viewer to chat and back", async () => {
    await enterPlay();
    await goIn();
    expect(document.querySelector("[data-prompt]")).toBeNull();
    await walkTo(1);
    expect(document.querySelector("[data-prompt]")?.textContent).toContain("Something here remembers. Look closer?");
    await press("Yes");
    await screen.findByRole("complementary", { name: "Chat with the ghost" });
    // The talk button is not offered while the Chat is open, and the one live region (not the log) announces.
    expect(screen.queryByRole("button", { name: "Talk" })).toBeNull();
    expect(document.querySelector(".transcript")?.getAttribute("aria-live")).toBe("off");
    expect(document.querySelectorAll("[data-live-region]")).toHaveLength(1);
    // Chat open: the Viewer ignores movement.
    expect((screen.getByRole("button", { name: "Walk to memory 2" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-prompt]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Walk to memory 2" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("complementary", { name: "Chat with the ghost" })).toBeNull();
  });

  it("Enter accepts the prompt, but not when it is meant for a button, and Escape closes the Chat", async () => {
    await enterPlay();
    await goIn();
    await walkTo(1);
    const exit = screen.getByRole("button", { name: "Exit" });
    exit.focus();
    fireEvent.keyDown(exit, { key: "Enter" });
    expect(screen.queryByRole("complementary", { name: "Chat with the ghost" })).toBeNull();
    await act(async () => { fireEvent.keyDown(document.body, { key: "Enter" }); });
    const chat = await screen.findByRole("complementary", { name: "Chat with the ghost" });
    fireEvent.keyDown(chat, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Chat with the ghost" })).toBeNull());
  });

  it("Enter does nothing when the Viewer has reported no prompt", async () => {
    await enterPlay();
    await goIn();
    await act(async () => { fireEvent.keyDown(document.body, { key: "Enter" }); });
    expect(screen.queryByRole("complementary", { name: "Chat with the ghost" })).toBeNull();
    await walkTo(1);
    await act(async () => { fireEvent.keyDown(document.body, { key: "Enter" }); });
    await screen.findByRole("complementary", { name: "Chat with the ghost" });
  });

  it("cannot talk before the notice has been acknowledged", async () => {
    await enterPlay();
    await screen.findByText("Before you go in");
    await press("Talk");
    expect(screen.queryByRole("complementary", { name: "Chat with the ghost" })).toBeNull();
  });

  it("a quick button or typed text gets a reply, shown as a subtitle and announced, with the scripted note", async () => {
    await enterPlay();
    await goIn();
    expect(document.querySelector(".scripted")).toBeNull();
    await press("Talk");
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll(".transcript .ui-log-row")).toHaveLength(2));
    const [you, ghost] = [...document.querySelectorAll(".transcript .ui-log-row")];
    expect(you!.textContent).toBe("You: Look");
    expect(ghost!.getAttribute("data-who")).toBe("ghost");
    expect(live()).toBe(ghost!.textContent!.replace("Ghost: ", ""));
    expect(document.querySelector(".scripted")?.textContent).toBe("scripted ghost");

    const box = screen.getByLabelText("Say something") as HTMLInputElement;
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  who are you?  " } });
    await act(async () => { fireEvent.submit(box.closest("form")!); });
    await waitFor(() => expect(document.querySelectorAll(".transcript .ui-log-row")).toHaveLength(4));
    expect(document.querySelectorAll(".transcript .ui-log-row")[2]!.textContent).toBe("You: who are you?");
    expect(box.value).toBe("");
    expect(box.maxLength).toBe(200);
  });

  it("tells the visitor that typed words may go to a model only when the server says a model is on", async () => {
    await enterPlay({ fake: { flags: { ghostModel: true } } });
    await goIn();
    await press("Talk");
    expect(document.querySelector("[data-model-note]")?.textContent).toMatch(/AI model/);
    cleanup();
    await enterPlay();
    await goIn();
    await press("Talk");
    await screen.findByRole("complementary", { name: "Chat with the ghost" });
    expect(document.querySelector("[data-model-note]")).toBeNull();
  });

  it("keeps the Chat usable after a failed turn, with fixed words and no error screen", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await enterPlay({ api });
    await goIn();
    await press("Talk");
    api.backend.failNext("playTurn", "network_error");
    await press("Look");
    await waitFor(() => expect(document.querySelector("[data-who=system]")).not.toBeNull());
    expect(document.querySelector("[data-who=system]")!.textContent).toContain("We could not reach the server");
    expect(live()).toContain("We could not reach the server");
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1));
  });

  it("holds the controls after a rate limit for the advised seconds", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    let limited = true;
    const api = { ...base, playTurn: (...a: Parameters<ShellApi["playTurn"]>) => (limited ? Promise.resolve({ ok: false, code: "rate_limited", retryAfterSec: 3 } as ApiResult<never>) : base.playTurn(...a)) } as ShellApi;
    await enterPlay({ api });
    await goIn();
    await press("Talk");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await press("Look");
    await act(async () => {});
    expect((screen.getByRole("button", { name: "Look" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Please wait 3 seconds.")).toBeTruthy();
    limited = false;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect((screen.getByRole("button", { name: "Look" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Play: finding memories", () => {
  it("counts each memory, announces it, keeps it in the journal and shows the new view to the Viewer", async () => {
    await enterPlay();
    await goIn();
    await lookHere(1);
    expect(foundText()).toBe("Memories found: 1 of 3");
    await waitFor(() => expect(live()).toBe("Memory 1 of 3 found."));
    await press("Close chat");
    await press("Journal");
    const dialog = screen.getByRole("dialog", { name: "Journal" });
    expect(dialog.textContent).toContain("A low hum comes back to you");
    expect(dialog.querySelectorAll("li")).toHaveLength(1);
    expect(document.querySelector("[data-standin-viewer]")!.textContent).toContain("Haunt level 43%");
  });

  it("the journal dialog traps focus, closes on Escape and gives focus back", async () => {
    await enterPlay();
    await goIn();
    const journal = screen.getByRole("button", { name: "Journal" });
    journal.focus();
    await press("Journal");
    expect(screen.getByText(/Nothing found yet/)).toBeTruthy();
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(journal);
  });

  it("the third memory releases the Viewer and opens the Ending, once, at its own address", async () => {
    const h = await enterPlay();
    await goIn();
    await lookHere(1);
    await lookHere(2);
    await lookHere(3);
    await screen.findByRole("heading", { name: "You remembered" });
    expect(h.history.stack.at(-1)).toBe("/end/attic-room");
    expect(h.p.log.slice(-2)).toEqual(["dispose", "disposed"]);
    expect(h.p.log.filter((l) => l === "dispose")).toHaveLength(1);
    expect(document.querySelector("[data-standin-viewer]")).toBeNull();
  });
});

describe("Play: leaving", () => {
  it("Exit waits for the Viewer to be released, then shows Home, with no reload", async () => {
    const h = await enterPlay();
    await goIn();
    await press("Exit");
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(h.p.log.slice(-2)).toEqual(["dispose", "disposed"]);
    expect(document.querySelector("[data-standin-viewer]")).toBeNull();
    expect(h.history.stack.at(-1)).toBe("/");
  });

  it("leaving by the browser's Back button also releases the Viewer", async () => {
    const h = await enterPlay();
    await goIn();
    act(() => h.history.back());
    await screen.findByRole("heading", { name: "Your place" });
    await waitFor(() => expect(h.p.log.slice(-2)).toEqual(["dispose", "disposed"]));
  });

  it("Exit works at once, before the Viewer was ever loaded", async () => {
    const h = await enterPlay();
    await screen.findByText("Before you go in");
    await press("Exit");
    await screen.findByRole("heading", { name: "Hauntology" });
    expect(h.p.loadViewer).not.toHaveBeenCalled();
  });
});

describe("Play: reloading", () => {
  it("restores the same game with its found memories, and does not start another", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const first = await enterPlay({ api });
    await goIn();
    await lookHere(1);
    await press("Close chat");
    cleanup();
    void first;

    const start = vi.spyOn(api, "playStart");
    const get = vi.spyOn(api, "playGet");
    const p = testPlatform();
    renderApp("/play/attic-room", { api, platform: p.kit });
    await screen.findByRole("heading", { name: "Wander" });
    await waitFor(() => expect(foundText()).toBe("Memories found: 1 of 3"));
    expect(start).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
    // The notice was acknowledged in this Session, so it is not shown again.
    expect(screen.queryByText("Before you go in")).toBeNull();
    await screen.findByText("Stand-in view. The 3D Viewer is not built yet.");
  });

  it("shows the notice again after a reload if it was never acknowledged", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await enterPlay({ api });
    cleanup();
    const p = testPlatform();
    renderApp("/play/attic-room", { api, platform: p.kit });
    await screen.findByText("Before you go in");
    expect(p.loadViewer).not.toHaveBeenCalled();
  });
});

describe("Play: when the game cannot start", () => {
  it("shows fixed words and the code with a Try again, and recovers", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("playStart", "network_error");
    await enterPlay({ api });
    await screen.findByText("We could not reach the server");
    expect(screen.getByText("network_error")).toBeTruthy();
    await press("Try again");
    await screen.findByText("Before you go in");
  });

  it("goes to Expired when the world is gone", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("playStart", "world_not_found");
    const p = testPlatform();
    const h = renderApp("/gallery", { api, platform: p.kit });
    await screen.findByText("The attic room");
    fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
    await screen.findByRole("heading", { name: "Your place" });
    act(() => h.router.setFlow({ ghostReady: true }));
    act(() => h.router.navigate({ screen: "play", worldId: "attic-room" }));
    await screen.findByRole("heading", { name: "That place is gone" });
  });
});

describe("Play: the Viewer falls back", () => {
  it("says so in one line, keeps the Chat, and shows the place as a picture when the Viewer cannot start", async () => {
    const p = testPlatform();
    const broken = testPlatform({ loadViewer: vi.fn(async () => { throw new Error("no WebGL"); }) });
    await enterPlay({ platform: broken.kit });
    await screen.findByText("Before you go in");
    await press("Go in");
    await waitFor(() => expect(document.querySelector("[data-degraded]")?.textContent).toBe(DEGRADED_TEXT.thumb));
    await waitFor(() => expect(document.querySelector(".viewer-fallback img")?.getAttribute("src")).toBe("/demo/gallery/attic-room.svg"));
    await press("Talk");
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1));
    void p;
  });

  it("says a panorama is shown when the Viewer falls back to one", async () => {
    const real = testPlatform();
    const pano = testPlatform({
      loadViewer: vi.fn(async () => ({
        async mountViewer(setup: ViewerSetup) {
          const viewer = await (await real.kit.loadViewer!()).mountViewer(setup);
          setup.onMessage({ t: "degraded", rung: "pano" });
          return viewer;
        },
      })),
    });
    await enterPlay({ platform: pano.kit });
    await goIn();
    await waitFor(() => expect(document.querySelector("[data-degraded]")?.textContent).toBe(DEGRADED_TEXT.pano));
    expect(document.querySelector(".viewer-fallback")).toBeNull();
    await press("Talk");
    expect(screen.getByRole("complementary", { name: "Chat with the ghost" })).toBeTruthy();
  });
});

describe("Play: the ghost's voice", () => {
  it("speaks each line named in the reply after the visitor has gone in, while the subtitle is always shown", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const speak = vi.spyOn(api, "speak");
    const h = await enterPlay({ api });
    await goIn();
    await press("Talk");
    await press("Look");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0]![0].lineId).toMatch(/^line-/);
    await waitFor(() => expect(h.p.played).toHaveLength(1));
    expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1);
    await press("Look");
    await waitFor(() => expect(h.p.played).toHaveLength(2));
    expect(h.p.played[0]!.paused).toBe(true);
  });

  it("stays silent, with the subtitle, when the speak switch is off", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const speak = vi.spyOn(api, "speak");
    await enterPlay({ api });
    await goIn();
    await press("Talk");
    fireEvent.click(screen.getByLabelText("Speak aloud"));
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1));
    expect(speak).not.toHaveBeenCalled();
  });

  it("hides every voice control when the server has voice off, and never asks for speech", async () => {
    const api = createFakeApi({ latencyMs: 0, flags: { voiceEnabled: false } });
    const speak = vi.spyOn(api, "speak");
    await enterPlay({ api });
    await goIn();
    await press("Talk");
    expect(screen.queryByLabelText("Speak aloud")).toBeNull();
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1));
    expect(speak).not.toHaveBeenCalled();
  });

  it("falls back to the subtitle, with no error, when speech is refused", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("speak", "voice_unavailable");
    const h = await enterPlay({ api });
    await goIn();
    await press("Talk");
    await press("Look");
    await waitFor(() => expect(document.querySelectorAll("[data-who=ghost]")).toHaveLength(1));
    expect(h.p.played).toHaveLength(0);
    expect(document.querySelector("[data-who=system]")).toBeNull();
  });

  it("hold to talk records while held, shows the microphone indicator, and sends the transcript as typed text", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const listen = vi.spyOn(api, "listen").mockResolvedValue({ ok: true, value: { transcript: "who are you" } });
    const h = await enterPlay({ api });
    await goIn();
    await press("Talk");
    const talk = screen.getByRole("button", { name: "Hold to talk" });
    await act(async () => { fireEvent.pointerDown(talk); });
    await waitFor(() => expect(document.querySelector("[data-mic-indicator]")).not.toBeNull());
    expect(talk.getAttribute("aria-pressed")).toBe("true");
    expect(live()).toBe("Listening.");
    await act(async () => { fireEvent.pointerUp(talk); });
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
    expect(h.p.log).toContain("rec stop");
    await waitFor(() => expect(document.querySelectorAll(".transcript .ui-log-row")).toHaveLength(2));
    expect(document.querySelectorAll(".transcript .ui-log-row")[0]!.textContent).toBe("You: who are you");
    expect(document.querySelector("[data-mic-indicator]")).toBeNull();
  });

  it("holds with the keyboard too: Space down and up", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const listen = vi.spyOn(api, "listen").mockResolvedValue({ ok: true, value: { transcript: "hello" } });
    await enterPlay({ api });
    await goIn();
    await press("Talk");
    const talk = screen.getByRole("button", { name: "Hold to talk" });
    await act(async () => { fireEvent.keyDown(talk, { key: " " }); });
    await waitFor(() => expect(document.querySelector("[data-mic-indicator]")).not.toBeNull());
    await act(async () => { fireEvent.keyDown(talk, { key: " ", repeat: true }); });
    await act(async () => { fireEvent.keyUp(talk, { key: " " }); });
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
  });

  it("falls back to typing with one calm note when the microphone is refused", async () => {
    const refused = testPlatform();
    const kit = { ...refused.kit, voice: { ...refused.kit.voice!, recorder: async () => { throw new Error("NotAllowedError"); } } };
    await enterPlay({ platform: kit });
    await goIn();
    await press("Talk");
    const talk = screen.getByRole("button", { name: "Hold to talk" });
    await act(async () => { fireEvent.pointerDown(talk); });
    await screen.findByText("Talking is not available right now. You can type instead.");
    expect((talk as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-screen-error]")).toBeNull();
    expect(screen.getByLabelText("Say something")).toBeTruthy();
  });

  it("shows no talk button in a browser that cannot record", async () => {
    const none = testPlatform();
    const kit = { ...none.kit, voice: { ...none.kit.voice!, recorder: null } };
    await enterPlay({ platform: kit });
    await goIn();
    await press("Talk");
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
    expect(screen.getByLabelText("Speak aloud")).toBeTruthy();
  });
});

describe("Play: one game per visit to the Screen", () => {
  it("starts exactly one play session however often it renders", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const start = vi.spyOn(api, "playStart");
    await enterPlay({ api });
    await screen.findByText("Before you go in");
    expect(start).toHaveBeenCalledTimes(1);
  });
});
