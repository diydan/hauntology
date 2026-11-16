import { startSession } from "@hauntology/shared/ghost/play";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import { VOICE_LINE_TTL_MS, VoiceLineSchema } from "@hauntology/shared/voice/line";
import { describe, expect, it } from "vitest";
import { CloudflarePlaySessions } from "../play/cloudflare";
import { PlayVoiceLines } from "../voice/lines";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { PlayIndex } from "./play-index";
import { PlaySession } from "./play-session";

// ghost-voice 3.5 over the real `PlaySession` object: the lines are kept in the game's own storage and found through the same owner check as the game.

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const T0 = 1_800_000_000_000;
const look = { input: { button: "look" }, pose: {}, world: { bounds: WORLD.bounds, brief: WORLD.brief } };
const MODEL = "The window over the sink is fogged. The rain is soft on the glass tonight, and I remember the kettle.";

function setup() {
  const clock = { t: T0 };
  const index = new FakeNamespace((state) => new PlayIndex(state));
  const sessions = new FakeNamespace((state) => new PlaySession(state, { PLAY_INDEX: index }, () => clock.t));
  const plays = new CloudflarePlaySessions(sessions, index);
  const game = (id = "p-1", owner = "sid-a") => startSession({ id, worldId: "w-1", ownerSid: owner, world: WORLD, seed: 3, now: clock.t });
  const turn = async (id = "p-1", owner = "sid-a") => {
    clock.t += 1600;
    const r = await plays.turn(id, owner, look);
    if (!r.ok) throw new Error(r.code);
    return r;
  };
  return { clock, index, sessions, plays, game, turn };
}

describe("lines over the Durable Object", () => {
  it("names the line a turn made, and gives it back to the owner as a line that fits the schema", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const r = await t.turn();
    expect(r.voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const line = await t.plays.voiceLine("p-1", "sid-a", r.voice!.lineId);
    expect(line).not.toBeNull();
    expect(VoiceLineSchema.safeParse(line).success).toBe(true);
    expect(line).toMatchObject({ id: r.voice!.lineId, text: r.reply.text });
  });
  it("gives the same null to another Session, a game that is not there, an unknown line and no line at all", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const r = await t.turn();
    const id = r.voice!.lineId;
    expect(await t.plays.voiceLine("p-1", "sid-b", id)).toBeNull();
    expect(await t.plays.voiceLine("p-nothing", "sid-a", id)).toBeNull();
    expect(await t.plays.voiceLine("p-1", "sid-a", "not-a-line-00000000000")).toBeNull();
    expect(await t.plays.voiceLine("p-1", "sid-a", "")).toBeNull();
  });
  it("keeps the lines in the game's own storage: a fresh adapter over the same objects still finds them", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const id = (await t.turn()).voice!.lineId;
    const other = new CloudflarePlaySessions(t.sessions, t.index);
    expect(await other.voiceLine("p-1", "sid-a", id)).not.toBeNull();
  });
  it("lets a line go after ten minutes, and the game itself after a day", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const id = (await t.turn()).voice!.lineId;
    const made = t.clock.t;
    t.clock.t = made + VOICE_LINE_TTL_MS - 1;
    expect(await t.plays.voiceLine("p-1", "sid-a", id)).not.toBeNull();
    t.clock.t = made + VOICE_LINE_TTL_MS;
    expect(await t.plays.voiceLine("p-1", "sid-a", id)).toBeNull();
  });
  it("settles the model's words into a new line and drops the scripted one", async () => {
    const t = setup();
    const g = t.game();
    await t.plays.start(g);
    const first = await t.turn();
    const s = await t.plays.settle("p-1", "sid-a", { stamp: g.createdAt, turn: 1, text: MODEL });
    expect(s).toMatchObject({ ok: true, applied: true });
    const settled = s as { voice?: { lineId: string } | null };
    expect(settled.voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(settled.voice!.lineId).not.toBe(first.voice!.lineId);
    expect(await t.plays.voiceLine("p-1", "sid-a", first.voice!.lineId)).toBeNull();
    expect(await t.plays.voiceLine("p-1", "sid-a", settled.voice!.lineId)).toMatchObject({ text: MODEL, spoken: MODEL });
  });
  it("forgets the lines when the game is played again", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const id = (await t.turn()).voice!.lineId;
    t.clock.t += 1600;
    expect((await t.plays.reset("p-1", "sid-a", { world: WORLD, seed: 5 })).ok).toBe(true);
    expect(await t.plays.voiceLine("p-1", "sid-a", id)).toBeNull();
  });
});

