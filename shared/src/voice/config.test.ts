import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_CONFIG, parseVoiceConfig } from "./config";
import { VOICE_ROOM_LINE_CAP } from "./limits";

describe("parseVoiceConfig (ghost-voice 2.1)", () => {
  it("returns spec defaults when env is empty or undefined", () => {
    expect(parseVoiceConfig(undefined)).toEqual(DEFAULT_VOICE_CONFIG);
    expect(parseVoiceConfig({})).toEqual(DEFAULT_VOICE_CONFIG);
    expect(DEFAULT_VOICE_CONFIG.liveEnabled).toBe(false);
    expect(DEFAULT_VOICE_CONFIG.roomLineCap).toBe(20);
  });

  it("parses valid overrides", () => {
    const cfg = parseVoiceConfig({
      VOICE_ENABLED: "false",
      VOICE_TTS_MODEL_ID: "inworld/tts-2",
      VOICE_TTS_SESSION_CAP: "10",
      VOICE_ROOM_LINE_CAP: "12",
      VOICE_STITCH_ENABLED: "0",
      VOICE_LIVE_ENABLED: "true",
      VOICE_LIVE_SESSION_SECONDS: "120",
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.ttsSessionCap).toBe(10);
    expect(cfg.roomLineCap).toBe(12);
    expect(cfg.stitchEnabled).toBe(false);
    expect(cfg.liveEnabled).toBe(true);
    expect(cfg.liveSessionSeconds).toBe(120);
  });

  it("falls back to defaults on invalid values and never raises roomLineCap above 20", () => {
    const cfg = parseVoiceConfig({
      VOICE_ENABLED: "maybe",
      VOICE_TTS_MODEL_ID: "   ",
      VOICE_TTS_SESSION_CAP: "-5",
      VOICE_TTS_DAY_CAP: "12.5",
      VOICE_STT_SESSION_CAP: "nan",
      VOICE_ROOM_LINE_CAP: "99",
      VOICE_STITCH_PLAYER_CHECKS: "abc",
    });
    expect(cfg.enabled).toBe(DEFAULT_VOICE_CONFIG.enabled);
    expect(cfg.ttsModel).toBe(DEFAULT_VOICE_CONFIG.ttsModel);
    expect(cfg.ttsSessionCap).toBe(DEFAULT_VOICE_CONFIG.ttsSessionCap);
    expect(cfg.ttsDayCap).toBe(DEFAULT_VOICE_CONFIG.ttsDayCap);
    expect(cfg.sttSessionCap).toBe(DEFAULT_VOICE_CONFIG.sttSessionCap);
    expect(cfg.roomLineCap).toBe(VOICE_ROOM_LINE_CAP);
    expect(cfg.stitchPlayerChecks).toBe(DEFAULT_VOICE_CONFIG.stitchPlayerChecks);
  });
});
