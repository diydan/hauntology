import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "./server";
import { speechVoices } from "../voice/line";
import { LODGER_VOICE_ORDER } from "../voice/voices";
import { directiveOfLog, lodgerVoiceOfProfile, narratableLog } from "./narrate-events";

function fakes(narrate?: Ports["narrate"], spoke?: Ports["spoke"]) {
  const disk: { text: string | undefined } = { text: undefined };
  const inbox = new Map<string, unknown[]>();
  const r = mulberry32(5);
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; }, setAlarm: async () => {},
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); },
    close: () => {}, now: () => 1_000_000,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
    requireWorld: () => false,
    ...(narrate === undefined ? {} : { narrate }),
    ...(spoke === undefined ? {} : { spoke }),
  };
  const of = (sid: string, t: string) => (inbox.get(sid) ?? []).filter((m) => (m as { t: string }).t === t) as Record<string, unknown>[];
  return { ports, of, disk };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

async function game(narrate?: Ports["narrate"], spoke?: Ports["spoke"]) {
  const f = fakes(narrate, spoke);
  const core = new RoomCore(f.ports);
  const { hostToken } = await core.create("ABCD");
  const a = await core.join("Ana"); const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "ana", { t: "hello", token: a.token });
  await say(core, "ben", { t: "hello", token: b.token });
  return { f, core, hostToken };
}

/** The active seat's id, read from the Host's latest public snapshot. */
const activeSid = (f: ReturnType<typeof fakes>): string => {
  const snaps = f.of("host", "public");
  const seat = ((snaps.at(-1) as { view?: { active?: number | null } } | undefined)?.view?.active ?? 1);
  return seat === 1 ? "ana" : "ben";
};

