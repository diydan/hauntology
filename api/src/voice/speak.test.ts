import { describe, expect, it } from "vitest";
import { createEngine, publicSnapshot, step } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { SCRIPTED_BANKS } from "@hauntology/shared/voice/banks/index";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { singleFlight } from "@hauntology/shared/voice/flight";
import { LIBRARY_PREFIX, canonicalSpeechKey, libraryKey } from "@hauntology/shared/voice/key";
import { buildLibrary, prefetchPlan } from "@hauntology/shared/voice/library";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import { FINITE_VALUES } from "@hauntology/shared/voice/placeholders";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import type { AiBinding } from "../guarded/workersai/call";
import { DEFAULT_TTS_FALLBACK_MODEL, DEFAULT_TTS_MODEL, WorkersAiSpeaker, type SpeechAnswer, type SpeechMaker, type SpeechRequest } from "../guarded/workersai/speak";
import { createLogger } from "../log";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechCache, type SpeechBucket } from "./cache";
import { R2SpeechLibrary, type LibraryBucket } from "./library";
import type { VoiceLines } from "./lines";
import { speakFoundLine, speakLine, type SpeakDeps } from "./speak";

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
  const libR2 = new FakeR2();
  const library = new R2SpeechLibrary(libR2 as unknown as LibraryBucket);
  const flights = countingFlights();
  const deps: SpeakDeps = { lines, cache, maker, spend, library, flights, log: createLogger((l) => logged.push(l), () => T0), now: () => T0, ...(o.kill ? { kill: o.kill } : {}) };
  return { deps, r2, libR2, flights, cache, lines, spend, maker, logged };
}
const ask = (deps: SpeakDeps, req: { playId: string; lineId: string; prefetch?: boolean } = { playId: "p-1", lineId: "L1" }, who = WHO, defer?: (p: Promise<unknown>) => void) => speakLine(deps, who, req, defer);

/** A maker that holds every call open until the test lets it go, to make requests overlap. */
function gatedMaker(answer: SpeechAnswer = good()) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const m = { requests: [] as SpeechRequest[], release, async speak(req: SpeechRequest) { m.requests.push(req); await gate; return answer; } };
  return m;
}
/** A real single flight that counts the requests that have reached it, so a test can wait until every request is in before it lets the call finish. */
function countingFlights() {
  const inner = singleFlight();
  const f = { runs: 0, run: <T>(key: string, make: () => Promise<T>): Promise<T> => { f.runs += 1; return inner.run(key, make); }, has: (key: string) => inner.has(key), get size() { return inner.size; } };
  return f;
}
/** Waits for a condition (a request needs several real `crypto.subtle` digests before it gets anywhere, so a fixed pause is not enough). */
async function until(cond: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for the requests to arrive");
    await new Promise((r) => setTimeout(r, 1));
  }
}

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
    for (const l of lines) expect(Object.keys(l).sort()).toEqual(["event", "level", "ms", "outcome", "paid", "prefetch", "t", "via"]);
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

const putLibrary = async (t: ReturnType<typeof setup>, voice: "inworld:Pippa" | "inworld:Chloe" | "inworld:Mark", spoken: string, bytes: Uint8Array) => { t.libR2.put(await libraryKey(voice, spoken, sha256Hex), bytes); };
const PREFETCH = { playId: "p-1", lineId: "L1", prefetch: true };

