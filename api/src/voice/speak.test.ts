import { describe, expect, it } from "vitest";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import type { AiBinding } from "../guarded/workersai/call";
import { DEFAULT_TTS_FALLBACK_MODEL, DEFAULT_TTS_MODEL, WorkersAiSpeaker, type SpeechAnswer, type SpeechMaker, type SpeechRequest } from "../guarded/workersai/speak";
import { createLogger } from "../log";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechCache, type SpeechBucket } from "./cache";
import type { VoiceLines } from "./lines";
import { speakLine, type SpeakDeps } from "./speak";

const T0 = 1_700_000_000_000;
const SESSION = "sid-owner";
const WHO = { sessionId: SESSION, ipHash: "iphash" };
const SPOKEN = "Somebody was in the kitchen before you.";

const mp3 = (n = 4_000, fill = 7): Uint8Array => { const b = new Uint8Array(n).fill(fill); b[0] = 0xff; b[1] = 0xfb; return b; };
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const line = (over: Partial<VoiceLine> = {}): VoiceLine => ({ id: "L1", kind: "narration", speaker: "whisper", text: `${SPOKEN} The rest is only subtitle.`, spoken: SPOKEN, voice: "inworld:Pippa", createdAt: T0, ...over });

/** Lines found by game id, line id and owner, as the real port will: anyone else's, and anything unknown, is null. */
function fakeLines(held: Record<string, VoiceLine>, game = "p-1"): VoiceLines & { asked: number } {
  const f = { asked: 0, async find(scope: { playId: string; ownerSid: string }, id: string) { f.asked += 1; return scope.playId === game && scope.ownerSid === SESSION ? (held[id] ?? null) : null; } };
  return f;
}