describe("party narration wiring (party-mode 2.114, 6)", () => {
  it("narrates a sealed accusation through the port while speaking is on, sent to the Host only, and asks the port for the Public View", async () => {
    const asked: { kind: string; hasSolution: boolean }[] = [];
    const { f, core } = await game(async (view, ev) => { asked.push({ kind: ev.kind, hasSolution: view.ending !== null }); return { text: "A name was sealed away.", speaker: "keeper" }; });
    await say(core, "ana", { t: "speech", action: "on" });
    await say(core, "ana", { t: "start" });
    await say(core, activeSid(f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(asked).toEqual([{ kind: "seal", hasSolution: false }]);
    expect(f.of("host", "voice").map((m) => m.text)).toEqual(["A name was sealed away."]);
    expect(f.of("ana", "voice")).toHaveLength(0);
    expect(f.of("ben", "voice")).toHaveLength(0);
  });
  it("narrates nothing, and never calls the port, while speaking is off", async () => {
    let calls = 0;
    const { f, core } = await game(async () => { calls += 1; return { text: "x", speaker: "keeper" }; });
    await say(core, "ana", { t: "start" });
    await say(core, activeSid(f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(calls).toBe(0);
    expect(f.of("host", "voice")).toHaveLength(0);
  });
  it("falls back to the scripted line when the port has nothing", async () => {
    const { f, core } = await game(async () => null);
    await say(core, "ana", { t: "speech", action: "on" });
    await say(core, "ana", { t: "start" });
    await say(core, activeSid(f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(f.of("host", "voice")).toHaveLength(1);
    expect((f.of("host", "voice")[0]!.text as string).length).toBeGreaterThan(5);
  });
});

describe("early synthesis hook (ghost-voice 3.12)", () => {
  it("hands each spoken line to the `spoke` port with the Room code, and never while speaking is off or when the port throws", async () => {
    const seen: { id: string; code: string }[] = [];
    const on = await game(async () => null, (line, code) => { seen.push({ id: line.id, code }); throw new Error("boom"); });
    await say(on.core, "ana", { t: "speech", action: "on" });
    await say(on.core, "ana", { t: "start" });
    await say(on.core, activeSid(on.f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ code: "ABCD" });
    expect(on.f.of("host", "voice")).toHaveLength(1);
    const off = await game(async () => null, (line, code) => { seen.push({ id: line.id, code }); });
    await say(off.core, "ana", { t: "start" });
    await say(off.core, activeSid(off.f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(seen).toHaveLength(1);
  });
});

describe("prefetch list (ghost-voice 4.8)", () => {
  it("lists Library lines for the Host only, while speaking is on, at most 8, findable by the Host token, never counted as spoken, and sent once", async () => {
    const { f, core, hostToken } = await game(async () => null);
    expect(f.of("host", "prefetch")).toHaveLength(0);
    await say(core, "ana", { t: "speech", action: "on" });
    await say(core, "ana", { t: "start" });
    const lists = f.of("host", "prefetch");
    expect(lists).toHaveLength(1);
    const ids = lists[0]!.lineIds as string[];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(8);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const line = await core.findVoiceLineForHost(id, hostToken);
      expect(line?.speaker === "lodger").toBe(false);
      expect(line?.spoken).not.toBe("");
    }
    expect(await core.findVoiceLineForHost(ids[0]!, "0".repeat(32))).toBeNull();
    expect(f.of("ana", "prefetch")).toHaveLength(0);
    expect(f.of("ben", "prefetch")).toHaveLength(0);
    expect((JSON.parse(f.disk.text!) as { voice: { spokenCount: number } }).voice.spokenCount).toBe(0);
    await say(core, activeSid(f), { t: "seal", suspect: "s1", zone: "z1", relic: "r1" });
    expect(f.of("host", "prefetch")).toHaveLength(1); // the list did not change, so it is not sent again
  });
  it("lists nothing while speaking is off", async () => {
    const { f, core } = await game();
    await say(core, "ana", { t: "start" });
    expect(f.of("host", "prefetch")).toHaveLength(0);
  });
});

describe("narrate-events", () => {
  it("narrates only key moments", () => {
    expect(directiveOfLog({ id: 1, kind: "seal", seat: 1 })).toBe("seal");
    expect(directiveOfLog({ id: 2, kind: "accuse", seat: 1, right: false })).toBe("accuse-wrong");
    expect(directiveOfLog({ id: 3, kind: "accuse", seat: 1, right: true })).toBe("accuse-right");
    expect(directiveOfLog({ id: 4, kind: "turn-start", seat: 1 })).toBeNull();
    expect(narratableLog([{ id: 1, kind: "seal", seat: 1 }, { id: 2, kind: "inspect", seat: 1, zone: "z1" }], 2)).toEqual([]);
  });
  it("gives a Suspect the Voice its maker picked, else a stable Preset voice, from the profile alone", () => {
    const contrib = { ghosts: { 1: { profileId: "g-1", status: "ok" as const, lodgerVoice: "victoria" as const } } };
    expect(lodgerVoiceOfProfile(contrib, "g-1")).toBe("victoria");
    expect(lodgerVoiceOfProfile(undefined, "preset-1")).toBe("mark");
    expect(lodgerVoiceOfProfile(undefined, "preset-2")).toBe("conrad");
    expect(lodgerVoiceOfProfile(undefined, "unknown-x")).toBe(lodgerVoiceOfProfile(undefined, "unknown-x"));
  });
});

/** Plays turns until the round ends and the sealed accusations are read out (or gives up). */
async function playToReveal(f: ReturnType<typeof fakes>, core: RoomCore, accusation: { suspect: string; zone: string; relic: string }): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    const log = (JSON.parse(f.disk.text!) as { engine: { log: { kind: string }[] } }).engine.log;
    if (log.some((e) => e.kind === "accuse")) return;
    const sid = activeSid(f);
    await say(core, sid, { t: "seal", ...accusation });
  }
}
const solutionOf = (f: ReturnType<typeof fakes>) => (JSON.parse(f.disk.text!) as { engine: { deal: { solution: { suspect: string; zone: string; relic: string } } } }).engine.deal.solution;

describe("the confession (party-mode 2.114)", () => {
  it("is spoken in the Voice of the Suspect in the Solution, once the Solution is public, and not before", async () => {
    const { f, core, hostToken } = await game(async () => null);
    await say(core, "ana", { t: "speech", action: "on" });
    await say(core, "ana", { t: "start" });
    const sol = solutionOf(f);
    expect(f.of("host", "voice").some((m) => String(m.lineId).startsWith("lodger-"))).toBe(false);
    await playToReveal(f, core, sol);
    const lines = f.of("host", "voice");
    const ending = lines.filter((m) => m.kind === "ending");
    expect(ending.length).toBeGreaterThan(0);
    const confession = ending.find((m) => String(m.lineId).startsWith("lodger-"));
    expect(confession).toBeDefined();
    const line = await core.findVoiceLineForHost(String(confession!.lineId), hostToken);
    expect(line?.speaker).toBe("lodger");
    const engine = (JSON.parse(f.disk.text!) as { engine: { pool: { suspects: { id: string; profileId: string }[] } } }).engine;
    const profile = engine.pool.suspects.find((x) => x.id === sol.suspect)!.profileId;
    expect(speechVoices(line!).lodgerVoice).toBe(lodgerVoiceOfProfile(undefined, profile));
    expect(LODGER_VOICE_ORDER).toContain(speechVoices(line!).lodgerVoice);
  });
});
