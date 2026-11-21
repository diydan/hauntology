import { describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { BACKOFF_MS, RoomSocketPort, browserDeps, type PortDeps, type SocketLike } from "./socket-port";

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed: { code?: number } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly code: string) {}
  send(d: string): void { this.sent.push(d); }
  close(code?: number): void { this.closed = code === undefined ? {} : { code }; }
  open(): void { this.onopen?.(); }
  say(msg: unknown): void { this.onmessage?.({ data: JSON.stringify(msg) }); }
  drop(code = 1006): void { this.onclose?.({ code }); }
  msgs(): { t: string; [k: string]: unknown }[] { return this.sent.map((s) => JSON.parse(s)); }
}
const TOKEN = "0123456789abcdef0123456789abcdef";

function rig(over: { joinBody?: unknown; status?: number; throws?: boolean; stored?: string } = {}) {
  const sockets: FakeSocket[] = [];
  const store = new Map<string, string>();
  if (over.stored !== undefined) store.set("hauntology.party.seat", over.stored);
  const timers: { f: () => void; ms: number; id: number; live: boolean }[] = [];
  const calls: { url: string; body: unknown }[] = [];
  const clock = { t: 1000 };
  const deps: PortDeps = {
    fetch: async (url, init) => {
      calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
      if (over.throws) throw new Error("offline");
      return { ok: (over.status ?? 200) < 400, status: over.status ?? 200, json: async () => ("joinBody" in over ? over.joinBody : { ok: true, seat: 2, token: TOKEN }) };
    },
    openSocket: (code) => { const s = new FakeSocket(code); sockets.push(s); return s; },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    now: () => clock.t,
    setTimer: (f, ms) => { const t = { f, ms, id: timers.length, live: true }; timers.push(t); return t.id; },
    clearTimer: (h) => { const t = timers[h as number]; if (t) t.live = false; },
  };
  const port = new RoomSocketPort(deps);
  const fire = (): void => { const t = [...timers].reverse().find((x) => x.live); if (t) { t.live = false; t.f(); } };
  return { port, sockets, store, timers, calls, clock, fire };
}

describe("RoomSocketPort: joining and the first message (party-mode 9.1)", () => {
  it("joins over HTTP, opens the socket for that Room, sends the token only in the first message, and goes online on welcome", async () => {
    const r = rig();
    const res = await r.port.join("K7M2", "Ben");
    expect(res).toEqual({ ok: true, seat: 2, nickname: "Ben" });
    expect(r.calls[0]).toEqual({ url: "/api/party/K7M2/join", body: { nickname: "Ben" } });
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]!.code).toBe("K7M2");
    expect(r.port.getView()).toMatchObject({ connection: "connecting", code: "K7M2", seat: 2, nickname: "Ben" });
    r.sockets[0]!.open();
    expect(r.sockets[0]!.msgs()).toEqual([{ t: "hello", token: TOKEN }]);
    expect(r.calls[0]!.url).not.toContain(TOKEN);
    r.sockets[0]!.say({ t: "welcome", role: "controller", seat: 2 });
    expect(r.port.getView().connection).toBe("online");
  });
  it("keeps the token in session storage under no other name than the seat, and nothing else of the Room", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    expect(JSON.parse(r.store.get("hauntology.party.seat")!)).toEqual({ code: "K7M2", token: TOKEN, seat: 2, nickname: "Ben" });
  });
  it("answers the Room's refusals as they are and a failed call as unreachable, and opens nothing", async () => {
    for (const code of ["room_full", "game_started", "room_unknown"]) {
      const r = rig({ joinBody: { ok: false, code }, status: 409 });
      expect(await r.port.join("K7M2", "Ben")).toEqual({ ok: false, code });
      expect(r.sockets).toHaveLength(0);
    }
    expect(await rig({ throws: true }).port.join("K7M2", "Ben")).toEqual({ ok: false, code: "unreachable" });
    expect(await rig({ joinBody: { ok: false, code: "rate_limited" }, status: 429 }).port.join("K7M2", "Ben")).toEqual({ ok: false, code: "room_unknown" });
    expect(await rig({ joinBody: null, status: 502 }).port.join("K7M2", "Ben")).toEqual({ ok: false, code: "unreachable" });
  });
  it("takes the stored seat again after a reload, with the stored token", async () => {
    const r = rig({ stored: JSON.stringify({ code: "K7M2", token: TOKEN, seat: 3, nickname: "Cat" }) });
    expect(await r.port.restore("ZZZZ")).toBeNull();
    expect(await r.port.restore()).toEqual({ ok: true, seat: 3, nickname: "Cat" });
    r.sockets[0]!.open();
    expect(r.sockets[0]!.msgs()).toEqual([{ t: "hello", token: TOKEN }]);
    expect(r.calls).toHaveLength(0);
    expect(await rig({ stored: "nonsense" }).port.restore()).toBeNull();
    expect(await rig({ stored: JSON.stringify({ code: "K7M2", token: "short", seat: 1, nickname: "x" }) }).port.restore()).toBeNull();
  });
});

