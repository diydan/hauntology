import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "./server";

function fakes(seed = 3, requireWorld = true) {
  const disk: { text: string | undefined; alarm: number | null } = { text: undefined, alarm: null };
  const inbox = new Map<string, unknown[]>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(seed);
  const ports: Ports = {
    load: async () => disk.text,
    save: async (t) => { disk.text = t; },
    deleteAll: async () => { disk.text = undefined; },
    setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); },
    close: () => {},
    now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
    requireWorld: () => requireWorld,
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, clock, of };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));
const BIG = { t: "world", id: "kitchen", walkRadius: 9, authoredZones: false };

async function lobby(requireWorld = true) {
  const f = fakes(3, requireWorld);
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const a = await core.join("Ana");
  const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "disp", { t: "hello", token: displayToken });
  await say(core, "ana", { t: "hello", token: a.token });
  await say(core, "ben", { t: "hello", token: b.token });
  return { f, core, a, b };
}

describe("RoomCore: the world (party-mode 4.3, 4.11)", () => {
  it("refuses start with world_not_set, then starts once the Master chose a world", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", { t: "start" });
    expect(f.of("ana", "refused").at(-1)).toMatchObject({ code: "world_not_set" });
    await say(core, "ana", BIG);
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ worldId: "kitchen" });
    await say(core, "ana", { t: "start" });
    expect(f.of("ana", "private").length).toBeGreaterThan(0);
  });
  it("a Room that does not require a world still starts without one", async () => {
    const { f, core } = await lobby(false);
    await say(core, "ana", { t: "start" });
    expect(f.of("ana", "refused")).toHaveLength(0);
    expect(f.of("ana", "private").length).toBeGreaterThan(0);
  });
  it("refuses a world under 7 m with no authored Zones as world_too_small, and accepts it with authored Zones", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", { t: "world", id: "closet", walkRadius: 5 });
    expect(f.of("ana", "refused").at(-1)).toMatchObject({ code: "world_too_small" });
    await say(core, "ana", { t: "start" });
    expect(f.of("ana", "refused").at(-1)).toMatchObject({ code: "world_not_set" });
    await say(core, "ana", { t: "world", id: "closet", walkRadius: 5, authoredZones: true });
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ worldId: "closet" });
  });
  it("only the Master chooses the world, and not after the start", async () => {
    const { f, core } = await lobby();
    await say(core, "ben", BIG);
    expect(f.of("ben", "refused").at(-1)).toMatchObject({ code: "not_master" });
    await say(core, "ana", BIG);
    await say(core, "ana", { t: "start" });
    await say(core, "ana", { ...BIG, id: "other" });
    expect(f.of("ana", "refused").at(-1)).toMatchObject({ code: "game_started" });
  });
  it("the choice survives a new RoomCore on the same storage", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", BIG);
    const again = new RoomCore(f.ports);
    await say(again, "ana", { t: "hello", token: (JSON.parse(f.disk.text as string) as { room: string }).room.match(/"token":"([0-9a-f]{32})"/)![1] });
    await say(again, "ana", { t: "start" });
    expect(f.of("ana", "refused").filter((m) => m.code === "world_not_set")).toHaveLength(0);
  });
});

async function playing() {
  const l = await lobby();
  await say(l.core, "ana", BIG);
  await say(l.core, "ana", { t: "start" });
  return l;
}
const activeOf = (f: ReturnType<typeof fakes>): number => (f.of("host", "public").at(-1)!.view as { active: number }).active;

