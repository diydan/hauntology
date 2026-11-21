import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { MIDNIGHT_LINE } from "./hour";
import { RoomCore, type Ports } from "./server";

function fakes(over: Partial<Ports> = {}) {
  const disk: { text: string | undefined; alarm: number | null } = { text: undefined, alarm: null };
  const inbox = new Map<string, unknown[]>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(5);
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; }, setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); }, close: () => {}, now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)), requireWorld: () => true, ...over,
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, clock, of };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));
const WORLD = { t: "world", id: "kitchen", walkRadius: 9 };

async function table(over: Partial<Ports> = {}, startAt = 1_000_000) {
  const f = fakes(over);
  f.clock.t = startAt;
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const a = await core.join("Ana");
  const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "disp", { t: "hello", token: displayToken });
  await say(core, "ana", { t: "hello", token: a.token });
  await say(core, "ben", { t: "hello", token: b.token });
  await say(core, "ana", WORLD);
  return { f, core };
}
const start = async (t: Awaited<ReturnType<typeof table>>) => { await say(t.core, "ana", { t: "start" }); };

describe("RoomCore: the hour strike (party-mode 4.17)", () => {
  it("wakes the alarm at the next hour of the Host's clock, strikes the Host and every phone at one server time, and counts the sound", async () => {
    const t = await table();
    await say(t.core, "host", { t: "hostClock", offsetMin: 0 });
    await say(t.core, "ana", { t: "sound", consent: true });
    await start(t);
    await say(t.core, "ana", { t: "sound", consent: true });
    await say(t.core, "host", { t: "hostClock", offsetMin: 0 });
    expect(t.f.disk.alarm).toBeLessThanOrEqual(3_600_000);
    t.f.clock.t = 3_600_000;
    await t.core.alarm();
    const host = t.f.of("host", "strike");
    expect(host).toHaveLength(1);
    expect(host[0]).toMatchObject({ atMs: 3_600_000, count: 1, midnight: false, plan: "play" });
    expect(t.f.of("ana", "strike")[0]).toMatchObject({ atMs: 3_600_000, count: 1, plan: "play" });
    expect(t.f.of("ben", "strike")[0]).toMatchObject({ atMs: 3_600_000, plan: "none" });
    expect(t.f.of("disp", "scripted")[0]).toMatchObject({ kind: "strike", line: "The clock struck one." });
    const saved = JSON.parse(t.f.disk.text as string) as { engine: { players: { seat: number; soundsThisRound: number }[] }; extras: { pendingStrike: { atMs: number } } };
    expect(saved.engine.players.find((p) => p.seat === 1)!.soundsThisRound).toBe(1);
    expect(saved.engine.players.find((p) => p.seat === 2)!.soundsThisRound).toBe(0);
    expect(saved.extras.pendingStrike.atMs).toBe(7_200_000);
    await t.core.alarm();
    expect(t.f.of("host", "strike")).toHaveLength(1);
  });
  it("strikes twelve at midnight with the scripted line, and the ghost voice speaks it when speech is on", async () => {
    const t = await table({}, 86_400_000 - 600_000);
    await start(t);
    await say(t.core, "ana", { t: "speech", action: "on" });
    await say(t.core, "host", { t: "hostClock", offsetMin: 0 });
    t.f.clock.t = 86_400_000;
    await t.core.alarm();
    expect(t.f.of("host", "strike")[0]).toMatchObject({ count: 12, midnight: true, hour: 0 });
    expect(t.f.of("ben", "scripted")[0]).toMatchObject({ kind: "midnight", line: MIDNIGHT_LINE });
    expect(t.f.of("host", "voice").at(-1)).toMatchObject({ kind: "midnight", text: MIDNIGHT_LINE });
    expect(t.f.of("ana", "voice")).toHaveLength(0);
  });
  it("uses the Host's own offset: UTC+5:30 strikes on its own hour", async () => {
    const t = await table({}, 0);
    await start(t);
    await say(t.core, "host", { t: "hostClock", offsetMin: 330 });
    expect((JSON.parse(t.f.disk.text as string) as { extras: { pendingStrike: { atMs: number } } }).extras.pendingStrike.atMs).toBe(1_800_000);
  });
  it("strikes nothing when the Master switched it off, before a game, or with no Host offset", async () => {
    const t = await table();
    await say(t.core, "host", { t: "hostClock", offsetMin: 0 });
    expect((JSON.parse(t.f.disk.text as string) as { extras: { pendingStrike?: unknown } }).extras.pendingStrike ?? null).toBeNull();
    await say(t.core, "ana", { t: "roomSettings", hourStrike: false });
    await start(t);
    t.f.clock.t = 3_600_000;
    await t.core.alarm();
    expect(t.f.of("host", "strike")).toHaveLength(0);
    const u = await table();
    await start(u);
    u.f.clock.t = 3_600_000;
    await u.core.alarm();
    expect(u.f.of("host", "strike")).toHaveLength(0);
  });
});

