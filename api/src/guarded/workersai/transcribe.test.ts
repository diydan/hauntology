import { describe, expect, it } from "vitest";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { NoTicketError } from "../ticket";
import type { AiBinding } from "./call";
import { DEFAULT_STT_MODEL, sttModelFromEnv, transcribeClip, transcribeWasCharged, WorkersAiTranscriber } from "./transcribe";

const ticket = (meter: SpendTicket["meter"] = "stt"): SpendTicket => ({ id: "t-stt-1", meter, sessionId: "s-1", issuedAt: 1_000 });

describe("WorkersAiTranscriber & transcribeClip (ghost-voice 3.3)", () => {
  it("accepts blank or the named Whisper model and refuses any other model id", () => {
    expect(sttModelFromEnv(undefined)).toBe(DEFAULT_STT_MODEL);
    expect(sttModelFromEnv("")).toBe(DEFAULT_STT_MODEL);
    expect(sttModelFromEnv(DEFAULT_STT_MODEL)).toBe(DEFAULT_STT_MODEL);
    expect(sttModelFromEnv("@cf/meta/llama-3")).toBeNull();
  });

  it("refuses any Ticket whose meter is not stt or live", () => {
    const ai: AiBinding = { run: async () => ({ text: "hello" }) };
    const transcriber = new WorkersAiTranscriber(ai);
    expect(() => transcribeClip(transcriber, ticket("tts"), { audio: new Uint8Array([1, 2]), contentType: "audio/webm" })).toThrow(NoTicketError);
    expect(() => transcribeClip(transcriber, ticket("llm"), { audio: new Uint8Array([1, 2]), contentType: "audio/webm" })).toThrow(NoTicketError);
  });

  it("transcribes valid audio with stt or live ticket and returns clean text", async () => {
    const calls: { model: string; input: Record<string, unknown> }[] = [];
    const ai: AiBinding = {
      async run(model, input) {
        calls.push({ model, input });
        return { result: { text: "  open the door  " } };
      },
    };
    const transcriber = new WorkersAiTranscriber(ai);
    const clip = new Uint8Array([10, 20, 30]);
    const res = await transcribeClip(transcriber, ticket("stt"), { audio: clip, contentType: "audio/webm;codecs=opus", durationMs: 2_500 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.transcript).toBe("open the door");
    expect(transcribeWasCharged(res)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe(DEFAULT_STT_MODEL);
    expect(calls[0]!.input).toEqual({ audio: clip, language: "en" });

    const liveRes = await transcribeClip(transcriber, ticket("live"), { audio: clip, contentType: "audio/mp4" });
    expect(liveRes.ok).toBe(true);
  });

  it("rejects invalid size, contentType or durationMs before calling Workers AI (not charged)", async () => {
    let called = 0;
    const ai: AiBinding = { run: async () => { called += 1; return { text: "nope" }; } };
    const transcriber = new WorkersAiTranscriber(ai, { maxBytes: 100 });

    for (const bad of [
      { audio: new Uint8Array(0), contentType: "audio/webm" },
      { audio: new Uint8Array(101), contentType: "audio/webm" },
      { audio: new Uint8Array([1]), contentType: "application/octet-stream" },
      { audio: new Uint8Array([1]), contentType: "audio/webm", durationMs: 8_001 },
    ]) {
      const r = await transcribeClip(transcriber, ticket("stt"), bad);
      expect(r).toEqual({ ok: false, kind: "invalid", elapsedMs: 0 });
      expect(transcribeWasCharged(r)).toBe(false);
    }
    expect(called).toBe(0);
  });

  it("maps empty text to unusable (charged) and 429/errors/timeouts to uncharged failures", async () => {
    const emptyAi: AiBinding = { run: async () => ({ text: "   " }) };
    const rEmpty = await transcribeClip(new WorkersAiTranscriber(emptyAi), ticket("stt"), { audio: new Uint8Array([1]), contentType: "audio/webm" });
    expect(rEmpty.ok).toBe(false);
    if (!rEmpty.ok) expect(rEmpty.kind).toBe("unusable");
    expect(transcribeWasCharged(rEmpty)).toBe(true);

    const rateAi: AiBinding = { run: async () => { throw new Error("429 too many requests"); } };
    const rRate = await transcribeClip(new WorkersAiTranscriber(rateAi), ticket("stt"), { audio: new Uint8Array([1]), contentType: "audio/webm" });
    expect(rRate.ok).toBe(false);
    if (!rRate.ok) expect(rRate.kind).toBe("rate_limited");
    expect(transcribeWasCharged(rRate)).toBe(false);

    const slowAi: AiBinding = { run: () => new Promise(() => {}) };
    const rSlow = await transcribeClip(new WorkersAiTranscriber(slowAi, { timeoutMs: 25 }), ticket("stt"), { audio: new Uint8Array([1]), contentType: "audio/webm" });
    expect(rSlow.ok).toBe(false);
    if (!rSlow.ok) expect(rSlow.kind).toBe("failed");
    expect(transcribeWasCharged(rSlow)).toBe(false);
  });
});