describe("RoomCore: input and pose (party-mode 4.5)", () => {
  it("relays only the active Detective's input to the Host, clamped, at most 30 a second, and stores none of it", async () => {
    const { f, core } = await playing();
    const act = activeOf(f);
    const [on, off] = act === 1 ? ["ana", "ben"] : ["ben", "ana"];
    await say(core, off, { t: "input", seq: 1, move: [1, 0], look: [0, 0] });
    expect(f.of("host", "input")).toHaveLength(0);
    await say(core, on, { t: "input", seq: 1, move: [30, 40], look: [500, -500] });
    const got = f.of("host", "input");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ seat: act });
    const inp = got[0]!.input as { move: number[]; look: number[] };
    expect(Math.hypot(inp.move[0]!, inp.move[1]!)).toBeCloseTo(1, 5);
    expect(inp.look).toEqual([60, -60]);
    f.clock.t += 10;
    await say(core, on, { t: "input", seq: 2, move: [1, 0], look: [0, 0] });
    expect(f.of("host", "input")).toHaveLength(1); // inside 34 ms: dropped
    f.clock.t += 40;
    await say(core, on, { t: "input", seq: 3, move: [1, 0], look: [0, 0] });
    expect(f.of("host", "input")).toHaveLength(2);
    expect(f.disk.text).not.toContain('"seq"');
  });
  it("a Display or the Host sending input is ignored", async () => {
    const { f, core } = await playing();
    await say(core, "disp", { t: "input", seq: 1, move: [1, 0], look: [0, 0] });
    await say(core, "host", { t: "input", seq: 1, move: [1, 0], look: [0, 0] });
    expect(f.of("host", "input")).toHaveLength(0);
  });
  it("relays the Host's pose at most 4 times a second, clamped into the world's bounds, to everyone but the Host", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", { ...BIG, bounds: { min: [-5, 0, -5], max: [5, 3, 5] } });
    await say(core, "host", { t: "pose", pos: [99, 1, -99], yaw: 8 });
    const p = f.of("ana", "pose");
    expect(p).toHaveLength(1);
    expect(p[0]!.pos).toEqual([5, 1, -5]);
    expect(p[0]!.yaw as number).toBeGreaterThanOrEqual(-Math.PI);
    expect(p[0]!.yaw as number).toBeLessThan(Math.PI);
    expect(f.of("host", "pose")).toHaveLength(0);
    f.clock.t += 100;
    await say(core, "host", { t: "pose", pos: [1, 1, 1], yaw: 0 });
    expect(f.of("ana", "pose")).toHaveLength(1);
    f.clock.t += 200;
    await say(core, "host", { t: "pose", pos: [1, 1, 1], yaw: 0 });
    expect(f.of("ana", "pose")).toHaveLength(2);
    expect(f.of("disp", "pose")).toHaveLength(2);
  });
  it("a phone cannot send a pose", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", { t: "pose", pos: [1, 1, 1], yaw: 0 });
    expect(f.of("ana", "refused").at(-1)).toMatchObject({ code: "not_host" });
  });
});

describe("RoomCore: clock exchange, light consent and room switches (party-mode 17.3, 9.21)", () => {
  it("answers a ping with a pong at the server's time, and keeps only sane samples", async () => {
    const { f, core } = await lobby();
    await say(core, "ana", { t: "ping", id: 7, clientMs: 123 });
    expect(f.of("ana", "pong")[0]).toEqual({ t: "pong", id: 7, serverMs: 1_000_000 });
    await say(core, "ana", { t: "clockSample", sentMs: 10, serverMs: 1000, receivedMs: 30 });
    await say(core, "ana", { t: "clockSample", sentMs: 50, serverMs: 1000, receivedMs: 20 }); // received before sent
    const saved = JSON.parse(f.disk.text as string) as { extras: { clock: Record<string, unknown[]> } };
    expect(saved.extras.clock["1"]).toHaveLength(1);
  });
  it("records a phone's own light yes and reduced motion", async () => {
    const { f, core } = await lobby();
    await say(core, "ben", { t: "light", consent: true, reducedMotion: true });
    const saved = JSON.parse(f.disk.text as string) as { extras: { light: Record<string, unknown> } };
    expect(saved.extras.light["2"]).toEqual({ consent: true, reducedMotion: true });
  });
  it("only the Master changes the room switches, and only the known ones", async () => {
    const { f, core } = await lobby();
    await say(core, "ben", { t: "roomSettings", rattle: false });
    expect(f.of("ben", "refused").at(-1)).toMatchObject({ code: "not_master" });
    await say(core, "ana", { t: "roomSettings", rattle: false, hourStrike: false, conditions: "place" });
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ switches: { rattle: false, hourStrike: false, conditions: "place", stitch: false, lightBar: true } });
    await say(core, "ana", { t: "roomSettings", conditions: "somewhere" });
    expect(f.of("ana", "lobby").length).toBeGreaterThan(0); // a bad value closes the socket, changes nothing
  });
});

