import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LODGER_VOICE_ORDER, LODGER_VOICES, SPEAKERS, SPEAKER_ORDER } from "@hauntology/shared/voice/voices";
import { SpeakRequestSchema } from "@hauntology/shared/voice/requests";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { NoTicketError } from "../ticket";
import type { AiBinding } from "./call";
import {
  AUDIO_MAX_BYTES, AUDIO_MIN_BYTES, DEFAULT_TTS_FALLBACK_MODEL, DEFAULT_TTS_MODEL, SPEAK_DEADLINE_MS, WorkersAiSpeaker,
  assertSpeechTicket, generateSpeech, speechWasCharged, type SpeechAnswer, type SpeechMaker,
} from "./speak";

const LINE = "Somebody was in the kitchen before you.";
const LINK = "https://audio.example/clip.mp3";

/** n bytes that start like an MP3 frame, so they pass the header check. */
const mp3 = (n = 4_000): Uint8Array => { const b = new Uint8Array(n).fill(7); b[0] = 0xff; b[1] = 0xfb; return b; };
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const ticket = (meter: SpendTicket["meter"]): SpendTicket => ({ id: "t1", meter, sessionId: "s", issuedAt: 1 });

type Seen = { model: string; input: Record<string, any>; options: unknown };
/** A fake `env.AI`: a function (or fixed value) per model, a record of every call. An Error is thrown; a pending promise never answers. */
function fakeAi(by: Record<string, unknown | (() => unknown | Promise<unknown>)>): AiBinding & { seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    async run(model, input, options) {
      seen.push({ model, input, options });
      const a = by[model];
      const v = typeof a === "function" ? await (a as () => unknown)() : a;
      if (v instanceof Error) throw v;
      return v;
    },
  };
}
const fakeFetch = (res: { ok?: boolean; status?: number; body?: Uint8Array; headers?: Record<string, string> } = {}) => {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    const init: ResponseInit = { status: res.status ?? 200 };
    if (res.headers !== undefined) init.headers = res.headers;
    return new Response((res.body ?? mp3()) as BodyInit, init);
  }) as unknown as typeof fetch;
  return Object.assign(f, { calls });
};
const speaker = (ai: AiBinding, fetchFile: typeof fetch = fakeFetch()) => new WorkersAiSpeaker(ai, { fetchFile });

afterEach(() => vi.useRealTimers());

describe("generateSpeech: no Ticket, no call", () => {
  const maker = (): SpeechMaker & { calls: number } => ({ calls: 0, async speak() { this.calls += 1; return { ok: false, kind: "failed", elapsedMs: 0, attempts: [] } as SpeechAnswer; } });

  it("calls the maker for a tts Ticket and for a live Ticket", async () => {
    const m = maker();
    await generateSpeech(m, ticket("tts"), { speaker: "keeper", spoken: LINE });
    await generateSpeech(m, ticket("live"), { speaker: "keeper", spoken: LINE });
    expect(m.calls).toBe(2);
  });
  it.each(["world", "image", "llm", "stt"] as const)("refuses a Ticket for the %s meter, and the maker is never called", (meter) => {
    const m = maker();
    expect(() => generateSpeech(m, ticket(meter), { speaker: "keeper", spoken: LINE })).toThrow(NoTicketError);
    expect(m.calls).toBe(0);
  });
  it.each([null, undefined, {}, { meter: "tts" }, { meter: "tts", id: "" }])("refuses a missing or malformed Ticket (%j)", (t) => {
    expect(() => assertSpeechTicket(t as unknown as SpendTicket)).toThrow(NoTicketError);
  });
});

