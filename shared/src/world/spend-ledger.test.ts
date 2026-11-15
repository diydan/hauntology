import { describe, expect, it } from "vitest";
import { MapKv } from "./map-kv";
import { DEFAULT_CAPS, RESERVATION_TTL_MS, SpendLedger, capsFromEnv, dayOf, type CapTable } from "./spend-ledger";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);

let n = 0;
const ids = () => Uint8Array.from({ length: 16 }, (_, i) => (i === 0 ? ++n & 255 : i === 1 ? (n >> 8) & 255 : i));
const make = (caps: CapTable = DEFAULT_CAPS) => {
  const kv = new MapKv();
  return { kv, ledger: new SpendLedger(kv, caps, ids) };
};
const world = (sessionId: string, now = T0, ipHash = "ip-a") => ({ meter: "world" as const, sessionId, ipHash, now });
const granted = async (p: ReturnType<SpendLedger["reserve"]>) => {
  const r = await p;
  if (!r.ok) throw new Error(`denied: ${r.reason}`);
  return r.ticket;
};

describe("reserve", () => {
  it("grants up to the Session cap, then says session, and another Session is not affected", async () => {
    const { ledger } = make();
    await granted(ledger.reserve(world("a")));
    await granted(ledger.reserve(world("a")));
    expect(await ledger.reserve(world("a"))).toEqual({ ok: false, reason: "session" });
    expect((await ledger.reserve(world("b"))).ok).toBe(true);
  });

  it("says day at the day cap and total at the total cap, and day again tomorrow", async () => {
    const day = make({ ...DEFAULT_CAPS, world: { session: 9, day: 2, total: 9 } });
    await granted(day.ledger.reserve(world("a"))); await granted(day.ledger.reserve(world("b")));
    expect(await day.ledger.reserve(world("c"))).toEqual({ ok: false, reason: "day" });
    expect((await day.ledger.reserve(world("c", T0 + DAY))).ok).toBe(true);

    const total = make({ ...DEFAULT_CAPS, world: { session: 9, day: 9, total: 2 } });
    await total.ledger.commit(await granted(total.ledger.reserve(world("a"))), T0);
    await total.ledger.commit(await granted(total.ledger.reserve(world("b"))), T0);
    expect(await total.ledger.reserve(world("c"))).toEqual({ ok: false, reason: "total" });
    expect(await total.ledger.reserve(world("c", T0 + 5 * DAY))).toEqual({ ok: false, reason: "total" });
  });

  it("checks session, then address, then day, then total", async () => {
    const caps: CapTable = { ...DEFAULT_CAPS, world: { session: 1, ipDay: 1, day: 1, total: 1 } };
    const { ledger } = make(caps);
    await ledger.commit(await granted(ledger.reserve(world("a"))), T0);
    expect(await ledger.reserve(world("a"))).toEqual({ ok: false, reason: "session" });
    expect(await ledger.reserve(world("b", T0, "ip-a"))).toEqual({ ok: false, reason: "day" }); // the address cap, shown as day
    expect(await ledger.reserve(world("b", T0, "ip-b"))).toEqual({ ok: false, reason: "day" }); // the day cap
    expect(await ledger.reserve(world("b", T0 + DAY, "ip-b"))).toEqual({ ok: false, reason: "total" });
  });

  it("limits one address per day only when a cap is set for it, and a new day starts again", async () => {
    const on = make({ ...DEFAULT_CAPS, image: { session: 9, day: 99, ipDay: 2 } });
    const img = (sid: string, ip: string, now = T0) => ({ meter: "image" as const, sessionId: sid, ipHash: ip, now });
    await granted(on.ledger.reserve(img("a", "ip-1"))); await granted(on.ledger.reserve(img("b", "ip-1")));
    expect(await on.ledger.reserve(img("c", "ip-1"))).toEqual({ ok: false, reason: "day" });
    expect((await on.ledger.reserve(img("c", "ip-2"))).ok).toBe(true);
    expect((await on.ledger.reserve(img("c", "ip-1", T0 + DAY))).ok).toBe(true);
    const off = make();
    for (let i = 0; i < 8; i++) await granted(off.ledger.reserve({ meter: "image", sessionId: `s${i}`, ipHash: "ip-1", now: T0 }));
  });

  it("counts each meter separately", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 1, day: 9, total: 9 }, tts: { session: 1, day: 9 } });
    await granted(ledger.reserve(world("a")));
    expect((await ledger.reserve({ meter: "tts", sessionId: "a", ipHash: "ip-a", now: T0 })).ok).toBe(true);
    expect(await ledger.reserve({ meter: "tts", sessionId: "a", ipHash: "ip-a", now: T0 })).toEqual({ ok: false, reason: "session" });
  });

  it("changes nothing when it says no", async () => {
    const { ledger, kv } = make({ ...DEFAULT_CAPS, world: { session: 1, day: 9, total: 9 } });
    await granted(ledger.reserve(world("a")));
    const before = JSON.stringify([...kv.data]);
    expect((await ledger.reserve(world("a"))).ok).toBe(false);
    expect(JSON.stringify([...kv.data])).toBe(before);
  });

  it("gives every ticket its own id", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, llm: { session: 9, day: 99 } });
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) seen.add((await granted(ledger.reserve({ meter: "llm", sessionId: "a", ipHash: "ip", now: T0 }))).id);
    expect(seen.size).toBe(5);
  });

  it("refuses a request that is not well formed", async () => {
    const { ledger } = make();
    for (const bad of [{ ...world("a"), sessionId: "" }, { ...world("a"), sessionId: "a:b" }, { ...world("a"), ipHash: "x y" }, { ...world("a"), now: Number.NaN }, { ...world("a"), meter: "nope" as never }]) {
      await expect(ledger.reserve(bad)).rejects.toThrow(RangeError);
    }
  });
});

