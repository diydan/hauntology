import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "../party/server";

function fakes(seed = 1) {
  const disk: { text: string | undefined; alarm: number | null; deleted: number } = { text: undefined, alarm: null, deleted: 0 };
  const inbox = new Map<string, unknown[]>();
  const clipDeletes: (number[] | "all")[] = [];
  const clock = { t: 1_000_000 };
  const r = mulberry32(seed);
  const ports: Ports = {
    load: async () => disk.text,
    save: async (t) => { disk.text = t; },
    deleteAll: async () => { disk.text = undefined; disk.deleted += 1; },
    setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => {
      if (!inbox.has(sid)) inbox.set(sid, []);
      inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg)));
    },
    close: () => {},
    now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
    deleteStitchClips: async (forSeats) => { clipDeletes.push(forSeats); },
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as Record<string, unknown>[];
  return { ports, disk, inbox, clipDeletes, clock, of };
}

const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

async function roomSetup() {
  const f = fakes(3);
  const core = new RoomCore(f.ports);
  const { hostToken } = await core.create("ABCD");
  const ana = await core.join("Ana"); // seat 1 (Master)
  const ben = await core.join("Ben"); // seat 2
  if (!ana.ok || !ben.ok) throw new Error("join failed");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "ana", { t: "hello", token: ana.token });
  await say(core, "ben", { t: "hello", token: ben.token });
  return { f, core, hostToken, ana, ben };
}

describe("PartyRoom room speaking (ghost-voice 3.9)", () => {
  it("starts off, lets only the Master toggle speech, routes voice cues to Host only, and enforces 15+5 caps", async () => {
    const { f, core } = await roomSetup();

    // Speaking is off by default: nothing spoken or sent to Host or phones.
    const initiallyOff = await core.speakRoomEvent({
      id: "l-off",
      kind: "narration",
      speaker: "keeper",
      text: "The clock stops in the hall.",
    });
    expect(initiallyOff.spoke).toBe(false);
    expect(f.of("host", "voice")).toEqual([]);
    expect(f.of("ana", "voice")).toEqual([]);

    // Non-master cannot toggle speech on.
    await say(core, "ben", { t: "speech", action: "on" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });

    // Master switches speech on.
    await say(core, "ana", { t: "speech", action: "on" });
    expect(f.of("host", "speech").at(-1)).toEqual({ t: "speech", on: true });

    // Speak 15 narration lines: sent strictly to Host, never Controller phones.
    for (let i = 0; i < 15; i++) {
      f.clock.t += 100;
      const r = await core.speakRoomEvent({
        id: `n-${i}`,
        kind: "narration",
        speaker: "keeper",
        text: `The house remembers turn ${i}.`,
      });
      expect(r.spoke).toBe(true);
    }
    expect(f.of("host", "voice")).toHaveLength(15);
    expect(f.of("ana", "voice")).toEqual([]);
    expect(f.of("ben", "voice")).toEqual([]);
    expect(await core.findVoiceLine("n-14")).not.toBeNull();

    // 16th ordinary narration line is refused (late_line); haunt_event/midnight/ending lines are allowed up to 20.
    const lateNarration = await core.speakRoomEvent({
      id: "n-15",
      kind: "narration",
      speaker: "keeper",
      text: "Ordinary narration past 15.",
    });
    expect(lateNarration.spoke).toBe(false);

    for (let k = 0; k < 5; k++) {
      const kind = k < 3 ? "haunt_event" : k === 3 ? "midnight" : "ending";
      const r = await core.speakRoomEvent({
        id: `k-${k}`,
        kind,
        speaker: "keeper",
        text: "The bells strike in the stairwell.",
      });
      expect(r.spoke).toBe(true);
    }

    // 21st line exceeds room cap (20).
    const overCap = await core.speakRoomEvent({
      id: "over",
      kind: "ending",
      speaker: "keeper",
      text: "Twenty-first line cannot speak.",
    });
    expect(overCap.spoke).toBe(false);
  });
});

describe("PartyRoom Stitch contract (ghost-voice 5.12)", () => {
  it("allows only Master to toggle Stitch, prevents Master from answering for another seat, deletes clips on off, and keeps public log anonymous without mutating engine rules", async () => {
    const { f, core } = await roomSetup();

    // Non-master cannot turn Stitch on.
    await say(core, "ben", { t: "stitchSetting", on: true });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "not_master" });

    // Master turns Stitch on, then tries to answer on behalf of seat 2 -> refused!
    await say(core, "ana", { t: "stitchSetting", on: true });
    await say(core, "ana", { t: "stitchAnswer", seat: 2, yes: true, tick: true });
    expect(f.of("ana", "refused").at(-1)).toEqual({ t: "refused", code: "bad_token" });
    expect(JSON.parse(f.disk.text!).voice.stitch.consents).toEqual([]);

    // Seat 2 answers for itself -> accepted!
    await say(core, "ben", { t: "stitchAnswer", yes: true, tick: true });
    expect(JSON.parse(f.disk.text!).voice.stitch.consents).toEqual([{ seat: 2, yes: true, ageOrGuardianTick: true }]);

    // Start game, record engine state, whisper a stitch -> Host gets clips & subtitle, phones see anonymous "a voice whispered", engine state unchanged!
    await say(core, "ana", { t: "start" });
    const engineBefore = JSON.parse(f.disk.text!).engine;
    const rev = await core.whisperStitch(
      { eventId: "st-1", seat: 2, templateId: "tpl-2", subtitle: "wait here", at: f.clock.t },
      [{ word: "wait" }, { word: "here" }],
    );
    const engineAfter = JSON.parse(f.disk.text!).engine;

    expect(engineAfter).toEqual(engineBefore);
    expect(f.of("host", "stitch").at(-1)).toMatchObject({ t: "stitch", eventId: "st-1", subtitle: "wait here" });
    expect(f.of("ana", "stitch")).toEqual([]);
    expect(f.of("ana", "stitch_log").at(-1)).toEqual({ t: "stitch_log", kind: "stitch", text: "a voice whispered" });
    expect(JSON.stringify(f.of("ana", "stitch_log"))).not.toContain("2");
    expect(rev.reveals).toEqual([{ eventId: "st-1", seat: 2, templateId: "tpl-2", subtitle: "wait here", at: f.clock.t }]);

    // Master turns Stitch off -> consents cleared and deleteStitchClips("all") triggered.
    await say(core, "ana", { t: "stitchSetting", on: false });
    expect(JSON.parse(f.disk.text!).voice.stitch.enabled).toBe(false);
    expect(JSON.parse(f.disk.text!).voice.stitch.consents).toEqual([]);
    expect(f.clipDeletes).toContain("all");
  });
});
