import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeR2, FakeNamespace, fakeState } from "../worlds/fake-cloudflare";
import { PartyDirectory } from "./party-directory";
import { PartyRoom } from "./party-room";
import { RoomSongStore, type SongBucket } from "../songs/store";

/** A fake socket with an attachment, as the Hibernation API keeps one. */
class FakeSocket {
  sent: unknown[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(private attachment: unknown) {}
  serializeAttachment(v: unknown) { this.attachment = v; }
  deserializeAttachment() { return this.attachment; }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close(code: number, reason: string) { this.closed = { code, reason }; }
}

function room(env: ConstructorParameters<typeof PartyRoom>[1] = {}) {
  const parts = fakeState();
  const sockets: FakeSocket[] = [];
  (parts.state as unknown as { getWebSockets(): FakeSocket[] }).getWebSockets = () => sockets;
  const clock = { t: 5_000_000 };
  const r = new PartyRoom(parts.state, env, () => clock.t);
  const post = async (path: string, body: unknown) => (await r.fetch(new Request(`https://room${path}`, { method: "POST", body: JSON.stringify(body) }))).json() as Promise<Record<string, unknown>>;
  const socket = (id: string) => { const s = new FakeSocket({ id }); sockets.push(s); return s; };
  return { r, parts, post, socket, clock };
}

describe("PartyRoom Durable Object", () => {
  it("creates, seats, says hello over a socket, and starts a game; storage and the alarm hold the state", async () => {
    const t = room();
    const { hostToken } = (await t.post("/create", { code: "WXYZ" })) as { hostToken: string };
    const ana = (await t.post("/join", { nickname: "Ana" })) as { token: string; seat: number };
    const ben = (await t.post("/join", { nickname: "Ben" })) as { token: string };
    const host = t.socket("h");
    const sa = t.socket("a");
    const sb = t.socket("b");
    await t.r.webSocketMessage(host as unknown as WebSocket, JSON.stringify({ t: "hello", token: hostToken }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "hello", token: ana.token }));
    await t.r.webSocketMessage(sb as unknown as WebSocket, JSON.stringify({ t: "hello", token: ben.token }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "start" }));
    expect(sa.sent.some((m) => (m as { t: string; code?: string }).t === "refused" && (m as { code: string }).code === "world_not_set")).toBe(true);
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "world", id: "gallery-1", walkRadius: 9 }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "start" }));
    expect(host.sent.some((m) => (m as { t: string; view?: { phase: string } }).t === "public" && (m as { view: { phase: string } }).view.phase === "playing")).toBe(true);
    expect(sa.sent.some((m) => (m as { t: string }).t === "private")).toBe(true);
    expect(host.sent.some((m) => (m as { t: string }).t === "private")).toBe(false);
    expect(t.parts.data.has("room")).toBe(true);
    expect(t.parts.alarm.at).not.toBeNull();
    await t.r.webSocketMessage(sb as unknown as WebSocket, new ArrayBuffer(4));
    expect(sb.closed?.code).toBe(4400);
    expect((await (await t.r.fetch(new Request("https://room/ws"))).text())).toMatch(/websocket/);
  });

  it("frees its place in the directory when it ends", async () => {
    const directory = new FakeNamespace((state) => new PartyDirectory(state));
    const dir = directory.get(directory.idFromName("party-directory"));
    const ask = async (path: string, body: unknown) => (await dir.fetch(`https://d${path}`, { method: "POST", body: JSON.stringify(body) })).json();
    expect(await ask("/create", { code: "WXYZ", sessionId: "s" })).toEqual({ ok: true });
    const t = room({ PARTY_DIRECTORY: directory });
    const { hostToken } = (await t.post("/create", { code: "WXYZ" })) as { hostToken: string };
    const host = t.socket("h");
    await t.r.webSocketMessage(host as unknown as WebSocket, JSON.stringify({ t: "hello", token: hostToken }));
    await t.r.webSocketMessage(host as unknown as WebSocket, JSON.stringify({ t: "end" }));
    expect(host.closed?.code).toBe(4000);
    expect(await ask("/has", { code: "WXYZ" })).toEqual({ live: false });
  });

  it("serves /voice-line only to hostToken and purges clip:* DO keys when Stitch is switched off", async () => {
    const t = room();
    const { hostToken } = (await t.post("/create", { code: "WXYZ" })) as { hostToken: string };
    const ana = (await t.post("/join", { nickname: "Ana" })) as { token: string };
    const host = t.socket("h");
    const sa = t.socket("a");
    await t.r.webSocketMessage(host as unknown as WebSocket, JSON.stringify({ t: "hello", token: hostToken }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "hello", token: ana.token }));

    // Turn speech & stitch on, seed a clip:* entry in DO storage, then toggle stitch off -> clip:* purged, room state kept.
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "speech", action: "on" }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "stitchSetting", on: true }));
    t.parts.data.set("clip:1:wait", { seat: 1, word: "wait", recordedAt: 1_000 });
    expect(t.parts.data.has("clip:1:wait")).toBe(true);
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "stitchSetting", on: false }));
    expect(t.parts.data.has("clip:1:wait")).toBe(false);
    expect(t.parts.data.has("room")).toBe(true);

    // /voice-line refuses non-host token and accepts hostToken.
    const denied = await t.post("/voice-line", { lineId: "missing", token: ana.token });
    expect(denied).toEqual({ line: null });
    const allowed = await t.post("/voice-line", { lineId: "missing", token: hostToken });
    expect(allowed).toEqual({ line: null });
  });

  it("deletes generated Room songs from R2 BUCKET on /end without touching other rooms", async () => {
    const r2 = new FakeR2();
    const store = new RoomSongStore(r2 as unknown as SongBucket);
    await store.put("WXYZ", "opening", new Uint8Array([1, 2, 3, 4]));
    await store.put("OTHR", "opening", new Uint8Array([5, 6, 7, 8]));

    const t = room({ BUCKET: r2 as unknown as SongBucket });
    await t.post("/create", { code: "WXYZ" });
    await t.r.fetch(new Request("https://room/end", { method: "POST" }));

    expect(await store.get("WXYZ", "opening")).toBeNull();
    expect(await store.get("OTHR", "opening")).not.toBeNull();
  });
});