describe("kill switch", () => {
  it("stops new worlds only, and can be turned off", async () => {
    const { ledger } = make();
    await ledger.setKill(true);
    expect(await ledger.reserve(world("a"))).toEqual({ ok: false, reason: "killed" });
    expect((await ledger.reserve({ meter: "image", sessionId: "a", ipHash: "ip", now: T0 })).ok).toBe(true);
    expect((await ledger.status(T0)).killed).toBe(true);
    await ledger.setKill(false);
    expect((await ledger.reserve(world("a"))).ok).toBe(true);
    expect((await ledger.status(T0)).killed).toBe(false);
  });

  it("outranks the caps", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 0, day: 0, total: 0 } });
    await ledger.setKill(true);
    expect(await ledger.reserve(world("a"))).toEqual({ ok: false, reason: "killed" });
  });
});

describe("commit and release", () => {
  it("gives the unit back on release, keeps it on commit, and does each only once", async () => {
    const { ledger, kv } = make({ ...DEFAULT_CAPS, world: { session: 3, day: 9, total: 9 } });
    const t1 = await granted(ledger.reserve(world("a")));
    const t2 = await granted(ledger.reserve(world("a")));
    expect((await ledger.remaining("a", "ip-a", T0)).world).toBe(1);
    await ledger.release(t1, T0); await ledger.release(t1, T0);
    expect((await ledger.remaining("a", "ip-a", T0)).world).toBe(2);
    await ledger.commit(t2, T0); await ledger.commit(t2, T0);
    await ledger.release(t2, T0); // too late: it was committed
    expect((await ledger.remaining("a", "ip-a", T0)).world).toBe(2);
    await ledger.commit(t1, T0); // too late: it was released
    expect((await ledger.remaining("a", "ip-a", T0)).world).toBe(2);
    expect((await kv.get<{ state: string }>(`tk:${t1.id}`))?.state).toBe("released");
    expect((await kv.get<{ state: string }>(`tk:${t2.id}`))?.state).toBe("committed");
  });

  it("ignores a ticket that was never made, and trusts only what it stored", async () => {
    const { ledger } = make();
    const t = await granted(ledger.reserve(world("a")));
    await ledger.release({ id: "nope" }, T0);
    await ledger.commit({ id: "nope" }, T0);
    // A forged ticket naming another meter or session still releases only what was stored.
    await ledger.release({ ...t, meter: "image", sessionId: "b" } as never, T0);
    expect((await ledger.remaining("a", "ip-a", T0)).world).toBe(2);
    expect((await ledger.remaining("a", "ip-a", T0)).image).toBe(8);
    expect((await ledger.remaining("b", "ip-a", T0)).image).toBe(8);
  });

  it("returns the day and total units too", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 9, day: 1, total: 1 } });
    const t = await granted(ledger.reserve(world("a")));
    expect(await ledger.reserve(world("b"))).toEqual({ ok: false, reason: "day" });
    await ledger.release(t, T0);
    expect((await ledger.reserve(world("b"))).ok).toBe(true);
  });

  it("returns the address unit too", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, image: { session: 9, day: 99, ipDay: 1 } });
    const img = (sid: string) => ({ meter: "image" as const, sessionId: sid, ipHash: "ip-1", now: T0 });
    const t = await granted(ledger.reserve(img("a")));
    expect((await ledger.reserve(img("b"))).ok).toBe(false);
    await ledger.release(t, T0);
    expect((await ledger.reserve(img("b"))).ok).toBe(true);
  });

  it("never goes below zero", async () => {
    const { ledger, kv } = make();
    const t = await granted(ledger.reserve(world("a")));
    await kv.put("tot:world", 0);
    await kv.put(`day:${dayOf(T0)}:world`, 0);
    await ledger.release(t, T0);
    expect(await kv.get("tot:world")).toBe(0);
    expect(await kv.get(`day:${dayOf(T0)}:world`)).toBe(0);
  });
});