describe("speakLine: the Library tier", () => {
  it("plays a scripted line from the Library with no Ticket, no call and no cache read, even with every cap spent and the kill switch on", async () => {
    const t = setup({ cap: 0, kill: () => true });
    await putLibrary(t, "inworld:Pippa", SPOKEN, mp3(4_000, 4));
    const r = await ask(t.deps);
    expect(r).toMatchObject({ ok: true, via: "library", paid: false });
    expect(r.ok && r.audio).toEqual(mp3(4_000, 4));
    expect(t.spend.reserved).toEqual([]);
    expect(t.maker.requests).toEqual([]);
    expect(t.r2.objects.size).toBe(0);
  });
  it("prefers the Library to the cache", async () => {
    const t = setup();
    await putLibrary(t, "inworld:Pippa", SPOKEN, mp3(4_000, 1));
    await t.cache.put("inworld:Pippa", SPOKEN, mp3(4_000, 2));
    const r = await ask(t.deps);
    expect(r).toMatchObject({ ok: true, via: "library" });
    expect(r.ok && r.audio).toEqual(mp3(4_000, 1));
  });
  it("goes on to the cache when the Library has nothing, and to a paid call when neither has", async () => {
    const t = setup();
    await t.cache.put("inworld:Pippa", SPOKEN, mp3());
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache" });
    const u = setup();
    expect(await ask(u.deps)).toMatchObject({ ok: true, via: "inworld", paid: true });
  });
  it("finds a Lodger line in its own voice's Library file and not in another Lodger voice's", async () => {
    const chloe = setup({ held: { L1: line({ speaker: "lodger", voice: "inworld:Chloe" }) } });
    await putLibrary(chloe, "inworld:Chloe", SPOKEN, mp3());
    expect(await ask(chloe.deps)).toMatchObject({ ok: true, via: "library" });
    const other = setup({ held: { L1: line({ speaker: "lodger", voice: "inworld:Chloe" }) } });
    await putLibrary(other, "inworld:Mark", SPOKEN, mp3());
    expect(await ask(other.deps)).toMatchObject({ ok: true, via: "inworld", paid: true });
  });
  it("goes on when the Library cannot be read", async () => {
    const t = setup();
    t.deps.library = new R2SpeechLibrary({ get: () => { throw new Error("R2 is down"); } } as unknown as LibraryBucket);
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "inworld", paid: true });
  });
  it("works with no Library given: only the cache is read", async () => {
    const t = setup();
    delete t.deps.library;
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "inworld" });
  });
  it("never writes to the Library: a paid clip is kept under speech/v1/ and nothing is added under speech/lib/", async () => {
    const t = setup();
    await ask(t.deps);
    expect(t.libR2.objects.size).toBe(0);
    expect([...t.r2.objects.keys()].every((k) => k.startsWith("speech/v1/") && !k.startsWith(LIBRARY_PREFIX))).toBe(true);
  });
});

