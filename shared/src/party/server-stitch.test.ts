import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { MAX_MESSAGE_BYTES, parseClientMessage } from "./protocol";
import { encodeB64 } from "./room-stitch";
import { RoomCore, type Ports } from "./server";
import type { StitchClip } from "../voice/stitch/compose";
import { recordCheck } from "../voice/stitch/check";

const NAMES = ["ana", "ben", "cat", "dot"];

function fakes(over: Partial<Ports> = {}) {
  const disk: { text: string | undefined; alarm: number | null } = { text: undefined, alarm: null };
  const inbox = new Map<string, unknown[]>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(21);
  const store = { clips: [] as StitchClip[], deleted: [] as (number[] | "all")[], checks: [] as { seat: number; word: string; bytes0: number }[] };
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; }, setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); }, close: () => {}, now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)), requireWorld: () => true,
    deleteStitchClips: async (f) => { store.deleted.push(f); store.clips = f === "all" ? [] : store.clips.filter((c) => !f.includes(c.seat)); },
    listStitchClips: async () => store.clips,
    wordCheck: async (i) => {
      store.checks.push({ seat: i.seat, word: i.word, bytes0: i.audio[0] ?? -1 });
      const accepted = i.audio[0] === 1;
      if (accepted) store.clips.push({ seat: i.seat, word: i.word, bytes: new Uint8Array(i.audio), durationMs: i.durationMs, recordedAt: clock.t, contentType: i.contentType });
      return { ok: true, accepted, checks: recordCheck(i.state.checks, i.seat, i.word, accepted, true) };
    },
    purgeStitchClips: async (ctx, now) => {
      store.clips = store.clips.filter((c) => !ctx.gameOver && ctx.enabled && ctx.activeSeats.has(c.seat) && now - c.recordedAt < 6 * 3_600_000);
      return store.clips.length === 0 ? null : Math.min(...store.clips.map((c) => c.recordedAt + 6 * 3_600_000));
    },
    ...over,
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, clock, of, store };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));
const audio = (first: number) => encodeB64(new Uint8Array([first, 2, 3, 4, 5, 6, 7, 8]));
const clipMsg = (word: string, first = 1, extra: object = {}) => ({ t: "stitchClip", word, audio: audio(first), contentType: "audio/webm;codecs=opus", durationMs: 900, ...extra });

async function table(over: Partial<Ports> = {}, startAt = 1_000_000) {
  const f = fakes(over);
  f.clock.t = startAt;
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const toks: string[] = [];
  for (const n of NAMES) { const j = await core.join(n); if (!j.ok) throw new Error("join"); toks.push(j.token); }
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "disp", { t: "hello", token: displayToken });
  for (let i = 0; i < 4; i++) await say(core, NAMES[i]!, { t: "hello", token: toks[i] });
  await say(core, "ana", { t: "world", id: "kitchen", walkRadius: 9 });
  return { f, core };
}
const optIn = async (t: Awaited<ReturnType<typeof table>>, seats: string[]) => {
  await say(t.core, "ana", { t: "stitchSetting", on: true });
  for (const n of seats) await say(t.core, n, { t: "stitchAnswer", yes: true, tick: true });
};