describe("expiry", () => {
  it("releases a reservation that is 30 minutes old, and not one minute before", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 1, day: 9, total: 9 } });
    await granted(ledger.reserve(world("a")));
    expect(await ledger.reserve(world("a", T0 + RESERVATION_TTL_MS - 1))).toEqual({ ok: false, reason: "session" });
    expect((await ledger.reserve(world("a", T0 + RESERVATION_TTL_MS))).ok).toBe(true);
    expect(RESERVATION_TTL_MS).toBe(1_800_000);
  });

  it("does not release what was committed, and ignores a late commit or release of what expired", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 2, day: 9, total: 9 } });
    const kept = await granted(ledger.reserve(world("a")));
    const lost = await granted(ledger.reserve(world("a")));
    await ledger.commit(kept, T0);
    expect(await ledger.sweep(T0 + 2 * HOUR)).toBe(1);
    expect((await ledger.remaining("a", "ip-a", T0 + 2 * HOUR)).world).toBe(1);
    await ledger.commit(lost, T0 + 2 * HOUR);
    await ledger.release(lost, T0 + 2 * HOUR);
    expect((await ledger.remaining("a", "ip-a", T0 + 2 * HOUR)).world).toBe(1);
  });

  it("refuses a commit that comes after the 30 minutes, even when nothing else has swept in between", async () => {
    const { ledger, kv } = make({ ...DEFAULT_CAPS, world: { session: 1, day: 9, total: 9 } });
    const t = await granted(ledger.reserve(world("a")));
    await ledger.commit(t, T0 + RESERVATION_TTL_MS + 60_000);
    expect((await kv.get<{ state: string }>(`tk:${t.id}`))?.state).toBe("released");
    expect((await ledger.remaining("a", "ip-a", T0 + RESERVATION_TTL_MS + 60_000)).world).toBe(1);
  });

  it("says when the next reservation expires", async () => {
    const { ledger } = make();
    expect(await ledger.nextExpiry()).toBeNull();
    const t = await granted(ledger.reserve(world("a", T0)));
    await granted(ledger.reserve(world("a", T0 + 5 * 60_000)));
    expect(await ledger.nextExpiry()).toBe(T0 + RESERVATION_TTL_MS);
    await ledger.commit(t, T0);
    expect(await ledger.nextExpiry()).toBe(T0 + 5 * 60_000 + RESERVATION_TTL_MS);
  });
});

describe("remaining and status", () => {
  it("is limited by the total cap when that is the smallest room", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 9, day: 9, total: 2 } });
    await ledger.commit(await granted(ledger.reserve(world("a"))), T0);
    expect((await ledger.remaining("b", "ip-b", T0)).world).toBe(1);
    await ledger.commit(await granted(ledger.reserve(world("b"))), T0);
    expect((await ledger.remaining("c", "ip-c", T0)).world).toBe(0);
  });

  it("reports the smallest room under any cap that applies, per meter", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 5, day: 3, total: 4, ipDay: 9 }, image: { session: 2, day: 99, ipDay: 1 } });
    await granted(ledger.reserve(world("a")));
    await granted(ledger.reserve({ meter: "image", sessionId: "a", ipHash: "ip-a", now: T0 }));
    const r = await ledger.remaining("a", "ip-a", T0);
    expect(r.world).toBe(2); // day: 3 - 1
    expect(r.image).toBe(0); // the address cap: 1 - 1
    expect((await ledger.remaining("b", "ip-b", T0)).image).toBe(1); // a new address still has its own cap of 1
    expect(r.llm).toBe(40);
  });

  it("says the day cap, the total cap and the kill switch are reached", async () => {
    const { ledger } = make({ ...DEFAULT_CAPS, world: { session: 9, day: 1, total: 2 } });
    expect(await ledger.status(T0)).toEqual({ dayCapReached: false, totalCapReached: false, killed: false });
    await granted(ledger.reserve(world("a")));
    expect(await ledger.status(T0)).toEqual({ dayCapReached: true, totalCapReached: false, killed: false });
    expect((await ledger.status(T0 + DAY)).dayCapReached).toBe(false);
    await ledger.commit(await granted(ledger.reserve(world("a", T0 + 1000))), T0 + 1000);
    await ledger.commit(await granted(ledger.reserve(world("b", T0 + DAY))), T0 + DAY);
    expect((await ledger.status(T0 + DAY)).totalCapReached).toBe(true);
  });

  it("refuses a request that is not well formed", async () => {
    const { ledger } = make();
    await expect(ledger.remaining("", "ip", T0)).rejects.toThrow(RangeError);
    await expect(ledger.remaining("a", "x y", T0)).rejects.toThrow(RangeError);
    await expect(ledger.remaining("a", "ip", Number.NaN)).rejects.toThrow(RangeError);
  });
});