describe("WorkersAiSpeaker: the Inworld request", () => {
  it("sends the Whisper's tag in front of the text, Pippa's voice, her rate and her temperature, and asks for MP3", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    const a = await speaker(ai).speak({ speaker: "whisper", spoken: LINE });
    expect(a.ok).toBe(true);
    expect(ai.seen).toHaveLength(1);
    expect(ai.seen[0]!.model).toBe("inworld/tts-2");
    expect(ai.seen[0]!.input).toEqual({
      text: `[whisper] ${LINE}`, voice_id: "Pippa", output_format: "mp3", temperature: SPEAKERS.whisper.temperature, timestamp_type: "none", speaking_rate: SPEAKERS.whisper.rate,
    });
  });
  it("sends the Keeper with no tag, in Ronald's voice", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    await speaker(ai).speak({ speaker: "keeper", spoken: LINE });
    expect(ai.seen[0]!.input).toMatchObject({ text: LINE, voice_id: "Ronald", temperature: SPEAKERS.keeper.temperature, speaking_rate: SPEAKERS.keeper.rate });
  });
  it.each(LODGER_VOICE_ORDER)("sends the Lodger's tag and the %s voice", async (lv) => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    await speaker(ai).speak({ speaker: "lodger", lodgerVoice: lv, spoken: LINE });
    expect(ai.seen[0]!.input).toMatchObject({ text: `[speak nervously] ${LINE}`, voice_id: LODGER_VOICES[lv].inworld, speaking_rate: SPEAKERS.lodger.rate, temperature: SPEAKERS.lodger.temperature });
  });
  it("uses Mark when a Lodger line has no Lodger Voice", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    await speaker(ai).speak({ speaker: "lodger", spoken: LINE });
    expect(ai.seen[0]!.input.voice_id).toBe("Mark");
  });
  it("uses the model ids it is given", async () => {
    const ai = fakeAi({ "x/tts": { audio: b64(mp3()) } });
    const a = await new WorkersAiSpeaker(ai, { model: "x/tts" }).speak({ speaker: "keeper", spoken: LINE });
    expect(a.ok).toBe(true);
    expect(ai.seen[0]!.model).toBe("x/tts");
  });
});

describe("WorkersAiSpeaker: what comes back", () => {
  it("downloads the presigned file Inworld names and returns its bytes", async () => {
    const f = fakeFetch({ body: mp3(5_000) });
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { audio: LINK } }), f).speak({ speaker: "whisper", spoken: LINE });
    expect(f.calls).toEqual([LINK]);
    expect(a).toMatchObject({ ok: true, via: "inworld", contentType: "audio/mpeg", voice: "inworld:Pippa" });
    if (a.ok) expect(a.audio.length).toBe(5_000);
  });
  it("reads the answer when the platform wraps it in result", async () => {
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { result: { audio: b64(mp3(3_000)) } } })).speak({ speaker: "keeper", spoken: LINE });
    expect(a.ok && a.audio.length).toBe(3_000);
  });
  it("reports the voice that spoke and one attempt", async () => {
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } })).speak({ speaker: "lodger", lodgerVoice: "chloe", spoken: LINE });
    expect(a).toMatchObject({ ok: true, voice: "inworld:Chloe" });
    expect(a.attempts.map((x) => [x.step, x.outcome])).toEqual([["inworld", "ok"]]);
  });
  it("accepts an ID3-tagged MP3 as well as a bare frame", async () => {
    const id3 = mp3(); id3.set([0x49, 0x44, 0x33]);
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(id3) } })).speak({ speaker: "keeper", spoken: LINE });
    expect(a.ok).toBe(true);
  });
});

describe("WorkersAiSpeaker: the fallback to Aura-2 English", () => {
  const AURA = DEFAULT_TTS_FALLBACK_MODEL;
  const auraStream = (bytes = mp3()) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, 1_000)); c.enqueue(bytes.subarray(1_000)); c.close(); } });

  it("falls back when Inworld throws, sends Aura the plain text and the Speaker's Aura voice, and never sends a tag", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("500 upstream"), [AURA]: () => auraStream() });
    const a = await speaker(ai).speak({ speaker: "whisper", spoken: LINE });
    expect(a).toMatchObject({ ok: true, via: "aura", voice: "aura-2:luna" });
    expect(ai.seen.map((s) => s.model)).toEqual([DEFAULT_TTS_MODEL, AURA]);
    expect(ai.seen[1]!.input).toEqual({ text: LINE, speaker: "luna", encoding: "mp3" });
    expect(a.attempts.map((x) => [x.step, x.outcome])).toEqual([["inworld", "failed"], ["aura", "ok"]]);
  });
  it("falls back when Inworld answers with no audio, or with a file that is not an MP3, or one too small", async () => {
    for (const first of [{}, { audio: "" }, { audio: b64(new TextEncoder().encode("<html>nope</html>".repeat(100))) }, { audio: b64(mp3(AUDIO_MIN_BYTES - 1)) }]) {
      const ai = fakeAi({ [DEFAULT_TTS_MODEL]: first, [AURA]: () => auraStream() });
      const a = await speaker(ai).speak({ speaker: "keeper", spoken: LINE });
      expect(a).toMatchObject({ ok: true, via: "aura" });
      expect(a.attempts[0]).toMatchObject({ step: "inworld", outcome: "unusable" });
    }
  });
  it("falls back when the audio link answers an error, and when the file is declared far too big", async () => {
    for (const f of [fakeFetch({ status: 403 }), fakeFetch({ headers: { "content-length": String(AUDIO_MAX_BYTES + 1) } })]) {
      const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: LINK }, [AURA]: () => auraStream() });
      expect(await speaker(ai, f).speak({ speaker: "keeper", spoken: LINE })).toMatchObject({ ok: true, via: "aura" });
    }
  });
  it("never fetches a link that is not https", async () => {
    for (const bad of ["http://audio.example/a.mp3", "file:///etc/passwd", "data:audio/mpeg;base64,AAAA", "ftp://x/y"]) {
      const f = fakeFetch();
      const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: bad }, [AURA]: () => auraStream() });
      expect(await speaker(ai, f).speak({ speaker: "keeper", spoken: LINE })).toMatchObject({ ok: true, via: "aura" });
      expect(f.calls).toEqual([]);
    }
  });
  it("reads an Aura answer given as a buffer, a typed array or base64", async () => {
    for (const out of [mp3().buffer, mp3(), { audio: b64(mp3()) }]) {
      const ai = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("down"), [AURA]: out });
      expect(await speaker(ai).speak({ speaker: "keeper", spoken: LINE })).toMatchObject({ ok: true, via: "aura" });
    }
  });
  it("gives a Suspect with no Aura voice picked yet the Lodger's default Aura voice, and a picked one its own", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("down"), [AURA]: () => auraStream() });
    await speaker(ai).speak({ speaker: "lodger", lodgerVoice: "victoria", spoken: LINE });
    expect(ai.seen[1]!.input.speaker).toBe(LODGER_VOICES.victoria.aura ?? SPEAKERS.lodger.aura);
  });
});

