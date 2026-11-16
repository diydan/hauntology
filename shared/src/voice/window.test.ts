import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MapKv } from "../world/map-kv";
import {
  VOICE_WINDOW_DEFAULT_LINES, VOICE_WINDOW_DEFAULT_MINUTES, VOICE_WINDOW_MAX_LINES, VOICE_WINDOW_MAX_MINUTES, VoiceWindowStore, readWindowRequest,
} from "./window";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const store = () => new VoiceWindowStore(new MapKv());

describe("the limits", () => {
  it("are an hour and 200 lines by default, and at most 8 hours and 1000 lines", () => {
    expect([VOICE_WINDOW_DEFAULT_MINUTES, VOICE_WINDOW_DEFAULT_LINES, VOICE_WINDOW_MAX_MINUTES, VOICE_WINDOW_MAX_LINES]).toEqual([60, 200, 480, 1000]);
  });
});

describe("a window that was never opened", () => {
  it("is closed, with nothing to take", async () => {
    const w = store();
    expect(await w.status(T0)).toEqual({ open: false, until: null, remainingMs: 0, cap: 0, used: 0, remainingLines: 0 });
    expect(await w.take(T0)).toEqual({ ok: false, reason: "closed" });
  });
  it("closing it again is harmless, and giving a line back changes nothing", async () => {
    const w = store();
    expect((await w.close(T0)).open).toBe(false);
    await w.give(1, T0);
    expect((await w.status(T0)).open).toBe(false);
  });
});

describe("open", () => {
  it("opens for the minutes given, with the cap given and nothing used", async () => {
    const s = await store().open({ minutes: 30, cap: 50 }, T0);
    expect(s).toEqual({ open: true, until: T0 + 30 * MIN, remainingMs: 30 * MIN, cap: 50, used: 0, remainingLines: 50 });
  });
  it("closes by itself: open a millisecond before the time is up and closed at the time", async () => {
    const w = store();
    await w.open({ minutes: 10, cap: 5 }, T0);
    expect((await w.status(T0 + 10 * MIN - 1)).open).toBe(true);
    expect((await w.status(T0 + 10 * MIN)).open).toBe(false);
    expect(await w.take(T0 + 10 * MIN)).toEqual({ ok: false, reason: "closed" });
    expect((await w.status(T0 + 10 * MIN)).until).toBeNull();
  });
  it("counts the time left down as the clock moves", async () => {
    const w = store();
    await w.open({ minutes: 10, cap: 5 }, T0);
    expect((await w.status(T0 + 4 * MIN)).remainingMs).toBe(6 * MIN);
  });
  it("starts a new window with a count of none when it is opened again, and takes the new length and cap", async () => {
    const w = store();
    await w.open({ minutes: 10, cap: 3 }, T0);
    await w.take(T0);
    await w.take(T0);
    const again = await w.open({ minutes: 20, cap: 7 }, T0 + MIN);
    expect(again).toMatchObject({ used: 0, cap: 7, remainingLines: 7, until: T0 + MIN + 20 * MIN });
  });
  it("refuses numbers that are not allowed with a RangeError, and changes nothing", async () => {
    const w = store();
    await w.open({ minutes: 10, cap: 3 }, T0);
    const bad = [{ minutes: 0, cap: 3 }, { minutes: 481, cap: 3 }, { minutes: -1, cap: 3 }, { minutes: 1.5, cap: 3 }, { minutes: 10, cap: 0 }, { minutes: 10, cap: 1001 }, { minutes: Number.NaN, cap: 3 }, { minutes: 10, cap: Number.POSITIVE_INFINITY }];
    for (const b of bad) await expect(w.open(b, T0), JSON.stringify(b)).rejects.toThrow(RangeError);
    expect(await w.status(T0)).toMatchObject({ open: true, cap: 3 });
  });
});

