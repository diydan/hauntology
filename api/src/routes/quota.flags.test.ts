import { API_SCHEMAS } from "@hauntology/shared/app/api-schemas";
import { QuotaWithFlagsSchema } from "@hauntology/shared/voice/quota-flags";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, MemorySpendGuard, MemoryImageStore } from "../worlds/fakes";
import { worldsKit } from "../worlds/test-kit";

const NOW = 1_800_000_000_000;
const SIX = ["image", "live", "llm", "stt", "tts", "world"];
const kitWith = (env: Record<string, string> = {}, guard = true) => worldsKit(() => NOW, { env, creation: { images: new MemoryImageStore(), ...(guard ? { guard: new MemorySpendGuard(DEFAULT_CAPS, () => NOW) } : {}) } });
const get = async (kit: ReturnType<typeof kitWith>) => (await kit.send("/api/quota", { headers: (await kit.visitor()).headers })).json as Record<string, unknown>;

describe("GET /api/quota voice flags (ghost-voice 3.2): a contract change that is off by default", () => {
  it("is exactly the six counts by default, and the shell's strict schema still parses it", async () => {
    const body = await get(kitWith());
    expect(Object.keys(body).sort()).toEqual(SIX);
    expect(API_SCHEMAS.quota.parse(body)).toEqual(body);
  });
  it("stays the six counts when VOICE_QUOTA_FLAGS is off, blank or nonsense, whatever the voice variables say", async () => {
    for (const v of ["false", "", "0", "yes please"]) {
      const body = await get(kitWith({ VOICE_QUOTA_FLAGS: v, VOICE_LIVE_ENABLED: "true" }));
      expect(Object.keys(body).sort(), v).toEqual(SIX);
    }
  });
  it("adds flags { voice, stitch, live } only when VOICE_QUOTA_FLAGS is on, with live off by default", async () => {
    const body = await get(kitWith({ VOICE_QUOTA_FLAGS: "true" }));
    expect(body.flags).toEqual({ voice: true, stitch: true, live: false });
    expect(QuotaWithFlagsSchema.parse(body)).toEqual(body);
    expect(Object.keys(body).sort()).toEqual([...SIX, "flags"].sort());
  });
  it("follows the voice variables: the kill switch turns all three off, live needs VOICE_LIVE_ENABLED, stitch can be off alone", async () => {
    expect((await get(kitWith({ VOICE_QUOTA_FLAGS: "on", VOICE_ENABLED: "off", VOICE_LIVE_ENABLED: "true" }))).flags).toEqual({ voice: false, stitch: false, live: false });
    expect((await get(kitWith({ VOICE_QUOTA_FLAGS: "on", VOICE_LIVE_ENABLED: "true" }))).flags).toEqual({ voice: true, stitch: true, live: true });
    expect((await get(kitWith({ VOICE_QUOTA_FLAGS: "on", VOICE_STITCH_ENABLED: "false" }))).flags).toEqual({ voice: true, stitch: false, live: false });
  });
  it("with no guard the counts are all none and the flags are still told when on", async () => {
    const body = await get(kitWith({ VOICE_QUOTA_FLAGS: "1" }, false));
    expect(body).toMatchObject({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0, flags: { voice: true } });
  });
  it("carries nothing about the Session or anyone else", async () => {
    const kit = kitWith({ VOICE_QUOTA_FLAGS: "true" });
    const v = await kit.visitor();
    const r = await kit.send("/api/quota", { headers: v.headers });
    expect(JSON.stringify(r.json)).not.toContain(v.sid);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});
