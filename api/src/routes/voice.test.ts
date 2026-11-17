import { describe, expect, it } from "vitest";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { singleFlight } from "@hauntology/shared/voice/flight";
import { libraryKey } from "@hauntology/shared/voice/key";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import type { SpeechAnswer, SpeechMaker, SpeechRequest } from "../guarded/workersai/speak";
import { createLogger } from "../log";
import { R2SpeechCache, type SpeechBucket } from "../voice/cache";
import { R2SpeechLibrary, type LibraryBucket } from "../voice/library";
import type { VoiceLines } from "../voice/lines";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { NOW, ORIGIN, worldsKit, type Visitor } from "../worlds/test-kit";

const SPOKEN = "Somebody was in the kitchen before you.";
const PLAY = "p-game0000000000000001";
const LINE_ID = "Zm9vYmFyYmF6cXV4ZGVm";
const mp3 = (n = 4_000, fill = 7): Uint8Array => { const b = new Uint8Array(n).fill(fill); b[0] = 0xff; b[1] = 0xfb; return b; };
const line = (over: Partial<VoiceLine> = {}): VoiceLine => ({ id: LINE_ID, kind: "narration", speaker: "whisper", text: `${SPOKEN} More subtitle.`, spoken: SPOKEN, voice: "inworld:Pippa", createdAt: NOW, ...over });
const UNAVAILABLE = { ok: false, code: "voice_unavailable" };

function setup(o: { cap?: number; answer?: SpeechAnswer; held?: Record<string, VoiceLine> } = {}) {
  let ownerSid = "";
  const held = o.held ?? { [LINE_ID]: line() };
  const lines: VoiceLines = { async find(scope, id) { return scope.playId === PLAY && scope.ownerSid === ownerSid ? (held[id] ?? null) : null; } };
  const r2 = new FakeR2();
  const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => NOW });
  const spend = { reserved: 0, commits: 0, releases: 0, granted: 0 };
  const guard = {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> {
      spend.reserved += 1;
      if (spend.granted >= (o.cap ?? 100)) return { ok: false, reason: "session" };
      spend.granted += 1;
      return { ok: true, ticket: { id: `t${spend.granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit() { spend.commits += 1; },
    async release() { spend.releases += 1; },
  };
  const requests: SpeechRequest[] = [];
  const maker: SpeechMaker = { async speak(req) { requests.push(req); return o.answer ?? { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: "inworld:Pippa", elapsedMs: 900, attempts: [] }; } };
  const logged: string[] = [];
  const libR2 = new FakeR2();
  const library = new R2SpeechLibrary(libR2 as unknown as LibraryBucket);
  const kit = worldsKit(() => NOW, { voice: { speak: { lines, cache, maker, spend: guard, library, flights: singleFlight() } }, log: createLogger((l) => logged.push(l), () => NOW) });
  const owner = async (): Promise<Visitor> => { const v = await kit.visitor(); ownerSid = v.sid; return v; };

  /** `app.request` directly, so the audio bytes are not turned into text on the way. */
  const post = async (body: unknown, headers: Record<string, string>, path = "/api/voice/speak", method = "POST") => {
    const res = await kit.app.request(`${ORIGIN}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }, kit.env);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, bytes, text: new TextDecoder().decode(bytes) };
  };
  return { kit, r2, libR2, cache, spend, requests, logged, owner, post };
}
const ok = { playId: PLAY, lineId: LINE_ID };