describe("pruning", () => {
  it("forgets settled tickets after 48 hours, old Sessions after 8 days and day counters after 2 days, but never the total or a pending ticket", async () => {
    const caps: CapTable = { ...DEFAULT_CAPS, world: { session: 9, day: 9, total: 9, ipDay: 9 } };
    const { ledger, kv } = make(caps);
    const done = await granted(ledger.reserve(world("a")));
    await ledger.commit(done, T0);
    const cancelled = await granted(ledger.reserve(world("a")));
    await ledger.release(cancelled, T0);
    await granted(ledger.reserve(world("b", T0 + 40 * HOUR)));
    expect(kv.data.has(`tk:${done.id}`)).toBe(true);

    await ledger.sweep(T0 + 47 * HOUR);
    expect(kv.data.has(`tk:${done.id}`)).toBe(true); // settled 47 hours ago: kept
    await ledger.sweep(T0 + 49 * HOUR);
    expect(kv.data.has(`tk:${done.id}`)).toBe(false);
    expect(kv.data.has(`tk:${cancelled.id}`)).toBe(false);
    expect(kv.data.has(`day:${dayOf(T0)}:world`)).toBe(true); // a day counter is kept for two days
    expect(kv.data.has(`ses:a`)).toBe(true);

    await ledger.sweep(T0 + 3 * DAY);
    expect(kv.data.has(`day:${dayOf(T0)}:world`)).toBe(false);
    expect(kv.data.has(`ip:${dayOf(T0)}:ip-a`)).toBe(false);
    expect(kv.data.has("ses:a")).toBe(true); // a Session is kept for 8 days
    expect(kv.data.get("tot:world")).toBeGreaterThanOrEqual(1);

    await ledger.sweep(T0 + 9 * DAY);
    expect(kv.data.has("ses:a")).toBe(false);
    expect(kv.data.get("tot:world")).toBe(1); // the committed world still counts
  });

  it("does nothing to an old ticket's meaning: releasing it after it was forgotten changes nothing", async () => {
    const { ledger } = make();
    const t = await granted(ledger.reserve(world("a")));
    await ledger.commit(t, T0);
    await ledger.sweep(T0 + 3 * DAY);
    await ledger.release(t, T0 + 3 * DAY);
    expect((await ledger.status(T0 + 3 * DAY)).totalCapReached).toBe(false);
    expect((await ledger.remaining("a", "ip-a", T0 + 3 * DAY)).world).toBe(1); // the committed world still counts for its Session
  });

  const settledLongAgo = async (kv: MapKv, id: string) => kv.put(`tk:${id}`, { ...((await kv.get(`tk:${id}`)) as object), settledAt: T0 - 3 * DAY });

  it("keeps a settled ticket for exactly 48 hours, and a Session for 8 days after it was last seen", async () => {
    const settledAt = T0 - 5 * DAY;
    for (const [after, kept] of [[48 * HOUR - 1, true], [48 * HOUR, false]] as const) {
      const { ledger, kv } = make();
      await kv.put("tk:old", { meter: "world", sessionId: "a", ipHash: "ip", issuedAt: settledAt, day: dayOf(settledAt), state: "committed", settledAt });
      await ledger.sweep(settledAt + after);
      expect(kv.data.has("tk:old"), `after ${after}`).toBe(kept);
    }
    for (const [after, kept] of [[8 * DAY - 1, true], [8 * DAY, false]] as const) {
      const { ledger, kv } = make();
      await kv.put("ses:a", { n: { world: 1 }, seen: T0 });
      await ledger.sweep(T0 + after);
      expect(kv.data.has("ses:a"), `after ${after}`).toBe(kept);
    }
  });

  it("counts a Session from the last time it reserved, not the first", async () => {
    const { ledger, kv } = make();
    await ledger.commit(await granted(ledger.reserve(world("a", T0))), T0);
    await ledger.commit(await granted(ledger.reserve(world("a", T0 + 5 * DAY))), T0 + 5 * DAY);
    await ledger.sweep(T0 + 9 * DAY);
    expect(kv.data.has("ses:a")).toBe(true);
    await ledger.sweep(T0 + 14 * DAY);
    expect(kv.data.has("ses:a")).toBe(false);
  });

  it("prunes at most once an hour", async () => {
    const { ledger, kv } = make();
    await ledger.sweep(T0);
    const t = await granted(ledger.reserve(world("a", T0)));
    await ledger.commit(t, T0);
    await settledLongAgo(kv, t.id);
    await ledger.sweep(T0 + 10 * 60_000);
    expect(kv.data.has(`tk:${t.id}`)).toBe(true); // settled long ago, but pruning ran 10 minutes ago
    await ledger.sweep(T0 + HOUR);
    expect(kv.data.has(`tk:${t.id}`)).toBe(false);
  });

  it("prunes again when the clock goes back", async () => {
    const { ledger, kv } = make();
    await ledger.sweep(T0);
    const t = await granted(ledger.reserve(world("a", T0)));
    await ledger.commit(t, T0);
    await settledLongAgo(kv, t.id);
    await ledger.sweep(T0 - 10 * 60_000);
    expect(kv.data.has(`tk:${t.id}`)).toBe(false);
  });
});