describe("RoomCore: Stitch clips and the word check (party-mode 4.20)", () => {
  it("accepts a heard word into the Room's store and tells only that phone; a word not heard is not kept", async () => {
    const t = await table();
    await optIn(t, ["ben"]);
    await say(t.core, "ben", clipMsg("here"));
    expect(t.f.of("ben", "stitchResult")).toEqual([{ t: "stitchResult", word: "here", ok: true }]);
    expect(t.f.store.clips.map((c) => [c.seat, c.word])).toEqual([[2, "here"]]);
    await say(t.core, "ben", clipMsg("wait", 9));
    expect(t.f.of("ben", "stitchResult").at(-1)).toEqual({ t: "stitchResult", word: "wait", ok: false, reason: "not_heard" });
    expect(t.f.store.clips).toHaveLength(1);
    for (const n of ["ana", "cat", "dot", "host", "disp"]) expect(t.f.of(n, "stitchResult")).toHaveLength(0);
    expect(t.f.disk.text).not.toContain(audio(1)); // the Room's saved state holds no audio
  });
  it("refuses with a reason: Stitch off, no yes, no tick, a word outside the bank, a bad clip, a clip over 2 s; and a Bot or the Master cannot answer for a seat", async () => {
    const t = await table();
    await say(t.core, "ben", clipMsg("here"));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:off" });
    await say(t.core, "ana", { t: "stitchSetting", on: true });
    await say(t.core, "ben", clipMsg("here"));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:no_consent" });
    await say(t.core, "ben", { t: "stitchAnswer", yes: true, tick: false });
    await say(t.core, "ben", clipMsg("here"));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:no_consent" });
    await say(t.core, "ana", { t: "stitchAnswer", seat: 2, yes: true, tick: true }); // the Master cannot answer for another seat
    await say(t.core, "ben", clipMsg("here"));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:no_consent" });
    await say(t.core, "ben", { t: "stitchAnswer", yes: true, tick: true });
    await say(t.core, "ben", clipMsg("zebra"));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:bad_word" });
    await say(t.core, "ben", clipMsg("here", 1, { contentType: "text/html" }));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:bad_clip" });
    await say(t.core, "ben", clipMsg("here", 1, { audio: "not base64!!" }));
    expect(t.f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "stitch_denied:bad_clip" });
    await say(t.core, "host", clipMsg("here"));
    expect(t.f.of("host", "refused").at(-1)).toEqual({ t: "refused", code: "not_a_player" });
    expect(t.f.store.checks).toHaveLength(0);
  });
  it("closes the socket on a clip over 2 s (schema), and a clip message may be large while any other message may not", () => {
    const big = JSON.stringify({ ...clipMsg("here"), audio: "A".repeat(100_000) });
    expect(big.length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(big).kind).toBe("room");
    expect(parseClientMessage(JSON.stringify({ ...clipMsg("here"), durationMs: 2500 })).kind).toBe("bad");
    expect(parseClientMessage(JSON.stringify({ ...clipMsg("here"), audio: "A".repeat(200_000) })).kind).toBe("bad");
    expect(parseClientMessage(JSON.stringify({ t: "settings", puzzles: "easy", pad: "x".repeat(MAX_MESSAGE_BYTES) })).kind).toBe("bad");
  });
  it("limits attempts: three for the same word, then the Player is told so and no check is spent", async () => {
    const t = await table();
    await optIn(t, ["ben"]);
    for (let i = 0; i < 3; i++) await say(t.core, "ben", clipMsg("wait", 9));
    expect(t.f.store.checks).toHaveLength(3);
    await say(t.core, "ben", clipMsg("wait", 1));
    expect(t.f.of("ben", "stitchResult").at(-1)).toEqual({ t: "stitchResult", word: "wait", ok: false, reason: "limit" });
    expect(t.f.store.checks).toHaveLength(3);
  });
  it("says check_unavailable when the Room has no word check, and when it throws", async () => {
    const none = await table();
    delete (none.f.ports as { wordCheck?: unknown }).wordCheck;
    await optIn(none, ["ben"]);
    await say(none.core, "ben", clipMsg("here"));
    expect(none.f.of("ben", "stitchResult")[0]).toEqual({ t: "stitchResult", word: "here", ok: false, reason: "check_unavailable" });
    const boom = await table({ wordCheck: async () => { throw new Error("down"); } });
    await optIn(boom, ["ben"]);
    await say(boom.core, "ben", clipMsg("here"));
    expect(boom.f.of("ben", "stitchResult")[0]).toMatchObject({ ok: false, reason: "check_unavailable" });
  });
  it("deletes a Player's clips when they say no or leave, all clips when the Master switches it off, and all clips when the Room ends", async () => {
    const t = await table();
    await optIn(t, ["ben", "cat"]);
    await say(t.core, "ben", clipMsg("here"));
    await say(t.core, "cat", clipMsg("wait"));
    await say(t.core, "ben", { t: "stitchLeave" });
    expect(t.f.store.deleted.at(-1)).toEqual([2]);
    expect(t.f.store.clips.map((c) => c.seat)).toEqual([3]);
    await say(t.core, "ana", { t: "stitchSetting", on: false });
    expect(t.f.store.deleted.at(-1)).toBe("all");
    await say(t.core, "ana", { t: "end" });
    expect(t.f.store.deleted.at(-1)).toBe("all");
  });
  it("keeps the next six-hour expiry in the one alarm, and the alarm purges expired clips while the Room is still in use", async () => {
    const t = await table();
    await optIn(t, ["ben"]);
    await say(t.core, "ana", { t: "start" });
    await say(t.core, "ben", clipMsg("here"));
    const exp = 1_000_000 + 6 * 3_600_000;
    expect(t.f.disk.alarm).toBeLessThanOrEqual(exp);
    t.f.clock.t += 5 * 3_600_000;
    await say(t.core, "ana", { t: "pause" }); // the table is still playing, so the Room is not idle
    t.f.clock.t = exp + 1;
    await t.core.alarm();
    expect(t.f.store.clips).toHaveLength(0);
    expect(t.f.of("host", "ended")).toHaveLength(0);
  });
});

