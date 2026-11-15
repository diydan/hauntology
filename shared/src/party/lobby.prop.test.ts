import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { authorize, peekAllowed, whoIs } from "./auth";
import { checkMasterTimeout, handOver, nextMaster } from "./master";
import { NICKNAME_MAX, sanitizeNickname } from "./nickname";
import {
  MASTER_TIMEOUT_MS, MAX_PLAYERS, ROOM_TTL_MS, createRoomState, deleteRoomData, isRoomExpired, newToken, parseRoom, roomPrefix,
  serializeRoom, stateKey, type RoomState, type RoomStore, type Seat,
} from "./room";
import { CODE_ALPHABET, generateRoomCode, normalizeCode } from "./roomCode";
import { canJoin, markAway, rejoin, seatPlayer } from "./seats";

const tokenArb = fc.uint8Array({ minLength: 16, maxLength: 16 }).map((b) => newToken(() => b));
const fresh = (code = "ABCD", now = 1000): RoomState => createRoomState(code, 7, now, "a".repeat(32), "b".repeat(32));

/** A lobby built from a list of joins: true is a phone with a fresh token, false a Bot. */
const joinsArb = fc.array(fc.tuple(fc.boolean(), fc.string({ maxLength: 40 }), tokenArb), { maxLength: 9 });
function build(joins: ReadonlyArray<readonly [boolean, string, string]>): { state: RoomState; tokens: Map<Seat, string>; first: Seat | null } {
  let state = fresh();
  const tokens = new Map<Seat, string>();
  let first: Seat | null = null;
  for (const [human, name, token] of joins) {
    if (human && [...tokens.values()].includes(token)) continue;
    const res = seatPlayer(state, name, human ? token : null, 2000);
    if (res.ok) { state = res.state; if (human) { tokens.set(res.seat, token); first ??= res.seat; } }
  }
  return { state, tokens, first };
}

describe("Property 1: Room codes are well formed", () => {
  it("gives four characters from the alphabet with no look-alikes, and normalises any case and spacing", () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    fc.assert(fc.property(fc.integer(), fc.array(fc.constantFrom(" ", "-", "  "), { maxLength: 3 }), fc.boolean(), (seed, gaps, lower) => {
      const code = generateRoomCode(mulberry32(seed));
      expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`));
      const typed = [...code].map((ch, i) => ch + (gaps[i] ?? "")).join("");
      expect(normalizeCode(lower ? typed.toLowerCase() : typed)).toBe(code);
    }));
  });

  it("rejects every string that is not a code", () => {
    fc.assert(fc.property(fc.string({ maxLength: 12 }), (s) => {
      const n = normalizeCode(s);
      if (n !== null) expect(n).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`));
    }));
    for (const bad of ["ABC", "ABCDE", "AB0D", "ABOD", "AB1D", "ABID", "ABLD", "AB?D", ""]) expect(normalizeCode(bad), bad).toBeNull();
  });
});

describe("Property 2: Seating and nicknames", () => {
  it("never seats more than six, keeps seats unique, refuses with the right reason, and makes the first human the Master", () => {
    fc.assert(fc.property(joinsArb, (joins) => {
      const { state, first } = build(joins);
      expect(state.seats.length).toBeLessThanOrEqual(MAX_PLAYERS);
      expect(new Set(state.seats.map((s) => s.seat)).size).toBe(state.seats.length);
      expect(state.masterSeat).toBe(first); // the first human to sit down, or nobody while only Bots sit
      expect(state.seats.find((s) => s.seat === state.masterSeat)?.bot ?? false).toBe(false);
      if (state.seats.length === MAX_PLAYERS) {
        expect(canJoin(state)).toBe("room_full");
        expect(seatPlayer(state, "x", "c".repeat(32), 3000)).toEqual({ ok: false, code: "room_full" });
      }
      const started = { ...state, started: true };
      expect(seatPlayer(started, "x", "c".repeat(32), 3000)).toEqual({ ok: false, code: "game_started" });
    }), { numRuns: 300 });
  });

  it("makes the first human to join the Master, even after Bots", () => {
    let s = fresh();
    for (const t of [null, null, "c".repeat(32), "d".repeat(32)]) { const r = seatPlayer(s, "n", t, 1); if (r.ok) s = r.state; }
    expect(s.masterSeat).toBe(3);
  });

  it("cleans nicknames: at most 16 characters, no control characters, markup or URLs, and cleaning twice changes nothing", () => {
    fc.assert(fc.property(fc.oneof(fc.string({ maxLength: 60 }), fc.fullUnicodeString({ maxLength: 60 })), (raw) => {
      const n = sanitizeNickname(raw);
      expect([...n].length).toBeLessThanOrEqual(NICKNAME_MAX);
      expect(n.length).toBeGreaterThan(0);
      expect(n).not.toMatch(/\p{C}|[<>]|https?:|www\./u);
      expect(sanitizeNickname(n)).toBe(n);
    }), { numRuns: 500 });
    expect(sanitizeNickname("<b>Ana</b>")).toBe("Ana");
    expect(sanitizeNickname("visit evil.com now")).toBe("visit now");
    expect(sanitizeNickname("http://x.y/z")).toBe("Player");
    expect(sanitizeNickname("a\u0000b​c")).toBe("a b c");
  });
});