describe("capsFromEnv", () => {
  it("is the default table with no variables", () => {
    expect(capsFromEnv(undefined)).toEqual(DEFAULT_CAPS);
    expect(capsFromEnv({})).toEqual(DEFAULT_CAPS);
  });

  it("reads each variable of the spec", () => {
    const caps = capsFromEnv({
      WORLD_SESSION_CAP: "3", WORLD_DAY_CAP: "11", WORLD_TOTAL_CAP: "31", IMAGE_SESSION_CAP: "9", IMAGE_DAY_CAP: "151",
      LLM_SESSION_CAP: "41", LLM_DAY_CAP: "1501", VOICE_TTS_SESSION_CAP: "42", VOICE_TTS_DAY_CAP: "1502",
      VOICE_STT_SESSION_CAP: "21", VOICE_STT_DAY_CAP: "751", VOICE_LIVE_SESSION_SECONDS: "600", VOICE_LIVE_DAY_SECONDS: "3600",
    });
    expect(caps).toEqual({
      world: { session: 3, day: 11, total: 31 }, image: { session: 9, day: 151 }, llm: { session: 41, day: 1501 },
      tts: { session: 42, day: 1502 }, stt: { session: 21, day: 751 }, live: { session: 60, day: 360 },
    });
  });

  it("counts live in 10-second slices, rounding down", () => {
    expect(capsFromEnv({ VOICE_LIVE_SESSION_SECONDS: "299", VOICE_LIVE_DAY_SECONDS: "1805" }).live).toEqual({ session: 29, day: 180 });
  });

  it("turns on the per-address cap with <METER>_IP_DAY_CAP", () => {
    const caps = capsFromEnv({ WORLD_IP_DAY_CAP: "2", IMAGE_IP_DAY_CAP: "5", LLM_IP_DAY_CAP: "6", TTS_IP_DAY_CAP: "7", STT_IP_DAY_CAP: "8", LIVE_IP_DAY_CAP: "9" });
    expect([caps.world.ipDay, caps.image.ipDay, caps.llm.ipDay, caps.tts.ipDay, caps.stt.ipDay, caps.live.ipDay]).toEqual([2, 5, 6, 7, 8, 9]);
    expect(capsFromEnv({ WORLD_IP_DAY_CAP: "x" }).world).not.toHaveProperty("ipDay");
  });

  it("falls back on anything that is not a whole number, and allows zero", () => {
    for (const bad of ["", "-1", "1.5", "abc", "NaN", "Infinity"]) expect(capsFromEnv({ WORLD_SESSION_CAP: bad, WORLD_TOTAL_CAP: bad, VOICE_LIVE_SESSION_SECONDS: bad }).world.session).toBe(2);
    expect(capsFromEnv({ WORLD_SESSION_CAP: "0" }).world.session).toBe(0);
    expect(capsFromEnv({ WORLD_TOTAL_CAP: " 7 " }).world.total).toBe(7);
  });
});
