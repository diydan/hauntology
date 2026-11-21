import { describe, expect, it } from "vitest";
import { singleFlight } from "@hauntology/shared/voice/flight";
import type { ChecksState } from "@hauntology/shared/voice/stitch/check";
import { emptyChecksState } from "@hauntology/shared/voice/stitch/check";
import { voiceFor } from "@hauntology/shared/voice/voices";
import { PartyRoom } from "../do/party-room";
import type { SpeechMaker } from "../guarded/workersai/speak";
import type { ClipTranscriber } from "../guarded/workersai/transcribe";
import { MemoryPlaySessions } from "../play/memory";
import { R2SpeechCache, type SpeechBucket } from "./cache";
import { R2SpeechLibrary, type LibraryBucket } from "./library";
import { CloudflareRoomVoiceLines, PlayVoiceLines } from "./lines";
import { runWordCheck } from "./stitch";
import { RoomStitchClipStore, type RoomClipStorage } from "./stitch-store";
import { FakeNamespace, FakeR2, fakeState } from "../worlds/fake-cloudflare";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";
import { MemorySpendGuard } from "../worlds/fakes";
import { NOW, ORIGIN, worldsKit } from "../worlds/test-kit";

const mp3 = (): Uint8Array => {
  const b = new Uint8Array(2_000).fill(9);
  b[0] = 0xff;
  b[1] = 0xfb;
  return b;
};