describe("take and give", () => {
  it("spends a line each time, until the cap, and then says cap while the window stays open", async () => {
    const w = store();
    await w.open({ minutes: 60, cap: 2 }, T0);
    expect(await w.take(T0)).toMatchObject({ ok: true });
    expect(await w.take(T0)).toMatchObject({ ok: true });
    expect(await w.take(T0)).toEqual({ ok: false, reason: "cap" });
    expect(await w.status(T0)).toMatchObject({ open: true, used: 2, remainingLines: 0 });
  });
  it("gives a line back, so it can be spent again", async () => {
    const w = store();
    await w.open({ minutes: 60, cap: 1 }, T0);
    const a = await w.take(T0);
    expect(a.ok).toBe(true);
    expect(await w.take(T0)).toEqual({ ok: false, reason: "cap" });
    if (a.ok) await w.give(a.id, T0);
    expect(await w.take(T0)).toMatchObject({ ok: true });
  });
  it("gives nothing back to a window that is not the one the line came from: a new window, or a closed one", async () => {
    const w = store();
    await w.open({ minutes: 60, cap: 5 }, T0);
    const old = await w.take(T0);
    await w.open({ minutes: 60, cap: 5 }, T0 + MIN);
    await w.take(T0 + MIN);
    if (old.ok) await w.give(old.id, T0 + MIN); // the old call finishes late
    expect((await w.status(T0 + MIN)).used).toBe(1);
    const cur = await w.take(T0 + MIN);
    await w.close(T0 + MIN);
    await w.open({ minutes: 60, cap: 5 }, T0 + 2 * MIN);
    if (cur.ok) await w.give(cur.id, T0 + 2 * MIN);
    expect((await w.status(T0 + 2 * MIN)).used).toBe(0);
  });
  it("never takes the count below none, however many lines are given back", async () => {
    const w = store();
    const s = await w.open({ minutes: 60, cap: 5 }, T0);
    expect(s.used).toBe(0);
    const t = await w.take(T0);
    for (let i = 0; i < 4; i++) if (t.ok) await w.give(t.id, T0);
    expect((await w.status(T0)).used).toBe(0);
  });
  it("gives each window its own id, also after the window was closed", async () => {
    const w = store();
    const ids = new Set<number>();
    for (let i = 0; i < 4; i++) {
      await w.open({ minutes: 5, cap: 2 }, T0 + i * 10 * MIN);
      const t = await w.take(T0 + i * 10 * MIN);
      if (t.ok) ids.add(t.id);
      if (i % 2 === 0) await w.close(T0 + i * 10 * MIN);
    }
    expect(ids.size).toBe(4);
  });
});

describe("close", () => {
  it("closes at once, and a line cannot be taken after", async () => {
    const w = store();
    await w.open({ minutes: 60, cap: 5 }, T0);
    expect((await w.close(T0 + MIN)).open).toBe(false);
    expect(await w.take(T0 + MIN)).toEqual({ ok: false, reason: "closed" });
  });
});

describe("a damaged record", () => {
  it("is read as closed, and does not stop a new window from being opened", async () => {
    for (const junk of ["x", 5, null, {}, { id: "a", until: 1, cap: 1, used: 0 }, { id: 1, until: Number.NaN, cap: 1, used: 0 }, { id: 1, until: T0 + MIN, cap: -1, used: 0 }, { id: 1, until: T0 + MIN, cap: 1, used: -3 }]) {
      const kv = new MapKv();
      await kv.put("voice-window", junk);
      const w = new VoiceWindowStore(kv);
      expect((await w.status(T0)).open, JSON.stringify(junk)).toBe(false);
      expect(await w.take(T0)).toEqual({ ok: false, reason: "closed" });
      expect((await w.open({ minutes: 5, cap: 2 }, T0)).open).toBe(true);
    }
  });
});

