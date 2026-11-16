import { voiceOfPreset } from "@hauntology/shared/ghost/scripted";
import { verifySession } from "@hauntology/shared/session-cookie";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { libraryKey } from "@hauntology/shared/voice/key";
import { spokenPart } from "@hauntology/shared/voice/speakable";
import { SPEAKERS, speakerForGhostVoice, voiceFor } from "@hauntology/shared/voice/voices";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { PlayIndex, PlaySession, SpendGuard, WorldJob, type WorkerEnv } from "./worker";
import { FakeNamespace, FakeR2 } from "./worlds/fake-cloudflare";
import { ORIGIN, SECRET, sampleManifest } from "./worlds/test-kit";

// ghost-voice 3.5, 3.6 and 3.12 through the real Worker: the real games, the real SpendGuard, an R2 bucket and a Workers AI binding, all fakes at the edge.

afterEach(() => vi.useRealTimers());

const mp3 = (fill = 7): Uint8Array => { const b = new Uint8Array(4_000).fill(fill); b[0] = 0xff; b[1] = 0xfb; return b; };
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const UNAVAILABLE = JSON.stringify({ ok: false, code: "voice_unavailable" });
const SPEAKER = speakerForGhostVoice(voiceOfPreset(undefined));

type AiCall = { model: string; input: Record<string, any> };
type AiBehaviour = (model: string, input: Record<string, any>) => unknown;
/** Inworld answers with audio; anything else is an error unless the test says otherwise. */
const inworld: AiBehaviour = (model) => {
  if (model === "inworld/tts-2") return { audio: b64(mp3()) };
  throw new Error(`unexpected model ${model}`);
};

function envWith(extra: Record<string, string>) {
  const bucket = new FakeR2();
  const env = { HMAC_SECRET: SECRET, BUCKET: bucket, SPEND_GUARD: undefined, WORLD_JOB: undefined, ...extra } as unknown as WorkerEnv;
  const jobs = new FakeNamespace((state) => new WorldJob(state, env));
  const spend = new FakeNamespace((state) => new SpendGuard(state, extra));
  const index = new FakeNamespace((state) => new PlayIndex(state));
  const plays = new FakeNamespace((state) => new PlaySession(state, { PLAY_INDEX: index }));
  Object.assign(env, { WORLD_JOB: jobs, SPEND_GUARD: spend, PLAY_SESSION: plays, PLAY_INDEX: index });
  return { bucket, jobs, env };
}

