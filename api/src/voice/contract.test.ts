import { describe, expect, it } from "vitest";
import { LOG_SCHEMA } from "@hauntology/shared/log";
import { singleFlight } from "@hauntology/shared/voice/flight";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { ClipTranscriber } from "../guarded/workersai/transcribe";
import type { SpeechMaker } from "../guarded/workersai/speak";
import { createLogger } from "../log";
import { MemoryPlaySessions } from "../play/memory";
import { R2SpeechCache, type SpeechBucket } from "../voice/cache";
import { R2SpeechLibrary, type LibraryBucket } from "../voice/library";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { MemorySpendGuard } from "../worlds/fakes";
import { NOW, ORIGIN, worldsKit } from "../worlds/test-kit";

const WORLD_ID = "w-contract-00000001";

describe("ghost-voice 3.10 contract suite", () => {
  it("zero quota + kill switch keeps turn route playable to ending while listen/speak answer quietly and write/log nothing", async () => {
    let now = NOW;
    const r2 = new FakeR2();
    const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => now });
    const library = new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket);
    const sessions = new MemoryPlaySessions(() => now);
    const zeroSpend = new MemorySpendGuard(
      {
        world: { session: 0, day: 0, total: 0 },
        image: { session: 0, day: 0 },
        llm: { session: 0, day: 0 },
        tts: { session: 0, day: 0 },
        stt: { session: 0, day: 0 },
        live: { session: 0, day: 0 },
      },
      () => now,
    );

    const FOREIGN_LINE_ID = "foreign-line-id";
    const heldLine: VoiceLine = {
      id: "line-1",
      kind: "narration",
      speaker: "whisper",
      text: "The sink is still wet.",
      spoken: "The sink is still wet.",
      voice: "inworld:Pippa",
      createdAt: NOW,
    };
    let aiCalls = 0;
    const maker: SpeechMaker = { async speak() { aiCalls += 1; return { ok: false, kind: "failed", elapsedMs: 0, attempts: [] }; } };
    const transcriber: ClipTranscriber = { async transcribe() { aiCalls += 1; return { ok: true, transcript: "secret words", elapsedMs: 5 }; } };

    const logged: string[] = [];
    const kit = worldsKit(
      () => now,
      {
        play: { sessions },
        voice: {
          speak: {
            lines: { async find(_s, id) { return id === "line-1" ? heldLine : null; } },
            cache,
            library,
            maker,
            spend: zeroSpend,
            flights: singleFlight(),
            kill: () => true,
          },
          listen: {
            transcriber,
            spend: zeroSpend,
            kill: () => true,
            now: () => now,
          },
        },
        log: createLogger((l) => logged.push(l), () => now),
      },
    );
    const visitor = await kit.visitor();
    kit.readyWorld(WORLD_ID, visitor);

    // Speak refuses arbitrary text and foreign lineId, and quiet-fails when killed/exhausted.
    const speakText = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { ...visitor.headers, "Content-Type": "application/json" }, body: JSON.stringify({ playId: "p-1", lineId: FOREIGN_LINE_ID, text: "say this" }) },
      kit.env,
    );
    expect(speakText.status).toBe(400);

    const speakForeign = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { ...visitor.headers, "Content-Type": "application/json" }, body: JSON.stringify({ playId: "p-1", lineId: FOREIGN_LINE_ID }) },
      kit.env,
    );
    expect(speakForeign.status).toBe(404);

    // Listen writes nothing and fails quietly when killed / zero stt.
    const listenRes = await kit.app.request(
      `${ORIGIN}/api/voice/listen`,
      { method: "POST", headers: { ...visitor.headers, "Content-Type": "audio/webm" }, body: new Uint8Array([1, 2, 3]) },
      kit.env,
    );
    expect(listenRes.status).toBe(503);
    expect(await listenRes.json()).toEqual({ ok: false, code: "voice_unavailable" });
    expect(aiCalls).toBe(0);
    expect(r2.objects.size).toBe(0);

    // Play still starts and advances cleanly all the way to the Ending by typing/buttons.
    const started = await kit.app.request(
      `${ORIGIN}/api/play/start`,
      { method: "POST", headers: { ...visitor.headers, "Content-Type": "application/json" }, body: JSON.stringify({ worldId: WORLD_ID }) },
      kit.env,
    );
    expect(started.status).toBe(200);
    const { playId, view } = await started.json() as { playId: string; view: { anchors: { pos: [number, number, number] }[] } };

    let ended = false;
    for (const a of view.anchors) {
      now += 2_000;
      const turnRes = await kit.app.request(
        `${ORIGIN}/api/play/${playId}/turn`,
        {
          method: "POST",
          headers: { ...visitor.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ input: { text: "look carefully" }, pose: { pos: a.pos, yaw: 0 } }),
        },
        kit.env,
      );
      expect(turnRes.status).toBe(200);
      const turnJson = await turnRes.json() as { view: { ended: boolean } };
      ended = turnJson.view.ended;
    }
    expect(ended).toBe(true);

    // Every emitted log line is a whitelisted schema event with no forbidden text/audio.
    for (const raw of logged) {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.hasOwn(LOG_SCHEMA, obj.event as string)).toBe(true);
      expect(raw).not.toContain("secret words");
      expect(raw).not.toContain("look carefully");
      expect(raw).not.toContain("say this");
    }
  });
});