/** A SpendGuard with a cap: it grants `cap` Tickets and then refuses; it records every commit and release. */
function fakeSpend(cap = 100) {
  const s = { reserved: [] as { meter: string; sessionId: string; ipHash: string }[], commits: [] as SpendTicket[], releases: [] as SpendTicket[], granted: 0 };
  return Object.assign(s, {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
      s.reserved.push({ meter: req.meter, sessionId: req.sessionId, ipHash: req.ipHash });
      if (s.granted >= cap) return { ok: false, reason: "session" };
      s.granted += 1;
      return { ok: true, ticket: { id: `t${s.granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit(t: SpendTicket) { s.commits.push(t); },
    async release(t: SpendTicket) { s.releases.push(t); },
  });
}

function fakeMaker(answer: SpeechAnswer | (() => SpeechAnswer | Promise<SpeechAnswer>)): SpeechMaker & { requests: SpeechRequest[] } {
  const m = { requests: [] as SpeechRequest[], async speak(req: SpeechRequest) { m.requests.push(req); return typeof answer === "function" ? answer() : answer; } };
  return m;
}
const good = (over: Partial<Extract<SpeechAnswer, { ok: true }>> = {}): SpeechAnswer => ({ ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: "inworld:Pippa", elapsedMs: 900, attempts: [{ step: "inworld", outcome: "ok", ms: 900 }], ...over });
const bad = (kind: Extract<SpeechAnswer, { ok: false }>["kind"]): SpeechAnswer => ({ ok: false, kind, elapsedMs: 5000, attempts: [] });

function setup(o: { held?: Record<string, VoiceLine>; cap?: number; maker?: SpeechMaker & { requests: SpeechRequest[] }; kill?: () => boolean } = {}) {
  const r2 = new FakeR2();
  const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => T0 });
  const lines = fakeLines(o.held ?? { L1: line() });
  const spend = fakeSpend(o.cap);
  const maker = o.maker ?? fakeMaker(good());
  const logged: string[] = [];
  const deps: SpeakDeps = { lines, cache, maker, spend, log: createLogger((l) => logged.push(l), () => T0), now: () => T0, ...(o.kill ? { kill: o.kill } : {}) };
  return { deps, r2, cache, lines, spend, maker, logged };
}
const ask = (deps: SpeakDeps, req = { playId: "p-1", lineId: "L1" }, who = WHO, defer?: (p: Promise<unknown>) => void) => speakLine(deps, who, req, defer);

describe("speakLine: finding the line", () => {
  it("is no_line, and nothing is looked up, reserved or called, for an unknown line, another game's line and another Session's line", async () => {
    for (const [req, who] of [
      [{ playId: "p-1", lineId: "nope" }, WHO],
      [{ playId: "p-2", lineId: "L1" }, WHO],
      [{ playId: "p-1", lineId: "L1" }, { ...WHO, sessionId: "sid-stranger" }],
    ] as const) {
      const t = setup();
      expect(await ask(t.deps, req, who)).toEqual({ ok: false, reason: "no_line", paid: false });
      expect(t.spend.reserved).toEqual([]);
      expect(t.maker.requests).toEqual([]);
      expect(t.r2.objects.size).toBe(0);
    }
  });
  it("is no_line, not an error, when the lines port throws", async () => {
    const t = setup();
    t.deps.lines = { find: async () => { throw new Error("DO unreachable"); } };
    expect(await ask(t.deps)).toMatchObject({ ok: false, reason: "no_line" });
  });
  it("is silent for a line with no spoken part, with nothing reserved or called", async () => {
    for (const spoken of ["", "   "]) {
      const t = setup({ held: { L1: line({ spoken }) } });
      expect(await ask(t.deps)).toEqual({ ok: false, reason: "silent", paid: false });
      expect(t.spend.reserved).toEqual([]);
      expect(t.maker.requests).toEqual([]);
    }
  });
});

describe("speakLine: the cache is a free read", () => {
  it("plays a cached clip with no Ticket and no call", async () => {
    const t = setup();
    await t.cache.put("inworld:Pippa", SPOKEN, mp3(4_000, 5));
    const r = await ask(t.deps);
    expect(r).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(r.ok && r.audio).toEqual(mp3(4_000, 5));
    expect(t.spend.reserved).toEqual([]);
    expect(t.maker.requests).toEqual([]);
  });
  it("plays a cached Aura-2 clip when there is no Inworld one", async () => {
    const t = setup();
    await t.cache.put("aura-2:luna", SPOKEN, mp3(4_000, 6));
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache" });
    expect(t.maker.requests).toEqual([]);
  });
  it("still plays it when every cap is spent and the kill switch is on", async () => {
    const t = setup({ cap: 0, kill: () => true });
    await t.cache.put("inworld:Pippa", SPOKEN, mp3());
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(t.spend.reserved).toEqual([]);
  });
});

describe("speakLine: a miss is paid for once and then kept", () => {
  it("reserves a tts Ticket for this Session and address, speaks the line's own words in its Speaker's voice, commits, and keeps the clip", async () => {
    const t = setup();
    const r = await ask(t.deps);
    expect(r).toMatchObject({ ok: true, via: "inworld", paid: true });
    expect(t.spend.reserved).toEqual([{ meter: "tts", sessionId: SESSION, ipHash: "iphash" }]);
    expect(t.maker.requests).toEqual([{ speaker: "whisper", spoken: SPOKEN }]);
    expect(t.spend.commits).toHaveLength(1);
    expect(t.spend.releases).toHaveLength(0);
    expect(t.r2.objects.size).toBe(1);
  });
  it("hears the same line again from the cache: no second call and no second Ticket", async () => {
    const t = setup();
    await ask(t.deps);
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(t.maker.requests).toHaveLength(1);
    expect(t.spend.reserved).toHaveLength(1);
  });
  it("keeps an Aura-2 clip under the Aura-2 voice, so the next request finds it", async () => {
    const t = setup({ maker: fakeMaker(good({ via: "aura", voice: "aura-2:luna" })) });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "aura" });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache" });
    expect(t.maker.requests).toHaveLength(1);
  });
  it("tells the maker which of the Lodger's six is speaking", async () => {
    const t = setup({ held: { L1: line({ speaker: "lodger", voice: "inworld:Chloe" }) } });
    await ask(t.deps);
    expect(t.maker.requests).toEqual([{ speaker: "lodger", lodgerVoice: "chloe", spoken: SPOKEN }]);
  });
  it("hands the cache write to `defer` when it is given, and the answer does not wait for it", async () => {
    const t = setup();
    const deferred: Promise<unknown>[] = [];
    const r = await ask(t.deps, undefined, WHO, (p) => deferred.push(p));
    expect(r.ok).toBe(true);
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect(t.r2.objects.size).toBe(1);
  });
  it("still answers when the cache cannot be written", async () => {
    const t = setup();
    const broken: SpeechBucket = { get: async () => null, put: () => { throw new Error("R2 is down"); } };
    t.deps.cache = new R2SpeechCache(broken, { now: () => T0 });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "inworld" });
  });
});

describe("speakLine: when it cannot speak", () => {
  it("is denied, with no call, when a cap is spent, and the cache is not touched", async () => {
    const t = setup({ cap: 0 });
    expect(await ask(t.deps)).toEqual({ ok: false, reason: "denied", paid: false });
    expect(t.maker.requests).toEqual([]);
    expect(t.r2.objects.size).toBe(0);
  });
  it("is killed, with nothing reserved and no call, when paid calls are off", async () => {
    const t = setup({ kill: () => true });
    expect(await ask(t.deps)).toEqual({ ok: false, reason: "killed", paid: false });
    expect(t.spend.reserved).toEqual([]);
    expect(t.maker.requests).toEqual([]);
  });
  it("is failed, releases the Ticket and keeps nothing, when the voice gives nothing and costs nothing", async () => {
    for (const kind of ["failed", "rate_limited", "invalid"] as const) {
      const t = setup({ maker: fakeMaker(bad(kind)) });
      expect(await ask(t.deps)).toEqual({ ok: false, reason: "failed", paid: false });
      expect([t.spend.commits.length, t.spend.releases.length]).toEqual([0, 1]);
      expect(t.r2.objects.size).toBe(0);
    }
  });
  it("is failed but PAID, commits the Ticket and keeps nothing, when a model answered with nothing playable", async () => {
    const t = setup({ maker: fakeMaker(bad("unusable")) });
    expect(await ask(t.deps)).toEqual({ ok: false, reason: "failed", paid: true });
    expect([t.spend.commits.length, t.spend.releases.length]).toEqual([1, 0]);
    expect(t.r2.objects.size).toBe(0);
  });
  it("is failed and releases the Ticket when the maker throws", async () => {
    const t = setup({ maker: fakeMaker(() => { throw new Error("binding exploded"); }) });
    expect(await ask(t.deps)).toEqual({ ok: false, reason: "failed", paid: false });
    expect([t.spend.commits.length, t.spend.releases.length]).toEqual([0, 1]);
  });
  it("never grants more Tickets than the cap, however many different lines are asked for", async () => {
    const held = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`L${i}`, line({ id: `L${i}`, spoken: `${SPOKEN} Number ${i}.` })]));
    const t = setup({ held, cap: 3 });
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await ask(t.deps, { playId: "p-1", lineId: `L${i}` }));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === "denied")).toHaveLength(7);
    expect(t.maker.requests).toHaveLength(3);
  });
});

describe("speakLine: with the real voice wrapper and a fake Workers AI", () => {
  const fakeAi = (by: Record<string, unknown>): AiBinding & { seen: string[] } => {
    const seen: string[] = [];
    return { seen, async run(model) { seen.push(model); const v = by[model]; if (v instanceof Error) throw v; return v; } };
  };
  it("speaks through Inworld once, keeps the clip, and a second request makes no AI call at all", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    const t = setup({ maker: new WorkersAiSpeaker(ai) as never });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "inworld", paid: true });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(ai.seen).toEqual([DEFAULT_TTS_MODEL]);
  });
  it("falls back to Aura-2 on the same Ticket, and caches it under the Aura-2 voice", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("500"), [DEFAULT_TTS_FALLBACK_MODEL]: mp3().buffer });
    const t = setup({ maker: new WorkersAiSpeaker(ai) as never });
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "aura", paid: true });
    expect(t.spend.reserved).toHaveLength(1);
    expect(t.spend.commits).toHaveLength(1);
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache" });
    expect(ai.seen).toEqual([DEFAULT_TTS_MODEL, DEFAULT_TTS_FALLBACK_MODEL]);
  });
  it("refuses a line whose spoken text holds a Steering Tag or markup before any model call, and releases the Ticket", async () => {
    const ai = fakeAi({});
    const t = setup({ held: { L1: line({ spoken: "[whisper] hello there" }) }, maker: new WorkersAiSpeaker(ai) as never });
    expect(await ask(t.deps)).toEqual({ ok: false, reason: "failed", paid: false });
    expect(ai.seen).toEqual([]);
    expect([t.spend.commits.length, t.spend.releases.length]).toEqual([0, 1]);
  });
});

describe("speakLine: what it logs", () => {
  it("writes exactly one voice.speak line per request, with counters only", async () => {
    const t = setup();
    await ask(t.deps);                                  // inworld, paid
    await ask(t.deps);                                  // cache
    await ask(t.deps, { playId: "p-1", lineId: "zz" }); // no_line
    const lines = t.logged.map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.event, l.via, l.outcome, l.paid])).toEqual([
      ["voice.speak", "inworld", "ok", true],
      ["voice.speak", "cache", "ok", false],
      ["voice.speak", "none", "no_line", false],
    ]);
    for (const l of lines) expect(Object.keys(l).sort()).toEqual(["event", "level", "ms", "outcome", "paid", "t", "via"]);
  });
  it("never writes the line's words, a line id, a game id, a Session id, the address hash or the audio", async () => {
    const t = setup();
    await ask(t.deps);
    await ask(t.deps);
    await ask(t.deps, { playId: "p-1", lineId: "zz" });
    const everything = t.logged.join("\n");
    for (const secret of [SPOKEN, "kitchen", "subtitle", "L1", "zz", "p-1", SESSION, "iphash", "AAAA", "inworld:Pippa", "[whisper]"]) expect(everything).not.toContain(secret);
  });
});
