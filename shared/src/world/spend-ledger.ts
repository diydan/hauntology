import { toBase64Url } from "../session-cookie";
import { METERS, type DenyReason, type Meter, type Remaining, type ReserveResult, type SpendTicket } from "./spend";

/**
 * The accounting behind `SpendGuard` (world-pipeline 4.1, Requirements 5.1 to 5.3, 5.5 to 5.7). It counts units
 * per Session, per hashed address and day, per day and (for worlds) in total. A reservation counts at once; a
 * release or an expiry gives the unit back; a commit keeps it. It talks to storage through `Kv`, so the same
 * code runs over a Durable Object's storage and over a `Map` in tests. The Durable Object's input gates make the
 * reads and writes of one call atomic, so nothing here takes a lock.
 *
 * Rules:
 * - A reserve checks, in this order, the kill switch (worlds only), the Session cap, the address-per-day cap
 *   (when one is set), the day cap and the total cap (worlds only). A refusal changes nothing.
 * - A reservation that is neither committed nor released within 30 minutes is released (`RESERVATION_TTL_MS`).
 * - Commit and release act on a ticket once; repeating either, or presenting a ticket that is unknown (never made,
 *   or settled long enough ago to be forgotten), changes nothing. Only the stored ticket counts, never the fields
 *   the caller sends back.
 * - A day is a UTC calendar day.
 */

export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
}

export type MeterCaps = {
  /** Units one Session may use. */
  session: number;
  /** Units everyone together may use in one UTC day. */
  day: number;
  /** Units everyone may ever use (worlds only). Counts reserved plus committed. */
  total?: number;
  /** Units one hashed address may use in one UTC day. Not enforced when absent. */
  ipDay?: number;
};
export type CapTable = Record<Meter, MeterCaps>;

/** The defaults of the spec (`.kiro/steering/tech.md` and the `ghost-voice` design). The `live` meter counts 10-second slices. */
export const DEFAULT_CAPS: CapTable = {
  world: { session: 2, day: 10, total: 30 },
  image: { session: 8, day: 150 },
  llm: { session: 40, day: 1500 },
  tts: { session: 40, day: 1500 },
  stt: { session: 20, day: 750 },
  live: { session: 30, day: 180 },
};

type Env = Record<string, string | undefined>;
/** A whole number of zero or more, or `undefined` (an empty or blank value is not zero). */
const optionalWhole = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};
const whole = (raw: string | undefined, fallback: number): number => optionalWhole(raw) ?? fallback;

/**
 * Reads the caps from the Worker's variables, a missing or bad one falling back to the default:
 * `WORLD_SESSION_CAP`, `WORLD_DAY_CAP`, `WORLD_TOTAL_CAP`, `IMAGE_*`, `LLM_*`, `VOICE_TTS_*`, `VOICE_STT_*`,
 * `VOICE_LIVE_SESSION_SECONDS` and `VOICE_LIVE_DAY_SECONDS` (10 seconds a unit). `<METER>_IP_DAY_CAP`
 * (`WORLD_IP_DAY_CAP`, `IMAGE_IP_DAY_CAP`, `LLM_IP_DAY_CAP`, `TTS_IP_DAY_CAP`, `STT_IP_DAY_CAP`, `LIVE_IP_DAY_CAP`) turns
 * on the per-address daily cap, which has no default.
 */
export function capsFromEnv(env: Env | undefined): CapTable {
  const e = env ?? {};
  const d = DEFAULT_CAPS;
  const ip = (name: string) => {
    const v = optionalWhole(e[`${name}_IP_DAY_CAP`]);
    return v === undefined ? {} : { ipDay: v };
  };
  return {
    world: { session: whole(e.WORLD_SESSION_CAP, d.world.session), day: whole(e.WORLD_DAY_CAP, d.world.day), total: whole(e.WORLD_TOTAL_CAP, d.world.total as number), ...ip("WORLD") },
    image: { session: whole(e.IMAGE_SESSION_CAP, d.image.session), day: whole(e.IMAGE_DAY_CAP, d.image.day), ...ip("IMAGE") },
    llm: { session: whole(e.LLM_SESSION_CAP, d.llm.session), day: whole(e.LLM_DAY_CAP, d.llm.day), ...ip("LLM") },
    tts: { session: whole(e.VOICE_TTS_SESSION_CAP, d.tts.session), day: whole(e.VOICE_TTS_DAY_CAP, d.tts.day), ...ip("TTS") },
    stt: { session: whole(e.VOICE_STT_SESSION_CAP, d.stt.session), day: whole(e.VOICE_STT_DAY_CAP, d.stt.day), ...ip("STT") },
    live: {
      session: Math.floor(whole(e.VOICE_LIVE_SESSION_SECONDS, d.live.session * 10) / 10),
      day: Math.floor(whole(e.VOICE_LIVE_DAY_SECONDS, d.live.day * 10) / 10),
      ...ip("LIVE"),
    },
  };
}

