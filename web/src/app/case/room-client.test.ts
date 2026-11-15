import { describe, expect, it } from "vitest";
import { openRoom, RoomError, startSolo, type RoomDeps, type SocketLike } from "./room-client";

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(readonly url: string) {}
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close(code = 1000) { this.closedWith = code; }
  open() { this.onopen?.({}); }
  say(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

function deps(answers: Record<string, { status?: number; body: unknown }>) {
  const sockets: FakeSocket[] = [];
  const calls: { url: string; body: unknown }[] = [];
  const d: RoomDeps = {
    fetch: async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const a = answers[url] ?? { status: 404, body: { code: "room_unknown" } };
      return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
    },
    openSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    socketOrigin: "ws://here",
  };
  return { d, sockets, calls };
}

describe("startSolo", () => {
  it("makes a Room (replacing the visitor's old one), sits as seat 1, then sends hello, the preset, puzzles off, the Bots and start, in order", async () => {
    const { d, sockets, calls } = deps({ "/api/party": { body: { code: "ABCD", hostToken: "h" } }, "/api/party/ABCD/join": { body: { ok: true, seat: 1, token: "t".repeat(32) } } });
    const c = await startSolo(d, { preset: "gentle", bots: 3 });
    expect(calls[0]).toEqual({ url: "/api/party", body: { replace: true } });
    expect(calls[1]).toEqual({ url: "/api/party/ABCD/join", body: { nickname: "You" } });
    const ws = sockets[0]!;
    expect(ws.url).toBe("ws://here/api/party/ABCD/ws");
    expect(ws.sent).toEqual([]); // nothing goes before the socket opens
    ws.open();
    expect(ws.sent.map((m) => m.t)).toEqual(["hello", "settings", "settings", "addBot", "addBot", "addBot", "start"]);
    expect(ws.sent[0]).toEqual({ t: "hello", token: "t".repeat(32) });
    expect(ws.sent[1]).toEqual({ t: "settings", preset: "gentle" });
    expect(ws.sent[2]).toEqual({ t: "settings", puzzles: "off" });
    expect(c.getSnapshot().status).toBe("connecting");
  });

  it("fails with the Room's own reason when it cannot make or join the Room", async () => {
    const full = deps({ "/api/party": { status: 429, body: { code: "rooms_full" } } });
    await expect(startSolo(full.d, { preset: "classic", bots: 2 })).rejects.toEqual(new RoomError("rooms_full"));
    expect(full.sockets).toEqual([]);
  });
});

describe("openRoom", () => {
  it("keeps the latest views, shows a refusal until the next public view, and follows the phase", () => {
    const { d, sockets } = deps({});
    const c = openRoom(d, "ABCD", "t");
    const ws = sockets[0]!;
    ws.open();
    ws.say({ t: "welcome", role: "controller", seat: 1 });
    ws.say({ t: "lobby" });
    expect(c.getSnapshot()).toMatchObject({ seat: 1, status: "lobby" });
    ws.say({ t: "public", view: { phase: "playing" } });
    ws.say({ t: "private", view: { seat: 1, hand: [] } });
    ws.say({ t: "refused", code: "not_your_turn" });
    expect(c.getSnapshot()).toMatchObject({ status: "playing", refused: "not_your_turn", private: { seat: 1 } });
    ws.say({ t: "public", view: { phase: "ended" } });
    expect(c.getSnapshot()).toMatchObject({ status: "ended", refused: null });
    ws.onmessage?.({ data: "{not json" });
    expect(c.getSnapshot().status).toBe("ended");
  });

  it("close ends the Room: sent at once when open, or as soon as the socket opens", () => {
    const a = deps({});
    const open = openRoom(a.d, "ABCD", "t");
    a.sockets[0]!.open();
    open.close();
    expect(a.sockets[0]!.sent.at(-1)).toEqual({ t: "end" });
    expect(a.sockets[0]!.closedWith).toBe(1000);
    open.close();
    expect(a.sockets[0]!.sent.filter((m) => m.t === "end")).toHaveLength(1);

    const b = deps({});
    const early = openRoom(b.d, "ABCD", "t");
    early.close();
    expect(b.sockets[0]!.sent).toEqual([]);
    b.sockets[0]!.open();
    expect(b.sockets[0]!.sent).toEqual([{ t: "hello", token: "t" }, { t: "end" }]);
    expect(early.getSnapshot().status).toBe("closed");
  });
});