/** A visitor in a game of their own, in a world that is theirs, over the real Worker. */
async function game(extra: Record<string, string> = {}, ai: AiBehaviour | null = inworld) {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { bucket, jobs, env } = envWith(extra);
  const calls: AiCall[] = [];
  if (ai !== null) Object.assign(env, { AI: { run: async (model: string, input: Record<string, any>) => { calls.push({ model, input }); return ai(model, input); } } });
  const cx = { pending: [] as Promise<unknown>[] };
  const ctx = { waitUntil: (p: Promise<unknown>) => void cx.pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
  const r0 = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx);
  const cookie = (r0.headers.get("Set-Cookie") as string).split(";")[0] as string;
  const who = { Cookie: cookie, Origin: ORIGIN };
  const sid = (await verifySession(cookie.slice(cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000)))!.sid;
  await jobs.get("w-mine").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-mine", kind: "user", ownerSid: sid, status: "ready", manifest: sampleManifest("w-mine") }) });

  const send = (path: string, body?: unknown, headers: Record<string, string> = who) =>
    worker.fetch(new Request(`${ORIGIN}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  const started = (await (await send("/api/play/start", { worldId: "w-mine" })).json()) as { playId: string; view: { anchors: Array<{ pos: number[] }> } };
  const pos = started.view.anchors[0]!.pos;
  type Reply = { reply: { text: string; scripted: boolean; voice?: { lineId: string } } };
  const turn = async (): Promise<Reply["reply"]> => {
    vi.setSystemTime(Date.now() + 2_000);
    return ((await (await send(`/api/play/${started.playId}/turn`, { input: { button: "look" }, pose: { pos, yaw: 0 } })).json()) as Reply).reply;
  };
  const speak = async (lineId: string, headers: Record<string, string> = who) => {
    const res = await send("/api/voice/speak", { playId: started.playId, lineId }, headers);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, bytes, text: new TextDecoder().decode(bytes) };
  };
  const quota = async () => ((await (await send("/api/quota")).json()) as { tts: number }).tts;
  const flush = () => Promise.all(cx.pending);
  const stranger = async () => {
    const r = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx);
    return { Cookie: (r.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
  };
  return { env, bucket, calls, who, started, turn, speak, quota, flush, send, stranger };
}

describe("the ghost's voice through the real Worker", () => {
  it("names a line in the reply, and plays it: Inworld once, the ghost's Speaker and Steering Tag, one unit of the tts quota, the clip kept under speech/v1/", async () => {
    const g = await game();
    const before = await g.quota();
    const reply = await g.turn();
    expect(reply.voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const heard = await g.speak(reply.voice!.lineId);
    expect(heard.status).toBe(200);
    expect(heard.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(heard.bytes).toEqual(mp3());
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]!.model).toBe("inworld/tts-2");
    const spoken = (g.calls[0]!.input["text"] as string).slice(SPEAKERS[SPEAKER].tag.length);
    expect(g.calls[0]!.input["text"]).toBe(SPEAKERS[SPEAKER].tag + spoken);
    expect(reply.text.startsWith(spoken)).toBe(true);
    expect(g.calls[0]!.input["voice_id"]).toBe(SPEAKERS[SPEAKER].inworld);
    expect(before - (await g.quota())).toBe(1);
    await g.flush();
    const kept = [...g.bucket.objects.keys()];
    expect(kept).toHaveLength(1);
    expect(kept[0]!.startsWith("speech/v1/")).toBe(true);
    expect(JSON.stringify(g.bucket.objects.get(kept[0]!)!.customMetadata)).not.toContain(spoken.slice(0, 12)); // the bucket never holds what was said
  });

  it("plays the same line again from the cache: no second call, no second unit", async () => {
    const g = await game();
    const reply = await g.turn();
    await g.speak(reply.voice!.lineId);
    await g.flush();
    const after = await g.quota();
    const again = await g.speak(reply.voice!.lineId);
    expect(again.status).toBe(200);
    expect(again.bytes).toEqual(mp3());
    expect(g.calls).toHaveLength(1);
    expect(await g.quota()).toBe(after);
  });

  it("plays a line that is in the Voice Library with no call and no unit, and copies nothing into the cache", async () => {
    const g = await game();
    const reply = await g.turn();
    const spoken = spokenPart(reply.text);
    expect(spoken).not.toBe("");
    g.bucket.put(await libraryKey(voiceFor(SPEAKER, "inworld"), spoken, sha256Hex), mp3(9));
    const before = await g.quota();
    const heard = await g.speak(reply.voice!.lineId);
    expect(heard.status).toBe(200);
    expect(heard.bytes).toEqual(mp3(9));
    expect(g.calls).toEqual([]);
    expect(await g.quota()).toBe(before);
    await g.flush();
    expect([...g.bucket.objects.keys()].filter((k) => k.startsWith("speech/v1/"))).toEqual([]);
  });

  it("falls back to Aura-2 on the same unit when Inworld fails, with the plain text and no Steering Tag", async () => {
    const g = await game({}, (model) => { if (model === "inworld/tts-2") throw new Error("500"); return mp3().buffer; });
    const before = await g.quota();
    const reply = await g.turn();
    const heard = await g.speak(reply.voice!.lineId);
    expect(heard.status).toBe(200);
    expect(g.calls.map((c) => c.model)).toEqual(["inworld/tts-2", "@cf/deepgram/aura-2-en"]);
    expect(g.calls[1]!.input["text"]).not.toMatch(/[[\]]/);
    expect(g.calls[1]!.input).toMatchObject({ speaker: SPEAKERS[SPEAKER].aura, encoding: "mp3" });
    expect(before - (await g.quota())).toBe(1);
  });

  it("answers 503, and keeps the unit, when no voice could be made", async () => {
    const g = await game({}, () => { throw new Error("down"); });
    const before = await g.quota();
    const reply = await g.turn();
    const heard = await g.speak(reply.voice!.lineId);
    expect([heard.status, heard.text]).toEqual([503, UNAVAILABLE]);
    expect(await g.quota()).toBe(before);
  });

  it("answers 503 when the cap is spent, still plays the line already heard, and spends nothing more", async () => {
    const g = await game({ VOICE_TTS_SESSION_CAP: "1" });
    const first = await g.turn();
    expect((await g.speak(first.voice!.lineId)).status).toBe(200);
    await g.flush();
    const second = await g.turn();
    const refused = await g.speak(second.voice!.lineId);
    expect([refused.status, refused.text]).toEqual([503, UNAVAILABLE]);
    expect((await g.speak(first.voice!.lineId)).status).toBe(200);
    expect(g.calls).toHaveLength(1);
    expect(await g.quota()).toBe(0);
  });

  it("is the same 404 for another visitor as for a line that was never there", async () => {
    const g = await game();
    const reply = await g.turn();
    const theirs = await g.speak(reply.voice!.lineId, await g.stranger());
    const nothing = await g.speak("no-such-line-0000000000");
    expect([theirs.status, theirs.text]).toEqual([404, UNAVAILABLE]);
    expect([nothing.status, nothing.text]).toEqual([404, UNAVAILABLE]);
    expect(g.calls).toEqual([]);
  });
});

describe("when the voice is not set up or not on", () => {
  it("has no voice route and names no line while the Worker has no Workers AI binding", async () => {
    const g = await game({}, null);
    const reply = await g.turn();
    expect("voice" in reply).toBe(false);
    expect((await g.speak("anything-at-all-0000000")).status).toBe(404);
  });
  it("turns the voice off for a speech model id it does not accept, and calls nothing", async () => {
    for (const extra of [{ VOICE_TTS_MODEL_ID: "openai/gpt-4o-mini-tts" }, { VOICE_TTS_FALLBACK_MODEL_ID: "@cf/meta/melotts" }]) {
      const g = await game(extra);
      const reply = await g.turn();
      expect("voice" in reply, JSON.stringify(extra)).toBe(false);
      expect((await g.speak("anything-at-all-0000000")).status).toBe(404);
      expect(g.calls).toEqual([]);
    }
  });
  it("serves the voice for the two model ids it does accept, named out loud", async () => {
    const g = await game({ VOICE_TTS_MODEL_ID: "inworld/tts-2", VOICE_TTS_FALLBACK_MODEL_ID: "@cf/deepgram/aura-2-en" });
    expect((await g.turn()).voice?.lineId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it("names no line, and answers 503, while VOICE_ENABLED is off, and calls nothing", async () => {
    const g = await game({ VOICE_ENABLED: "false" });
    const reply = await g.turn();
    expect("voice" in reply).toBe(false);
    const heard = await g.speak("anything-at-all-0000000");
    expect([heard.status, heard.text]).toEqual([503, UNAVAILABLE]);
    expect(g.calls).toEqual([]);
  });
});
