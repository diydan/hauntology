import type { ApiResult, PlayView, ShellApi } from "@hauntology/shared/app/api";
import { ANCHORS } from "@hauntology/shared/app/fake-api";
import type { FlowState, Route } from "@hauntology/shared/app/types";
import { describe, expect, it, vi } from "vitest";
import { createFakeApi } from "../FakeApi";
import { createPlayController, viewMessage, type PlayDeps, type ViewerPort } from "./controller";
import { createPlayMemory } from "./memory";

const W = "attic-room";
const photo = new Blob([new Uint8Array(10)], { type: "image/jpeg" });

/** A Viewer port that writes every call to a shared log, so the order of effects can be checked. */
function setup(over: { ackNotice?: boolean; lastPlayId?: string; lastWorldId?: string; api?: ShellApi; memory?: ReturnType<typeof createPlayMemory> } = {}) {
  const log: string[] = [];
  const sent: unknown[] = [];
  const port: ViewerPort = {
    start: async () => { log.push("start"); },
    send: (m) => { sent.push(m); log.push(`send ${m.t}`); },
    dispose: async () => { await Promise.resolve(); log.push("dispose"); },
  };
  const api = over.api ?? createFakeApi({ latencyMs: 0 });
  const memory = over.memory ?? createPlayMemory();
  const navigated: Route[] = [];
  const flows: Array<Partial<FlowState>> = [];
  const noticeAcked = vi.fn();
  const fpsSeen: number[] = [];
  const deps: PlayDeps = {
    api, worldId: W, memory,
    session: { ackNotice: over.ackNotice ?? false, lastPlayId: over.lastPlayId, lastWorldId: over.lastWorldId },
    port,
    navigate: (r) => { navigated.push(r); log.push(`navigate ${r.screen}`); },
    setFlow: (p) => { flows.push(p); log.push(`setFlow ${JSON.stringify(p)}`); },
    onNoticeAcked: noticeAcked,
    onFps: (fps) => fpsSeen.push(fps),
  };
  const controller = createPlayController(deps);
  return { controller, log, sent, api, memory, navigated, flows, noticeAcked, fpsSeen };
}

const at = (i: number) => ({ t: "pose", pos: [ANCHORS[i]!.pos[0], 1.6, ANCHORS[i]!.pos[2]], yaw: 0.5 });
const ack = async (c: ReturnType<typeof setup>["controller"]) => { await c.acknowledgeNotice(); await c.settled(); };

