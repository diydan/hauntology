import { startSession, type WorldFacts } from "@hauntology/shared/ghost/play";
import { SESSION_TTL_MS, type PlaySession } from "@hauntology/shared/ghost/session";
import { VOICE_LINES_KEPT, VOICE_LINE_TTL_MS } from "@hauntology/shared/voice/line";
import { describe, expect, it } from "vitest";
import { readSettle } from "./core";
import { MemoryPlaySessions } from "./memory";

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const T0 = 1_000_000;
const GAP = 1600;
const FAR = { pos: [11, 0, 11], yaw: 0 };
const OWNER = "sid-owner";
const MODEL = "The window over the sink is fogged. The rain is soft on the glass tonight, and I remember the kettle.";

/** A game kept in memory with a clock the test moves and line ids it can count on. */
function setup(over: { ids?: boolean } = {}) {
  const clock = { t: T0 };
  let n = 0;
  const sessions = new MemoryPlaySessions(() => clock.t, over.ids === false ? undefined : () => `id-${++n}`);
  const session: PlaySession = { ...startSession({ id: "p-1", worldId: "w-1", ownerSid: OWNER, world: WORLD, seed: 42, now: T0 }), voice: "wistful" };
  const begin = () => sessions.start(session);
  const turn = async (input: unknown = { button: "look" }, pose: unknown = FAR) => {
    clock.t += GAP;
    const r = await sessions.turn("p-1", OWNER, { input, pose, world: { bounds: WORLD.bounds, brief: WORLD.brief } });
    if (!r.ok) throw new Error(r.code);
    return r;
  };
  return { clock, sessions, session, begin, turn };
}

describe("a turn names the line it was kept as", () => {
  it("gives the line's id, and the game can hand the line back to its owner", async () => {
    const t = setup();
    await t.begin();
    const r = await t.turn();
    expect(r.voice).toEqual({ lineId: "id-1" });
    const line = await t.sessions.voiceLine("p-1", OWNER, "id-1");
    expect(line).toMatchObject({ id: "id-1", kind: "narration", speaker: "whisper", voice: "inworld:Pippa", text: r.reply.text });
    expect(line!.spoken).not.toBe("");
    expect(r.reply.text.startsWith(line!.spoken)).toBe(true);
  });
  it("is the same null for another Session's game, a game that is not there, and a line that is not there", async () => {
    const t = setup();
    await t.begin();
    await t.turn();
    expect(await t.sessions.voiceLine("p-1", "sid-stranger", "id-1")).toBeNull();
    expect(await t.sessions.voiceLine("p-nope", OWNER, "id-1")).toBeNull();
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-zzz")).toBeNull();
    expect(await t.sessions.voiceLine("p-1", OWNER, "")).toBeNull();
  });
  it("lets a line go after ten minutes, to the millisecond", async () => {
    const t = setup();
    await t.begin();
    await t.turn(); // made at T0 + GAP
    t.clock.t = T0 + GAP + VOICE_LINE_TTL_MS - 1;
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-1")).not.toBeNull();
    t.clock.t = T0 + GAP + VOICE_LINE_TTL_MS;
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-1")).toBeNull();
  });
  it("gives nothing once the game itself has run out", async () => {
    const t = setup();
    await t.begin();
    await t.turn();
    t.clock.t = T0 + SESSION_TTL_MS + 1;
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-1")).toBeNull();
  });
  it("keeps the last 8 lines and no more", async () => {
    const t = setup();
    await t.begin();
    for (let i = 0; i < 12; i++) await t.turn();
    const found: string[] = [];
    for (let i = 1; i <= 12; i++) if ((await t.sessions.voiceLine("p-1", OWNER, `id-${i}`)) !== null) found.push(`id-${i}`);
    expect(found).toEqual(["id-5", "id-6", "id-7", "id-8", "id-9", "id-10", "id-11", "id-12"]);
    expect(found).toHaveLength(VOICE_LINES_KEPT);
  });
  it("forgets every line when the game is played again", async () => {
    const t = setup();
    await t.begin();
    await t.turn();
    t.clock.t += GAP;
    expect((await t.sessions.reset("p-1", OWNER, { world: WORLD, seed: 7 })).ok).toBe(true);
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-1")).toBeNull();
  });
  it("makes ids that cannot be guessed when it is not given any: 22 characters of base64url, every one different", async () => {
    const t = setup({ ids: false });
    await t.begin();
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const r = await t.turn();
      expect(r.voice).not.toBeNull();
      expect(r.voice!.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
      ids.add(r.voice!.lineId);
    }
    expect(ids.size).toBe(25);
  });
  it("makes no difference to the game: the same turns give the same reply, directive and view whatever the line ids are", async () => {
    const a = setup();
    const b = setup({ ids: false });
    await a.begin();
    await b.begin();
    for (let i = 0; i < 4; i++) {
      const x = await a.turn();
      const y = await b.turn();
      expect(x.reply.text).toBe(y.reply.text);
      expect(x.directive).toBe(y.directive);
      expect(x.view).toEqual(y.view);
    }
  });
});

