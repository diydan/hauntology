import { describe, expect, it } from "vitest";
import { fakeState } from "../worlds/fake-cloudflare";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { PartyDirectory } from "./party-directory";
import { PartyRoom } from "./party-room";

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
});