describe("starting", () => {
  it("starts a new play session with the ghost and sky chosen on Haunt, and keeps its id", async () => {
    const memory = createPlayMemory();
    const choice = { hostHour: 22 };
    memory.set({ ghostPreset: "lamplighter", conditions: choice });
    const api = createFakeApi({ latencyMs: 0 });
    const start = vi.spyOn(api, "playStart");
    const t = setup({ api, memory });
    expect(t.controller.getSnapshot().phase).toBe("loading");
    await t.controller.begin();
    expect(start).toHaveBeenCalledWith({ worldId: W, ghostPreset: "lamplighter", conditions: choice });
    const ui = t.controller.getSnapshot();
    expect(ui.phase).toBe("ready");
    expect(ui.view?.found).toEqual([]);
    expect(t.memory.get().playId).toBeDefined();
    expect(t.memory.get().startFresh).toBe(false);
  });

  it("asks for a new game with no extras when none were chosen", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const start = vi.spyOn(api, "playStart");
    await setup({ api }).controller.begin();
    expect(start).toHaveBeenCalledWith({ worldId: W });
  });

  it("does not start the Viewer until the notice is acknowledged", async () => {
    const t = setup();
    await t.controller.begin();
    await t.controller.settled();
    expect(t.log).toEqual([]);
    expect(t.controller.getSnapshot().play.noticeAcked).toBe(false);
  });

  it("starts the Viewer at once when the notice was already acknowledged, then sends the sky, the view and the input mode", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    expect(t.log).toEqual(["start", "send set_atmosphere", "send apply_view", "send set_input_mode"]);
    expect(t.sent[0]).toEqual({ t: "set_atmosphere", atmosphere: null });
    expect(t.sent[1]).toEqual(viewMessage(t.controller.getSnapshot().view as PlayView));
    expect(t.sent[2]).toEqual({ t: "set_input_mode", mode: "play" });
  });

  it("passes the frozen sky of the play session to the Viewer", async () => {
    const memory = createPlayMemory();
    memory.set({ conditions: { hostHour: 23, memoryDay: { date: "1999-01-02", timeOfDay: "night" } } });
    const t = setup({ ackNotice: true, memory });
    await t.controller.begin();
    await t.controller.settled();
    expect(t.sent[0]).toMatchObject({ t: "set_atmosphere", atmosphere: { timeOfDay: "night" } });
  });

  it("acknowledging the notice tells the API, tells the boot data and starts the Viewer once", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const ackSpy = vi.spyOn(api, "ackNotice");
    const t = setup({ api });
    await t.controller.begin();
    await ack(t.controller);
    await ack(t.controller);
    expect(ackSpy).toHaveBeenCalledTimes(1);
    expect(t.noticeAcked).toHaveBeenCalledTimes(1);
    expect(t.log.filter((l) => l === "start")).toHaveLength(1);
    expect(t.log.slice(0, 4)).toEqual(["start", "send set_atmosphere", "send apply_view", "send set_input_mode"]);
    expect(t.controller.getSnapshot().play.noticeAcked).toBe(true);
  });

  it("goes on when the call that remembers the notice fails", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("ackNotice", "network_error");
    const t = setup({ api });
    await t.controller.begin();
    await ack(t.controller);
    expect(t.log).toContain("start");
  });

  it("an acknowledgement that comes before the game has loaded still gives the Viewer its view", async () => {
    let release!: () => void;
    const base = createFakeApi({ latencyMs: 0 });
    const gate = new Promise<void>((r) => { release = r; });
    const api = { ...base, playStart: async (req: Parameters<ShellApi["playStart"]>[0]) => { await gate; return base.playStart(req); } } as ShellApi;
    const t = setup({ api });
    const begun = t.controller.begin();
    await ack(t.controller);
    expect(t.log).toEqual(["start"]);
    release();
    await begun;
    await t.controller.settled();
    expect(t.log).toEqual(["start", "send set_atmosphere", "send apply_view", "send set_input_mode"]);
  });
});

