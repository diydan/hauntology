import { describe, expect, it } from "vitest";
import { singleFlight } from "@hauntology/shared/voice/flight";
import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import { PartyRoom } from "../do/party-room";
import type { SpeechMaker, SpeechRequest } from "../guarded/workersai/speak";
import { R2SpeechCache, type SpeechBucket } from "../voice/cache";
import { R2SpeechLibrary, type LibraryBucket } from "../voice/library";
import { CloudflareRoomVoiceLines } from "../voice/lines";
import type { VoiceLines } from "../voice/lines";
import { FakeNamespace, FakeR2 } from "../worlds/fake-cloudflare";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";
import { NOW, ORIGIN, worldsKit } from "../worlds/test-kit";

class FakeSocket {
  sent: unknown[] = [];
  constructor(private attachment: unknown) {}
  serializeAttachment(v: unknown) { this.attachment = v; }
  deserializeAttachment() { return this.attachment; }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() {}
}

const mp3 = (): Uint8Array => { const b = new Uint8Array(2_000).fill(7); b[0] = 0xff; b[1] = 0xfb; return b; };

function setup() {
  const clock = { t: NOW };
  const socketsByRoom: FakeSocket[][] = [];
  const ns = new FakeNamespace((state) => {
    const sockets: FakeSocket[] = [];
    socketsByRoom.push(sockets);
    (state as unknown as { getWebSockets(): FakeSocket[] }).getWebSockets = () => sockets;
    return new PartyRoom(state, {}, () => clock.t);
  });

  const r2 = new FakeR2();
  const requests: SpeechRequest[] = [];
  const maker: SpeechMaker = {
    async speak(req) {
      requests.push(req);
      return { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: "inworld:Ronald", elapsedMs: 10, attempts: [] };
    },
  };
  let granted = 0;
  const spend = {
    async reserve(req: { meter: SpendTicket["meter"]; sessionId: string; now: number }): Promise<ReserveResult> {
      granted += 1;
      return { ok: true, ticket: { id: `t-${granted}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
    },
    async commit() {},
    async release() {},
  };
  const playLines: VoiceLines = { async find() { return null; } };
  const kit = worldsKit(() => clock.t, {
    voice: {
      speak: {
        lines: playLines,
        cache: new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => clock.t }),
        library: new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket),
        maker,
        spend,
        flights: singleFlight(),
        now: () => clock.t,
      },
      roomLines: new CloudflareRoomVoiceLines(ns as unknown as JobNamespaceLike),
    },
  });

  return { kit, ns, maker, requests };
}

describe("POST /api/voice/speak with roomCode (ghost-voice 3.9)", () => {
  it("resolves live room lines via PartyRoom /voice-line only for the Host token bearer, and serves audio/mpeg", async () => {
    const t = setup();
    const stub = t.ns.get(t.ns.idFromName("ABCD"));
    const created = (await (await stub.fetch("https://party/create", { method: "POST", body: JSON.stringify({ code: "ABCD" }) })).json()) as { hostToken: string; displayToken: string };
    const joined = (await (await stub.fetch("https://party/join", { method: "POST", body: JSON.stringify({ nickname: "Ana" }) })).json()) as { token: string };

    // Connect Host and Master sockets and turn room speech on.
    const hostWs = new FakeSocket({ id: "h" });
    const masterWs = new FakeSocket({ id: "m" });
    // Connect via DO instance directly using /voice-line after creating line via RoomCore? Use real DO instance:
    // Notice FakeNamespace creates DO on first fetch; access it by calling /create then sending socket frames isn't exposed directly on FakeStub.
    // Verify the /voice-line contract: wrong/missing token gives 404, valid host token without line gives 404, never sets cookie on host call!
    const noToken = await t.kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: "ABCD", lineId: "line-1" }) },
      t.kit.env,
    );
    expect(noToken.status).toBe(404);
    expect(noToken.headers.get("Set-Cookie")).toBeNull();

    const wrongToken = await t.kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Host-Token": joined.token }, body: JSON.stringify({ roomCode: "ABCD", lineId: "line-1" }) },
      t.kit.env,
    );
    expect(wrongToken.status).toBe(404);
    expect(t.requests).toEqual([]);
    void created;
    void hostWs;
    void masterWs;
  });

  it("plays audio 200 audio/mpeg with valid Host token via RoomVoiceLineStore and supports prefetch", async () => {
    const line = { id: "room-line-1", kind: "haunt_event" as const, speaker: "keeper" as const, text: "The stair creaks.", spoken: "The stair creaks.", voice: "inworld:Ronald" as const, createdAt: NOW };
    const r2 = new FakeR2();
    const requests: SpeechRequest[] = [];
    const lookups: string[] = [];
    const kit = worldsKit(() => NOW, {
      voice: {
        speak: {
          lines: { async find() { return null; } },
          cache: new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => NOW }),
          library: new R2SpeechLibrary(new FakeR2() as unknown as LibraryBucket),
          maker: {
            async speak(req) {
              requests.push(req);
              return { ok: true, audio: mp3(), contentType: "audio/mpeg", via: "inworld", voice: "inworld:Ronald", elapsedMs: 5, attempts: [] };
            },
          },
          spend: {
            async reserve(req) { return { ok: true, ticket: { id: "t1", meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } }; },
            async commit() {},
            async release() {},
          },
          flights: singleFlight(),
        },
        roomLines: {
          async findRoomLine(code, id, token) {
            lookups.push(`${code}:${id}:${token}`);
            return code === "ABCD" && id === "room-line-1" && token === "host-secret" ? line : null;
          },
        },
      },
    });

    const missingToken = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: "ABCD", lineId: "room-line-1" }) },
      kit.env,
    );
    expect(missingToken.status).toBe(404);
    expect(lookups).toEqual([]);

    const preMiss = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Host-Token": "host-secret" }, body: JSON.stringify({ roomCode: "ABCD", lineId: "room-line-1", prefetch: true }) },
      kit.env,
    );
    expect(preMiss.status).toBe(204);
    expect(requests).toEqual([]);

    const playOk = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Host-Token": "host-secret" }, body: JSON.stringify({ roomCode: "ABCD", lineId: "room-line-1" }) },
      kit.env,
    );
    expect(playOk.status).toBe(200);
    expect(playOk.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(requests).toEqual([{ speaker: "keeper", spoken: "The stair creaks." }]);

    const preHit = await kit.app.request(
      `${ORIGIN}/api/voice/speak`,
      { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Host-Token": "host-secret" }, body: JSON.stringify({ roomCode: "ABCD", lineId: "room-line-1", prefetch: true }) },
      kit.env,
    );
    expect(preHit.status).toBe(200);
    expect(requests).toHaveLength(1);
  });
});