describe("Property 3: Tokens grant exactly their own data", () => {
  it("gives a Private View only to its own token, the Public View to this Room's tokens only, and controls only to the Master", () => {
    fc.assert(fc.property(joinsArb, tokenArb, (joins, stranger) => {
      const { state, tokens } = build(joins);
      const all = [state.hostToken, state.displayToken, ...tokens.values()];
      fc.pre(!all.includes(stranger));
      expect(authorize(state, stranger, { kind: "public" })).toBe(false);
      expect(authorize(state, "", { kind: "public" })).toBe(false);
      for (const t of all) expect(authorize(state, t, { kind: "public" })).toBe(true);
      for (const s of state.seats) {
        for (const t of all) expect(authorize(state, t, { kind: "private", seat: s.seat })).toBe(tokens.get(s.seat) === t);
      }
      for (const t of all) {
        const w = whoIs(state, t);
        expect(authorize(state, t, { kind: "control" })).toBe(w?.seat !== null && w?.seat !== undefined && w.seat === state.masterSeat);
      }
      expect(authorize(state, state.hostToken, { kind: "control" })).toBe(false);
      expect(authorize(state, state.hostToken, { kind: "end" })).toBe(true);
      expect(authorize(state, state.displayToken, { kind: "end" })).toBe(false);
    }), { numRuns: 300 });
  });

  it("restores the same seat on reconnect, and refuses a phone with no token after the start", () => {
    fc.assert(fc.property(joinsArb, (joins) => {
      const { state, tokens } = build(joins);
      const started = { ...state, started: true };
      for (const [seat, token] of tokens) {
        const away = markAway(started, seat, 5000);
        const back = rejoin(away, token, 6000);
        expect(back.ok && back.seat).toBe(seat);
      }
      expect(rejoin(started, null, 6000)).toEqual({ ok: false, code: "game_started" });
      expect(rejoin(started, "e".repeat(32), 6000)).toEqual({ ok: false, code: "game_started" });
    }));
  });

  it("allows the peek only when every other seat is a Bot", () => {
    fc.assert(fc.property(joinsArb, (joins) => {
      const { state, tokens } = build(joins);
      for (const [seat, token] of tokens) {
        const othersBots = state.seats.filter((s) => s.seat !== seat).every((s) => s.bot) && state.seats.length > 1;
        expect(peekAllowed(state, seat)).toBe(othersBots);
        expect(authorize(state, token, { kind: "peek", seat })).toBe(othersBots);
      }
    }));
  });
});

describe("the Master role", () => {
  it("passes to the next human in seat order, never to a Bot, and stays when there is no other human", () => {
    fc.assert(fc.property(joinsArb, (joins) => {
      const { state, tokens } = build(joins);
      if (state.masterSeat === null) return;
      const next = nextMaster(state, state.masterSeat);
      if (next !== null) expect(state.seats.find((s) => s.seat === next)?.bot).toBe(false);
      expect(tokens.size > 1).toBe(next !== null);
      const away = markAway(state, state.masterSeat, 10_000);
      expect(checkMasterTimeout(away, 10_000 + MASTER_TIMEOUT_MS - 1).masterSeat).toBe(state.masterSeat);
      expect(checkMasterTimeout(away, 10_000 + MASTER_TIMEOUT_MS).masterSeat).toBe(next ?? state.masterSeat);
    }));
  });

  it("hands over only from the Master's token, and only to a seated human", () => {
    let s = fresh();
    for (const t of ["c".repeat(32), null, "d".repeat(32)]) { const r = seatPlayer(s, "n", t, 1); if (r.ok) s = r.state; }
    expect(handOver(s, "d".repeat(32), 1)).toBeNull(); // not the Master
    expect(handOver(s, "c".repeat(32), 2)).toBeNull(); // a Bot
    expect(handOver(s, "c".repeat(32), 5)).toBeNull(); // nobody there
    expect(handOver(s, "c".repeat(32), 3)?.masterSeat).toBe(3);
  });
});

describe("Property 4: Room lifecycle round-trips and deletes completely", () => {
  it("parses back what it saved, rejects anything else, and expires after its time to live", () => {
    fc.assert(fc.property(joinsArb, fc.boolean(), (joins, started) => {
      const state = { ...build(joins).state, started };
      expect(parseRoom(serializeRoom(state))).toEqual(state);
      expect(isRoomExpired(state, state.lastActiveMs + ROOM_TTL_MS - 1)).toBe(false);
      expect(isRoomExpired(state, state.lastActiveMs + ROOM_TTL_MS)).toBe(true);
    }));
    fc.assert(fc.property(fc.string(), (junk) => { expect(() => parseRoom(junk)).not.toThrow(); }));
    expect(parseRoom(JSON.stringify({ ...fresh(), v: 2 }))).toBeNull();
    expect(parseRoom(JSON.stringify({ ...fresh(), extra: 1 }))).toBeNull();
  });

  it("deletes every key of the Room and nothing of another Room", async () => {
    const map = new Map<string, string>();
    const store: RoomStore = {
      get: async (k) => map.get(k),
      put: async (k, v) => { map.set(k, v); },
      delete: async (ks) => { for (const k of ks) map.delete(k); },
      list: async (p) => [...map.keys()].filter((k) => k.startsWith(p)),
    };
    await store.put(stateKey("ABCD"), serializeRoom(fresh()));
    for (const k of ["photo:1", "sprite:2", "nick:3"]) await store.put(`${roomPrefix("ABCD")}${k}`, "x");
    await store.put(stateKey("WXYZ"), serializeRoom(fresh("WXYZ")));
    expect(await deleteRoomData(store, "ABCD")).toBe(4);
    expect(await store.list(roomPrefix("ABCD"))).toEqual([]);
    expect(await store.get(stateKey("ABCD"))).toBeUndefined();
    expect(await store.get(stateKey("WXYZ"))).toBeDefined();
  });
});