describe("restoring after a reload", () => {
  async function liveSession() {
    const api = createFakeApi({ latencyMs: 0 });
    const up = await api.uploadPhoto(photo);
    if (!up.ok) throw new Error("upload");
    const q = await api.quote(up.value.imageId);
    if (!q.ok) throw new Error("quote");
    // The Gallery world "attic-room" is ready; start a play session there and find one memory.
    const started = await api.playStart({ worldId: W });
    if (!started.ok) throw new Error("start");
    await api.playTurn(started.value.playId, { input: { button: "look" }, pose: { pos: [3, 0, 0], yaw: 0 } });
    return { api, playId: started.value.playId };
  }

  it("restores the game the Session names, with its found memories, and does not start another", async () => {
    const { api, playId } = await liveSession();
    const start = vi.spyOn(api, "playStart");
    const t = setup({ api, lastPlayId: playId, lastWorldId: W, ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    expect(start).not.toHaveBeenCalled();
    expect(t.controller.getSnapshot().view?.found).toEqual(["a1"]);
    expect(t.controller.getSnapshot().play.found).toBe(1);
    expect(t.memory.get().playId).toBe(playId);
  });

  it("prefers the game remembered in this tab to the one in the Session", async () => {
    const { api, playId } = await liveSession();
    const memory = createPlayMemory();
    memory.set({ playId });
    const get = vi.spyOn(api, "playGet");
    const t = setup({ api, memory, lastPlayId: "someone-else", lastWorldId: W });
    await t.controller.begin();
    expect(get).toHaveBeenCalledWith(playId);
  });

  it("starts a new game instead when the Session's game is another world's, is over, or is gone", async () => {
    const { api, playId } = await liveSession();
    for (const [label, over] of [
      ["another world", { lastPlayId: playId, lastWorldId: "greenhouse" }],
      ["no world named", { lastPlayId: playId }],
      ["unknown id", { lastPlayId: "nope", lastWorldId: W }],
    ] as const) {
      const start = vi.spyOn(api, "playStart");
      start.mockClear();
      const t = setup({ api, ...over });
      await t.controller.begin();
      expect(start, label).toHaveBeenCalledTimes(1);
      expect(t.controller.getSnapshot().phase).toBe("ready");
    }
    // Finish the game: a restore of an ended game starts a new one.
    for (const i of [1, 2]) await api.playTurn(playId, { input: { button: "look" }, pose: { pos: [ANCHORS[i]!.pos[0], 0, ANCHORS[i]!.pos[2]], yaw: 0 } });
    const start = vi.spyOn(api, "playStart");
    start.mockClear();
    const t = setup({ api, lastPlayId: playId, lastWorldId: W });
    await t.controller.begin();
    expect(start).toHaveBeenCalledTimes(1);
    expect(t.navigated).toEqual([]);
  });

  it("does not restore a game of another world, even from this tab's memory", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const started = await base.playStart({ worldId: W });
    if (!started.ok) throw new Error("start");
    const api = { ...base, playGet: async (id: string) => { const r = await base.playGet(id); return r.ok ? { ok: true, value: { ...r.value, worldId: "greenhouse" } } : r; } } as ShellApi;
    const memory = createPlayMemory();
    memory.set({ playId: started.value.playId });
    const start = vi.spyOn(api, "playStart");
    start.mockClear();
    const t = setup({ api, memory });
    await t.controller.begin();
    expect(start).toHaveBeenCalledTimes(1);
    expect(t.memory.get().playId).not.toBe(started.value.playId);
  });

  it("starts fresh, ignoring the Session, when asked to (Wander, Haunt again)", async () => {
    const { api, playId } = await liveSession();
    const memory = createPlayMemory();
    memory.set({ startFresh: true });
    const get = vi.spyOn(api, "playGet");
    const start = vi.spyOn(api, "playStart");
    start.mockClear();
    const t = setup({ api, memory, lastPlayId: playId, lastWorldId: W });
    await t.controller.begin();
    expect(get).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    expect(t.memory.get().startFresh).toBe(false);
  });
});

describe("when the game cannot start", () => {
  it("shows the code and lets the visitor retry", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("playStart", "rate_limited");
    const t = setup({ api });
    await t.controller.begin();
    expect(t.controller.getSnapshot()).toMatchObject({ phase: "failed", failure: { code: "rate_limited" } });
    await t.controller.retry();
    expect(t.controller.getSnapshot().phase).toBe("ready");
    expect(t.controller.getSnapshot().failure).toBeNull();
  });

  it("carries the advised delay of a rate limit", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const api = { ...base, playStart: async () => ({ ok: false, code: "rate_limited", retryAfterSec: 7 }) as ApiResult<never> } as unknown as ShellApi;
    const t = setup({ api });
    await t.controller.begin();
    expect(t.controller.getSnapshot().failure).toEqual({ code: "rate_limited", retryAfterSec: 7 });
  });

  it("goes to Expired when the world is gone", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("playStart", "world_not_found");
    const t = setup({ api });
    await t.controller.begin();
    await t.controller.settled();
    expect(t.navigated).toEqual([{ screen: "expired" }]);
  });

  it("retry does nothing unless it failed, and begin runs once", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const start = vi.spyOn(api, "playStart");
    const t = setup({ api });
    const get = vi.spyOn(api, "playGet");
    await Promise.all([t.controller.begin(), t.controller.begin()]);
    await t.controller.retry();
    expect(start).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("what the Viewer says", () => {
  it("keeps the last pose and sends it with the next turn", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const turn = vi.spyOn(api, "playTurn");
    const t = setup({ api, ackNotice: true });
    await t.controller.begin();
    t.controller.onViewerMessage({ t: "pose", pos: [1, 2, 3], yaw: 0.25 });
    await t.controller.submit({ button: "look" });
    expect(turn.mock.calls[0]![1]).toEqual({ input: { button: "look" }, pose: { pos: [1, 2, 3], yaw: 0.25 } });
  });

  it("uses the spawn pose before the Viewer has said anything", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const turn = vi.spyOn(api, "playTurn");
    const t = setup({ api });
    await t.controller.begin();
    await t.controller.submit({ button: "look" });
    expect(turn.mock.calls[0]![1].pose).toEqual({ pos: [0, 0, 0], yaw: 0 });
  });

  it("drops anything that is not in the contract: bad shapes, extra fields, non-finite numbers, wrong direction", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const turn = vi.spyOn(api, "playTurn");
    const t = setup({ api });
    await t.controller.begin();
    const bad: unknown[] = [
      null, 7, "pose", {}, { t: "pose", pos: [0, 0], yaw: 0 }, { t: "pose", pos: [0, Number.NaN, 0], yaw: 0 },
      { t: "pose", pos: [0, 0, 0], yaw: 0, seed: "hidden" }, { t: "prompt", target: "wall" }, { t: "degraded", rung: "splat" },
      { t: "set_input_mode", mode: "chat" }, { t: "apply_view" },
    ];
    for (const m of bad) expect(() => t.controller.onViewerMessage(m)).not.toThrow();
    await t.controller.submit({ button: "look" });
    expect(turn.mock.calls[0]![1].pose).toEqual({ pos: [0, 0, 0], yaw: 0 });
    expect(t.controller.getSnapshot().prompt).toBeNull();
    expect(t.controller.getSnapshot().play.degraded).toBeUndefined();
  });

  it("keeps the interaction prompt and a fall back to a panorama or a still picture, which never gets better", async () => {
    const t = setup();
    await t.controller.begin();
    t.controller.onViewerMessage({ t: "prompt", target: "ghost" });
    expect(t.controller.getSnapshot().prompt).toBe("ghost");
    t.controller.onViewerMessage({ t: "prompt", target: null });
    expect(t.controller.getSnapshot().prompt).toBeNull();
    t.controller.onViewerMessage({ t: "degraded", rung: "pano" });
    expect(t.controller.getSnapshot().play.degraded).toBe("pano");
    t.controller.onViewerMessage({ t: "degraded", rung: "thumb" });
    t.controller.onViewerMessage({ t: "degraded", rung: "pano" });
    expect(t.controller.getSnapshot().play.degraded).toBe("thumb");
  });

  it("passes the Viewer's frame rate to the debug overlay and nowhere else", async () => {
    const t = setup();
    await t.controller.begin();
    t.controller.onViewerMessage({ t: "fps", fps: 59.6 });
    t.controller.onViewerMessage({ t: "fps", fps: -2 });
    expect(t.fpsSeen).toEqual([59.6]);
    expect(t.controller.getSnapshot().prompt).toBeNull();
  });
});

