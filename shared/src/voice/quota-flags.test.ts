import { describe, expect, it } from "vitest";
import { QuotaSnapshotSchema } from "../app/api-schemas";
import { QuotaWithFlagsSchema, quotaFlagsFrom, quotaFlagsOn } from "./quota-flags";

describe("quotaFlagsOn (the opt-in: ghost-voice 3.2)", () => {
  it("is off unless VOICE_QUOTA_FLAGS says on, so the default answer of /api/quota does not change", () => {
    expect(quotaFlagsOn(undefined)).toBe(false);
    expect(quotaFlagsOn({})).toBe(false);
    expect(quotaFlagsOn({ VOICE_QUOTA_FLAGS: "" })).toBe(false);
    expect(quotaFlagsOn({ VOICE_QUOTA_FLAGS: "false" })).toBe(false);
    expect(quotaFlagsOn({ VOICE_QUOTA_FLAGS: "maybe" })).toBe(false);
    for (const v of ["true", "1", "on", " TRUE "]) expect(quotaFlagsOn({ VOICE_QUOTA_FLAGS: v }), v).toBe(true);
  });
});

describe("quotaFlagsFrom", () => {
  it("voice follows VOICE_ENABLED (on unless false, 0 or off), stitch also needs voice, live is off unless VOICE_LIVE_ENABLED is on and voice is on", () => {
    expect(quotaFlagsFrom({})).toEqual({ voice: true, stitch: true, live: false });
    expect(quotaFlagsFrom({ VOICE_ENABLED: "off" })).toEqual({ voice: false, stitch: false, live: false });
    expect(quotaFlagsFrom({ VOICE_ENABLED: "false", VOICE_LIVE_ENABLED: "true" })).toEqual({ voice: false, stitch: false, live: false });
    expect(quotaFlagsFrom({ VOICE_STITCH_ENABLED: "0" })).toEqual({ voice: true, stitch: false, live: false });
    expect(quotaFlagsFrom({ VOICE_LIVE_ENABLED: "1" })).toEqual({ voice: true, stitch: true, live: true });
  });
  it("takes a voice window that is closed as voice off, when it is told so", () => {
    expect(quotaFlagsFrom({ VOICE_LIVE_ENABLED: "true" }, { windowOpen: false })).toEqual({ voice: false, stitch: false, live: false });
    expect(quotaFlagsFrom({}, { windowOpen: true }).voice).toBe(true);
  });
});

describe("QuotaWithFlagsSchema", () => {
  const six = { world: 1, image: 2, llm: 3, tts: 4, stt: 5, live: 6 };
  it("accepts the six counts with the flags, and the old answer without them keeps passing the old schema", () => {
    expect(QuotaWithFlagsSchema.parse({ ...six, flags: { voice: true, stitch: false, live: false } })).toEqual({ ...six, flags: { voice: true, stitch: false, live: false } });
    expect(QuotaSnapshotSchema.parse(six)).toEqual(six);
    expect(QuotaWithFlagsSchema.parse(six)).toEqual(six); // flags are optional
  });
  it("refuses unknown flags and non-boolean flags", () => {
    expect(QuotaWithFlagsSchema.safeParse({ ...six, flags: { voice: true, stitch: true, live: false, extra: true } }).success).toBe(false);
    expect(QuotaWithFlagsSchema.safeParse({ ...six, flags: { voice: "yes", stitch: true, live: false } }).success).toBe(false);
  });
});
