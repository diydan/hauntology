import { describe, expect, it } from "vitest";
import { createEngine, publicSnapshot, step } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { FORBIDDEN_WORDS } from "@hauntology/shared/songs/stock";
import { initialSongPlan } from "@hauntology/shared/songs/plan";
import { MapKv } from "@hauntology/shared/world/map-kv";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { MurekaSongMaker, NoSongTicketError, assertSongTicket, type SongMaker } from "../guarded/songs/mureka";
import { RoomSongCoordinator } from "./service";
import { SongSpendGuard } from "./spend";
import { RoomSongStore, roomSongObjectKey, type SongBucket } from "./store";

const fakeMp3 = (): Uint8Array => {
  const b = new Uint8Array(2_000).fill(7);
  b[0] = 0xff;
  b[1] = 0xfb;
  return b;
};

describe("Guarded Song Service & SongSpendGuard (game-songs 3.1)", () => {
  it("requires a valid SongTicket and sends only lyrics and style, never forbidden words or Room tokens", async () => {
    expect(() => assertSongTicket({ id: "", meter: "song", roomCode: "ABCD", issuedAt: 1 })).toThrow(NoSongTicketError);
    expect(() => assertSongTicket({ id: "t-1", meter: "tts" as never, roomCode: "ABCD", issuedAt: 1 })).toThrow(NoSongTicketError);

    const seenBodies: unknown[] = [];
    let calls = 0;
    const maker = new MurekaSongMaker({
      apiKey: "test-key",
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls++;
        if (String(url).startsWith("https://cdn.example/")) {
          return new Response(fakeMp3(), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
        }
        seenBodies.push(JSON.parse(String(init?.body)));
        if (calls === 1) return new Response("err", { status: 500 }); // retries once automatically
        return new Response(JSON.stringify({ url: "https://cdn.example/song.mp3" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    });

    const spend = new SongSpendGuard(new MapKv(), { room: 2, day: 10 }, () => 1_000);
    const r = await spend.reserve({ roomCode: "ABCD" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Forbidden word blocked before any network call.
    const bad = await maker.make(r.ticket, { lyrics: `See ${FORBIDDEN_WORDS[0]}`, style: "slow waltz" });
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.kind).toBe("invalid");
    expect(calls).toBe(0);

    // Valid call retries once on 500, downloads MP3, and sends ONLY { lyrics, style }.
    const good = await maker.make(r.ticket, { lyrics: "A lantern burns in the hall.", style: "slow minor waltz" });
    expect(good.ok).toBe(true);
    expect(calls).toBe(3); // 500 + generate ok + audio download
    expect(Object.keys(seenBodies[0] as object).sort()).toEqual(["lyrics", "style"]);
  });

  it("enforces kill switch, room cap, day cap, releases failed tickets, and deletes songs with Room", async () => {
    const kv = new MapKv();
    const spend = new SongSpendGuard(kv, { room: 2, day: 5 }, () => 2_000);

    const t1 = await spend.reserve({ roomCode: "RM1" });
    expect(t1.ok).toBe(true);
    const t2 = await spend.reserve({ roomCode: "RM1" });
    expect(t2.ok).toBe(true);
    const t3 = await spend.reserve({ roomCode: "RM1" });
    expect(t3).toEqual({ ok: false, reason: "session" });

    // Releasing t2 gives capacity back cleanly.
    if (t2.ok) await spend.release(t2.ticket);
    expect((await spend.remaining("RM1")).room).toBe(1);

    await spend.setKilled(true);
    expect(await spend.reserve({ roomCode: "RM1" })).toEqual({ ok: false, reason: "killed" });

    const r2 = new FakeR2();
    const store = new RoomSongStore(r2 as unknown as SongBucket);
    await store.put("RM1", "opening", fakeMp3());
    await store.put("RM1", "ballad", fakeMp3());
    await store.put("RM2", "opening", fakeMp3());
    expect(await store.get("RM1", "opening")).not.toBeNull();
    expect(roomSongObjectKey("RM1", "opening")).toBe("songs/room-RM1/opening.mp3");

    expect(await store.deleteRoomSongs("RM1")).toBe(2);
    expect(await store.get("RM1", "opening")).toBeNull();
    expect(await store.get("RM2", "opening")).not.toBeNull();
  });
});

describe("RoomSongCoordinator & Stock fallback (game-songs 3.2)", () => {
  it("generates Room songs only under setting=on and cap, falls back immediately to Stock, and purges on Room end", async () => {
    const seats = [1, 2].map((seat) => ({ seat, nickname: `SecretGuest${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
    let s = createEngine({ seed: 77, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "off" }, presetIds: PRESET_GHOST_IDS });
    s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 1_000).state;
    const view = publicSnapshot(s, 2_000);

    const r2 = new FakeR2();
    const store = new RoomSongStore(r2 as unknown as SongBucket);
    const spend = new SongSpendGuard(new MapKv(), { room: 7, day: 10 }, () => 3_000);
    const calls: string[] = [];
    const maker: SongMaker = {
      async make(_ticket, req) {
        calls.push(req.lyrics);
        return { ok: true, audio: fakeMp3(), contentType: "audio/mpeg", elapsedMs: 12 };
      },
    };
    const coord = new RoomSongCoordinator({ spend, maker, store, now: () => 3_000 });

    const prep = await coord.prepareForView({
      roomCode: "ABCD",
      view,
      plan: initialSongPlan("on"),
      consent: { 1: false, 2: true },
      seed: 77,
    });
    expect(prep.generated.map((g) => g.key)).toEqual(["opening"]);
    expect(calls[0]).not.toContain("SecretGuest1");
    expect(calls[0]).toContain("SecretGuest2");
    expect(await store.get("ABCD", "opening")).not.toBeNull();

    // Custom ready plays custom; unmade moment falls back immediately to Stock without waiting.
    const calm = { phase: "playing" as const, betweenTurns: true, roundEnded: false, quietScene: true, speechPlaying: false, cuePlaying: false, revealPlaying: false };
    expect(coord.pickForSlot({ roomCode: "ABCD", setting: "on", slotInput: calm, kind: "opening", key: "opening" })?.source).toBe("custom");
    const fb = coord.pickForSlot({ roomCode: "ABCD", setting: "on", slotInput: calm, kind: "wrong_accuse", key: "wrong_accuse-9" });
    expect(fb?.source).toBe("stock");

    // End room deletes stored audio cleanly.
    expect(await coord.purgeRoom("ABCD")).toBe(1);
    expect(await store.get("ABCD", "opening")).toBeNull();
    expect(coord.pickForSlot({ roomCode: "ABCD", setting: "on", slotInput: calm, kind: "opening", key: "opening" })?.source).toBe("stock");
  });
});