describe("the Chat", () => {
  it("sets the Viewer's input mode to chat while the Chat is open, and back to play when it closes", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    t.sent.length = 0;
    t.controller.openChat();
    t.controller.openChat();
    await t.controller.settled();
    expect(t.sent).toEqual([{ t: "set_input_mode", mode: "chat" }]);
    t.controller.closeChat();
    await t.controller.settled();
    expect(t.sent).toEqual([{ t: "set_input_mode", mode: "chat" }, { t: "set_input_mode", mode: "play" }]);
  });

  it("cannot open before the notice is acknowledged", async () => {
    const t = setup();
    await t.controller.begin();
    t.controller.openChat();
    await t.controller.settled();
    expect(t.controller.getSnapshot().play.mode).toBe("play");
    expect(t.sent).toEqual([]);
  });

  it("sends typed text trimmed and cut to 200 characters, and ignores empty text", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const turn = vi.spyOn(api, "playTurn");
    const t = setup({ api });
    await t.controller.begin();
    await t.controller.submit({ text: "   " });
    await t.controller.submit({ text: "" });
    expect(turn).not.toHaveBeenCalled();
    await t.controller.submit({ text: `  ${"x".repeat(300)}  ` });
    expect((turn.mock.calls[0]![1].input as { text: string }).text).toBe("x".repeat(200));
  });

  it("adds what you said and what the ghost answered, and marks a scripted game", async () => {
    const t = setup();
    await t.controller.begin();
    await t.controller.submit({ button: "look" });
    const ui = t.controller.getSnapshot();
    expect(ui.lines.map((l) => [l.who, l.who === "you" ? l.text : "…"])).toEqual([["you", "Look"], ["ghost", "…"]]);
    expect(ui.scripted).toBe(true);
    expect(ui.reply?.text).toBe(ui.lines[1]!.text);
    expect(ui.reply?.voice?.lineId).toBeTruthy();
    expect(ui.busy).toBe(false);
  });

  it("once a scripted line has been seen, the game stays marked as scripted", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    let calls = 0;
    const api = {
      ...base,
      playTurn: async (...a: Parameters<ShellApi["playTurn"]>) => {
        const r = await base.playTurn(...a);
        return r.ok && ++calls > 1 ? { ok: true, value: { ...r.value, reply: { ...r.value.reply, scripted: false } } } : r;
      },
    } as ShellApi;
    const t = setup({ api });
    await t.controller.begin();
    await t.controller.submit({ button: "look" });
    expect(t.controller.getSnapshot().scripted).toBe(true);
    await t.controller.submit({ button: "look" });
    expect(t.controller.getSnapshot().reply?.n).toBe(2);
    expect(t.controller.getSnapshot().scripted).toBe(true);
  });

  it("takes one turn at a time", async () => {
    let release!: () => void;
    const base = createFakeApi({ latencyMs: 0 });
    const gate = new Promise<void>((r) => { release = r; });
    const turn = vi.fn(async (...args: Parameters<ShellApi["playTurn"]>) => { await gate; return base.playTurn(...args); });
    const api = { ...base, playTurn: turn, playStart: base.playStart } as unknown as ShellApi;
    const t = setup({ api });
    await t.controller.begin();
    const first = t.controller.submit({ button: "look" });
    expect(t.controller.getSnapshot().busy).toBe(true);
    await t.controller.submit({ button: "listen" });
    await t.controller.submit({ text: "hello" });
    expect(turn).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(t.controller.getSnapshot().busy).toBe(false);
  });

  it("finds a memory when the visitor stands at it, sends the new view to the Viewer and counts it", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    t.sent.length = 0;
    t.controller.onViewerMessage(at(0));
    await t.controller.submit({ button: "look" });
    await t.controller.settled();
    expect(t.controller.getSnapshot().play.found).toBe(1);
    expect(t.controller.getSnapshot().view?.journal).toHaveLength(1);
    expect(t.sent).toEqual([viewMessage(t.controller.getSnapshot().view as PlayView)]);
    expect((t.sent[0] as { found: string[] }).found).toEqual(["a1"]);
  });

  it("keeps the Chat usable after a failed turn and says what went wrong in fixed words", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const t = setup({ api });
    await t.controller.begin();
    api.backend.failNext("playTurn", "network_error");
    await t.controller.submit({ text: "hello" });
    const ui = t.controller.getSnapshot();
    expect(ui.busy).toBe(false);
    expect(ui.turnFailure).toEqual({ code: "network_error" });
    expect(ui.lines.at(-1)).toMatchObject({ who: "system" });
    expect(ui.lines.at(-1)!.text).toContain("We could not reach the server");
    await t.controller.submit({ text: "again" });
    expect(t.controller.getSnapshot().turnFailure).toBeNull();
    expect(t.controller.getSnapshot().lines.at(-1)!.who).toBe("ghost");
  });

  it("carries the advised delay of a rate limit on a turn", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const api = { ...base, playTurn: async () => ({ ok: false, code: "rate_limited", retryAfterSec: 3 }) } as unknown as ShellApi;
    const t = setup({ api });
    await t.controller.begin();
    await t.controller.submit({ text: "hi" });
    expect(t.controller.getSnapshot().turnFailure).toEqual({ code: "rate_limited", retryAfterSec: 3 });
  });

  it("leaves for Expired, with the Viewer released first, when the game or the world is gone", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const t = setup({ api, ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    api.backend.failNext("playTurn", "session_not_found");
    await t.controller.submit({ text: "hi" });
    expect(t.controller.getSnapshot().turnFailure).not.toBeNull();
    api.backend.failNext("playTurn", "world_not_found");
    await t.controller.submit({ text: "hi" });
    await t.controller.settled();
    expect(t.log.slice(-2)).toEqual(["dispose", "navigate expired"]);
  });
});