describe("readWindowRequest", () => {
  it("makes `{}` the default window: an hour and 200 lines", () => {
    expect(readWindowRequest({})).toEqual({ kind: "open", minutes: 60, cap: 200 });
  });
  it("reads minutes and a cap, and a cap alone, and minutes alone", () => {
    expect(readWindowRequest({ minutes: 45, cap: 120 })).toEqual({ kind: "open", minutes: 45, cap: 120 });
    expect(readWindowRequest({ cap: 5 })).toEqual({ kind: "open", minutes: 60, cap: 5 });
    expect(readWindowRequest({ minutes: 480 })).toEqual({ kind: "open", minutes: 480, cap: 200 });
  });
  it("closes for minutes 0, and only without a cap", () => {
    expect(readWindowRequest({ minutes: 0 })).toEqual({ kind: "close" });
    expect(readWindowRequest({ minutes: 0, cap: 10 })).toMatchObject({ kind: "bad" });
  });
  it("refuses a field that is not listed, such as a typo, instead of reading it as the default", () => {
    for (const body of [{ minute: 5 }, { minutes: 5, lines: 10 }, { cap: 5, x: 1 }, { Minutes: 5 }]) expect(readWindowRequest(body), JSON.stringify(body)).toMatchObject({ kind: "bad" });
  });
  it("refuses numbers outside the limits and values that are not whole numbers", () => {
    const bad: unknown[] = [{ minutes: 481 }, { minutes: -5 }, { minutes: 1.5 }, { minutes: "60" }, { minutes: null }, { minutes: true }, { minutes: Number.NaN }, { minutes: 10, cap: 0 }, { minutes: 10, cap: 1001 }, { minutes: 10, cap: 2.5 }, { minutes: 10, cap: "5" }, { cap: null }];
    for (const body of bad) expect(readWindowRequest(body), JSON.stringify(body)).toMatchObject({ kind: "bad" });
  });
  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "60", 60, [], [{ minutes: 5 }], true]) expect(readWindowRequest(body)).toMatchObject({ kind: "bad" });
  });
  it("for any body: either bad, or a window within the limits, or a close", () => {
    fc.assert(
      fc.property(fc.anything(), (body) => {
        const r = readWindowRequest(body);
        if (r.kind === "open") {
          expect(r.minutes).toBeGreaterThanOrEqual(1);
          expect(r.minutes).toBeLessThanOrEqual(VOICE_WINDOW_MAX_MINUTES);
          expect(r.cap).toBeGreaterThanOrEqual(1);
          expect(r.cap).toBeLessThanOrEqual(VOICE_WINDOW_MAX_LINES);
          expect(Number.isInteger(r.minutes) && Number.isInteger(r.cap)).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("Property: a window never spends more lines than its cap", () => {
  it("for any run of takes, gives (to the window they came from or a stale one), opens and closes: used stays between 0 and the cap, and the lines in hand never exceed it", async () => {
    const step = fc.oneof(
      fc.record({ op: fc.constant("take" as const) }),
      fc.record({ op: fc.constant("give" as const), which: fc.nat(30) }),
      fc.record({ op: fc.constant("open" as const), cap: fc.integer({ min: 1, max: 6 }) }),
      fc.record({ op: fc.constant("close" as const) }),
      fc.record({ op: fc.constant("wait" as const), ms: fc.integer({ min: 0, max: 40 * MIN }) }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 60 }), async (steps) => {
        const w = store();
        let now = T0;
        const held: Array<{ id: number }> = [];
        let current = null as { id: number; cap: number } | null;
        for (const s of steps) {
          if (s.op === "open") { const st = await w.open({ minutes: 30, cap: s.cap }, now); held.length = 0; current = { id: (current?.id ?? 0) + 1, cap: s.cap }; expect(st.used).toBe(0); }
          else if (s.op === "close") await w.close(now);
          else if (s.op === "wait") now += s.ms;
          else if (s.op === "take") { const t = await w.take(now); if (t.ok) held.push({ id: t.id }); }
          else if (held.length > 0) { const h = held.splice(s.which % held.length, 1)[0]!; await w.give(h.id, now); }
          const st = await w.status(now);
          expect(st.used).toBeGreaterThanOrEqual(0);
          if (st.open) { expect(st.used).toBeLessThanOrEqual(st.cap); expect(st.remainingLines).toBe(st.cap - st.used); }
          else expect(st).toEqual({ open: false, until: null, remainingMs: 0, cap: 0, used: 0, remainingLines: 0 });
          if (st.open && current !== null) expect(held.filter((h) => h.id === current!.id).length).toBeLessThanOrEqual(st.used); // lines in hand are all counted
        }
      }),
      { numRuns: 200 },
    );
  });
});