describe("WorkersAiSpeaker: when it gives nothing", () => {
  const AURA = DEFAULT_TTS_FALLBACK_MODEL;

  it("says rate_limited, not charged, when both steps are limited", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("429 too many requests"), [AURA]: new Error("429 too many requests") });
    const a = await speaker(ai).speak({ speaker: "keeper", spoken: LINE });
    expect(a).toMatchObject({ ok: false, kind: "rate_limited" });
    expect(speechWasCharged(a)).toBe(false);
  });
  it("says failed, not charged, when both steps fail", async () => {
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: new Error("boom"), [AURA]: new Error("boom") })).speak({ speaker: "keeper", spoken: LINE });
    expect(a).toMatchObject({ ok: false, kind: "failed" });
    expect(speechWasCharged(a)).toBe(false);
  });
  it("says unusable, charged, when a model answered but nothing was playable", async () => {
    const a = await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: {}, [AURA]: new Error("boom") })).speak({ speaker: "keeper", spoken: LINE });
    expect(a).toMatchObject({ ok: false, kind: "unusable" });
    expect(speechWasCharged(a)).toBe(true);
  });
  it("is charged when it succeeded", async () => {
    expect(speechWasCharged(await speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } })).speak({ speaker: "keeper", spoken: LINE }))).toBe(true);
  });

  it("stops at 5 seconds from the request: a slow Inworld call is dropped and Aura is skipped because no time is left", async () => {
    vi.useFakeTimers();
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: () => new Promise(() => {}), [AURA]: { audio: b64(mp3()) } });
    const pending = speaker(ai).speak({ speaker: "keeper", spoken: LINE });
    await vi.advanceTimersByTimeAsync(SPEAK_DEADLINE_MS);
    const a = await pending;
    expect(a).toMatchObject({ ok: false, kind: "failed" });
    expect(a.attempts.map((x) => [x.step, x.outcome])).toEqual([["inworld", "slow"]]);
    expect(ai.seen.map((s) => s.model)).toEqual([DEFAULT_TTS_MODEL]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("tries Aura with what is left when Inworld fails early", async () => {
    vi.useFakeTimers();
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: async () => { await new Promise((r) => setTimeout(r, 3_000)); throw new Error("boom"); }, [AURA]: () => new Promise(() => {}) });
    const pending = speaker(ai).speak({ speaker: "keeper", spoken: LINE });
    await vi.advanceTimersByTimeAsync(5_000);
    const a = await pending;
    expect(a.attempts.map((x) => [x.step, x.outcome])).toEqual([["inworld", "failed"], ["aura", "slow"]]);
    expect(a.elapsedMs).toBeLessThanOrEqual(SPEAK_DEADLINE_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts a download that is still running at the deadline", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const f = ((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }))) as unknown as typeof fetch;
    const pending = speaker(fakeAi({ [DEFAULT_TTS_MODEL]: { audio: LINK } }), f).speak({ speaker: "keeper", spoken: LINE });
    await vi.advanceTimersByTimeAsync(SPEAK_DEADLINE_MS);
    await pending;
    expect(aborted).toBe(true);
  });
});