describe("RoomSocketPort: connection, reconnection and ending", () => {
  it("shows reconnecting, waits 0.5 s, 1 s, 2 s, 4 s, 8 s and then 8 s again, and says the same hello each time; online again resets the wait", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    r.sockets[0]!.open(); r.sockets[0]!.say({ t: "welcome" });
    r.sockets[0]!.drop();
    expect(r.port.getView().connection).toBe("reconnecting");
    expect(r.timers.at(-1)!.ms).toBe(BACKOFF_MS[0]);
    for (let i = 1; i < 7; i++) {
      r.fire();
      r.sockets.at(-1)!.drop();
      expect(r.timers.at(-1)!.ms).toBe(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]);
    }
    r.fire();
    const s = r.sockets.at(-1)!;
    s.open();
    expect(s.msgs()).toEqual([{ t: "hello", token: TOKEN }]);
    s.say({ t: "welcome" });
    expect(r.port.getView().connection).toBe("online");
    s.drop();
    expect(r.timers.at(-1)!.ms).toBe(BACKOFF_MS[0]);
  });
  it("ignores the late close of a socket it already replaced", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    const first = r.sockets[0]!;
    first.drop();
    r.fire();
    expect(r.sockets).toHaveLength(2);
    const live = r.timers.filter((t) => t.live).length;
    first.drop();
    expect(r.timers.filter((t) => t.live).length).toBe(live);
    expect(r.port.getView().connection).toBe("reconnecting");
  });
  it("gives the seat up for a token the Room does not know, an unknown or ended Room, and the Room's own 'ended'", async () => {
    for (const code of [4403, 4004, 4000]) {
      const r = rig();
      await r.port.join("K7M2", "Ben");
      r.sockets[0]!.drop(code);
      expect(r.port.getView().seat).toBeNull();
      expect(r.store.size).toBe(0);
      expect(r.timers.filter((t) => t.live)).toHaveLength(0);
    }
    const r = rig();
    await r.port.join("K7M2", "Ben");
    r.sockets[0]!.say({ t: "ended" });
    expect(r.port.getView().seat).toBeNull();
    expect(r.store.size).toBe(0);
    expect(r.sockets[0]!.closed).not.toBeNull();
  });
  it("leave sends the Stitch goodbye, closes, forgets the seat and does not reconnect", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    r.sockets[0]!.open(); r.sockets[0]!.say({ t: "welcome" });
    await r.port.leave();
    expect(r.sockets[0]!.msgs().map((m) => m.t)).toEqual(["hello", "stitchLeave"]);
    expect(r.sockets[0]!.closed).not.toBeNull();
    r.sockets[0]!.drop(1000);
    expect(r.timers.filter((t) => t.live)).toHaveLength(0);
    expect(r.store.size).toBe(0);
    expect(r.port.getView().seat).toBeNull();
  });
  it("sends nothing while it is not online", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    r.port.send({ t: "sound", consent: true });
    expect(r.sockets[0]!.sent).toEqual([]);
  });
});

