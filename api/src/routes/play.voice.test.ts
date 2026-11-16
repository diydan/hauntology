import { voiceOfPreset } from "@hauntology/shared/ghost/scripted";
import { singleFlight } from "@hauntology/shared/voice/flight";
import { VOICE_LINE_TTL_MS } from "@hauntology/shared/voice/line";
import { speakerForGhostVoice, voiceFor } from "@hauntology/shared/voice/voices";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import { describe, expect, it } from "vitest";
import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import type { SpeechMaker, SpeechRequest } from "../guarded/workersai/speak";
import { MemoryPlaySessions } from "../play/memory";
import type { Narration } from "../play/narrate";
import { R2SpeechCache, type SpeechBucket } from "../voice/cache";
import { R2SpeechLibrary, type LibraryBucket } from "../voice/library";
import { PlayVoiceLines } from "../voice/lines";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { NOW, ORIGIN, worldsKit, type Visitor } from "../worlds/test-kit";

// ghost-voice 3.5 and 3.6 through the real app: a turn names the line its reply was kept as, and the speech route plays it.

const ID = "w-kitchen-0000000000";
const CLOCK = { t: NOW };
const LINE = "The window over the sink is fogged, and the rain is soft on the glass tonight.";
const mp3 = (): Uint8Array => { const b = new Uint8Array(4_000).fill(7); b[0] = 0xff; b[1] = 0xfb; return b; };
const UNAVAILABLE = { ok: false, code: "voice_unavailable" };

const ok = (text: string): NarrationAnswer => ({ ok: true, text, stopReason: "end_turn", usage: { inputTokens: 600, outputTokens: 40 }, thinkingBlocks: 0, shape: [] });
function model(say: (req: NarrationRequest, n: number) => string): Narrator & { calls: NarrationRequest[] } {
  const calls: NarrationRequest[] = [];
  return { calls, async narrate(req) { calls.push(req); return ok(say(req, calls.length)); } };
}