describe("POST /api/voice/speak: audio", () => {
  it("answers the owner of the game with the line's audio: 200, audio/mpeg, never cached by anyone", async () => {
    const t = setup();
    const v = await t.owner();
    const r = await t.post(ok, v.headers);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Length")).toBe(String(mp3().byteLength));
    expect(r.bytes).toEqual(mp3());
    expect(t.requests).toEqual([{ speaker: "whisper", spoken: SPOKEN }]);
  });
  it("carries the security headers like every other answer", async () => {
    const t = setup();
    const r = await t.post(ok, (await t.owner()).headers);
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("plays the same line again from the cache, with no second model call", async () => {
    const t = setup();
    const v = await t.owner();
    await t.post(ok, v.headers);
    const again = await t.post(ok, v.headers);
    expect(again.status).toBe(200);
    expect(again.bytes).toEqual(mp3());
    expect(t.requests).toHaveLength(1);
    expect(t.spend.reserved).toBe(1);
  });
});

describe("POST /api/voice/speak: what it refuses to take", () => {
  it("refuses a body that carries text, or any field that is not listed, and calls nothing and reserves nothing", async () => {
    const t = setup();
    const v = await t.owner();
    for (const extra of [{ text: "Say hello" }, { spoken: "Say hello" }, { prompt: "x" }, { speaker: "keeper" }, { voice: "inworld:Ronald" }, { roomCode: "ABCD" }, { prefetch: "yes" }, { prefetch: 1 }, { prefetch: true, text: "Say hello" }]) {
      const r = await t.post({ ...ok, ...extra }, v.headers);
      expect([r.status, JSON.parse(r.text)], JSON.stringify(extra)).toEqual([400, UNAVAILABLE]);
    }
    expect(t.requests).toEqual([]);
    expect(t.spend.reserved).toBe(0);
  });
  it("refuses a body that is not JSON, not an object, empty or over the size limit", async () => {
    const t = setup();
    const v = await t.owner();
    for (const body of ["not json", "[]", "null", "", JSON.stringify({ ...ok, lineId: "a".repeat(70_000) })]) {
      const r = await t.post(body, v.headers);
      expect([r.status, r.text], body.slice(0, 20)).toEqual([400, JSON.stringify(UNAVAILABLE)]);
    }
    expect(t.spend.reserved).toBe(0);
  });
  it("refuses a request from another origin and one with no Origin at all", async () => {
    const t = setup();
    const v = await t.owner();
    const cookie = v.headers["Cookie"] as string;
    for (const headers of [{ Cookie: cookie, Origin: "https://evil.example" }, { Cookie: cookie }]) {
      const r = await t.post(ok, headers);
      expect(r.status).toBe(403);
    }
    expect(t.requests).toEqual([]);
  });
  it("has no GET route", async () => {
    const t = setup();
    const v = await t.owner();
    expect((await t.post(null, v.headers, "/api/voice/speak", "GET")).status).toBe(404);
  });
});

describe("POST /api/voice/speak: whose line it is", () => {
  it("answers one 404 for another visitor's line, an unknown line and another game's line: the same body, so an id tells nobody anything", async () => {
    const t = setup();
    const owner = await t.owner();
    const stranger = await t.kit.visitor(); // owns nothing
    const answers = [
      await t.post(ok, stranger.headers),
      await t.post({ ...ok, lineId: "no-such-line" }, owner.headers),
      await t.post({ ...ok, playId: "p-some-other-game" }, owner.headers),
    ];
    for (const a of answers) expect([a.status, a.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
    expect(t.requests).toEqual([]);
    expect(t.spend.reserved).toBe(0);
  });
  it("answers a request with no Session cookie 404 at once, makes no Session for it and reserves nothing", async () => {
    const t = setup();
    await t.owner();
    const r = await t.post(ok, { Origin: ORIGIN });
    expect([r.status, r.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    expect(t.spend.reserved).toBe(0);
  });
});

describe("POST /api/voice/speak: when it will not speak", () => {
  it("is 503 voice_unavailable for every refusal, with no detail: speech off, a spent cap, a failed voice, a line with nothing to say", async () => {
    const cases: [string, ReturnType<typeof setup>, (t: ReturnType<typeof setup>) => void][] = [
      ["a spent cap", setup({ cap: 0 }), () => {}],
      ["a failed voice", setup({ answer: { ok: false, kind: "failed", elapsedMs: 5000, attempts: [] } }), () => {}],
      ["a rate-limited voice", setup({ answer: { ok: false, kind: "rate_limited", elapsedMs: 100, attempts: [] } }), () => {}],
      ["a line with nothing to say", setup({ held: { [LINE_ID]: line({ spoken: "" }) } }), () => {}],
      ["speech off", setup(), (t) => { t.kit.env["VOICE_ENABLED"] = "false"; }],
    ];
    for (const [name, t, tweak] of cases) {
      const v = await t.owner();
      tweak(t);
      const r = await t.post(ok, v.headers);
      expect([r.status, r.text], name).toEqual([503, JSON.stringify(UNAVAILABLE)]);
      expect(r.headers.get("Cache-Control"), name).toBe("no-store");
    }
  });
  it("with speech off, reads nothing and calls nothing, not even the cache", async () => {
    const t = setup();
    const v = await t.owner();
    await t.post(ok, v.headers); // heard once while it was on: now cached
    t.kit.env["VOICE_ENABLED"] = "off";
    const r = await t.post(ok, v.headers);
    expect(r.status).toBe(503);
    expect(t.requests).toHaveLength(1);
  });
  it("with every cap spent, still plays a line that was heard before", async () => {
    const t = setup({ cap: 1 });
    const v = await t.owner();
    expect((await t.post(ok, v.headers)).status).toBe(200); // spends the one Ticket
    const second = await t.post(ok, v.headers);
    expect(second.status).toBe(200);
    expect(second.bytes).toEqual(mp3());
    expect(t.spend.granted).toBe(1);
  });
  it("releases the Ticket of a voice that gave nothing and commits that of one that did", async () => {
    const failed = setup({ answer: { ok: false, kind: "failed", elapsedMs: 5000, attempts: [] } });
    await failed.post(ok, (await failed.owner()).headers);
    expect([failed.spend.commits, failed.spend.releases]).toEqual([0, 1]);
    const spoke = setup();
    await spoke.post(ok, (await spoke.owner()).headers);
    expect([spoke.spend.commits, spoke.spend.releases]).toEqual([1, 0]);
  });
});

describe("POST /api/voice/speak: what it logs", () => {
  it("writes one counter line for each request and none of the words, ids or audio", async () => {
    const t = setup();
    const v = await t.owner();
    await t.post(ok, v.headers);                                           // inworld
    await t.post(ok, v.headers);                                           // cache
    await t.post({ ...ok, text: "hello" }, v.headers);                     // bad_body
    await t.post({ ...ok, lineId: "no-such-line" }, v.headers);            // no_line
    t.kit.env["VOICE_ENABLED"] = "false";
    await t.post(ok, v.headers);                                           // off
    const voice = t.logged.map((l) => JSON.parse(l)).filter((l) => l.event === "voice.speak");
    expect(voice.map((l) => [l.via, l.outcome, l.paid])).toEqual([["inworld", "ok", true], ["cache", "ok", false], ["none", "bad_body", false], ["none", "no_line", false], ["none", "off", false]]);
    const everything = t.logged.join("\n");
    for (const secret of [SPOKEN, "kitchen", LINE_ID, PLAY, v.sid, "hello", "inworld:Pippa"]) expect(everything).not.toContain(secret);
  });
});

describe("POST /api/voice/speak: the Voice Library", () => {
  it("plays a scripted line from the Library with every cap spent: no Ticket, no model call", async () => {
    const t = setup({ cap: 0 });
    t.libR2.put(await libraryKey("inworld:Pippa", SPOKEN, sha256Hex), mp3(4_000, 4));
    const r = await t.post(ok, (await t.owner()).headers);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(r.bytes).toEqual(mp3(4_000, 4));
    expect(t.spend.reserved).toBe(0);
    expect(t.requests).toEqual([]);
    expect(t.r2.objects.size).toBe(0); // nothing is copied from the Library into the cache
  });
  it("is still switched off with speech off: the Library is not read either", async () => {
    const t = setup();
    const v = await t.owner();
    t.libR2.put(await libraryKey("inworld:Pippa", SPOKEN, sha256Hex), mp3());
    t.kit.env["VOICE_ENABLED"] = "false";
    expect((await t.post(ok, v.headers)).status).toBe(503);
  });
});

describe("POST /api/voice/speak: prefetch", () => {
  const PRE = { ...ok, prefetch: true };

  it("answers 204 with nothing, and spends and calls nothing, for a line that is not in the Library or the cache", async () => {
    const t = setup({ cap: 1_000 });
    const r = await t.post(PRE, (await t.owner()).headers);
    expect(r.status).toBe(204);
    expect(r.bytes.byteLength).toBe(0);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(t.spend.reserved).toBe(0);
    expect(t.requests).toEqual([]);
    expect(t.r2.objects.size).toBe(0);
  });
  it("answers 200 with the audio once the line is in the cache, and the same for a Library line, and still pays nothing", async () => {
    const t = setup();
    const v = await t.owner();
    await t.post(ok, v.headers); // heard once: now cached (this one paid)
    const spentBefore = t.spend.reserved;
    const cached = await t.post(PRE, v.headers);
    expect([cached.status, cached.headers.get("Content-Type")]).toEqual([200, "audio/mpeg"]);
    expect(cached.bytes).toEqual(mp3());
    const u = setup();
    u.libR2.put(await libraryKey("inworld:Pippa", SPOKEN, sha256Hex), mp3(4_000, 4));
    const lib = await u.post(PRE, (await u.owner()).headers);
    expect([lib.status, lib.bytes]).toEqual([200, mp3(4_000, 4)]);
    expect(t.spend.reserved).toBe(spentBefore);
    expect(u.spend.reserved).toBe(0);
  });
  it("is the same 404 for a line that is not the visitor's, so a prefetch tells nobody anything either", async () => {
    const t = setup();
    await t.owner();
    const stranger = await t.kit.visitor();
    const r = await t.post(PRE, stranger.headers);
    expect([r.status, r.text]).toEqual([404, JSON.stringify(UNAVAILABLE)]);
  });
  it("is 503 with speech off, like any request", async () => {
    const t = setup();
    const v = await t.owner();
    t.kit.env["VOICE_ENABLED"] = "false";
    expect((await t.post(PRE, v.headers)).status).toBe(503);
  });
  it("logs that it was a prefetch and that nothing was paid", async () => {
    const t = setup();
    const v = await t.owner();
    await t.post(PRE, v.headers);
    const rows = t.logged.map((l) => JSON.parse(l)).filter((l) => l.event === "voice.speak").map((l) => [l.via, l.outcome, l.paid, l.prefetch]);
    expect(rows).toEqual([["none", "not_ready", false, true]]);
  });
});