describe("speakLine: single flight", () => {
  it("makes one call for two overlapping requests for one line: the first pays, the second joins it and pays nothing", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    const a = ask(t.deps);
    const b = ask(t.deps);
    await until(() => t.flights.runs === 2 && maker.requests.length === 1);
    expect(t.flights.has(canonicalSpeechKey("inworld:Pippa", SPOKEN))).toBe(true); // the call is running, and the second request is waiting on it
    maker.release();
    const results = await Promise.all([a, b]);
    expect(maker.requests).toHaveLength(1);
    // which of two overlapping requests gets there first is up to the timing: exactly one leads and pays, the other joins and does not
    const leader = results.find((r) => r.ok && r.via === "inworld");
    const joiner = results.find((r) => r.ok && r.via === "flight");
    expect(leader).toMatchObject({ ok: true, paid: true });
    expect(joiner).toMatchObject({ ok: true, paid: false });
    expect(leader!.ok && joiner!.ok && leader!.audio).toEqual(joiner!.ok && joiner!.audio);
    expect([t.spend.reserved.length, t.spend.commits.length, t.spend.releases.length]).toEqual([1, 1, 0]);
    expect(t.flights.size).toBe(0);
  });
  it("makes one call for ten overlapping requests", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    const all = Array.from({ length: 10 }, () => ask(t.deps));
    await until(() => t.flights.runs === 10);
    maker.release();
    const results = await Promise.all(all);
    expect(maker.requests).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.via === "inworld")).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.via === "flight")).toHaveLength(9);
    expect(t.spend.reserved).toHaveLength(1);
  });
  it("keeps different lines apart: two lines, two calls and two Tickets", async () => {
    const maker = gatedMaker();
    const t = setup({ held: { L1: line(), L2: line({ id: "L2", spoken: `${SPOKEN} And another.` }) }, maker });
    const a = ask(t.deps, { playId: "p-1", lineId: "L1" });
    const b = ask(t.deps, { playId: "p-1", lineId: "L2" });
    await until(() => t.flights.runs === 2);
    maker.release();
    await Promise.all([a, b]);
    expect(maker.requests).toHaveLength(2);
    expect(t.spend.reserved).toHaveLength(2);
  });
  it("keeps the same words in different voices apart", async () => {
    const maker = gatedMaker();
    const t = setup({ held: { L1: line(), L2: line({ id: "L2", speaker: "keeper", voice: "inworld:Ronald" }) }, maker });
    const a = ask(t.deps, { playId: "p-1", lineId: "L1" });
    const b = ask(t.deps, { playId: "p-1", lineId: "L2" });
    await until(() => t.flights.runs === 2);
    maker.release();
    await Promise.all([a, b]);
    expect(maker.requests.map((r) => r.speaker).sort()).toEqual(["keeper", "whisper"]);
  });
  it("shares a call between two Sessions that ask for the same words: one call, one Ticket, the second pays nothing", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    t.deps.lines = { find: async () => line() }; // both visitors own a line with the same words and voice
    const a = ask(t.deps, undefined, { sessionId: "sid-a", ipHash: "ha" });
    const b = ask(t.deps, undefined, { sessionId: "sid-b", ipHash: "hb" });
    await until(() => t.flights.runs === 2);
    maker.release();
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.ok && ra.via, rb.ok && rb.via].sort()).toEqual(["flight", "inworld"]); // either may lead
    const leaderIsA = ra.ok && ra.via === "inworld";
    expect(t.spend.reserved).toEqual([{ meter: "tts", sessionId: leaderIsA ? "sid-a" : "sid-b", ipHash: leaderIsA ? "ha" : "hb" }]);
    expect([ra, rb].map((r) => r.paid).sort()).toEqual([false, true]);
  });
  it("gives everyone who joined a call that failed the same refusal, releases its Ticket once, and lets the next request try again", async () => {
    const maker = gatedMaker(bad("failed"));
    const t = setup({ maker });
    const a = ask(t.deps);
    const b = ask(t.deps);
    await until(() => t.flights.runs === 2);
    maker.release();
    expect(await Promise.all([a, b])).toEqual([{ ok: false, reason: "failed", paid: false }, { ok: false, reason: "failed", paid: false }]);
    expect([t.spend.commits.length, t.spend.releases.length]).toEqual([0, 1]);
    expect(t.flights.size).toBe(0);
    await ask(t.deps); // the gate is open now: a new call is made
    expect(maker.requests).toHaveLength(2);
  });
  it("lets go of the key when the call throws", async () => {
    const t = setup({ maker: fakeMaker(() => { throw new Error("boom"); }) });
    expect(await ask(t.deps)).toMatchObject({ ok: false, reason: "failed" });
    expect(t.flights.size).toBe(0);
  });
  it("is a cache hit, not a flight, once the call has finished", async () => {
    const t = setup();
    await ask(t.deps);
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache" });
  });
  it("makes one call for each request when no flights are shared", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    delete t.deps.flights;
    const a = ask(t.deps);
    const b = ask(t.deps);
    await until(() => maker.requests.length === 2); // each request makes its own call: both are in the maker, waiting at the gate
    maker.release();
    await Promise.all([a, b]);
    expect(maker.requests).toHaveLength(2);
  });
});

