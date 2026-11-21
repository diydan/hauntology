import { describe, expect, it } from "vitest";
import { RoomHostPort } from "./host-port";
import { BACKOFF_MS, type PortDeps, type SocketLike } from "./socket-port";

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly code: string) {}
  send(d: string): void { this.sent.push(d); }
  close(): void { this.closed = true; }
  say(m: unknown): void { this.onmessage?.({ data: JSON.stringify(m) }); }
  msgs(): { t: string; [k: string]: unknown }[] { return this.sent.map((s) => JSON.parse(s)); }
}
const HOST = "abcdefabcdefabcdefabcdefabcdefab";
const rig = (over: { body?: unknown; status?: number; throws?: boolean; stored?: string; deleteFails?: boolean } = {}) => {
  const sockets: FakeSocket[] = [];
  const store = new Map<string, string>();
  if (over.stored !== undefined) store.set("hauntology.party.host", over.stored);
  const timers: { f: () => void; ms: number; live: boolean }[] = [];
  const calls: { url: string; method: string; headers: Record<string, string>; body: string | null }[] = [];
  const deps: PortDeps = {
    fetch: async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: (init?.body as string | undefined) ?? null });
      if (over.throws || (over.deleteFails && init?.method === "DELETE")) throw new Error("offline");
      return { ok: true, status: over.status ?? 200, json: async () => ("body" in over ? over.body : { code: "K7M2", hostToken: HOST, displayToken: "d".repeat(32) }) };
    },
    openSocket: (code) => { const s = new FakeSocket(code); sockets.push(s); return s; },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    now: () => Date.UTC(2026, 10, 21, 12, 0),
    setTimer: (f, ms) => { timers.push({ f, ms, live: true }); return timers.length - 1; },
    clearTimer: (h) => { const t = timers[h as number]; if (t) t.live = false; },
  };
  const port = (persist = true) => new RoomHostPort(deps, { persist });
  return { deps, sockets, store, timers, calls, port, fire: () => { const t = [...timers].reverse().find((x) => x.live); if (t) { t.live = false; t.f(); } } };
};