describe("PartyRoom Durable Object: Stitch without a speech binding", () => {
  it("tells the Player the check is unavailable, keeps no clip, and leaves the Room's one alarm alone", async () => {
    const t = room();
    const { hostToken } = (await t.post("/create", { code: "WXYZ" })) as { hostToken: string };
    const ana = (await t.post("/join", { nickname: "Ana" })) as { token: string };
    const host = t.socket("h");
    const sa = t.socket("a");
    await t.r.webSocketMessage(host as unknown as WebSocket, JSON.stringify({ t: "hello", token: hostToken }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "hello", token: ana.token }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "stitchSetting", on: true }));
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "stitchAnswer", yes: true, tick: true }));
    const alarmBefore = t.parts.alarm.at;
    await t.r.webSocketMessage(sa as unknown as WebSocket, JSON.stringify({ t: "stitchClip", word: "here", audio: "AAECAwQFBgc=", contentType: "audio/webm", durationMs: 800 }));
    expect(sa.sent.some((m) => (m as { t: string; reason?: string }).t === "stitchResult" && (m as { reason: string }).reason === "check_unavailable")).toBe(true);
    expect([...t.parts.data.keys()].filter((k) => k.startsWith("clip:"))).toEqual([]);
    expect(t.parts.alarm.at).toBe(alarmBefore);
  });
});

describe("PartyRoom: the sky at the start (conditions 3.3, party-mode 4.18)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  async function startWith(env: Parameters<typeof room>[0], place: unknown) {
    const t = room(env);
    const { hostToken } = (await t.post("/create", { code: "WXYZ" })) as { hostToken: string };
    const ana = (await t.post("/join", { nickname: "Ana" })) as { token: string };
    const ben = (await t.post("/join", { nickname: "Ben" })) as { token: string };
    const host = t.socket("h");
    const sa = t.socket("a");
    const sb = t.socket("b");
    const say = (s: FakeSocket, m: unknown) => t.r.webSocketMessage(s as unknown as WebSocket, JSON.stringify(m));
    await say(host, { t: "hello", token: hostToken });
    await say(sa, { t: "hello", token: ana.token });
    await say(sb, { t: "hello", token: ben.token });
    await say(sa, { t: "world", id: "gallery-1", walkRadius: 9 });
    await say(sa, { t: "roomSettings", conditions: "place", place });
    await say(sa, { t: "start" });
    return { t, host, sa };
  }
  const atmosphere = (s: FakeSocket) => s.sent.filter((m) => (m as { t: string }).t === "setAtmosphere") as { t: string }[];

  it("with the service off, makes no outside call, starts, and gives the Host only the three cosmetic fields", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("no outside call is allowed"); });
    vi.stubGlobal("fetch", fetchSpy);
    const { t, host, sa } = await startWith({ CONDITIONS_ENABLED: "false" }, { lat: 48.8566, lon: 2.3522, label: "Paris" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sa.sent.some((m) => (m as { t: string }).t === "private")).toBe(true);
    const got = atmosphere(host);
    expect(got).toHaveLength(1);
    expect(Object.keys(got[0]!).sort()).toEqual(["moon", "t", "timeOfDay", "weather"]);
    expect(JSON.stringify([...t.parts.data.values()])).not.toMatch(/48\.86|2\.35|Paris/);
  });

  it("with the weather host failing, still starts and keeps no place", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("down"); });
    vi.stubGlobal("fetch", fetchSpy);
    const { t, sa } = await startWith({ WEATHER_BASE_URL: "https://weather.example.test" }, { lat: 48.8566, lon: 2.3522, label: "Paris" });
    expect(sa.sent.some((m) => (m as { t: string }).t === "private")).toBe(true);
    expect(JSON.stringify([...t.parts.data.values()])).not.toMatch(/48\.86|2\.35|Paris/);
  });
});