describe("speakLine: prefetch", () => {
  it("returns Library audio, and cached audio, with no Ticket and not paid", async () => {
    const t = setup();
    await putLibrary(t, "inworld:Pippa", SPOKEN, mp3(4_000, 1));
    expect(await ask(t.deps, PREFETCH)).toMatchObject({ ok: true, via: "library", paid: false });
    const u = setup();
    await u.cache.put("inworld:Pippa", SPOKEN, mp3());
    expect(await ask(u.deps, PREFETCH)).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(t.spend.reserved.length + u.spend.reserved.length).toBe(0);
  });
  it("returns nothing, spends nothing and writes nothing for a line that is in neither, however much budget there is", async () => {
    const t = setup({ cap: 1_000 });
    expect(await ask(t.deps, PREFETCH)).toEqual({ ok: false, reason: "not_ready", paid: false });
    expect(t.spend.reserved).toEqual([]);
    expect(t.maker.requests).toEqual([]);
    expect(t.r2.objects.size).toBe(0);
  });
  it("never joins or starts a call, and does not disturb one that is running", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    const running = ask(t.deps);
    await until(() => t.flights.runs === 1);
    expect(await ask(t.deps, PREFETCH)).toMatchObject({ ok: false, reason: "not_ready" });
    maker.release();
    expect(await running).toMatchObject({ ok: true, via: "inworld", paid: true });
    expect(maker.requests).toHaveLength(1);
  });
  it("is no_line for a line that is not the visitor's, like any request", async () => {
    const t = setup();
    expect(await ask(t.deps, PREFETCH, { ...WHO, sessionId: "sid-stranger" })).toEqual({ ok: false, reason: "no_line", paid: false });
  });
  it("logs that it was a prefetch, and a line that was not ready is not paid", async () => {
    const t = setup();
    await ask(t.deps, PREFETCH);
    await t.cache.put("inworld:Pippa", SPOKEN, mp3());
    await ask(t.deps, PREFETCH);
    expect(t.logged.map((l) => JSON.parse(l)).map((l) => [l.via, l.outcome, l.paid, l.prefetch])).toEqual([["none", "not_ready", false, true], ["cache", "ok", false, true]]);
  });
});

describe("speakFoundLine: starting synthesis early", () => {
  it("starts the call when the line is validated, and a request that comes while it runs joins it", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    const early = speakFoundLine(t.deps, WHO, line());
    await until(() => t.flights.runs === 1);
    const later = ask(t.deps);
    await until(() => t.flights.runs === 2);
    expect(maker.requests).toHaveLength(1);
    maker.release();
    expect(await early).toMatchObject({ ok: true, via: "inworld", paid: true });
    expect(await later).toMatchObject({ ok: true, via: "flight", paid: false });
    expect(t.spend.reserved).toHaveLength(1);
  });
  it("leaves the clip in the cache for a request that comes after it finished", async () => {
    const t = setup();
    await speakFoundLine(t.deps, WHO, line());
    expect(await ask(t.deps)).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(t.maker.requests).toHaveLength(1);
  });
  it("spends one unit for a line the visitor never asks for, and the caps still bound how many", async () => {
    const t = setup({ cap: 3 });
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await speakFoundLine(t.deps, WHO, line({ id: `E${i}`, spoken: `${SPOKEN} Number ${i}.` })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(t.spend.granted).toBe(3);
    expect(t.maker.requests).toHaveLength(3);
  });
  it("starts nothing for a line with no spoken part, and nothing for a Library line", async () => {
    const t = setup();
    expect(await speakFoundLine(t.deps, WHO, line({ spoken: "" }))).toEqual({ ok: false, reason: "silent", paid: false });
    await putLibrary(t, "inworld:Pippa", SPOKEN, mp3());
    expect(await speakFoundLine(t.deps, WHO, line())).toMatchObject({ ok: true, via: "library" });
    expect(t.spend.reserved).toEqual([]);
    expect(t.maker.requests).toEqual([]);
  });
});

describe("speakLine: the log after the Library, flights and prefetch", () => {
  it("names where each answer came from, never what was said", async () => {
    const maker = gatedMaker();
    const t = setup({ maker });
    await putLibrary(t, "inworld:Pippa", `${SPOKEN} In the Library.`, mp3());
    t.deps.lines = { find: async (_s, id) => (id === "LIB" ? line({ id: "LIB", spoken: `${SPOKEN} In the Library.` }) : line()) };
    await ask(t.deps, { playId: "p-1", lineId: "LIB" });           // library
    const a = ask(t.deps);
    const b = ask(t.deps);
    await until(() => t.flights.runs === 2);
    maker.release();
    await Promise.all([a, b]);                                      // inworld, flight
    await ask(t.deps);                                              // cache
    const rows = t.logged.map((l) => JSON.parse(l)).map((l) => [l.via, l.outcome, l.paid, l.prefetch]);
    expect(rows).toEqual([["library", "ok", false, false], ["inworld", "ok", true, false], ["flight", "ok", false, false], ["cache", "ok", false, false]]);
    for (const secret of [SPOKEN, "kitchen", "Library.", "LIB", "p-1", SESSION, "iphash"]) expect(t.logged.join("\n")).not.toContain(secret);
  });
});

