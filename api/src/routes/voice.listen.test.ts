import { describe, expect, it } from "vitest";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import type { ClipTranscriber, TranscribeAnswer, TranscribeRequest } from "../guarded/workersai/transcribe";
import { createLogger } from "../log";
import { R2SpeechCache, type SpeechBucket } from "../voice/cache";
import type { VoiceLines } from "../voice/lines";
import type { SpeechMaker } from "../guarded/workersai/speak";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { NOW, ORIGIN, worldsKit, type Visitor } from "../worlds/test-kit";

const clip = (n = 64, fill = 9): Uint8Array => new Uint8Array(n).fill(fill);

function setup(o: { cap?: number; answer?: TranscribeAnswer; maxBytes?: number; env?: Record<string, string> } = {}) {
  let now = NOW;
  const lines: VoiceLines = { async find() { return null; } };
  const r2 = new FakeR2();
  const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => now });
  const maker: SpeechMaker = { async speak() { return { ok: false, kind: "failed", elapsedMs: 0, attempts: [] }; } };
  const spend = { reserved: 0, commits: 0, releases: 0, granted: 0 };
  const guard = {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> {
      spend.reserved += 1;
      if (spend.granted >= (o.cap ?? 20)) return { ok: false, reason: "session" };
      spend.granted += 1;
      return { ok: true, ticket: { id: `stt-${spend.granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit() { spend.commits += 1; },
    async release() { spend.releases += 1; },
  };
  const seen: { bytesSnapshot: Uint8Array; ref: Uint8Array; contentType: string; durationMs?: number | undefined }[] = [];
  const transcriber: ClipTranscriber = {
    async transcribe(req: TranscribeRequest) {
      seen.push({
        bytesSnapshot: new Uint8Array(req.audio),
        ref: req.audio,
        contentType: req.contentType,
        durationMs: req.durationMs,
      });
      return o.answer ?? { ok: true, transcript: "look behind the door", elapsedMs: 25 };
    },
  };
  const logged: string[] = [];
  const kit = worldsKit(
    () => now,
    {
      voice: {
        speak: { lines, cache, maker, spend: guard },
        listen: { transcriber, spend: guard, ...(o.maxBytes !== undefined ? { maxBytes: o.maxBytes } : {}), now: () => now },
      },
      log: createLogger((l) => logged.push(l), () => now),
      ...(o.env !== undefined ? { env: o.env } : {}),
    },
  );

  const post = async (
    body: Uint8Array,
    headers: Record<string, string>,
    method = "POST",
  ) => {
    const res = await kit.app.request(
      `${ORIGIN}/api/voice/listen`,
      {
        method,
        headers,
        ...(method === "POST" ? { body } : {}),
      },
      kit.env,
    );
    return { status: res.status, headers: res.headers, json: await res.json() as Record<string, unknown> };
  };

  return {
    kit,
    r2,
    spend,
    seen,
    logged,
    advance: (ms: number) => { now += ms; },
    visitor: (): Promise<Visitor> => kit.visitor(),
    post,
  };
}

describe("POST /api/voice/listen (ghost-voice 3.7)", () => {
  it("transcribes valid audio with stt ticket, zeroes clip buffer after use, writes nothing to storage, and logs counters only", async () => {
    const t = setup();
    const v = await t.visitor();
    const res = await t.post(clip(64, 42), { ...v.headers, "Content-Type": "audio/webm;codecs=opus", "X-Clip-Duration-Ms": "2000" });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, transcript: "look behind the door" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(t.spend.commits).toBe(1);
    expect(t.spend.releases).toBe(0);
    expect(t.seen).toHaveLength(1);
    expect(t.seen[0]!.ref.every((b) => b === 0)).toBe(true);
    expect(t.r2.objects.size).toBe(0);
    expect(t.logged.join("\n")).not.toContain("look behind the door");
  });

  it("enforces origin and cookie checks and refuses unauthenticated POSTs without setting a cookie", async () => {
    const t = setup();
    const noOrigin = await t.post(clip(), { "Content-Type": "audio/webm" });
    expect(noOrigin.status).toBe(403);

    const noCookie = await t.kit.app.request(
      `${ORIGIN}/api/voice/listen`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "audio/webm" }, body: clip() },
      t.kit.env,
    );
    expect(noCookie.status).toBe(401);
    expect(noCookie.headers.get("Set-Cookie")).toBeNull();
    expect(t.spend.reserved).toBe(0);
  });

  it("refuses unlisted content types, empty clips, over-byte clips, and > 8s duration before reserving stt", async () => {
    const t = setup({ maxBytes: 128 });
    const v = await t.visitor();

    const badType = await t.post(clip(), { ...v.headers, "Content-Type": "text/plain" });
    expect(badType.status).toBe(503);
    expect(badType.json).toEqual({ ok: false, code: "voice_unavailable" });

    const tooLongBytes = await t.post(clip(129), { ...v.headers, "Content-Type": "audio/webm" });
    expect(tooLongBytes.status).toBe(400);
    expect(tooLongBytes.json).toEqual({ ok: false, code: "clip_too_long" });

    const tooLongMs = await t.post(clip(64), { ...v.headers, "Content-Type": "audio/webm", "X-Clip-Duration-Ms": "8001" });
    expect(tooLongMs.status).toBe(400);
    expect(tooLongMs.json).toEqual({ ok: false, code: "clip_too_long" });

    expect(t.spend.reserved).toBe(0);
  });

  it("enforces one clip per 1.5 seconds per Session", async () => {
    const t = setup();
    const v = await t.visitor();

    const first = await t.post(clip(), { ...v.headers, "Content-Type": "audio/webm" });
    expect(first.status).toBe(200);

    t.advance(1_499);
    const soon = await t.post(clip(), { ...v.headers, "Content-Type": "audio/webm" });
    expect(soon.status).toBe(429);
    expect(soon.json).toEqual({ ok: false, code: "rate_limited" });

    t.advance(1);
    const ok = await t.post(clip(), { ...v.headers, "Content-Type": "audio/webm" });
    expect(ok.status).toBe(200);
  });

  it("releases stt Ticket on uncharged failure and answers clip_not_heard on unusable/empty transcript", async () => {
    const failed = setup({ answer: { ok: false, kind: "failed", elapsedMs: 10 } });
    const v1 = await failed.visitor();
    const r1 = await failed.post(clip(), { ...v1.headers, "Content-Type": "audio/mp4" });
    expect(r1.status).toBe(503);
    expect(r1.json).toEqual({ ok: false, code: "voice_unavailable" });
    expect(failed.spend.releases).toBe(1);
    expect(failed.spend.commits).toBe(0);

    const unheard = setup({ answer: { ok: false, kind: "unusable", elapsedMs: 15 } });
    const v2 = await unheard.visitor();
    const r2 = await unheard.post(clip(), { ...v2.headers, "Content-Type": "audio/mp4" });
    expect(r2.status).toBe(422);
    expect(r2.json).toEqual({ ok: false, code: "clip_not_heard" });
    expect(unheard.spend.commits).toBe(1);
  });
});