describe("WorkersAiSpeaker: what it refuses to send", () => {
  it.each([
    ["empty", ""], ["blank", "   "], ["too long", "a".repeat(241)], ["a Steering Tag already in it", "[whisper] hello"], ["markup", "<b>hello</b>"],
    ["a bracket", "hello [there]"], ["a code fence", "`hello`"], ["a placeholder", "hello {nick}"], ["a heading", "# hello"],
  ])("refuses %s, with no call and nothing charged", async (_n, spoken) => {
    const ai = fakeAi({});
    const a = await speaker(ai).speak({ speaker: "whisper", spoken });
    expect(a).toMatchObject({ ok: false, kind: "invalid", attempts: [] });
    expect(speechWasCharged(a)).toBe(false);
    expect(ai.seen).toEqual([]);
  });
  it("refuses a Speaker or Lodger Voice that is not in the cast", async () => {
    const ai = fakeAi({});
    for (const bad of [{ speaker: "narrator", spoken: LINE }, { speaker: "lodger", lodgerVoice: "bob", spoken: LINE }, { speaker: "toString", spoken: LINE }, null]) {
      expect(await speaker(ai).speak(bad as never)).toMatchObject({ ok: false, kind: "invalid" });
    }
    expect(ai.seen).toEqual([]);
  });
  it("accepts a line of exactly 240 characters", async () => {
    const ai = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
    expect((await speaker(ai).speak({ speaker: "keeper", spoken: "a".repeat(240) })).ok).toBe(true);
  });
});

describe("the Steering Tag has one home", () => {
  /** Every non-test source file under api/src, as path -> text. */
  function sources(dir: string, out: Record<string, string> = {}): Record<string, string> {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) sources(p, out);
      else if (name.endsWith(".ts") && !/\.(test|prop\.test|live\.test)\.ts$/.test(name)) out[p] = readFileSync(p, "utf8");
    }
    return out;
  }
  it("is added only by guarded/workersai/speak.ts: no other api source calls steeringTag", () => {
    const root = join(__dirname, "..", "..");
    const users = Object.entries(sources(root)).filter(([, text]) => /\bsteeringTag\b/.test(text)).map(([p]) => relative(root, p).split(sep).join("/"));
    expect(users).toEqual(["guarded/workersai/speak.ts"]);
  });

  it("synthesis request shapes carry no reference-voice field for any Speaker or Lodger Voice", async () => {
    const AURA = DEFAULT_TTS_FALLBACK_MODEL;
    const cases: Array<{ speaker: "whisper" | "keeper" | "lodger"; lodgerVoice?: (typeof LODGER_VOICE_ORDER)[number] }> = [
      { speaker: "whisper" },
      { speaker: "keeper" },
      ...LODGER_VOICE_ORDER.map((lodgerVoice) => ({ speaker: "lodger" as const, lodgerVoice })),
    ];
    for (const c of cases) {
      const inAi = fakeAi({ [DEFAULT_TTS_MODEL]: { audio: b64(mp3()) } });
      await speaker(inAi).speak({ ...c, spoken: LINE });
      expect(Object.keys(inAi.seen[0]!.input).sort()).toEqual(["output_format", "speaking_rate", "temperature", "text", "timestamp_type", "voice_id"]);

      const auraAi = fakeAi({ [DEFAULT_TTS_MODEL]: new Error("down"), [AURA]: mp3().buffer });
      await speaker(auraAi).speak({ ...c, spoken: LINE });
      expect(Object.keys(auraAi.seen[1]!.input).sort()).toEqual(["encoding", "speaker", "text"]);
      expect(auraAi.seen[1]!.input.text).toBe(LINE);
    }
    for (const sp of SPEAKER_ORDER) expect(SPEAKERS[sp]).toBeDefined();
    expect(SpeakRequestSchema.safeParse({ playId: "p1", lineId: "l1", reference_voice: "Pippa" }).success).toBe(false);
    expect(SpeakRequestSchema.safeParse({ playId: "p1", lineId: "l1", referenceVoice: "Pippa" }).success).toBe(false);
    expect(SpeakRequestSchema.safeParse({ playId: "p1", lineId: "l1", text: "hi" }).success).toBe(false);
  });
});