describe("ghost-voice Checkpoint 7 end-to-end & cut-order checks", () => {
  it("Single player reaches turns with speaking on and plays audio, while VOICE_ENABLED=false + zero meters still plays cleanly", async () => {
    let now = NOW;
    const r2 = new FakeR2();
    const sessions = new MemoryPlaySessions(() => now);
    const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => now });
    const library = new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket);
    let upstreamCalls = 0;
    const maker: SpeechMaker = {
      async speak(req) {
        upstreamCalls++;
        return { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: voiceFor(req.speaker, "inworld", req.lodgerVoice), elapsedMs: 10, attempts: [] };
      },
    };
    const spend = new MemorySpendGuard(undefined, () => now);
    const kitOn = worldsKit(() => now, {
      play: { sessions },
      voice: { speak: { lines: new PlayVoiceLines(sessions), cache, library, maker, spend, flights: singleFlight() } },
    });
    const vOn = await kitOn.visitor();
    kitOn.readyWorld("w-ckpt-1", vOn);

    const started = await kitOn.app.request(
      `${ORIGIN}/api/play/start`,
      { method: "POST", headers: { ...vOn.headers, "Content-Type": "application/json" }, body: JSON.stringify({ worldId: "w-ckpt-1" }) },
      kitOn.env,
    );
    const { playId } = (await started.json()) as { playId: string };
    const turnOn = await kitOn.app.request(
      `${ORIGIN}/api/play/${playId}/turn`,
      { method: "POST", headers: { ...vOn.headers, "Content-Type": "application/json" }, body: JSON.stringify({ input: { text: "Who is here?" } }) },
      kitOn.env,
    );
    expect(turnOn.status).toBe(200);
    const tOnJson = (await turnOn.json()) as { reply: { text: string; voice?: { lineId: string } } };
    expect(tOnJson.reply.voice?.lineId).toBeTruthy();

    const spoke = await kitOn.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { ...vOn.headers, "Content-Type": "application/json" }, body: JSON.stringify({ playId, lineId: tOnJson.reply.voice!.lineId }) },
      kitOn.env,
    );
    expect(spoke.status).toBe(200);
    expect(spoke.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(upstreamCalls).toBe(1);

    // Zero quota + VOICE_ENABLED="false": replies carry no lineId, speak is 503, game still plays.
    now += 2_000;
    const zeroSpend = new MemorySpendGuard(
      { world: { session: 0, day: 0, total: 0 }, image: { session: 0, day: 0 }, llm: { session: 0, day: 0 }, tts: { session: 0, day: 0 }, stt: { session: 0, day: 0 }, live: { session: 0, day: 0 } },
      () => now,
    );
    const kitOff = worldsKit(() => now, {
      play: { sessions },
      voice: { speak: { lines: new PlayVoiceLines(sessions), cache, library, maker, spend: zeroSpend, flights: singleFlight(), kill: () => true } },
    });
    const envOff = { ...kitOff.env, VOICE_ENABLED: "false", VOICE_LIVE_ENABLED: "false", VOICE_STITCH_ENABLED: "false" };
    const vOff = await kitOff.visitor();
    kitOff.readyWorld("w-ckpt-1", vOn);
    const turnOff = await kitOff.app.request(
      `${ORIGIN}/api/play/${playId}/turn`,
      { method: "POST", headers: { ...vOn.headers, "Content-Type": "application/json" }, body: JSON.stringify({ input: { text: "Answer me." } }) },
      envOff,
    );
    expect(turnOff.status).toBe(200);
    const tOffJson = (await turnOff.json()) as { reply: { text: string; voice?: { lineId: string } } };
    expect(tOffJson.reply.text.length).toBeGreaterThan(0);
    expect(tOffJson.reply.voice).toBeUndefined();

    const quietSpeak = await kitOff.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { ...vOff.headers, "Content-Type": "application/json" }, body: JSON.stringify({ playId, lineId: tOnJson.reply.voice!.lineId }) },
      envOff,
    );
    expect(quietSpeak.status).toBe(503);
    expect((await quietSpeak.json()) as { code: string }).toMatchObject({ code: "voice_unavailable" });
  });

  it("Multiplayer room with speaking ON and Stitch ON + fake Clips plays Host voice, whispers stitched line, and purges clips at end", async () => {
    const { state } = fakeState();
    const sockets: Array<{ attachment: unknown; sent: unknown[] }> = [];
    const makeSock = (attachment: unknown) => {
      const sent: unknown[] = [];
      return {
        attachment,
        sent,
        serializeAttachment(v: unknown) { this.attachment = v; },
        deserializeAttachment() { return this.attachment; },
        send(t: string) { sent.push(JSON.parse(t)); },
        close() {},
      };
    };
    const hostSock = makeSock({ id: "host-1" });
    const phoneSock = makeSock({ id: "phone-1" });
    sockets.push(hostSock, phoneSock);
    (state as unknown as { getWebSockets(): unknown[] }).getWebSockets = () => sockets;

    const room = new PartyRoom(state, {}, () => NOW);
    const ns = new FakeNamespace(() => room);
    const stub = { fetch: (url: string, init?: RequestInit) => room.fetch(new Request(url, init)) };

    const created = (await (await stub.fetch("https://party/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "CKPT" }) })).json()) as { hostToken: string };
    const joined = (await (await stub.fetch("https://party/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: "Sam" }) })).json()) as { token: string };

    await room.webSocketMessage(hostSock as unknown as WebSocket, JSON.stringify({ t: "hello", token: created.hostToken }));
    await room.webSocketMessage(phoneSock as unknown as WebSocket, JSON.stringify({ t: "hello", token: joined.token }));
    await room.webSocketMessage(phoneSock as unknown as WebSocket, JSON.stringify({ t: "speech", action: "on" }));
    await room.webSocketMessage(phoneSock as unknown as WebSocket, JSON.stringify({ t: "stitchSetting", on: true }));
    await room.webSocketMessage(phoneSock as unknown as WebSocket, JSON.stringify({ t: "stitchAnswer", yes: true, tick: true }));

    // Spoken room line -> Host speaks it via POST /api/voice/speak with X-Host-Token.
    const core = (room as unknown as { core: PartyRoom["core" & keyof PartyRoom] }).core as unknown as {
      speakRoomEvent(i: { id: string; kind: "haunt_event"; speaker: "keeper"; text: string }): Promise<{ spoke: boolean; lineId: string | null }>;
      whisperStitch(e: { eventId: number; text: string; seat: number }, clips: readonly unknown[]): Promise<{ reveals: unknown[] }>;
    };
    const ev = await core.speakRoomEvent({ id: "ev-1", kind: "haunt_event", speaker: "keeper", text: "The stair creaks above." });
    expect(ev.spoke).toBe(true);
    expect(ev.lineId).toBeTruthy();

    // Fake Stitch clip check & room storage.
    const r2 = new FakeR2();
    const spend = new MemorySpendGuard(undefined, () => NOW);
    const clipStore = new RoomStitchClipStore(state.storage as unknown as RoomClipStorage);
    const transcriber: ClipTranscriber = {
      async transcribe() {
        return { ok: true, transcript: "candle", elapsedMs: 5 };
      },
    };
    let checks: ChecksState = emptyChecksState();
    const checked = await runWordCheck(
      { transcriber, spend, clips: clipStore, now: () => NOW },
      { enabled: true, consents: [{ seat: 1, yes: true, ageOrGuardianTick: true }], checks },
      { roomId: "CKPT", seat: 1, word: "candle", audio: new Uint8Array(1000).fill(5), contentType: "audio/webm", durationMs: 900, ipHash: "h-1" },
    );
    expect(checked).toMatchObject({ ok: true, accepted: true });
    checks = checked.checks;
    expect((await clipStore.list()).map((c) => `${c.seat}:${c.word}`)).toEqual(["1:candle"]);

    await core.whisperStitch({ eventId: 99, text: "Listen now.", seat: 1 }, []);
    expect(phoneSock.sent.some((m) => (m as { t?: string; text?: string }).t === "stitch_log" && (m as { text?: string }).text === "a voice whispered")).toBe(true);

    // Host fetches audio via X-Host-Token even when VOICE_LIVE_ENABLED is false (cut order).
    const kit = worldsKit(() => NOW, {
      voice: {
        speak: {
          lines: new PlayVoiceLines(new MemoryPlaySessions(() => NOW)),
          cache: new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => NOW }),
          library: new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket),
          maker: { async speak(req) { return { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: voiceFor(req.speaker, "inworld", req.lodgerVoice), elapsedMs: 5, attempts: [] }; } },
          spend,
          flights: singleFlight(),
        },
        roomLines: new CloudflareRoomVoiceLines({ idFromName: (c: string) => ns.idFromName(c), get: (id: unknown) => (id ? stub : stub) } as unknown as JobNamespaceLike),
      },
    });
    const hostRes = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Host-Token": created.hostToken }, body: JSON.stringify({ roomCode: "CKPT", lineId: ev.lineId }) },
      { ...kit.env, VOICE_LIVE_ENABLED: "false" },
    );
    expect(hostRes.status).toBe(200);

    // End room deletes all stitch clips from room storage cleanly.
    await stub.fetch("https://party/end", { method: "POST", body: JSON.stringify({}) });
    expect(await clipStore.list()).toEqual([]);
  });
});