describe("the model's words for a turn settle the line", () => {
  const settleOf = (session: PlaySession, text = MODEL, extra: Record<string, unknown> = {}) => ({ stamp: session.createdAt, turn: 1, text, ...extra });

  it("gives the line for the words the visitor saw under a new id, and the scripted turn's line is gone", async () => {
    const t = setup();
    await t.begin();
    const first = await t.turn(); // id-1: the scripted line
    const s = await t.sessions.settle("p-1", OWNER, settleOf(t.session));
    expect(s).toMatchObject({ ok: true, applied: true, voice: { lineId: "id-2" } });
    expect(await t.sessions.voiceLine("p-1", OWNER, first.voice!.lineId)).toBeNull();
    expect(await t.sessions.voiceLine("p-1", OWNER, "id-2")).toMatchObject({ id: "id-2", text: MODEL, spoken: MODEL, speaker: "whisper" });
  });
  it("keeps the words the visitor typed out of the line, and gives no line at all when nothing is left to say", async () => {
    const t = setup();
    await t.begin();
    await t.turn({ text: "my name is Marguerite" });
    const echo = "Marguerite, the window over the sink is fogged. The rain is soft on the glass tonight.";
    const s = await t.sessions.settle("p-1", OWNER, settleOf(t.session, echo, { typed: "my name is Marguerite" }));
    expect(s).toMatchObject({ ok: true, applied: true, voice: null });
    const second = setup();
    await second.begin();
    await second.turn({ text: "my name is Marguerite" });
    const later = "The window over the sink is fogged. Marguerite, the rain is soft on the glass tonight.";
    const s2 = await second.sessions.settle("p-1", OWNER, settleOf(second.session, later, { typed: "my name is Marguerite" }));
    expect(s2).toMatchObject({ voice: { lineId: "id-2" } });
    expect((await second.sessions.voiceLine("p-1", OWNER, "id-2"))!.spoken).toBe("The window over the sink is fogged.");
  });
  it("is not applied, and leaves the scripted line, for words that belong to another game", async () => {
    const t = setup();
    await t.begin();
    const first = await t.turn();
    const s = await t.sessions.settle("p-1", OWNER, { stamp: t.session.createdAt + 1, turn: 1, text: MODEL });
    expect(s).toEqual({ ok: true, applied: false });
    expect(await t.sessions.voiceLine("p-1", OWNER, first.voice!.lineId)).not.toBeNull();
  });
  it("is not applied for something that is not a settle", async () => {
    const t = setup();
    await t.begin();
    await t.turn();
    for (const bad of [null, "x", { stamp: 1 }, settleOf(t.session, MODEL, { typed: 7 }), settleOf(t.session, MODEL, { typed: "" }), settleOf(t.session, "")]) {
      expect(await t.sessions.settle("p-1", OWNER, bad as never)).toEqual({ ok: true, applied: false });
    }
  });
  it("is refused as no game for another Session, like any settle", async () => {
    const t = setup();
    await t.begin();
    await t.turn();
    expect(await t.sessions.settle("p-1", "sid-stranger", settleOf(t.session))).toMatchObject({ ok: false, code: "session_not_found" });
  });
});

describe("readSettle and what the visitor typed", () => {
  const base = { stamp: 5, turn: 1, text: MODEL };
  it("accepts typed words, and none", () => {
    expect(readSettle({ ...base, typed: "hello there" })).toEqual({ ...base, typed: "hello there" });
    expect(readSettle(base)).toEqual(base);
  });
  it("accepts typed words with a memory", () => {
    expect(readSettle({ ...base, typed: "hi", memory: { anchorId: "a1", text: MODEL } })).toEqual({ ...base, typed: "hi", memory: { anchorId: "a1", text: MODEL } });
  });
  it("refuses typed words that are not a plain text: a number, an empty text, a blank one, an object, or more than 2000 characters", () => {
    for (const typed of [7, "", "   ", {}, null, "x".repeat(2001)]) expect(readSettle({ ...base, typed }), String(typed).slice(0, 10)).toBeNull();
  });
});