describe("the ending", () => {
  it("on the third memory releases the Viewer, then goes to the Ending once, with the flow marked and the farewell kept", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    t.log.length = 0;
    for (let i = 0; i < 3; i++) {
      t.controller.onViewerMessage(at(i));
      await t.controller.submit({ button: "look" });
    }
    await t.controller.settled();
    expect(t.log.slice(-3)).toEqual(["dispose", `setFlow ${JSON.stringify({ playEnded: true })}`, "navigate end"]);
    expect(t.navigated).toEqual([{ screen: "end", worldId: W }]);
    expect(t.log.filter((l) => l === "dispose")).toHaveLength(1);
    expect(t.memory.get().farewell).toBe(t.controller.getSnapshot().lines.at(-1)!.text);
    // The game is over: nothing more is sent.
    await t.controller.submit({ button: "look" });
    expect(t.navigated).toHaveLength(1);
  });
});

describe("leaving", () => {
  it("Exit releases the Viewer and waits for it before it goes to Home, or to the Gallery when asked", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    t.log.length = 0;
    await t.controller.exit();
    await t.controller.settled();
    expect(t.log).toEqual(["dispose", "navigate home"]);

    const g = setup({ ackNotice: true });
    await g.controller.begin();
    await g.controller.settled();
    await g.controller.exit("gallery");
    expect(g.navigated).toEqual([{ screen: "gallery" }]);
  });

  it("Exit works before the Viewer has started, and while the game is still loading", async () => {
    const t = setup();
    await t.controller.begin();
    await t.controller.exit();
    expect(t.log).toEqual(["navigate home"]);
  });

  it("destroy releases the Viewer once, and not again after an Exit", async () => {
    const t = setup({ ackNotice: true });
    await t.controller.begin();
    await t.controller.settled();
    await t.controller.destroy();
    await t.controller.destroy();
    expect(t.log.filter((l) => l === "dispose")).toHaveLength(1);

    const e = setup({ ackNotice: true });
    await e.controller.begin();
    await e.controller.exit();
    await e.controller.destroy();
    expect(e.log.filter((l) => l === "dispose")).toHaveLength(1);
  });
});

