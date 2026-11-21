import { describe, expect, it } from "vitest";
import { checkWorld, openRoom, RoomError, startSolo, type RoomDeps, type SocketLike } from "./room-client";

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
    now: () => 10_000,
  };
  return { d, sockets, calls };
}

describe("startSolo", () => {
  it("makes a Room (replacing the visitor's old one), sits as seat 1, then sends hello, the preset (which carries the puzzle level), the Bots and start, in order", async () => {
    const { d, sockets, calls } = deps({ "/api/party": { body: { code: "ABCD", hostToken: "h" } }, "/api/party/ABCD/join": { body: { ok: true, seat: 1, token: "t".repeat(32) } } });
    const c = await startSolo(d, { preset: "gentle", bots: 3 });
    expect(calls[0]).toEqual({ url: "/api/party", body: { replace: true } });
    expect(calls[1]).toEqual({ url: "/api/party/ABCD/join", body: { nickname: "You" } });
    const ws = sockets[0]!;
    expect(ws.url).toBe("ws://here/api/party/ABCD/ws");
    expect(ws.sent).toEqual([]); // nothing goes before the socket opens
    ws.open();
    expect(ws.sent.map((m) => m.t)).toEqual(["hello", "settings", "addBot", "addBot", "addBot", "start"]);
    expect(ws.sent[0]).toEqual({ t: "hello", token: "t".repeat(32) });
    expect(ws.sent[1]).toEqual({ t: "settings", preset: "gentle" });
    expect(c.getSnapshot().status).toBe("connecting");
    expect(c.getSnapshot().hostToken).toBe("h");
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

describe("checkWorld", () => {
  const world = (half: number) => ({ "/api/worlds/w1": { body: { id: "w1", status: "ready", manifest: { bounds: { min: [-half, 0, -half], max: [half, 3, half] } } } } });
  it("lets a case start in a big enough world, and refuses a small one as world_too_small", async () => {
    await expect(checkWorld(deps(world(8)).d, "w1", { preset: "classic", bots: 2 })).resolves.toBeUndefined();
    await expect(checkWorld(deps(world(7)).d, "w1", { preset: "classic", bots: 2 })).resolves.toBeUndefined();
    await expect(checkWorld(deps(world(6.9)).d, "w1", { preset: "classic", bots: 2 })).rejects.toEqual(new RoomError("world_too_small"));
  });
  it("starts no case on a world it cannot read", async () => {
    await expect(checkWorld(deps({}).d, "w1", { preset: "classic", bots: 2 })).rejects.toEqual(new RoomError("case_failed"));
  });
});

describe("openRoom voice protocol", () => {
  it("tracks speech toggle, voice cues, and prefetch lists on the Host snapshot", () => {
    const { d, sockets } = deps({});
    const c = openRoom(d, "ABCD", "t", { hostToken: "host-sec" });
    const ws = sockets[0]!;
    ws.open();
    ws.say({ t: "speech", on: true });
    expect(c.getSnapshot().speechOn).toBe(true);
    ws.say({ t: "prefetch", lineIds: ["lib-1", "lib-2"] });
    expect(c.getSnapshot().prefetch).toEqual(["lib-1", "lib-2"]);
    ws.say({ t: "voice", lineId: "l-1", text: "Cold air.", kind: "haunt" });
    expect(c.getSnapshot().voice).toEqual({ seq: 1, lineId: "l-1", text: "Cold air.", kind: "haunt" });
    expect(c.getSnapshot().hostToken).toBe("host-sec");
  });
});

describe("Locks and Sights in the solo case (integration 5.3)", () => {
  const lockMsg = { t: "lock", lockId: "L1", level: 2, attempts: 3, deadlineAt: 70_000, faded: null, view: { kind: "safe", level: 2 } };
  const open = () => {
    const { d, sockets } = deps({});
    const c = openRoom(d, "ABCD", "t");
    const ws = sockets[0]!;
    ws.open();
    return { c, ws };
  };

  it("a lock the Room gives becomes the open Lock, with its Cap counted from now, and nothing is sent back", () => {
    const { c, ws } = open();
    ws.say(lockMsg);
    expect(c.getSnapshot().lock).toMatchObject({ id: "L1", kind: "safe", attempts: 3, capMs: 60_000, faded: null });
    expect(ws.sent.map((m) => m.t)).toEqual(["hello"]);
  });

  it("an Attempt is sent with its transcript and answered by the Room's next result: wrong, then solved", async () => {
    const { c, ws } = open();
    ws.say(lockMsg);
    const first = c.attempt("L1", { kind: "safe", moves: [] } as never);
    expect(ws.sent.at(-1)).toEqual({ t: "attempt", lockId: "L1", transcript: { kind: "safe", moves: [] } });
    ws.say({ t: "lockResult", lockId: "L1", outcome: "wrong", attemptsLeft: 2 });
    await expect(first).resolves.toEqual({ outcome: "wrong", attemptsLeft: 2 });
    expect(c.getSnapshot().lock?.attempts).toBe(2);
    const second = c.attempt("L1", { kind: "safe", moves: [] } as never);
    ws.say({ t: "lockResult", lockId: "L1", outcome: "solved", zone: "z1", card: null });
    await expect(second).resolves.toEqual({ outcome: "solved" });
    expect(c.getSnapshot().lock).not.toBeNull(); // stays up until the Player taps Done
  });

  it("failed after an Attempt is answered as failed; Done (finished) clears the Lock and sends nothing", async () => {
    const { c, ws } = open();
    ws.say(lockMsg);
    const r = c.attempt("L1", { kind: "safe", moves: [] } as never);
    ws.say({ t: "lockResult", lockId: "L1", outcome: "failed" });
    await expect(r).resolves.toMatchObject({ outcome: "failed" });
    const before = ws.sent.length;
    c.closeLock("L1", "finished");
    expect(c.getSnapshot().lock).toBeNull();
    expect(ws.sent).toHaveLength(before);
  });

  it("giving up or running out of time tells the Room (giveUp) and clears the Lock", () => {
    for (const why of ["gave_up", "time_up"] as const) {
      const { c, ws } = open();
      ws.say(lockMsg);
      c.closeLock("L1", why);
      expect(ws.sent.at(-1)).toEqual({ t: "giveUp", lockId: "L1" });
      expect(c.getSnapshot().lock).toBeNull();
    }
  });

  it("a result nobody asked for (the Turn ended) clears the Lock, and a result for another Lock changes nothing", () => {
    const { c, ws } = open();
    ws.say(lockMsg);
    ws.say({ t: "lockResult", lockId: "OTHER", outcome: "failed" });
    expect(c.getSnapshot().lock?.id).toBe("L1");
    ws.say({ t: "lockResult", lockId: "L1", outcome: "failed" });
    expect(c.getSnapshot().lock).toBeNull();
  });

  it("a Sight is shown once and acknowledged by id; the next waits its turn", () => {
    const { c, ws } = open();
    ws.say({ t: "sight", sightId: "S1", sight: { showMs: 4000 } });
    ws.say({ t: "sight", sightId: "S2", sight: { showMs: 3000 } });
    expect(c.getSnapshot().sight).toMatchObject({ id: "S1" });
    c.ackSight("S1");
    expect(ws.sent.at(-1)).toEqual({ t: "sightAck", sightId: "S1" });
    expect(c.getSnapshot().sight).toMatchObject({ id: "S2" });
    c.ackSight("S2");
    expect(c.getSnapshot().sight).toBeNull();
  });
});