describe("RoomHostPort (party-mode 8.1)", () => {
  it("makes a Room, opens the socket for its code and says hello with the Host token only in the first message", async () => {
    const r = rig();
    const p = r.port();
    expect(await p.create()).toBe(true);
    expect(r.calls[0]).toMatchObject({ url: "/api/party", method: "POST", body: "{}" });
    expect(p.getState()).toMatchObject({ connection: "connecting", code: "K7M2" });
    r.sockets[0]!.onopen!();
    expect(r.sockets[0]!.msgs()).toEqual([{ t: "hello", token: HOST }]);
    expect(r.calls[0]!.url).not.toContain(HOST);
    r.sockets[0]!.say({ t: "welcome", role: "host", seat: null });
    expect(p.getState().connection).toBe("online");
    expect(r.sockets[0]!.msgs().at(-1)).toEqual({ t: "hostClock", offsetMin: -new Date(Date.UTC(2026, 10, 21, 12, 0)).getTimezoneOffset() }); // the machine's own offset
    expect(JSON.parse(r.store.get("hauntology.party.host")!)).toMatchObject({ code: "K7M2", hostToken: HOST });
  });
  it("can replace the visitor's own earlier Room, and says the Room's refusal as it is (or unreachable)", async () => {
    const r = rig();
    await r.port().create(true);
    expect(r.calls[0]!.body).toBe('{"replace":true}');
    for (const code of ["party_disabled", "rooms_full", "session_has_room"]) {
      const f = rig({ body: { code } });
      const p = f.port();
      expect(await p.create()).toBe(false);
      expect(p.getState()).toMatchObject({ connection: "failed", failure: code });
      expect(f.sockets).toHaveLength(0);
    }
    const down = rig({ throws: true }).port();
    await down.create();
    expect(down.getState().failure).toBe("unreachable");
    const odd = rig({ body: { code: "<script>" } }).port();
    await odd.create();
    expect(odd.getState().failure).toBe("unreachable");
  });
  it("folds the Room's messages into the Host view and hands each raw message to the page", async () => {
    const r = rig();
    const p = r.port();
    const seen: string[] = [];
    p.onMessage((m) => seen.push((m as { t: string }).t));
    await p.create();
    const s = r.sockets[0]!;
    s.say({ t: "welcome" });
    s.say({ t: "lobby", code: "K7M2", masterSeat: 1, started: false, worldId: null, settings: {}, switches: {}, seats: [] });
    s.say({ t: "input", seat: 2, input: { move: [1, 0], look: [0, 0] } });
    s.say({ t: "tvCue", eventId: 1, cue: "bell", playAtMs: 5 });
    expect(p.getState().view.game.lobby?.code).toBe("K7M2");
    expect(p.getState().view.input).toMatchObject({ seat: 2 });
    expect(p.getState().view.tvCues).toHaveLength(1);
    expect(seen).toEqual(["lobby", "input", "tvCue"]);
  });
  it("reconnects with the same hello after a drop (0.5 s, 1 s, 2 s...), says reconnecting, and stops for an ended Room", async () => {
    const r = rig();
    const p = r.port();
    await p.create();
    r.sockets[0]!.say({ t: "welcome" });
    r.sockets[0]!.onclose!({ code: 1006 });
    expect(p.getState().connection).toBe("reconnecting");
    expect(r.timers.at(-1)!.ms).toBe(BACKOFF_MS[0]);
    r.fire();
    r.sockets[1]!.onopen!();
    expect(r.sockets[1]!.msgs()).toEqual([{ t: "hello", token: HOST }]);
    r.sockets[1]!.onclose!({ code: 1006 });
    expect(r.timers.at(-1)!.ms).toBe(BACKOFF_MS[1]);
    r.fire();
    r.sockets[2]!.onclose!({ code: 4000 });
    expect(p.getState().connection).toBe("ended");
    expect(r.store.size).toBe(0);
    expect(r.timers.filter((t) => t.live)).toHaveLength(0);
  });
  it("reattaches to the stored Room after a reload, and not when nothing or nonsense is stored", () => {
    const stored = JSON.stringify({ code: "K7M2", hostToken: HOST, displayToken: "d".repeat(32) });
    const r = rig({ stored });
    const p = r.port();
    expect(p.restore()).toBe(true);
    r.sockets[0]!.onopen!();
    expect(r.sockets[0]!.msgs()).toEqual([{ t: "hello", token: HOST }]);
    expect(rig().port().restore()).toBe(false);
    expect(rig({ stored: "{" }).port().restore()).toBe(false);
    expect(rig({ stored: JSON.stringify({ code: "K7M2", hostToken: "short", displayToken: "d" }) }).port().restore()).toBe(false);
  });
  it("keeps nothing in storage when told not to (a solo case ends on reload)", async () => {
    const r = rig();
    await r.port(false).create();
    expect(r.store.size).toBe(0);
  });
  it("ends the Room with the Host token in a header, or with an end message when the call fails; sends only while online", async () => {
    const r = rig();
    const p = r.port();
    await p.create();
    p.send({ t: "pose", pos: [0, 0, 0], yaw: 0 }); // not online yet
    expect(r.sockets[0]!.sent).toEqual([]);
    r.sockets[0]!.say({ t: "welcome" });
    p.reportPose([1, 2, 3], 0.5);
    expect(r.sockets[0]!.msgs().at(-1)).toEqual({ t: "pose", pos: [1, 2, 3], yaw: 0.5 });
    await p.end();
    expect(r.calls.at(-1)).toMatchObject({ url: "/api/party/K7M2", method: "DELETE", headers: { Authorization: `Bearer ${HOST}` } });
    expect(p.getState().connection).toBe("ended");
    expect(r.store.size).toBe(0);
    const f = rig({ deleteFails: true });
    const q = f.port();
    await q.create();
    f.sockets[0]!.say({ t: "welcome" });
    await q.end();
    expect(f.sockets[0]!.msgs().at(-1)).toEqual({ t: "end" });
  });
});

describe("RoomHostPort as a Display (party-mode 10.1)", () => {
  const DISPLAY = "d".repeat(32);
  it("attaches with the code and the Display token, says hello with that token, never reports a clock and keeps nothing in storage", () => {
    const r = rig();
    const d = new RoomHostPort(r.deps, { persist: false, role: "display" });
    expect(d.attach("K7M2", DISPLAY)).toBe(true);
    r.sockets[0]!.onopen!();
    expect(r.sockets[0]!.msgs()).toEqual([{ t: "hello", token: DISPLAY }]);
    r.sockets[0]!.say({ t: "welcome", role: "display" });
    expect(d.getState().connection).toBe("online");
    expect(r.sockets[0]!.msgs().map((m) => m.t)).toEqual(["hello"]); // no hostClock, no pose
    expect(r.store.size).toBe(0);
    expect(d.getState().hostToken).toBeNull();
  });
  it("refuses a code or token that cannot be one, and opens nothing", () => {
    const r = rig();
    const d = new RoomHostPort(r.deps, { persist: false, role: "display" });
    expect(d.attach("nope", DISPLAY)).toBe(false);
    expect(d.attach("K7M2", "short")).toBe(false);
    expect(r.sockets).toHaveLength(0);
  });
});
