import { describe, expect, it } from "vitest";
import { emptyChecksState } from "@hauntology/shared/voice/stitch/check";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import type { ClipTranscriber, TranscribeAnswer } from "../guarded/workersai/transcribe";
import { createLogger } from "../log";
import { runWordCheck } from "./stitch";
import { RoomStitchClipStore, type RoomClipStorage } from "./stitch-store";

class MemoryRoomStorage implements RoomClipStorage {
  readonly map = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(k: string) { return this.map.get(k) as T | undefined; }
  async put(k: string, v: unknown) { this.map.set(k, v); }
  async delete(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) this.map.delete(k); }
  async list<T>(o: { prefix: string }) {
    const out = new Map<string, T>();
    for (const [k, v] of this.map) if (k.startsWith(o.prefix)) out.set(k, v as T);
    return out;
  }
  async setAlarm(t: number) { this.alarm = t; }
  async deleteAlarm() { this.alarm = null; }
}

function setup(o: { cap?: number; answer?: TranscribeAnswer } = {}) {
  const storage = new MemoryRoomStorage();
  const clips = new RoomStitchClipStore(storage);
  const spendLog = { reserved: 0, granted: 0, commits: 0, releases: 0 };
  const spend = {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> {
      spendLog.reserved += 1;
      if (spendLog.granted >= (o.cap ?? 120)) return { ok: false, reason: "session" };
      spendLog.granted += 1;
      return { ok: true, ticket: { id: `t-${spendLog.granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit() { spendLog.commits += 1; },
    async release() { spendLog.releases += 1; },
  };
  let refSeen: Uint8Array | null = null;
  const transcriber: ClipTranscriber = {
    async transcribe(req) {
      refSeen = req.audio;
      return o.answer ?? { ok: true, transcript: "Candle!", elapsedMs: 12 };
    },
  };
  const logged: string[] = [];
  const deps = { transcriber, spend, clips, log: createLogger((l) => logged.push(l), () => 1_000), now: () => 5_000 };
  return { deps, storage, clips, spendLog, logged, refSeen: () => refSeen };
}

describe("runWordCheck (ghost-voice 5.9)", () => {
  it("accepts matching single word, zeroes transient buffer, drops transcript from logs, and stores clip only in room storage", async () => {
    const t = setup();
    const state = {
      enabled: true,
      consents: [{ seat: 2, yes: true, ageOrGuardianTick: true }],
      checks: emptyChecksState(),
    };
    const audio = new Uint8Array([10, 20, 30]);
    const res = await runWordCheck(t.deps, state, {
      roomId: "ABCD",
      seat: 2,
      word: "candle",
      audio,
      contentType: "audio/webm",
      durationMs: 900,
      ipHash: "ip",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.accepted).toBe(true);
    expect(res.checks.accepted).toEqual(["2:candle"]);
    expect(t.spendLog.commits).toBe(1);
    expect(audio.every((b) => b === 0)).toBe(true);
    expect((await t.clips.list()).map((c) => `${c.seat}:${c.word}`)).toEqual(["2:candle"]);
    expect(t.logged.join("\n")).not.toContain("Candle");
    expect(t.logged.join("\n")).not.toContain("candle");
  });

  it("rejects mismatched word, drops clip, still charges Whisper attempt, and zeroes buffer", async () => {
    const t = setup({ answer: { ok: true, transcript: "stairs", elapsedMs: 12 } });
    const state = {
      enabled: true,
      consents: [{ seat: 1, yes: true, ageOrGuardianTick: true }],
      checks: emptyChecksState(),
    };
    const audio = new Uint8Array([5, 6, 7]);
    const res = await runWordCheck(t.deps, state, {
      roomId: "ABCD",
      seat: 1,
      word: "candle",
      audio,
      contentType: "audio/webm",
      durationMs: 900,
      ipHash: "ip",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.accepted).toBe(false);
    expect(res.checks.attempts["1:candle"]).toBe(1);
    expect(res.checks.accepted).toEqual([]);
    expect(await t.clips.list()).toEqual([]);
    expect(audio.every((b) => b === 0)).toBe(true);
  });

  it("refuses with stitch_check_limit when limit/consent fails and does not spend a check on denied stt ticket", async () => {
    const denied = setup({ cap: 0 });
    const state = {
      enabled: true,
      consents: [{ seat: 0, yes: true, ageOrGuardianTick: true }],
      checks: emptyChecksState(),
    };
    const resDenied = await runWordCheck(denied.deps, state, {
      roomId: "ABCD",
      seat: 0,
      word: "wait",
      audio: new Uint8Array([9]),
      contentType: "audio/webm",
      durationMs: 800,
      ipHash: "ip",
    });
    expect(resDenied.ok).toBe(false);
    if (!resDenied.ok) expect(resDenied.code).toBe("voice_unavailable");
    expect(resDenied.checks.room).toBe(0);

    const noConsent = await runWordCheck(
      denied.deps,
      { enabled: true, consents: [], checks: emptyChecksState() },
      { roomId: "ABCD", seat: 0, word: "wait", audio: new Uint8Array([9]), contentType: "audio/webm", durationMs: 800, ipHash: "ip" },
    );
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.code).toBe("stitch_check_limit");
  });
});