describe("the journal and subscribers", () => {
  it("opens and closes the journal", async () => {
    const t = setup();
    await t.controller.begin();
    t.controller.openJournal();
    expect(t.controller.getSnapshot().journalOpen).toBe(true);
    t.controller.closeJournal();
    expect(t.controller.getSnapshot().journalOpen).toBe(false);
  });

  it("tells subscribers about every change until they stop", async () => {
    const t = setup();
    const listener = vi.fn();
    const stop = t.controller.subscribe(listener);
    await t.controller.begin();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    stop();
    t.controller.openJournal();
    expect(listener.mock.calls.length).toBe(calls);
  });
});

describe("a Viewer that fails", () => {
  it("falls back to a still picture when it cannot start, and the Chat still works", async () => {
    const base = setup({ ackNotice: true });
    const api = base.api;
    const log: string[] = [];
    const port: ViewerPort = { start: async () => { throw new Error("WebGL lost"); }, send: () => { log.push("send"); }, dispose: async () => { log.push("dispose"); } };
    const controller = createPlayController({
      api, worldId: W, memory: createPlayMemory(), session: { ackNotice: true }, port, navigate: () => {}, setFlow: () => {}, onNoticeAcked: () => {},
    });
    await controller.begin();
    await controller.settled();
    expect(controller.getSnapshot().play.degraded).toBe("thumb");
    await controller.submit({ button: "look" });
    expect(controller.getSnapshot().lines.at(-1)!.who).toBe("ghost");
    expect(log).toEqual([]);
  });

  it("keeps going when the Viewer throws while it is being sent a message", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const port: ViewerPort = { start: async () => {}, send: () => { throw new Error("renderer gone"); }, dispose: async () => {} };
    const controller = createPlayController({
      api, worldId: W, memory: createPlayMemory(), session: { ackNotice: true }, port, navigate: () => {}, setFlow: () => {}, onNoticeAcked: () => {},
    });
    await controller.begin();
    await controller.settled();
    controller.openChat();
    await controller.submit({ button: "look" });
    await controller.settled();
    expect(controller.getSnapshot().lines.at(-1)!.who).toBe("ghost");
    expect(controller.getSnapshot().play.mode).toBe("chat");
  });
});