describe("RoomCore: conditions at the start (party-mode 4.18)", () => {
  const snapshot = { weather: "rain", timeOfDay: "night", moon: "full", lat: 51.5, lon: -0.1, temperatureC: 3, windKph: 40 };
  it("calls the service once, sends only the cosmetic fields to the Host and on the Public View, and keeps no position, temperature or wind", async () => {
    let calls = 0;
    const t = await table({ conditions: async () => { calls++; return snapshot as never; } });
    await say(t.core, "ana", { t: "roomSettings", conditions: "table" });
    await start(t);
    expect(calls).toBe(1);
    expect(t.f.of("host", "setAtmosphere")).toEqual([{ t: "setAtmosphere", weather: "rain", timeOfDay: "night", moon: "full" }]);
    const views = t.f.of("ben", "public");
    expect((views.at(-1)!.view as { atmosphere: unknown }).atmosphere).toEqual({ weather: "rain", timeOfDay: "night", moon: "full" });
    expect(t.f.disk.text).not.toMatch(/51\.5|temperatureC|windKph|"lat"/);
    await say(t.core, "ben", { t: "pause" }); // later steps do not call it again
    expect(calls).toBe(1);
  });
  it("starts with the default sky when the service fails, throws, or answers nonsense", async () => {
    for (const svc of [async () => null, async () => { throw new Error("down"); }, async () => ({ weather: "", timeOfDay: 4, moon: "x" }) as never]) {
      const t = await table({ conditions: svc });
      await say(t.core, "ana", { t: "roomSettings", conditions: "place", place: { lat: 48.86, lon: 2.35 } });
      await start(t);
      expect(t.f.of("ana", "private").length).toBeGreaterThan(0);
      expect(t.f.of("host", "setAtmosphere")).toHaveLength(0);
      expect((t.f.of("ben", "public").at(-1)!.view as { atmosphere?: unknown }).atmosphere).toBeUndefined();
    }
  });
  it("is never called with conditions off, and a Host that connects late is sent the frozen sky", async () => {
    let calls = 0;
    const off = await table({ conditions: async () => { calls++; return snapshot as never; } });
    await start(off);
    expect(calls).toBe(0);
    const on = await table({ conditions: async () => snapshot as never });
    await say(on.core, "ana", { t: "roomSettings", conditions: "table" });
    await start(on);
    const tok = (JSON.parse(on.f.disk.text as string) as { room: string }).room.match(/"hostToken":"([0-9a-f]{32})"/)![1];
    await say(on.core, "host2", { t: "hello", token: tok });
    expect(on.f.of("host2", "setAtmosphere")).toHaveLength(1);
  });
  it("hands the service the Master's place (rounded) and the Host's hour, then forgets the place", async () => {
    let seen: unknown = "unset";
    const t = await table({ conditions: async (_c, place, hour) => { seen = [place, hour]; return snapshot as never; } }, 3_600_000 * 5);
    await say(t.core, "host", { t: "hostClock", offsetMin: 120 });
    await say(t.core, "ana", { t: "roomSettings", conditions: "place", place: { lat: 48.8566, lon: 2.3522, label: "Paris" } });
    await start(t);
    expect(seen).toEqual([{ lat: 48.86, lon: 2.35, label: "Paris" }, 7]);
    expect(t.f.disk.text).not.toMatch(/48\.86|2\.35/);
  });
  it("refuses a place off the globe", async () => {
    const t = await table();
    await say(t.core, "ana", { t: "roomSettings", conditions: "place", place: { lat: 120, lon: 2 } });
    expect(t.f.of("ana", "lobby").at(-1)).toMatchObject({ switches: { conditions: "off" } });
  });
});