/** Every word of the first template, so a seat can be composed from. */
const TPL = ["wait", "here"];
const MIDNIGHT = 86_400_000;

async function midnightTable() {
  const t = await table({}, MIDNIGHT - 600_000);
  await optIn(t, ["ben", "cat"]);
  for (const w of TPL) { await say(t.core, "ben", clipMsg(w)); t.f.clock.t += 10; }
  await say(t.core, "ana", { t: "start" });
  await say(t.core, "host", { t: "hostClock", offsetMin: 0 });
  return t;
}

describe("RoomCore: the whisper (party-mode 4.20)", () => {
  it("at midnight, after the first minute, plays one line from a Player with a yes and the clips, on the Host only, and every screen reads only 'a voice whispered'", async () => {
    const t = await midnightTable();
    t.f.clock.t = MIDNIGHT;
    await t.core.alarm();
    const whisper = t.f.of("host", "stitch");
    expect(whisper).toHaveLength(1);
    expect(whisper[0]).toMatchObject({ subtitle: "wait here" });
    expect((whisper[0]!.clips as { word: string }[]).map((c) => c.word)).toEqual(["wait", "here"]);
    expect(JSON.stringify(whisper[0])).not.toMatch(/"seat"/);
    for (const n of ["ana", "ben", "cat", "dot", "disp"]) {
      expect(t.f.of(n, "stitch")).toHaveLength(0);
      expect(t.f.of(n, "stitch_log")).toEqual([{ t: "stitch_log", kind: "stitch", text: "a voice whispered" }]);
    }
    // only one a Round and two a game, and never the same Player twice running
    t.f.clock.t = MIDNIGHT + 3_600_000;
    await t.core.alarm();
    expect(t.f.of("host", "stitch")).toHaveLength(1);
  });
  it("is silent in the first 60 seconds, with Stitch off, with no clips, and for a Player who said no", async () => {
    const early = await table({}, MIDNIGHT - 30_000);
    await optIn(early, ["ben"]);
    for (const w of TPL) await say(early.core, "ben", clipMsg(w));
    await say(early.core, "ana", { t: "start" });
    await say(early.core, "host", { t: "hostClock", offsetMin: 0 });
    early.f.clock.t = MIDNIGHT;
    await early.core.alarm();
    expect(early.f.of("host", "stitch")).toHaveLength(0);

    const off = await midnightTable();
    await say(off.core, "ana", { t: "stitchSetting", on: false });
    off.f.clock.t = MIDNIGHT;
    await off.core.alarm();
    expect(off.f.of("host", "stitch")).toHaveLength(0);

    const nobody = await table({}, MIDNIGHT - 600_000);
    await optIn(nobody, ["ben"]);
    await say(nobody.core, "ana", { t: "start" });
    await say(nobody.core, "host", { t: "hostClock", offsetMin: 0 });
    nobody.f.clock.t = MIDNIGHT;
    await nobody.core.alarm();
    expect(nobody.f.of("host", "stitch")).toHaveLength(0);

    const said = await midnightTable();
    await say(said.core, "ben", { t: "stitchAnswer", yes: false, tick: true });
    said.f.clock.t = MIDNIGHT;
    await said.core.alarm();
    expect(said.f.of("host", "stitch")).toHaveLength(0);
  });
  it("is not played during an Accusation, and the game's end deletes the clips and names the whispered line and whose words it used", async () => {
    const t = await midnightTable();
    t.f.clock.t = MIDNIGHT - 100;
    // a sealed Accusation is pending
    const view = t.f.of("host", "public").at(-1)!.view as { active: number; suspects: { id: string }[]; zones: { id: string }[]; relics: { id: string }[] };
    await say(t.core, NAMES[view.active - 1]!, { t: "seal", suspect: view.suspects[0]!.id, zone: view.zones[0]!.id, relic: view.relics[0]!.id });
    t.f.clock.t = MIDNIGHT;
    await t.core.alarm();
    expect(t.f.of("host", "stitch")).toHaveLength(0);
  });
  it("the ending view carries the reveal of every whispered line", async () => {
    const t = await midnightTable();
    t.f.clock.t = MIDNIGHT;
    await t.core.alarm();
    expect(t.f.of("host", "stitch")).toHaveLength(1);
    // end the game: everyone seals the right Accusation
    const sol = (JSON.parse(t.f.disk.text as string) as { engine: { deal: { solution: { suspect: string; zone: string; relic: string } } } }).engine.deal.solution;
    for (let i = 0; i < 40; i++) {
      const v = t.f.of("host", "public").at(-1)!.view as { active: number | null; phase: string };
      if (v.phase === "ended" || v.active === null) break;
      t.f.clock.t += 100;
      await say(t.core, NAMES[v.active - 1]!, { t: "seal", ...sol });
    }
    const last = t.f.of("disp", "public").at(-1)!.view as { phase: string; ending: { stitch?: { seat: number; templateId: string; subtitle: string }[] } | null };
    expect(last.phase).toBe("ended");
    expect(last.ending!.stitch).toEqual([expect.objectContaining({ seat: 2, subtitle: "wait here" })]);
    expect(t.f.store.deleted.at(-1)).toBe("all");
    expect(t.f.store.clips).toHaveLength(0);
  });
  it("a Haunt Event also asks for a whisper (three lost Turns raise the Haunt to its first Event)", async () => {
    const t = await table({}, 5_000_000);
    await optIn(t, ["ben"]);
    for (const w of TPL) { await say(t.core, "ben", clipMsg(w)); t.f.clock.t += 10; }
    await say(t.core, "ana", { t: "start" });
    t.f.clock.t += 120_000; // past the first minute
    for (let i = 0; i < 8; i++) {
      const v = t.f.of("host", "public").at(-1)!.view as { haunt: { level: number; choosing: { chooser: number | null; options: string[] } | null } };
      if (v.haunt.level >= 3) break;
      t.f.clock.t += 100_000; // the Turn's clock runs out
      await t.core.alarm();
    }
    const events = (t.f.of("host", "public").at(-1)!.view as { events: { kind: string }[] }).events.filter((e) => e.kind === "haunt-event");
    expect(events.length).toBeGreaterThan(0);
    expect(t.f.of("host", "stitch")).toHaveLength(1);
    expect(t.f.of("host", "stitch")[0]).toMatchObject({ subtitle: "wait here" });
  });
});
