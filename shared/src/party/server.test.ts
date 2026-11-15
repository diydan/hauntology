import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { BOT_THINK_MAX_MS, BOT_THINK_MIN_MS } from "./engine";
import { MAX_MESSAGES_PER_SECOND, RoomCore, type Ports } from "./server";

/** Fake storage, sockets, clock and randomness. Storage survives a new RoomCore, as a Durable Object's does. */
function fakes(seed = 1) {
  const disk: { text: string | undefined; alarm: number | null; deleted: number } = { text: undefined, alarm: null, deleted: 0 };
  const inbox = new Map<string, unknown[]>();
  const closed = new Map<string, { code: number; reason: string }>();
  const clock = { t: 1_000_000 };
  const ended: string[] = [];
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
    ended: async (code) => { ended.push(code); },
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, inbox, closed, clock, of, ended };
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
    expect(f.of("host", "lobby").at(-1)?.["seats"] as unknown[]).toHaveLength(3);
    await say(core, "ben", { t: "start" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });
    await say(core, "ana", { t: "start" });
    expect(f.of("host", "public").at(-1)).toMatchObject({ t: "public", view: { phase: "playing" } });
    expect(await core.join("Late")).toEqual({ ok: false, code: "game_started" });
    expect(b.seat).toBe(2);
  });

  it("refuses a socket's messages past the per-second limit unread, and takes them again the next second", async () => {
    const { f, core } = await lobby();
    f.clock.t += 1000; // a fresh second: the hellos counted in the last one
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND; i++) await say(core, "ben", { t: "addBot" });
    expect(f.of("ben", "refused").filter((m) => m.code === "rate_limited")).toEqual([]);
    await say(core, "ana", { t: "addBot" }); // another socket has its own count
    expect(f.of("ana", "refused")).toEqual([]);
    await say(core, "ben", { t: "addBot" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "rate_limited" });
    f.clock.t += 1000;
    await say(core, "ben", { t: "addBot" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });
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
    expect(f.ended).toEqual(["ABCD"]);
    expect(f.closed.get("ana")?.code).toBe(4000);
  });

  it("an idle Room is deleted at its time to live", async () => {
    const { f, core } = await lobby(11);
    expect(f.disk.alarm).toBe(JSON.parse(f.disk.text!).room ? JSON.parse(JSON.parse(f.disk.text!).room).lastActiveMs + 6 * 3600_000 : 0);
    f.clock.t += 6 * 3600_000;
    await core.alarm();
    expect(f.disk.text).toBeUndefined();
    expect(f.ended).toEqual(["ABCD"]);
  });
});

describe("RoomCore: the Bot runner (integration 3.3, 3.4)", () => {
  async function botRoom(seed: number) {
    const f = fakes(seed);
    const core = new RoomCore(f.ports);
    const { hostToken } = await core.create("BOTS");
    await say(core, "tv", { t: "hello", token: hostToken });
    return { f, core };
  }

  it("only the host starts an all-Bot game, and only in a lobby with no human", async () => {
    const f = fakes(2);
    const core = new RoomCore(f.ports);
    const { hostToken } = await core.create("BOTS");
    const a = await core.join("Ana");
    if (!a.ok) throw new Error("join");
    await say(core, "ana", { t: "hello", token: a.token });
    await say(core, "ana", { t: "startBots" });
    expect(f.of("ana", "refused").at(-1)).toEqual({ t: "refused", code: "not_host" });
    await say(core, "tv", { t: "hello", token: hostToken });
    await say(core, "tv", { t: "startBots" });
    expect(f.of("tv", "refused").at(-1)).toEqual({ t: "refused", code: "players_seated" });
    const g = await botRoom(3);
    await say(g.core, "tv", { t: "startBots", bots: 3 });
    expect(JSON.parse(g.f.disk.text!).engine.phase).toBe("playing");
    await say(g.core, "tv", { t: "startBots" });
    expect(g.f.of("tv", "refused").at(-1)).toEqual({ t: "refused", code: "already_started" });
  });

  for (const seed of [11, 12, 13]) {
    it(`a whole all-Bot game runs to the ending on the alarm alone, each Bot thinking 1.5 to 6 s (seed ${seed})`, async () => {
      const { f, core } = await botRoom(seed);
      await say(core, "tv", { t: "startBots", bots: 4 });
      let lastLog = JSON.parse(f.disk.text!).engine.log.length as number;
      let lastActMs = f.clock.t;
      let wakes = 0;
      let actions = 0;
      for (; wakes < 20_000; wakes++) {
        const st = JSON.parse(f.disk.text!).engine;
        if (st.phase === "ended") break;
        expect(f.disk.alarm).not.toBeNull();
        f.clock.t = Math.max(f.clock.t, f.disk.alarm!);
        await core.alarm();
        const after = JSON.parse(f.disk.text!).engine;
        const fresh = after.log.slice(lastLog) as { kind: string }[];
        const acted = fresh.filter((e) => ["visit", "suggest", "inspect", "seal"].includes(e.kind));
        if (acted.length > 0) { expect(f.clock.t - lastActMs).toBeGreaterThanOrEqual(BOT_THINK_MIN_MS); actions += acted.length; }
        if (acted.length > 0 || fresh.some((e) => e.kind === "turn-start")) lastActMs = f.clock.t;
        lastLog = after.log.length;
      }
      const end = JSON.parse(f.disk.text!).engine;
      expect(end.phase).toBe("ended");
      expect(f.of("tv", "public").at(-1)).toMatchObject({ view: { phase: "ended" } });
      expect(end.turnNo).toBeGreaterThanOrEqual(8);
      expect(actions).toBeGreaterThanOrEqual(end.turnNo);
      expect(BOT_THINK_MAX_MS).toBeGreaterThan(BOT_THINK_MIN_MS);
    });
  }

  it("Play again: after an ending, a new deal with the same seats; not before the end, and only by the Master", async () => {
    const { f, core } = await botRoom(21);
    await say(core, "tv", { t: "startBots", bots: 3 });
    await say(core, "tv", { t: "playAgain" });
    expect(f.of("tv", "refused").at(-1)).toEqual({ t: "refused", code: "not_ended" });
    for (let k = 0; k < 20_000 && JSON.parse(f.disk.text!).engine.phase !== "ended"; k++) { f.clock.t = Math.max(f.clock.t, f.disk.alarm!); await core.alarm(); }
    const before = JSON.parse(f.disk.text!);
    expect(before.engine.phase).toBe("ended");
    await say(core, "tv", { t: "playAgain" });
    const after = JSON.parse(f.disk.text!);
    expect(after.engine.phase).toBe("playing");
    expect(after.engine.seats).toEqual(before.engine.seats);
    expect(after.engine.seed).not.toBe(before.engine.seed);
    expect(after.engine.deal).not.toEqual(before.engine.deal);
  });

  it("the public view names every Suspect and Relic, so a screen can offer them", async () => {
    const { f, core } = await botRoom(22);
    await say(core, "tv", { t: "startBots", bots: 3 });
    const view = f.of("tv", "public").at(-1)!.view as { suspects: { id: string; name: string }[]; relics: { name: string }[] };
    expect(view.suspects).toHaveLength(6);
    for (const x of view.suspects) expect(x.name).not.toBe("A visitor's ghost");
    expect(new Set(view.suspects.map((x) => x.name)).size).toBe(6);
    expect(view.relics.map((x) => x.name)).toContain("locket");
  });
});