describe("RoomCore: the Master's separate switches (party-mode 4.11, 12.5)", () => {
  it("sets auto-cross and the Bot level apart from the preset, keeps them to the start, and refuses a Player who is not the Master", async () => {
    const { f, core } = await lobby(false);
    await say(core, "ben", { t: "settings", autoCross: true });
    expect(f.of("ben", "refused").at(-1)).toMatchObject({ code: "not_master" });
    await say(core, "ana", { t: "settings", preset: "quick" });
    await say(core, "ana", { t: "settings", autoCross: true, botLevel: "gentle", nudges: "help-only", frames: false, sounds: false });
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ settings: { preset: "quick", autoCross: true, botLevel: "gentle", nudges: "help-only", frames: false, sounds: false } });
    await say(core, "ana", { t: "addBot" });
    await say(core, "ana", { t: "start" });
    const saved = JSON.parse(f.disk.text as string) as { engine: { seats: { bot: boolean; botLevel: string }[]; settings: { autoCross: boolean } } };
    expect(saved.engine.seats.filter((x) => x.bot).map((x) => x.botLevel)).toEqual(["gentle"]);
    expect(saved.engine.settings.autoCross).toBe(true);
  });
  it("a Classic preset chosen after a Gentle Bot level puts the Bots back to Standard", async () => {
    const { f, core } = await lobby(false);
    await say(core, "ana", { t: "settings", botLevel: "gentle" });
    await say(core, "ana", { t: "settings", preset: "classic" });
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ settings: { botLevel: "standard" } });
  });
});

describe("RoomCore: the host token may only end the Room or act as the screen (party-mode 4.11)", () => {
  it("refuses settings, start, pause, hand-over and addBot from the host or the display, and lets the host end", async () => {
    const { f, core } = await lobby(false);
    for (const sid of ["host", "disp"]) {
      for (const msg of [{ t: "settings", preset: "quick" }, { t: "start" }, { t: "pause" }, { t: "handOver", seat: 2 }, { t: "addBot" }, BIG, { t: "roomSettings", rattle: false }]) await say(core, sid, msg);
      expect(f.of(sid, "refused").length).toBe(7);
    }
    expect(f.of("ana", "lobby").at(-1)).toMatchObject({ settings: { preset: "classic" }, worldId: null });
    await say(core, "ben", { t: "handOver", seat: 2 });
    expect(f.of("ben", "refused").at(-1)).toMatchObject({ code: "not_master" });
    await say(core, "disp", { t: "end" });
    expect(f.of("disp", "refused").at(-1)).toMatchObject({ code: "not_master" });
    await say(core, "host", { t: "end" });
    expect(f.of("ana", "ended")).toHaveLength(1);
  });
});

describe("RoomCore: a Cue on the TV (party-mode 4.14)", () => {
  it("tells the Host and the Display, with the time to play on the server clock, and a Cue on the phone goes to the sender's phone only", async () => {
    const { f, core } = await playing();
    const act = activeOf(f);
    const other = act === 1 ? "ben" : "ana";
    await say(core, other, { t: "cue", cue: "creak", place: "tv" });
    const tv = f.of("host", "tvCue");
    expect(tv).toHaveLength(1);
    expect(tv[0]).toMatchObject({ cue: "creak", playAtMs: 1_000_000 });
    expect(f.of("disp", "tvCue")).toHaveLength(1);
    f.clock.t += 5_000;
    await say(core, other, { t: "cue", cue: "bell", place: "phone" });
    expect(f.of("host", "tvCue")).toHaveLength(1);
    expect(f.of(other, "cue").length).toBe(1);
    expect(f.of(act === 1 ? "ana" : "ben", "cue")).toHaveLength(0);
  });
});