describe("RoomSocketPort: the game through the port", () => {
  const online = async () => { const r = rig(); await r.port.join("K7M2", "Ben"); r.sockets[0]!.open(); r.sockets[0]!.say({ t: "welcome" }); return r; };
  it("builds the view from the Room's messages: phase, Master settings, game views, sky", async () => {
    const r = await online();
    const s = r.sockets[0]!;
    s.say({ t: "lobby", code: "K7M2", masterSeat: 2, started: false, worldId: null, settings: { puzzles: "easy", preset: "quick" }, switches: {}, seats: [] });
    expect(r.port.getView().master).toMatchObject({ puzzles: "easy", preset: "quick" });
    expect(r.port.getView().phase).toBe("lobby");
    s.say({ t: "lobby", code: "K7M2", masterSeat: 1, started: false, worldId: null, settings: {}, switches: {}, seats: [] });
    expect(r.port.getView().master).toBeNull();
    s.say({ t: "public", view: { phase: "playing", paused: false, doors: [], events: [], seats: [], zones: [], suspects: [], relics: [], atmosphere: { weather: "rain", timeOfDay: "night", moon: "full" } } });
    expect(r.port.getView().phase).toBe("playing");
    expect(r.port.getView().game!.atmosphere).toMatchObject({ weather: "rain" });
    s.say({ t: "public", view: { phase: "playing", paused: true, doors: [], events: [], seats: [], zones: [], suspects: [], relics: [], atmosphere: null } });
    expect(r.port.getView().phase).toBe("paused");
    s.say({ t: "private", view: { seat: 2, soundConsent: false, hand: [] } });
    expect(r.port.getView().soundConsent).toBe(false);
  });
  it("sends the Player's actions as the Room's own messages", async () => {
    const r = await online();
    r.port.setSound!(true);
    r.port.setAssist!(true);
    r.port.setPuzzles("hard");
    r.port.setCluePlace!("world");
    r.port.setErrands!(true);
    r.port.setErrandOptOut!(true);
    r.port.errandDone!();
    r.port.errandAnswer!(false);
    r.port.doorAct!("d1");
    r.port.send!({ t: "suggest", suspect: "s1", relic: "r1" });
    expect(r.sockets[0]!.msgs().slice(1)).toEqual([
      { t: "sound", consent: true }, { t: "assist", on: true }, { t: "settings", puzzles: "hard" }, { t: "settings", cluePlace: "world" }, { t: "settings", errands: true },
      { t: "errandOptOut", on: true }, { t: "errandDone" }, { t: "errandAnswer", yes: false }, { t: "doorAct", doorId: "d1" }, { t: "suggest", suspect: "s1", relic: "r1" },
    ]);
  });
  it("offers a Lock, resolves an Attempt from the Room's own answer, and gives up with a message", async () => {
    const r = await online();
    const lock = makeLock("safe", "easy", 3);
    r.sockets[0]!.say({ t: "lock", lockId: "L1", view: lock.view, level: "easy", attempts: 3, deadlineAt: 61_000, faded: null });
    expect(r.port.getView().lock).toMatchObject({ id: "L1", kind: "safe", attempts: 3, capMs: 60_000 });
    const p = r.port.attempt("L1", { kind: "safe", code: [1, 2, 3] } as never);
    expect(r.sockets[0]!.msgs().at(-1)).toMatchObject({ t: "attempt", lockId: "L1" });
    r.sockets[0]!.say({ t: "lockResult", lockId: "L1", outcome: "wrong", attemptsLeft: 2 });
    expect(await p).toEqual({ outcome: "wrong", attemptsLeft: 2 });
    const q = r.port.attempt("L1", { kind: "safe", code: [4] } as never);
    r.sockets[0]!.say({ t: "lockResult", lockId: "L1", outcome: "solved", zone: "z1" });
    expect(await q).toEqual({ outcome: "solved" });
    expect(r.port.getView().lock).not.toBeNull(); // stays until the Player taps Done
    r.port.closeLock("L1", "gave_up");
    expect(r.sockets[0]!.msgs().at(-1)).toEqual({ t: "giveUp", lockId: "L1" });
    expect(r.port.getView().lock).toBeNull();
    expect(await r.port.attempt("L1", { kind: "safe", code: [1] } as never)).toEqual({ outcome: "failed", reason: "no_lock" });
  });
  it("answers an Attempt the Room never answers with 'no_answer' after 8 s", async () => {
    const r = await online();
    r.sockets[0]!.say({ t: "lock", lockId: "L2", view: makeLock("safe", "easy", 4).view, level: "easy", attempts: 3, deadlineAt: 9_999, faded: null });
    const p = r.port.attempt("L2", { kind: "safe", code: [1] } as never);
    expect(r.timers.at(-1)!.ms).toBe(8000);
    r.fire();
    expect(await p).toEqual({ outcome: "failed", reason: "no_answer" });
  });
  it("measures the phone's clock against the Room's with three pings, reports each exchange, and keeps the median offset", async () => {
    const r = await online();
    const s = r.sockets[0]!;
    const fireAll = () => { for (const t of r.timers.filter((x) => x.live)) { t.live = false; t.f(); } };
    // three pings go out a little apart
    fireAll();
    const pings = s.msgs().filter((m) => m.t === "ping");
    expect(pings).toHaveLength(3);
    expect(pings.map((p) => p.id)).toEqual([1, 2, 3]);
    // the Room's clock is 5000 ms ahead of this phone; each exchange takes 100 ms
    r.clock.t = 1000;
    for (const p of pings) { r.clock.t += 100; s.say({ t: "pong", id: p.id, serverMs: 1000 + 50 + 5000 }); }
    const samples = s.msgs().filter((m) => m.t === "clockSample");
    expect(samples).toHaveLength(3);
    expect(samples[0]).toMatchObject({ t: "clockSample", sentMs: 1000, serverMs: 6050 });
    expect(r.port.getView().clock!.offsetMs).toBeGreaterThan(4900);
    expect(r.port.getView().clock!.offsetMs).toBeLessThan(5100);
    // an answer to a ping it never sent is ignored
    const before = s.sent.length;
    s.say({ t: "pong", id: 99, serverMs: 1 });
    expect(s.sent.length).toBe(before);
  });
  it("shows the Room's Sights one at a time, and a Sight is acknowledged by its id to the Room (integration 5.1)", async () => {
    const r = rig();
    await r.port.join("K7M2", "Ben");
    const s = r.sockets[0]!;
    s.open();
    s.say({ t: "welcome", role: "controller", seat: 2 });
    const one = { kind: "wires", payload: { kind: "wires", order: [1, 2, 3] }, showMs: 4000 };
    const two = { kind: "clock", payload: { kind: "clock", hour: 3 }, showMs: 3000 };
    expect(r.port.getView().sight).toBeUndefined();
    s.say({ t: "sight", sightId: "a", sight: one });
    s.say({ t: "sight", sightId: "b", sight: two });
    expect(r.port.getView().sight).toEqual({ id: "a", sight: one });
    r.port.ackSight("b"); // not the one on screen: nothing is sent and nothing changes
    expect(s.msgs().filter((m) => m.t === "sightAck")).toEqual([]);
    expect(r.port.getView().sight?.id).toBe("a");
    r.port.ackSight("a");
    expect(s.msgs().filter((m) => m.t === "sightAck")).toEqual([{ t: "sightAck", sightId: "a" }]);
    expect(r.port.getView().sight).toEqual({ id: "b", sight: two });
    r.port.ackSight("b");
    expect(r.port.getView().sight).toBeUndefined();
    // a malformed Sight is ignored, and leaving the seat drops what was waiting
    s.say({ t: "sight", sightId: 5, sight: one });
    s.say({ t: "sight", sightId: "c", sight: null });
    expect(r.port.getView().sight).toBeUndefined();
    s.say({ t: "sight", sightId: "d", sight: one });
    await r.port.leave();
    expect(r.port.getView().sight).toBeUndefined();
  });
  it("browserDeps points at wss on https, ws otherwise, and takes the Room Code only in the path", () => {
    let url = "";
    class W { constructor(u: string) { url = u; } }
    const mk = (protocol: string) => browserDeps({ protocol, host: "lab.example" }, { fetch: (async () => new Response("{}")) as never, WebSocket: W as never, sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    mk("https:").openSocket("K7M2");
    expect(url).toBe("wss://lab.example/api/party/K7M2/ws");
    mk("http:").openSocket("A B");
    expect(url).toBe("ws://lab.example/api/party/A%20B/ws");
  });
});
