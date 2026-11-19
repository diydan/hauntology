import { nextPurgeAt, purgeClips } from "@hauntology/shared/voice/stitch/purge";
import type { StitchClip } from "@hauntology/shared/voice/stitch/compose";
import type { StitchConsent } from "@hauntology/shared/voice/stitch/consent";

/**
 * Stitch clip storage inside `PartyRoom` Durable Object storage (ghost-voice 5.10, Requirement 5.5).
 *
 * Clips live ONLY in the room's own DO storage under `clip:<seat>:<word>` with `recordedAt`, never in
 * R2, KV, logs, prompts, or HTTP routes. Purges on leave, withdraw, Master switch off, game end, or
 * room deletion, and schedules the DO alarm from `nextPurgeAt`.
 */
export const CLIP_KEY_PREFIX = "clip:";

export const clipStorageKey = (seat: number, word: string): string => `${CLIP_KEY_PREFIX}${seat}:${word}`;

export interface RoomClipStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(keys: string | string[]): Promise<unknown>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  setAlarm(scheduledTime: number): Promise<unknown>;
  deleteAlarm(): Promise<unknown>;
}

export class RoomStitchClipStore {
  constructor(private readonly storage: RoomClipStorage) {}

  async list(): Promise<StitchClip[]> {
    const entries = await this.storage.list<StitchClip>({ prefix: CLIP_KEY_PREFIX });
    return [...entries.values()];
  }

  async save(clip: StitchClip): Promise<number | null> {
    await this.storage.put(clipStorageKey(clip.seat, clip.word), clip);
    return this.rescheduleAlarm(await this.list());
  }

  async deleteForSeat(seat: number): Promise<number | null> {
    const entries = await this.storage.list<StitchClip>({ prefix: `${CLIP_KEY_PREFIX}${seat}:` });
    for (const k of entries.keys()) await this.storage.delete(k);
    return this.rescheduleAlarm(await this.list());
  }

  async deleteAll(): Promise<void> {
    const entries = await this.storage.list<StitchClip>({ prefix: CLIP_KEY_PREFIX });
    for (const k of entries.keys()) await this.storage.delete(k);
    await this.storage.deleteAlarm();
  }

  async purge(
    ctx: { gameOver: boolean; enabled: boolean; activeSeats: ReadonlySet<number>; consents: readonly StitchConsent[] },
    now: number,
  ): Promise<{ kept: StitchClip[]; removedKeys: string[]; nextAlarmAt: number | null }> {
    const entries = await this.storage.list<StitchClip>({ prefix: CLIP_KEY_PREFIX });
    const all = [...entries.values()];
    const kept = purgeClips(all, ctx, now);
    const keepKeys = new Set(kept.map((c) => clipStorageKey(c.seat, c.word)));
    const removedKeys = [...entries.keys()].filter((k) => !keepKeys.has(k));
    for (const k of removedKeys) await this.storage.delete(k);
    const nextAlarmAt = await this.rescheduleAlarm(kept);
    return { kept, removedKeys, nextAlarmAt };
  }

  private async rescheduleAlarm(clips: readonly StitchClip[]): Promise<number | null> {
    const at = nextPurgeAt(clips);
    if (at === null) await this.storage.deleteAlarm();
    else await this.storage.setAlarm(at);
    return at;
  }
}