function setup(over: { narrator?: Narrator; voice?: boolean; env?: Record<string, string> } = {}) {
  CLOCK.t = NOW;
  const sessions = new MemoryPlaySessions(() => CLOCK.t);
  const r2 = new FakeR2();
  const requests: SpeechRequest[] = [];
  const maker: SpeechMaker = {
    async speak(req) {
      requests.push(req);
      return { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: voiceFor(req.speaker, "inworld", req.lodgerVoice), elapsedMs: 5, attempts: [] };
    },
  };
  let granted = 0;
  const spend = {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> { granted += 1; return { ok: true, ticket: { id: `t${granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } }; },
    async commit() {},
    async release() {},
  };
  const narration: Narration | undefined = over.narrator === undefined ? undefined : { narrator: over.narrator, spend: new MemorySpendGuard({ ...DEFAULT_CAPS, llm: { session: 40, day: 1500 } }, () => CLOCK.t), enabled: true, now: () => CLOCK.t };
  const speak = { lines: new PlayVoiceLines(sessions), cache: new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => CLOCK.t }), library: new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket), maker, spend, flights: singleFlight(), now: () => CLOCK.t };
  const kit = worldsKit(() => CLOCK.t, { play: { sessions, ...(narration ? { narration } : {}) }, ...(over.voice === false ? {} : { voice: { speak } }), ...(over.env ? { env: over.env } : {}) });

  const start = (v: Visitor, body: unknown) => kit.send("/api/play/start", { method: "POST", headers: v.headers, body });
  const turn = (v: Visitor, id: string, body: unknown) => kit.send(`/api/play/${id}/turn`, { method: "POST", headers: v.headers, body });
  /** `app.request` directly, so the audio bytes are not turned into text on the way. */
  const speakRaw = async (headers: Record<string, string>, body: unknown) => {
    const res = await kit.app.request(`${ORIGIN}/api/voice/speak`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }, kit.env);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, bytes, text: new TextDecoder().decode(bytes) };
  };
  const wait = (ms = 2000) => void (CLOCK.t += ms);
  return { kit, sessions, requests, r2, start, turn, speak: speakRaw, wait, granted: () => granted };
}

type Anchors = Array<{ id: string; pos: [number, number, number]; radius: number }>;
type Reply = { text: string; scripted: boolean; voice?: { lineId: string } };
const anchorsOf = (r: { json: unknown }): Anchors => (r.json as { view: { anchors: Anchors } }).view.anchors;
const at = (a: { pos: [number, number, number] }) => ({ pos: a.pos, yaw: 0 });
/** A place at least 2.6 metres from every anchor, so a turn there finds nothing. */
function away(anchors: Anchors): { pos: [number, number, number]; yaw: number } {
  let best: [number, number, number] = [-5, 0, -5];
  let reach = -1;
  for (let x = -5; x <= 5; x += 0.5) for (let z = -5; z <= 5; z += 0.5) {
    const d = Math.min(...anchors.map((a) => Math.hypot(a.pos[0] - x, a.pos[2] - z)));
    if (d > reach) { reach = d; best = [x, 0, z]; }
  }
  if (reach < 2.6) throw new Error("no place out of reach of every anchor");
  return { pos: best, yaw: 0 };
}
async function begin(t: ReturnType<typeof setup>) {
  const owner = await t.kit.visitor();
  t.kit.readyWorld(ID, owner);
  const r = await t.start(owner, { worldId: ID });
  const anchors = anchorsOf(r);
  return { owner, playId: (r.json as { playId: string }).playId, anchors, away: away(anchors) };
}
const replyOf = (r: { json: unknown }): Reply => (r.json as { reply: Reply }).reply;

describe("a reply names the line it can be heard as", () => {
  it("gives an unguessable line id, and the speech route plays that line: the ghost's own Speaker, the first sentences of the reply, no Steering Tag", async () => {
    const t = setup();
    const g = await begin(t);
    t.wait();
    const r = await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away });
    const reply = replyOf(r);
    expect(reply.voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const heard = await t.speak(g.owner.headers, { playId: g.playId, lineId: reply.voice!.lineId });
    expect(heard.status).toBe(200);
    expect(heard.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(heard.bytes).toEqual(mp3());
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.speaker).toBe(speakerForGhostVoice(voiceOfPreset(undefined)));
    expect(reply.text.startsWith(t.requests[0]!.spoken)).toBe(true);
    expect(t.requests[0]!.spoken).not.toMatch(/[[\]]/);
  });
  it("plays the same line again from the cache, with one call to the voice", async () => {
    const t = setup();
    const g = await begin(t);
    t.wait();
    const lineId = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice!.lineId;
    await t.speak(g.owner.headers, { playId: g.playId, lineId });
    const again = await t.speak(g.owner.headers, { playId: g.playId, lineId });
    expect(again.status).toBe(200);
    expect(t.requests).toHaveLength(1);
    expect(t.granted()).toBe(1);
  });
  it("gives each turn its own line, and the earlier line can still be heard", async () => {
    const t = setup();
    const g = await begin(t);
    t.wait();
    const first = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice!.lineId;
    t.wait();
    const second = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice!.lineId;
    expect(second).not.toBe(first);
    expect((await t.speak(g.owner.headers, { playId: g.playId, lineId: first })).status).toBe(200);
    expect((await t.speak(g.owner.headers, { playId: g.playId, lineId: second })).status).toBe(200);
  });
  it("is the same 404 for another visitor as for a line that was never there", async () => {
    const t = setup();
    const g = await begin(t);
    t.wait();
    const lineId = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice!.lineId;
    const stranger = await t.kit.visitor();
    const theirs = await t.speak(stranger.headers, { playId: g.playId, lineId });
    const nothing = await t.speak(g.owner.headers, { playId: g.playId, lineId: "no-such-line-0000000000" });
    expect([theirs.status, theirs.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
    expect([nothing.status, nothing.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
    expect(t.requests).toEqual([]);
  });
  it("lets the line go after ten minutes", async () => {
    const t = setup();
    const g = await begin(t);
    t.wait();
    const lineId = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice!.lineId;
    t.wait(VOICE_LINE_TTL_MS - 5_000);
    expect((await t.speak(g.owner.headers, { playId: g.playId, lineId })).status).toBe(200);
    t.wait(10_000);
    // The clip is in the cache by now, but the line is what is looked up first, and it has gone: the same 404 as for a line that never was.
    const late = await t.speak(g.owner.headers, { playId: g.playId, lineId });
    expect([late.status, late.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
    expect(t.requests).toHaveLength(1);
  });
  it("speaks the ending: the last reply of a game has a line, a spoken part of at most 240 characters, that starts the reply", async () => {
    const t = setup();
    const g = await begin(t);
    let last: Reply | null = null;
    for (const a of g.anchors) {
      t.wait();
      last = replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: at(a) }));
      expect(last.voice, "every reply of the game names a line").toBeDefined();
    }
    const heard = await t.speak(g.owner.headers, { playId: g.playId, lineId: last!.voice!.lineId });
    expect(heard.status).toBe(200);
    const spoken = t.requests.at(-1)!.spoken;
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.length).toBeLessThanOrEqual(240);
    expect(last!.text.startsWith(spoken)).toBe(true);
  });
});

describe("when speech is not served or not on", () => {
  it("names no line, and there is no speech route, when the app has none", async () => {
    const t = setup({ voice: false });
    const g = await begin(t);
    t.wait();
    const r = await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away });
    expect(replyOf(r)).toEqual({ text: replyOf(r).text, scripted: true });
    expect("voice" in replyOf(r)).toBe(false);
    expect((await t.speak(g.owner.headers, { playId: g.playId, lineId: "anything-at-all-0000000" })).status).toBe(404);
  });
  it("names no line while VOICE_ENABLED is off, and the speech route is quiet", async () => {
    const t = setup({ env: { VOICE_ENABLED: "false" } });
    const g = await begin(t);
    t.wait();
    const r = await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away });
    expect("voice" in replyOf(r)).toBe(false);
    const heard = await t.speak(g.owner.headers, { playId: g.playId, lineId: "anything-at-all-0000000" });
    expect([heard.status, heard.text]).toEqual([503, JSON.stringify(UNAVAILABLE)]);
    expect(t.requests).toEqual([]);
  });
  it("starts naming lines again when speech is switched back on", async () => {
    const t = setup({ env: { VOICE_ENABLED: "false" } });
    const g = await begin(t);
    t.wait();
    expect("voice" in replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away }))).toBe(false);
    t.kit.env["VOICE_ENABLED"] = "true";
    t.wait();
    expect(replyOf(await t.turn(g.owner, g.playId, { input: { button: "look" }, pose: g.away })).voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("with the model's words", () => {
  it("makes the line for the words the visitor sees: the speech route is given the model's words, not the scripted ones", async () => {
    const t = setup({ narrator: model(() => LINE) });
    const g = await begin(t);
    t.wait();
    const r = await t.turn(g.owner, g.playId, { input: { text: "hello ghost" }, pose: g.away });
    const reply = replyOf(r);
    expect(reply).toMatchObject({ text: LINE, scripted: false });
    expect(reply.voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await t.speak(g.owner.headers, { playId: g.playId, lineId: reply.voice!.lineId })).status).toBe(200);
    expect(t.requests[0]!.spoken).toBe(LINE);
  });
  it("keeps a typed word out of speech: a first sentence that holds it leaves the line with nothing to say, so no line is named", async () => {
    const t = setup({ narrator: model(() => "Marguerite, the window over the sink is fogged. The rain is soft on the glass tonight.") });
    const g = await begin(t);
    t.wait();
    const r = await t.turn(g.owner, g.playId, { input: { text: "hello Marguerite" }, pose: g.away });
    const reply = replyOf(r);
    expect(reply.text.startsWith("Marguerite, the window")).toBe(true); // the Subtitle shows every word
    expect(reply.scripted).toBe(false);
    expect("voice" in reply).toBe(false);
    expect(t.requests).toEqual([]);
  });
  it("speaks only the sentences before the one that holds a typed word", async () => {
    const t = setup({ narrator: model(() => "The window over the sink is fogged. Marguerite, the rain is soft on the glass tonight.") });
    const g = await begin(t);
    t.wait();
    const reply = replyOf(await t.turn(g.owner, g.playId, { input: { text: "hello Marguerite" }, pose: g.away }));
    expect(reply.text).toContain("Marguerite");
    await t.speak(g.owner.headers, { playId: g.playId, lineId: reply.voice!.lineId });
    expect(t.requests[0]!.spoken).toBe("The window over the sink is fogged.");
  });
  it("uses the scripted line when the model's words are not kept: the line is for the scripted words the visitor sees", async () => {
    const t = setup({ narrator: model(() => "Somewhere near, I think.") }); // bad for a hint, twice: the scripted hint is shown
    const g = await begin(t);
    t.wait();
    const reply = replyOf(await t.turn(g.owner, g.playId, { input: { button: "hint" }, pose: g.away }));
    expect(reply.scripted).toBe(true);
    await t.speak(g.owner.headers, { playId: g.playId, lineId: reply.voice!.lineId });
    expect(reply.text.startsWith(t.requests[0]!.spoken)).toBe(true);
    expect(t.requests[0]!.spoken).not.toContain("Somewhere near");
  });
});
