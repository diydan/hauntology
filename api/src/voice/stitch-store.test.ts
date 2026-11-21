import { describe, expect, it } from "vitest";
import type { StitchClip } from "@hauntology/shared/voice/stitch/compose";
import { CLIP_TTL_MS } from "@hauntology/shared/voice/stitch/purge";
import { clipStorageKey, RoomStitchClipStore, type RoomClipStorage } from "./stitch-store";

class FakeRoomStorage implements RoomClipStorage {
  readonly data = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async delete(keys: string | string[]): Promise<void> {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) this.data.delete(k);
  }

  async list<T>(options: { prefix: string }): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [k, v] of this.data.entries()) {
      if (k.startsWith(options.prefix)) out.set(k, v as T);
    }
    return out;
  }

  async setAlarm(scheduledTime: number): Promise<void> {
    this.alarmAt = scheduledTime;
  }

  async deleteAlarm(): Promise<void> {
    this.alarmAt = null;
  }
}

const makeClip = (seat: number, word: string, recordedAt: number): StitchClip => ({
  seat,
  word,
  bytes: new Uint8Array([1, 2, 3, 4]),
  durationMs: 900,
  recordedAt,
  contentType: "audio/webm",
});

describe("RoomStitchClipStore (ghost-voice 5.10)", () => {
  it("stores clips under clip:<seat>:<word> and schedules DO alarm from earliest nextPurgeAt", async () => {
    const storage = new FakeRoomStorage();
    storage.data.set("room", JSON.stringify({ id: "non-clip-key" }));
    const store = new RoomStitchClipStore(storage);

    const alarm1 = await store.save(makeClip(1, "wait", 10_000));
    expect(alarm1).toBe(10_000 + CLIP_TTL_MS);
    expect(storage.alarmAt).toBe(10_000 + CLIP_TTL_MS);
    expect(storage.data.has(clipStorageKey(1, "wait"))).toBe(true);

    const alarm2 = await store.save(makeClip(2, "here", 5_000));
    expect(alarm2).toBe(5_000 + CLIP_TTL_MS);
    expect(storage.alarmAt).toBe(5_000 + CLIP_TTL_MS);
    expect(await store.list()).toHaveLength(2);
    expect(storage.data.has("room")).toBe(true);
  });

  it("purges expired clips, withdrawn/absent seats, Master switch off, and game end while leaving non-clip keys intact", async () => {
    const storage = new FakeRoomStorage();
    storage.data.set("room", "preserved");
    const store = new RoomStitchClipStore(storage);

    await store.save(makeClip(0, "wait", 1_000));
    await store.save(makeClip(1, "here", 20_000));

    // Expire clip(0) and drop consent for seat 1 -> wait: keep seat 1 first via consent, expire seat 0 only.
    const r1 = await store.purge(
      {
        gameOver: false,
        enabled: true,
        activeSeats: new Set([0, 1]),
        consents: [
          { seat: 0, yes: true, ageOrGuardianTick: true },
          { seat: 1, yes: true, ageOrGuardianTick: true },
        ],
      },
      1_000 + CLIP_TTL_MS,
    );
    expect(r1.removedKeys).toEqual(["clip:0:wait"]);
    expect(r1.kept.map((c) => c.word)).toEqual(["here"]);
    expect(r1.nextAlarmAt).toBe(20_000 + CLIP_TTL_MS);

    // Master switch off or gameOver deletes all remaining clips and clears the alarm.
    const r2 = await store.purge(
      {
        gameOver: true,
        enabled: true,
        activeSeats: new Set([0, 1]),
        consents: [{ seat: 1, yes: true, ageOrGuardianTick: true }],
      },
      25_000,
    );
    expect(r2.removedKeys).toEqual(["clip:1:here"]);
    expect(r2.kept).toEqual([]);
    expect(r2.nextAlarmAt).toBeNull();
    expect(storage.alarmAt).toBeNull();
    expect(storage.data.get("room")).toBe("preserved");
  });

  it("deleteForSeat and deleteAll remove targeted clips and update alarm", async () => {
    const storage = new FakeRoomStorage();
    const store = new RoomStitchClipStore(storage);
    await store.save(makeClip(0, "cold", 1_000));
    await store.save(makeClip(1, "stairs", 2_000));

    const afterSeat = await store.deleteForSeat(0);
    expect(afterSeat).toBe(2_000 + CLIP_TTL_MS);
    expect(storage.data.has("clip:0:cold")).toBe(false);
    expect(storage.data.has("clip:1:stairs")).toBe(true);

    await store.deleteAll();
    expect(await store.list()).toEqual([]);
    expect(storage.alarmAt).toBeNull();
  });
});
