import { describe, expect, it } from "vitest";
import type { RoomDeps, SocketLike } from "../app/case/room-client";
import { createRoomPort } from "./room-port";

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

const TOKEN = "a".repeat(32);
function kit(join: { status?: number; body: unknown } | "throw" = { body: { ok: true, seat: 2, token: TOKEN } }) {
  const sockets: FakeSocket[] = [];
  const calls: { url: string; body: unknown }[] = [];
  const d: RoomDeps = {
    fetch: async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (join === "throw") throw new Error("offline");
      return new Response(JSON.stringify(join.body), { status: join.status ?? 200 });
    },
    openSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    socketOrigin: "ws://here",
    now: () => 10_000,
  };
  return { port: createRoomPort(d), sockets, calls };
}
const LOCK = { t: "lock", lockId: "L1", level: 1, attempts: 3, deadlineAt: 40_000, faded: null, view: { kind: "safe" } };

describe("the Controller's real Room port (integration 5.1, 5.3)", () => {
  it("joins by code over HTTP, then opens the socket with the token; the view says connecting, seated, in the lobby", async () => {
    const { port, sockets, calls } = kit();
    expect(port.getView().seat).toBeNull();
    const r = await port.join("ABCD", "Pip");
    expect(r).toEqual({ ok: true, seat: 2, nickname: "Pip" });
    expect(calls).toEqual([{ url: "/api/party/ABCD/join", body: { nickname: "Pip" } }]);
    expect(sockets[0]!.url).toBe("ws://here/api/party/ABCD/ws");
    expect(port.getView()).toMatchObject({ connection: "connecting", phase: "lobby", code: "ABCD", seat: 2, nickname: "Pip", master: null, lock: null });
    sockets[0]!.open();
    expect(sockets[0]!.sent[0]).toEqual({ t: "hello", token: TOKEN });
  });

  it("keeps the seat the join gave when the Room's first words come before its welcome", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    sockets[0]!.open();
    sockets[0]!.say({ t: "lobby", masterSeat: 2 });
    expect(port.getView()).toMatchObject({ seat: 2, master: { puzzles: "off" } });
  });

  it("keeps the Room's three refusals as they are and calls every other trouble 'unreachable', opening no socket", async () => {
    for (const code of ["room_full", "game_started", "room_unknown"] as const) {
      const k = kit({ status: 409, body: { ok: false, code } });
      expect(await k.port.join("ABCD", "Pip")).toEqual({ ok: false, code });
      expect(k.sockets).toEqual([]);
    }
    expect(await kit({ status: 500, body: { code: "boom" } }).port.join("ABCD", "Pip")).toEqual({ ok: false, code: "unreachable" });
    expect(await kit("throw").port.join("ABCD", "Pip")).toEqual({ ok: false, code: "unreachable" });
  });

  it("follows the Room: online, the Master named in its lobby word, the phase, and offline when the socket closes", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    const ws = sockets[0]!;
    ws.open();
    ws.say({ t: "welcome", role: "controller", seat: 2 });
    ws.say({ t: "lobby", masterSeat: 1 });
    expect(port.getView()).toMatchObject({ connection: "online", phase: "lobby", master: null });
    ws.say({ t: "lobby", masterSeat: 2 });
    expect(port.getView().master).toEqual({ puzzles: "off", preset: "classic" });
    ws.say({ t: "public", view: { phase: "playing", paused: false, puzzleSetting: "medium" } });
    expect(port.getView()).toMatchObject({ phase: "playing", master: { puzzles: "medium" } });
    ws.say({ t: "public", view: { phase: "playing", paused: true, puzzleSetting: "medium" } });
    expect(port.getView().phase).toBe("paused");
    ws.say({ t: "public", view: { phase: "ended", paused: false, puzzleSetting: "medium" } });
    expect(port.getView().phase).toBe("ended");
    ws.onclose?.({ code: 1006 });
    expect(port.getView().connection).toBe("offline");
  });

  it("gives the game views and the last refusal to the screen", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    const ws = sockets[0]!;
    ws.open();
    ws.say({ t: "public", view: { phase: "playing", paused: false, puzzleSetting: "off" } });
    ws.say({ t: "private", view: { seat: 2, hand: [] } });
    ws.say({ t: "refused", code: "not_your_turn" });
    expect(port.getView().game).toMatchObject({ pub: { phase: "playing" }, priv: { seat: 2 } });
    expect(port.getView().refused).toBe("not_your_turn");
    ws.say({ t: "public", view: { phase: "playing", paused: false, puzzleSetting: "off" } });
    expect(port.getView().refused).toBeUndefined();
  });

  it("shows a Lock the Room gives, takes Attempts and answers from the Room's word, and a give-up goes to the Room", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    const ws = sockets[0]!;
    ws.open();
    ws.say(LOCK);
    expect(port.getView().lock).toMatchObject({ id: "L1", kind: "safe", attempts: 3, capMs: 30_000, faded: null, clue: null });
    const reply = port.attempt("L1", { kind: "safe" } as never);
    expect(ws.sent.at(-1)).toEqual({ t: "attempt", lockId: "L1", transcript: { kind: "safe" } });
    ws.say({ t: "lockResult", lockId: "L1", outcome: "wrong", attemptsLeft: 2 });
    await expect(reply).resolves.toEqual({ outcome: "wrong", attemptsLeft: 2 });
    port.closeLock("L1", "gave_up");
    expect(ws.sent.at(-1)).toEqual({ t: "giveUp", lockId: "L1" });
    expect(port.getView().lock).toBeNull();
  });

  it("sends the Player's settings and game messages as the Room's own words", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    const ws = sockets[0]!;
    ws.open();
    port.setPuzzles("hard");
    port.setSound?.(false);
    port.setAssist?.(true);
    port.setCluePlace?.("world");
    port.setErrands?.(true);
    port.setErrandOptOut?.(true);
    port.act?.({ t: "walk", zone: "z1" });
    expect(ws.sent.slice(1)).toEqual([
      { t: "settings", puzzles: "hard" }, { t: "sound", consent: false }, { t: "assist", on: true }, { t: "settings", cluePlace: "world" },
      { t: "settings", errands: true }, { t: "errandOptOut", on: true }, { t: "walk", zone: "z1" },
    ]);
  });

  it("leaving gives up the seat without ending the Room, and the join page comes back", async () => {
    const { port, sockets } = kit();
    await port.join("ABCD", "Pip");
    const ws = sockets[0]!;
    ws.open();
    const seen: (number | null)[] = [];
    port.subscribe((v) => seen.push(v.seat));
    await port.leave();
    expect(ws.sent.some((m) => m.t === "end")).toBe(false);
    expect(ws.closedWith).toBe(1000);
    expect(port.getView().seat).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });
});
