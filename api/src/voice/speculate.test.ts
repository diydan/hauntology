import { singleFlight } from "@hauntology/shared/voice/flight";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import { describe, expect, it } from "vitest";
import type { SpeechAnswer, SpeechMaker, SpeechRequest } from "../guarded/workersai/speak";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechCache, type SpeechBucket } from "./cache";
import type { VoiceLines } from "./lines";
import { speakLine, type SpeakDeps } from "./speak";
import { speculate } from "./speculate";

// All over fakes: a fake R2 cache, a fake spend guard and a fake speech maker. Nothing here reaches a paid service.
const T0 = 1_700_000_000_000;
const WHO = { sessionId: "sid-owner", ipHash: "iphash" };
const SPOKEN = "Somebody was in the kitchen before you.";
const mp3 = (): Uint8Array => { const b = new Uint8Array(4_000).fill(7); b[0] = 0xff; b[1] = 0xfb; return b; };
const line = (over: Partial<VoiceLine> = {}): VoiceLine => ({ id: "L1", kind: "narration", speaker: "whisper", text: `${SPOKEN} The rest is only subtitle.`, spoken: SPOKEN, voice: "inworld:Pippa", createdAt: T0, ...over });
const good: SpeechAnswer = { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: "inworld:Pippa", elapsedMs: 900, attempts: [{ step: "inworld", outcome: "ok", ms: 900 }] };

function rig(o: { cap?: number; gated?: boolean; answer?: () => SpeechAnswer } = {}) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const maker: SpeechMaker & { requests: SpeechRequest[]; release: () => void } = {
    requests: [], release,
    async speak(req: SpeechRequest) { maker.requests.push(req); if (o.gated) await gate; return o.answer ? o.answer() : good; },
  };
  let granted = 0;
  const spend = {
    reserved: 0, commits: 0, releases: 0,
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> {
      spend.reserved++;
      if (granted >= (o.cap ?? 100)) return { ok: false, reason: "session" };
      granted++;
      return { ok: true, ticket: { id: `t${granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit() { spend.commits++; }, async release() { spend.releases++; },
  };
  const held: Record<string, VoiceLine> = { L1: line() };
  const lines: VoiceLines = { async find(scope, id) { return scope.ownerSid === WHO.sessionId && scope.playId === "p-1" ? (held[id] ?? null) : null; } };
  const cache = new R2SpeechCache(new FakeR2() as unknown as SpeechBucket, { now: () => T0 });
  const deps: SpeakDeps = { lines, cache, maker, spend, flights: singleFlight(), now: () => T0 };
  return { deps, maker, spend };
}
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 1)); };

describe("speculate (ghost-voice 3.12): start the paid call when the line is validated and speaking is on", () => {
  it("starts one call, and the later speak request joins it: one upstream call, one Ticket", async () => {
    const t = rig({ gated: true });
    const s = speculate(t.deps, WHO, line(), { speaking: true });
    expect(s.result).toBe("started");
    for (let i = 0; i < 200 && t.maker.requests.length === 0; i++) await new Promise((r) => setTimeout(r, 1));
    expect(t.maker.requests).toHaveLength(1);
    const later = speakLine(t.deps, WHO, { playId: "p-1", lineId: "L1" });
    await settle();
    t.maker.release();
    await s.done;
    expect(await later).toMatchObject({ ok: true, paid: false });
    expect(t.maker.requests).toHaveLength(1);
    expect(t.spend.reserved).toBe(1);
  });

  it("finds the clip kept in the cache for a request that comes after it finished", async () => {
    const t = rig();
    await speculate(t.deps, WHO, line(), { speaking: true }).done;
    expect(await speakLine(t.deps, WHO, { playId: "p-1", lineId: "L1" })).toMatchObject({ ok: true, via: "cache", paid: false });
    expect(t.maker.requests).toHaveLength(1);
  });

  it("starts nothing when speaking is off, when the voice is off, or for a line with no spoken part, and spends nothing", async () => {
    const t = rig();
    expect(speculate(t.deps, WHO, line(), { speaking: false }).result).toBe("off");
    expect(speculate(t.deps, WHO, line(), { speaking: true, voiceEnabled: false }).result).toBe("off");
    expect(speculate(t.deps, WHO, line({ spoken: "  " }), { speaking: true }).result).toBe("silent");
    await settle();
    expect([t.maker.requests.length, t.spend.reserved]).toEqual([0, 0]);
  });

  it("hands the work to defer so the caller does not wait, and never throws when the maker fails or the cap is spent", async () => {
    const deferred: Promise<unknown>[] = [];
    const t = rig({ answer: () => { throw new Error("binding exploded"); } });
    const s = speculate(t.deps, WHO, line(), { speaking: true, defer: (p) => { deferred.push(p); } });
    await expect(s.done).resolves.toBeUndefined();
    expect(deferred.length).toBeGreaterThan(0);
    const capped = rig({ cap: 0 });
    await expect(speculate(capped.deps, WHO, line(), { speaking: true }).done).resolves.toBeUndefined();
    expect(capped.maker.requests).toHaveLength(0); // a refused Ticket is a quiet no
  });

  it("is bounded by the caps: ten lines with a cap of three make three calls", async () => {
    const t = rig({ cap: 3 });
    for (let i = 0; i < 10; i++) await speculate(t.deps, WHO, line({ id: `E${i}`, spoken: `${SPOKEN} Number ${i}.` }), { speaking: true }).done;
    expect(t.maker.requests).toHaveLength(3);
  });

  it("a prefetch of a line that was never synthesised returns nothing and spends nothing", async () => {
    const t = rig();
    expect(await speakLine(t.deps, WHO, { playId: "p-1", lineId: "L1", prefetch: true })).toEqual({ ok: false, reason: "not_ready", paid: false });
    expect([t.maker.requests.length, t.spend.reserved]).toEqual([0, 0]);
  });
});