export const RESERVATION_TTL_MS = 30 * 60 * 1000;
const HOUR = 3_600_000;
const SETTLED_KEEP_MS = 48 * HOUR;
const SESSION_KEEP_MS = 8 * 24 * HOUR;
const PRUNE_EVERY_MS = HOUR;
const NAME = /^[A-Za-z0-9_-]{1,128}$/;

type Counts = Partial<Record<Meter, number>>;
type Ticket = { meter: Meter; sessionId: string; ipHash: string; issuedAt: number; day: string; state: "reserved" | "committed" | "released"; settledAt?: number };
type SessionCounts = { n: Counts; seen: number };
type Pending = [issuedAt: number, id: string][];

const K = {
  kill: "kill",
  pend: "pend",
  pruned: "pruned",
  total: (m: Meter) => `tot:${m}`,
  day: (day: string, m: Meter) => `day:${day}:${m}`,
  ses: (sid: string) => `ses:${sid}`,
  ip: (day: string, ip: string) => `ip:${day}:${ip}`,
  tk: (id: string) => `tk:${id}`,
};

export const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

export type SpendStatus = { dayCapReached: boolean; totalCapReached: boolean; killed: boolean };

export class SpendLedger {
  /** `randomBytes(16)` makes a ticket id; WebCrypto by default. */
  constructor(
    private readonly kv: Kv,
    private readonly caps: CapTable = DEFAULT_CAPS,
    private readonly randomBytes: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(16)),
  ) {}

  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    const { meter, sessionId, ipHash, now } = req;
    if (!METERS.includes(meter) || !NAME.test(sessionId) || !NAME.test(ipHash) || !Number.isFinite(now)) throw new RangeError("bad reserve request");
    await this.sweep(now);

    const caps = this.caps[meter];
    const day = dayOf(now);
    const deny = (reason: DenyReason): ReserveResult => ({ ok: false, reason });

    if (meter === "world" && (await this.kv.get<boolean>(K.kill)) === true) return deny("killed");
    const ses = (await this.kv.get<SessionCounts>(K.ses(sessionId))) ?? { n: {}, seen: now };
    if ((ses.n[meter] ?? 0) >= caps.session) return deny("session");
    const ip = caps.ipDay === undefined ? undefined : ((await this.kv.get<Counts>(K.ip(day, ipHash))) ?? {});
    if (caps.ipDay !== undefined && ((ip as Counts)[meter] ?? 0) >= caps.ipDay) return deny("day");
    const dayUsed = (await this.kv.get<number>(K.day(day, meter))) ?? 0;
    if (dayUsed >= caps.day) return deny("day");
    const totalUsed = caps.total === undefined ? 0 : ((await this.kv.get<number>(K.total(meter))) ?? 0);
    if (caps.total !== undefined && totalUsed >= caps.total) return deny("total");

    const id = toBase64Url(this.randomBytes());
    const ticket: SpendTicket = { id, meter, sessionId, issuedAt: now };
    ses.n[meter] = (ses.n[meter] ?? 0) + 1;
    ses.seen = now;
    await this.kv.put(K.ses(sessionId), ses);
    if (ip !== undefined) await this.kv.put(K.ip(day, ipHash), { ...ip, [meter]: (ip[meter] ?? 0) + 1 });
    await this.kv.put(K.day(day, meter), dayUsed + 1);
    if (caps.total !== undefined) await this.kv.put(K.total(meter), totalUsed + 1);
    await this.kv.put(K.tk(id), { meter, sessionId, ipHash, issuedAt: now, day, state: "reserved" } satisfies Ticket);
    const pend = (await this.kv.get<Pending>(K.pend)) ?? [];
    await this.kv.put(K.pend, [...pend, [now, id]]);
    return { ok: true, ticket };
  }

  /** The work succeeded: the unit stays used. */
  async commit(ticket: { id: string }, now: number): Promise<void> {
    await this.sweep(now); // a reservation that has run out is already released
    const t = await this.kv.get<Ticket>(K.tk(String(ticket.id)));
    if (t === undefined || t.state !== "reserved") return;
    await this.kv.put(K.tk(ticket.id), { ...t, state: "committed", settledAt: now } satisfies Ticket);
    await this.unpend([ticket.id]);
  }

  /** The work failed or was cancelled: the unit comes back. */
  async release(ticket: { id: string }, now: number): Promise<void> {
    await this.releaseMany([String(ticket.id)], now);
  }

  /** What is left for one Session and one address, per meter: the smallest room under any cap that applies. */
  async remaining(sessionId: string, ipHash: string, now: number): Promise<Remaining> {
    if (!NAME.test(sessionId) || !NAME.test(ipHash) || !Number.isFinite(now)) throw new RangeError("bad remaining request");
    await this.sweep(now);
    const day = dayOf(now);
    const ses = await this.kv.get<SessionCounts>(K.ses(sessionId));
    const ip = await this.kv.get<Counts>(K.ip(day, ipHash));
    const out = {} as Remaining;
    for (const m of METERS) {
      const c = this.caps[m];
      let room = c.session - (ses?.n[m] ?? 0);
      if (c.ipDay !== undefined) room = Math.min(room, c.ipDay - (ip?.[m] ?? 0));
      room = Math.min(room, c.day - ((await this.kv.get<number>(K.day(day, m))) ?? 0));
      if (c.total !== undefined) room = Math.min(room, c.total - ((await this.kv.get<number>(K.total(m))) ?? 0));
      out[m] = Math.max(0, room);
    }
    return out;
  }

  /** What the Home screen shows about worlds, for everyone: the day cap, the total cap and the kill switch. */
  async status(now: number): Promise<SpendStatus> {
    await this.sweep(now);
    const c = this.caps.world;
    const dayUsed = (await this.kv.get<number>(K.day(dayOf(now), "world"))) ?? 0;
    const totalUsed = (await this.kv.get<number>(K.total("world"))) ?? 0;
    return {
      dayCapReached: dayUsed >= c.day,
      totalCapReached: c.total !== undefined && totalUsed >= c.total,
      killed: (await this.kv.get<boolean>(K.kill)) === true,
    };
  }

  /** The kill switch for new worlds. It stays until it is turned off. */
  async setKill(on: boolean): Promise<void> {
    await this.kv.put(K.kill, on);
  }

  /** Releases every reservation that is 30 minutes old, and now and then forgets what has aged out. Safe to call at any time. */
  async sweep(now: number): Promise<number> {
    const pend = (await this.kv.get<Pending>(K.pend)) ?? [];
    const expired = pend.filter(([issuedAt]) => issuedAt + RESERVATION_TTL_MS <= now).map(([, id]) => id);
    if (expired.length > 0) await this.releaseMany(expired, now);
    const last = (await this.kv.get<number>(K.pruned)) ?? 0;
    if (now - last >= PRUNE_EVERY_MS || now < last) await this.prune(now);
    return expired.length;
  }

  /** When the oldest reservation will expire, for the alarm. `null` when none is waiting. */
  async nextExpiry(): Promise<number | null> {
    const pend = (await this.kv.get<Pending>(K.pend)) ?? [];
    return pend.length === 0 ? null : Math.min(...pend.map(([t]) => t)) + RESERVATION_TTL_MS;
  }

  private async unpend(ids: readonly string[]): Promise<void> {
    const pend = (await this.kv.get<Pending>(K.pend)) ?? [];
    await this.kv.put(K.pend, pend.filter(([, id]) => !ids.includes(id)));
  }

  private async releaseMany(ids: readonly string[], now: number): Promise<void> {
    const released: string[] = [];
    for (const id of ids) {
      const t = await this.kv.get<Ticket>(K.tk(id));
      if (t === undefined || t.state !== "reserved") continue;
      await this.kv.put(K.tk(id), { ...t, state: "released", settledAt: now } satisfies Ticket);
      released.push(id);
      const caps = this.caps[t.meter];
      const ses = await this.kv.get<SessionCounts>(K.ses(t.sessionId));
      if (ses !== undefined) await this.kv.put(K.ses(t.sessionId), { ...ses, n: { ...ses.n, [t.meter]: Math.max(0, (ses.n[t.meter] ?? 0) - 1) } });
      if (caps.ipDay !== undefined) {
        const ip = await this.kv.get<Counts>(K.ip(t.day, t.ipHash));
        if (ip !== undefined) await this.kv.put(K.ip(t.day, t.ipHash), { ...ip, [t.meter]: Math.max(0, (ip[t.meter] ?? 0) - 1) });
      }
      const day = await this.kv.get<number>(K.day(t.day, t.meter));
      if (day !== undefined) await this.kv.put(K.day(t.day, t.meter), Math.max(0, day - 1));
      if (caps.total !== undefined) {
        const total = (await this.kv.get<number>(K.total(t.meter))) ?? 0;
        await this.kv.put(K.total(t.meter), Math.max(0, total - 1));
      }
    }
    if (released.length > 0) await this.unpend(released);
  }

  private async prune(now: number): Promise<void> {
    await this.kv.put(K.pruned, now);
    for (const [key, t] of await this.kv.list<Ticket>({ prefix: "tk:" })) {
      if (t.state !== "reserved" && t.settledAt !== undefined && now - t.settledAt >= SETTLED_KEEP_MS) await this.kv.delete(key);
    }
    for (const [key, s] of await this.kv.list<SessionCounts>({ prefix: "ses:" })) {
      if (now - s.seen >= SESSION_KEEP_MS) await this.kv.delete(key);
    }
    const oldest = dayOf(now - 2 * 24 * HOUR);
    for (const prefix of ["day:", "ip:"]) {
      for (const key of (await this.kv.list<unknown>({ prefix })).keys()) {
        const keyDay = key.split(":")[1] as string;
        if (keyDay < oldest) await this.kv.delete(key);
      }
    }
  }
}