describe("RoomCore: the light bar (party-mode 4.19)", () => {
  it("plays a glow on the phone a Frame lands on, at a common start 500 ms ahead translated to its clock, and only if it agreed", async () => {
    const t = await table();
    for (const [sid, yes] of [["ana", true], ["ben", true]] as const) {
      await say(t.core, sid, { t: "light", consent: yes });
      await say(t.core, sid, { t: "clockSample", sentMs: 1_000_000, serverMs: 1_000_050, receivedMs: 1_000_100 });
    }
    await start(t);
    await say(t.core, "ana", { t: "sound", consent: true });
    await say(t.core, "ben", { t: "sound", consent: true });
    const act = (t.f.of("host", "public").at(-1)!.view as { active: number }).active;
    const [target, sender] = act === 1 ? ["ana", "ben"] : ["ben", "ana"];
    // a Frame needs two humans who both agreed to sound; send it from the one who is not the target
    await say(t.core, sender, { t: "frame", target: target === "ana" ? 1 : 2, cue: "creak" });
    const light = t.f.of(target, "lightCue");
    expect(light).toHaveLength(1);
    expect(light[0]).toMatchObject({ cue: "glow", startAtMs: 1_000_000 + 500 - 0 });
    expect(light[0]!.durationMs as number).toBeLessThanOrEqual(6000);
    expect(t.f.of(sender, "lightCue")).toHaveLength(0);
  });
  it("sends nothing to a phone whose clock error is over 150 ms", async () => {
    const t = await table();
    for (const sid of ["ana", "ben"]) {
      await say(t.core, sid, { t: "light", consent: true });
      // two wildly different samples: an error well over 150 ms
      await say(t.core, sid, { t: "clockSample", sentMs: 1_000_000, serverMs: 1_000_050, receivedMs: 1_000_100 });
      await say(t.core, sid, { t: "clockSample", sentMs: 1_000_000, serverMs: 1_000_900, receivedMs: 1_000_100 });
    }
    await start(t);
    await say(t.core, "ana", { t: "sound", consent: true });
    await say(t.core, "ben", { t: "sound", consent: true });
    const act = (t.f.of("host", "public").at(-1)!.view as { active: number }).active;
    const sender = act === 1 ? "ben" : "ana";
    const target = act === 1 ? 1 : 2;
    await say(t.core, sender, { t: "frame", target, cue: "creak" });
    expect(t.f.of("ana", "lightCue")).toHaveLength(0);
    expect(t.f.of("ben", "lightCue")).toHaveLength(0);
  });
  it("sends nothing when the Master switched the light bar off, even for a phone that agreed with a good clock", async () => {
    const t = await table();
    await say(t.core, "ana", { t: "roomSettings", lightBar: false });
    for (const sid of ["ana", "ben"]) {
      await say(t.core, sid, { t: "light", consent: true });
      await say(t.core, sid, { t: "clockSample", sentMs: 1_000_000, serverMs: 1_000_050, receivedMs: 1_000_100 });
    }
    await start(t);
    await say(t.core, "ana", { t: "sound", consent: true });
    await say(t.core, "ben", { t: "sound", consent: true });
    const act = (t.f.of("host", "public").at(-1)!.view as { active: number }).active;
    await say(t.core, act === 1 ? "ben" : "ana", { t: "frame", target: act === 1 ? 1 : 2, cue: "creak" });
    expect(t.f.of(act === 1 ? "ana" : "ben", "cue")).toHaveLength(1); // the Frame itself did land
    expect(t.f.of("ana", "lightCue")).toHaveLength(0);
    expect(t.f.of("ben", "lightCue")).toHaveLength(0);
  });
});