describe("RoomCore: Nudge refusals say why (party-mode 4.15)", () => {
  it("refuses a Nudge from the active Player as nudge_denied with the reason, and a Help from another Player moves the clock for every screen", async () => {
    const { f, core } = await playing();
    const act = activeOf(f);
    const [on, off] = act === 1 ? ["ana", "ben"] : ["ben", "ana"];
    await say(core, on, { t: "nudge", kind: "help" });
    expect(f.of(on, "refused").at(-1)).toEqual({ t: "refused", code: "nudge_denied:own_turn" });
    const before = (f.of("host", "public").at(-1)!.view as { deadlineMs: number }).deadlineMs;
    await say(core, off, { t: "nudge", kind: "help" });
    const after = (f.of("host", "public").at(-1)!.view as { deadlineMs: number }).deadlineMs;
    expect(after - before).toBe(10_000);
    expect((f.of("disp", "public").at(-1)!.view as { deadlineMs: number }).deadlineMs).toBe(after);
    expect((JSON.parse(f.disk.text as string) as { engine: { turn: unknown } }).engine.turn).not.toBeNull();
  });
});

describe("RoomCore: the Master's speaker controls and recap skip reach the Host only (party-mode 8.5, 8.8)", () => {
  it("relays mute, unmute, replay, skip and recapSkip from the Master to the Host, and refuses anyone else", async () => {
    const { f, core } = await lobby(false);
    for (const action of ["mute", "unmute", "replay", "skip"]) await say(core, "ana", { t: "speech", action });
    await say(core, "ana", { t: "recapSkip" });
    expect(f.of("host", "speechControl").map((m) => m.action)).toEqual(["mute", "unmute", "replay", "skip"]);
    expect(f.of("host", "recapSkip")).toHaveLength(1);
    for (const n of ["ana", "ben", "disp"]) { expect(f.of(n, "speechControl")).toHaveLength(0); expect(f.of(n, "recapSkip")).toHaveLength(0); }
    await say(core, "ben", { t: "speech", action: "skip" });
    await say(core, "ben", { t: "recapSkip" });
    expect(f.of("ben", "refused").map((m) => m.code)).toEqual(["not_master", "not_master"]);
    expect(f.of("host", "speechControl")).toHaveLength(4);
  });
  it("on and off still switch the voice on and off for the Master only", async () => {
    const { f, core } = await lobby(false);
    await say(core, "ana", { t: "speech", action: "on" });
    expect(f.of("host", "speech").at(-1)).toMatchObject({ on: true });
    expect(f.of("ana", "speech").at(-1)).toMatchObject({ on: true }); // the Master's own switch shows it
    expect(f.of("ben", "speech")).toHaveLength(0);
    await say(core, "ben", { t: "speech", action: "off" });
    expect(f.of("ben", "refused").at(-1)).toMatchObject({ code: "not_master" });
  });
});

describe("RoomCore: Seat Portraits in the lobby view (party-mode 19.8)", () => {
  it("names a Player's contributed ghost picture in the lobby view for every screen, none for a Bot or a Player who made none, and no token", async () => {
    const f = fakes(3, false);
    const core = new RoomCore(f.ports);
    const { hostToken } = await core.create("ABCD");
    const a = await core.join("Ana");
    const b = await core.join("Ben");
    if (!a.ok || !b.ok) throw new Error("join");
    await say(core, "host", { t: "hello", token: hostToken });
    await say(core, "ana", { t: "hello", token: a.token });
    await core.recordContribution(a.token, { kind: "ghost", profileId: "ghost-xyz", status: "ok" });
    await say(core, "ana", { t: "addBot" });
    const view = f.of("host", "lobby").at(-1)!.seats as { seat: number; portrait?: { portraitUrl: string } }[];
    expect(view.find((s) => s.seat === 1)!.portrait).toEqual({ portraitUrl: "/api/ghosts/sprite/room-ABCD-1" });
    expect(view.find((s) => s.seat === 2)!.portrait).toBeUndefined();
    expect(view.find((s) => s.seat === 3)!.portrait).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(a.token);
  });
});