describe("PlaySession /voice-line (internal address)", () => {
  it("answers `{line}` for the owner, `{line: null}` for anything else, and only to POST", async () => {
    const t = setup();
    await t.plays.start(t.game());
    const id = (await t.turn()).voice!.lineId;
    const stub = t.sessions.get(t.sessions.idFromName("p-1"));
    const ask = async (body: unknown, method = "POST") => ((await stub.fetch("https://play-session/voice-line", { method, body: JSON.stringify(body) })).json() as Promise<{ line?: { id: string } | null }>);
    expect((await ask({ ownerSid: "sid-a", lineId: id })).line?.id).toBe(id);
    for (const bad of [{ ownerSid: "sid-b", lineId: id }, { ownerSid: "sid-a" }, { ownerSid: "sid-a", lineId: 7 }, { ownerSid: "sid-a", lineId: ["x"] }, { lineId: id }, {}]) {
      expect((await ask(bad)).line, JSON.stringify(bad)).toBeNull();
    }
    const get = await stub.fetch("https://play-session/voice-line", { method: "GET" });
    expect(get.status).toBe(404);
  });
});

describe("CloudflarePlaySessions.voiceLine when an object misbehaves", () => {
  const fake = (fetch: () => Promise<Response>) => {
    const ns = { idFromName: (n: string) => n, get: () => ({ fetch }) };
    return new CloudflarePlaySessions(ns, ns);
  };
  const json = (body: unknown) => async () => new Response(JSON.stringify(body));

  it("is null for an answer that is not a line, whatever else it holds", async () => {
    for (const answer of [{ line: { id: "x" } }, { line: "text" }, { line: null }, { line: { id: "ok-id", kind: "chat", speaker: "whisper", text: "t", spoken: "t", voice: "inworld:Pippa", createdAt: 1 } }, {}, null, 5]) {
      expect(await fake(json(answer)).voiceLine("p", "s", "l"), JSON.stringify(answer)).toBeNull();
    }
  });
  it("is null when the object answers with something that is not JSON, or cannot be reached", async () => {
    expect(await fake(async () => new Response("not json")).voiceLine("p", "s", "l")).toBeNull();
    expect(await fake(async () => { throw new Error("object unreachable"); }).voiceLine("p", "s", "l")).toBeNull();
  });
  it("hands back a line that fits the schema, as it came", async () => {
    const line = { id: "abc", kind: "narration", speaker: "keeper", text: "The kettle is warm.", spoken: "The kettle is warm.", voice: "inworld:Ronald", createdAt: 5 };
    expect(await fake(json({ line })).voiceLine("p", "s", "abc")).toEqual(line);
  });
});

describe("PlayVoiceLines", () => {
  it("asks the game by its id, its owner and the line's id, and gives back what it says", async () => {
    const asked: unknown[][] = [];
    const line = { id: "abc", kind: "narration", speaker: "whisper", text: "t", spoken: "t", voice: "inworld:Pippa", createdAt: 1 } as const;
    const lines = new PlayVoiceLines({ voiceLine: async (...args) => { asked.push(args); return args[2] === "abc" ? line : null; } });
    expect(await lines.find({ playId: "p-1", ownerSid: "sid-a" }, "abc")).toEqual(line);
    expect(await lines.find({ playId: "p-1", ownerSid: "sid-a" }, "zzz")).toBeNull();
    expect(asked).toEqual([["p-1", "sid-a", "abc"], ["p-1", "sid-a", "zzz"]]);
  });
});
