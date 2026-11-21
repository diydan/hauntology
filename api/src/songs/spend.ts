import { toBase64Url } from "@hauntology/shared/session-cookie";
import type { DenyReason } from "@hauntology/shared/world/spend";
import { dayOf, type Kv } from "@hauntology/shared/world/spend-ledger";

/**
 * Spend ledger for the Song Service (`song` meter, game-songs 3.1, Requirements 3.2).
 *
 * Enforces a per-Room cap (7 per game: opening + 3 moments + 2 clues + ballad) and a global UTC
 * day cap, plus a kill switch (`SONG_KILL`), without altering the 6 core public quota snapshot keys.
 */
export type SongTicket = {
  id: string;
  meter: "song";
  roomCode: string;
  issuedAt: number;
};

export type SongCaps = {
  room: number;
  day: number;
};

export const SONG_DEFAULT_CAPS: SongCaps = {
  room: 7,
  day: 100,
};

export type SongReserveResult = { ok: true; ticket: SongTicket } | { ok: false; reason: DenyReason };

type StoredTicket = { roomCode: string; day: string; state: "reserved" | "committed" | "released" };

const KEY = {
  kill: "song:kill",
  day: (d: string) => `song:day:${d}`,
  room: (code: string) => `song:room:${code}`,
  tk: (id: string) => `song:tk:${id}`,
};

export class SongSpendGuard {
  constructor(
    private readonly kv: Kv,
    private readonly caps: SongCaps = SONG_DEFAULT_CAPS,
    private readonly clock: () => number = Date.now,
    private readonly randomBytes: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(16)),
  ) {}

  async setKilled(on: boolean): Promise<void> {
    await this.kv.put(KEY.kill, on);
  }

  async reserve(req: { roomCode: string; now?: number }): Promise<SongReserveResult> {
    const now = req.now ?? this.clock();
    const roomCode = req.roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(roomCode)) return { ok: false, reason: "killed" };
    if ((await this.kv.get<boolean>(KEY.kill)) === true) return { ok: false, reason: "killed" };

    const day = dayOf(now);
    const roomUsed = (await this.kv.get<number>(KEY.room(roomCode))) ?? 0;
    if (roomUsed >= this.caps.room) return { ok: false, reason: "session" };

    const dayUsed = (await this.kv.get<number>(KEY.day(day))) ?? 0;
    if (dayUsed >= this.caps.day) return { ok: false, reason: "day" };

    const id = toBase64Url(this.randomBytes());
    const ticket: SongTicket = { id, meter: "song", roomCode, issuedAt: now };
    await this.kv.put(KEY.room(roomCode), roomUsed + 1);
    await this.kv.put(KEY.day(day), dayUsed + 1);
    await this.kv.put(KEY.tk(id), { roomCode, day, state: "reserved" } satisfies StoredTicket);
    return { ok: true, ticket };
  }

  async commit(ticket: SongTicket): Promise<void> {
    const stored = await this.kv.get<StoredTicket>(KEY.tk(ticket.id));
    if (stored === undefined || stored.state !== "reserved") return;
    await this.kv.put(KEY.tk(ticket.id), { ...stored, state: "committed" } satisfies StoredTicket);
  }

  async release(ticket: SongTicket): Promise<void> {
    const stored = await this.kv.get<StoredTicket>(KEY.tk(ticket.id));
    if (stored === undefined || stored.state !== "reserved") return;
    await this.kv.put(KEY.tk(ticket.id), { ...stored, state: "released" } satisfies StoredTicket);
    const roomUsed = (await this.kv.get<number>(KEY.room(stored.roomCode))) ?? 0;
    if (roomUsed > 0) await this.kv.put(KEY.room(stored.roomCode), roomUsed - 1);
    const dayUsed = (await this.kv.get<number>(KEY.day(stored.day))) ?? 0;
    if (dayUsed > 0) await this.kv.put(KEY.day(stored.day), dayUsed - 1);
  }

  async remaining(roomCode: string, now: number = this.clock()): Promise<{ room: number; day: number; killed: boolean }> {
    const killed = (await this.kv.get<boolean>(KEY.kill)) === true;
    const roomUsed = (await this.kv.get<number>(KEY.room(roomCode.trim().toUpperCase()))) ?? 0;
    const dayUsed = (await this.kv.get<number>(KEY.day(dayOf(now)))) ?? 0;
    return {
      killed,
      room: killed ? 0 : Math.max(0, this.caps.room - roomUsed),
      day: killed ? 0 : Math.max(0, this.caps.day - dayUsed),
    };
  }
}
