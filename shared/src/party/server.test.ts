import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "./server";

/** Fake storage, sockets, clock and randomness. Storage survives a new RoomCore, as a Durable Object's does. */
function fakes(seed = 1) {
  const disk: { text: string | undefined; alarm: number | null; deleted: number } = { text: undefined, alarm: null, deleted: 0 };
  const inbox = new Map<string, unknown[]>();
  const closed = new Map<string, { code: number; reason: string }>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(seed);
  const ports: Ports = {
    load: async () => disk.text,
    save: async (t) => { disk.text = t; },
    deleteAll: async () => { disk.text = undefined; disk.deleted++; },
    setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); },
    close: (sid, code, reason) => { closed.set(sid, { code, reason }); },
    now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, inbox, closed, clock, of };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

async function lobby(seed = 1) {
  const f = fakes(seed);
  const core = new RoomCore(f.ports);
  const { hostToken } = await core.create("ABCD");
  const a = await core.join("Ana");
  const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "ana", { t: "hello", token: a.token });
  await say(core, "ben", { t: "hello", token: b.token });
  return { f, core, a, b, hostToken };
}

describe("RoomCore: the lobby", () => {
  it("seats Players, makes the first the Master, lets only the Master add a Bot and start, and tells every socket", async () => {
    const { f, core, a, b } = await lobby();
    expect(a.seat).toBe(1);
    expect(f.of("ana", "welcome")[0]).toMatchObject({ role: "controller", seat: 1 });
    expect(f.of("host", "welcome")[0]).toMatchObject({ role: "host", seat: null });
    await say(core, "ben", { t: "addBot" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });
    await say(core, "ana", { t: "addBot" });
    expect((f.of("host", "lobby").at(-1) as { seats: unknown[] }).seats).toHaveLength(3);
    await say(core, "ben", { t: "start" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });
    await say(core, "ana", { t: "start" });
    expect(f.of("host", "public").at(-1)).toMatchObject({ t: "public", view: { phase: "playing" } });
    expect(await core.join("Late")).toEqual({ ok: false, code: "game_started" });
    expect(b.seat).toBe(2);
  });

  it("closes a socket that sends a bad token, junk, or anything before hello", async () => {
    const { f, core } = await lobby();
    await say(core, "x1", { t: "hello", token: "f".repeat(32) });
    expect(f.closed.get("x1")).toEqual({ code: 4403, reason: "bad_token" });
    await core.message("x2", "{not json");
    expect(f.closed.get("x2")?.code).toBe(4400);
    await say(core, "x3", { t: "start" });
    expect(f.closed.get("x3")?.code).toBe(4401);
    await say(core, "ana", { t: "walk", zone: "z1", extra: 1 });
    expect(f.closed.get("ana")?.code).toBe(4400);
  });
});

describe("RoomCore: the game", () => {
  it("sends each phone only its own Private View, the TV only the public one", async () => {
    const { f, core } = await lobby(3);
    await say(core, "ana", { t: "addBot" });
    await say(core, "ana", { t: "start" });
    for (const [sid, seat] of [["ana", 1], ["ben", 2]] as const) for (const m of f.of(sid, "private")) expect((m.view as { seat: number }).seat).toBe(seat);
    expect(f.of("host", "private")).toEqual([]);
    for (const m of f.of("host")) expect(JSON.stringify(m)).not.toMatch(/"hand"|"shownToMe"|"found"/);
  });

  it("saves before sending and picks up after a restart, from storage alone", async () => {
    const { f, core } = await lobby(5);
    await say(core, "ana", { t: "start" });
    const saved = f.disk.text;
    expect(saved).toBeDefined();
    const before = JSON.parse(saved!).engine;
    const fresh = new RoomCore(f.ports); // the Durable Object was evicted and woke up again: it knows only storage
    const active = before.turn.seat as number;
    await say(fresh, active === 1 ? "ana" : "ben", { t: "pass" }); // the sockets were saved too, so no new hello is needed
    const after = JSON.parse(f.disk.text!).engine;
    expect(after.phase).toBe("playing");
    expect(after.turn.seat).not.toBe(active);
    expect(after.turnNo).toBe(before.turnNo + 1);
  });

  it("runs a whole game on the alarm alone when the Players only pass, and ends it", async () => {
    const { f, core } = await lobby(7);
    await say(core, "ana", { t: "addBot" });
    await say(core, "ana", { t: "start" });
    for (let k = 0; k < 5000; k++) {
      const st = JSON.parse(f.disk.text!);
      if (st.engine.phase === "ended") break;
      const active = st.engine.turn?.seat;
      if (active === 1) { await say(core, "ana", { t: "pass" }); continue; }
      if (active === 2) { await say(core, "ben", { t: "pass" }); continue; }
      f.clock.t = Math.max(f.clock.t + 1, f.disk.alarm ?? f.clock.t + 1000);
      await core.alarm();
    }
    expect(JSON.parse(f.disk.text!).engine.phase).toBe("ended");
    expect(f.of("host", "public").at(-1)).toMatchObject({ view: { phase: "ended" } });
  });

  it("a dropped phone is told to the Engine; the Master or the host can end the Room, which deletes everything", async () => {
    const { f, core, hostToken } = await lobby(9);
    await say(core, "ana", { t: "start" });
    await core.socketClosed("ben");
    expect(JSON.parse(f.disk.text!).engine.players.find((p: { seat: number }) => p.seat === 2).connected).toBe(false);
    await say(core, "ben", { t: "end" }); // ben's socket is gone: refused as unknown
    expect(f.closed.get("ben")?.code).toBe(4401);
    await say(core, "host2", { t: "hello", token: hostToken });
    await say(core, "host2", { t: "end" });
    expect(f.disk.text).toBeUndefined();
    expect(f.disk.deleted).toBe(1);
    expect(f.closed.get("ana")?.code).toBe(4000);
  });

  it("an idle Room is deleted at its time to live", async () => {
    const { f, core } = await lobby(11);
    expect(f.disk.alarm).toBe(JSON.parse(f.disk.text!).room ? JSON.parse(JSON.parse(f.disk.text!).room).lastActiveMs + 6 * 3600_000 : 0);
    f.clock.t += 6 * 3600_000;
    await core.alarm();
    expect(f.disk.text).toBeUndefined();
  });
});
