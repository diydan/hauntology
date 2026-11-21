import { describe, expect, it } from "vitest";
import { LOG_SCHEMA } from "../log";
import { formatVoiceLog, VOICE_LOG_EVENTS } from "./telemetry";

const FORBIDDEN_FIELDS = ["audio", "transcript", "prompt", "word", "text", "spoken", "clip"] as const;

describe("voice telemetry whitelist (ghost-voice 2.16)", () => {
  it("lists every voice counter event in the ghost engine whitelist with no content fields", () => {
    for (const ev of VOICE_LOG_EVENTS) {
      const schema = LOG_SCHEMA[ev];
      expect(schema).toBeDefined();
      for (const bad of FORBIDDEN_FIELDS) {
        expect(Object.keys(schema)).not.toContain(bad);
      }
    }
  });

  it("drops audio, transcripts, prompts, words and text from every voice telemetry event", () => {
    const poisoned = {
      via: "cache",
      outcome: "ok",
      reason: "ok",
      stop: "silence",
      paid: false,
      prefetch: false,
      accepted: true,
      rejected: false,
      ms: 14,
      checks: 3,
      count: 1,
      slices: 2,
      audio: "UklGRiQAAABXQVZF",
      transcript: "someone is by the stairs",
      prompt: "secret system prompt",
      word: "candle",
      text: "The hallway grew cold.",
    };

    for (const ev of VOICE_LOG_EVENTS) {
      const parsed = JSON.parse(formatVoiceLog("info", ev, poisoned as never, 1_000));
      expect(parsed.event).toBe(ev);
      for (const bad of FORBIDDEN_FIELDS) {
        expect(parsed).not.toHaveProperty(bad);
      }
      expect(parsed.dropped).toBeGreaterThanOrEqual(FORBIDDEN_FIELDS.length);
    }
  });
});