describe("Property 14 (3.12 speak service): secret-differing states make the same upstream calls", () => {
  it("two game states differing only in Solution, Hands, Residue or accusation accuracy produce the exact same prefetch and speak calls", async () => {
    const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);
    const byKey = new Map(entries.map((e) => [canonicalSpeechKey(e.voice, e.spoken), e]));
    const seats = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" as const }));

    const runForState = async (state: ReturnType<typeof createEngine>, minutesToMidnight: number | null) => {
      const pub = publicSnapshot(state, T0);
      const keys = prefetchPlan({ phase: pub.phase, haunt: { level: pub.haunt.level, max: pub.haunt.max }, minutesToMidnight }, entries);
      const held: Record<string, VoiceLine> = {};
      const linesToRun: VoiceLine[] = [];
      for (let i = 0; i < keys.length; i++) {
        const entry = byKey.get(keys[i]!)!;
        const id = `P${i}`;
        const vLine = line({ id, speaker: entry.speaker, voice: entry.voice, text: entry.spoken, spoken: entry.spoken });
        held[id] = vLine;
        linesToRun.push(vLine);
      }

      const t = setup({ held });
      // Put the first half in the Library, cache one more, and leave any remaining lines uncached.
      for (const l of linesToRun.slice(0, Math.floor(linesToRun.length / 2))) {
        t.libR2.put(await libraryKey(l.voice, l.spoken, sha256Hex), mp3(4_000, 3));
      }
      const mid = linesToRun[Math.floor(linesToRun.length / 2)];
      if (mid !== undefined) await t.cache.put(mid.voice, mid.spoken, mp3(4_000, 4));

      const prefetchResults = [];
      for (const l of linesToRun) prefetchResults.push(await ask(t.deps, { playId: "p-1", lineId: l.id, prefetch: true }));
      expect(t.maker.requests).toEqual([]);
      expect(t.spend.reserved).toEqual([]);

      const earlyResults = [];
      for (const l of linesToRun) earlyResults.push(await speakFoundLine(t.deps, WHO, l));

      return {
        keys,
        prefetchVias: prefetchResults.map((r) => (r.ok ? r.via : r.reason)),
        earlyVias: earlyResults.map((r) => (r.ok ? r.via : r.reason)),
        upstreamRequests: t.maker.requests,
        ticketsReserved: t.spend.reserved,
      };
    };

    for (const [seed, level, minutes] of [[1, 2, 30], [7, 0, null], [13, 5, 15]] as const) {
      const base = step(createEngine({ seed, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
      const sol = base.pool;
      const stateA = {
        ...base,
        haunt: { ...base.haunt, level },
        players: base.players.map((p, idx) => (idx === 0 ? { ...p, sealed: base.deal!.solution, hasSealed: true } : p)),
      };
      const stateB = {
        ...base,
        haunt: { ...base.haunt, level },
        deal: {
          ...base.deal!,
          solution: { suspect: sol.suspects[1]!.id, zone: sol.zones[1]!.id, relic: sol.relics[1]!.id },
          hands: { 1: base.deal!.hands[2] ?? [], 2: base.deal!.hands[3] ?? [], 3: base.deal!.hands[1] ?? [] },
        },
        residueAt: { [sol.zones[2]!.id]: sol.relics[2]!.id },
        players: base.players.map((p, idx) => (idx === 0 ? { ...p, sealed: base.deal!.solution, hasSealed: true } : p)),
      };

      const a = await runForState(stateA, minutes);
      const b = await runForState(stateB, minutes);
      expect(a).toEqual(b);
      expect(a.keys.length).toBeGreaterThan(0);
    }
  });
});
