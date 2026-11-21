import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { acceptJoin, acceptRoom, JOINS_PER_MINUTE, ROOM_TOTAL_CAP, type JoinLog } from "./limits";
import { COUNTERS, count, countError, emptyTelemetry, errorCodeOf, sanitizeTelemetry } from "./telemetry";

describe("Property 24: Telemetry carries no content and abuse is capped", () => {
  // Feature: party-mode, Property 24: Telemetry carries no content and abuse is capped
  // Validates: Requirements 10.5, 10.6
  it("drops every field that is not a whitelisted counter or error code, strings included", () => {
    fc.assert(fc.property(fc.anything(), fc.string(), (junk, text) => {
      const t = sanitizeTelemetry({ counters: { turns: 3, nickname: text, zone: text }, errors: { rate_limited: 2, [text]: 1 }, narration: text, extra: junk });
      if (Object.keys(t).sort().join() !== "counters,errors") return false;
      if (Object.keys(t.counters).sort().join() !== [...COUNTERS].sort().join()) return false;
      if (t.counters.turns !== 3) return false;
      return Object.values(t.counters).every(Number.isInteger) && Object.keys(t.errors).every((k) => k === "rate_limited");
    }), propParams());
    const json = JSON.stringify(sanitizeTelemetry({ counters: { turns: "Sam's kitchen" }, errors: { "Sam's kitchen": 1 } }));
    expect(json).not.toContain("Sam");
  });
  it("drops error counts that are not whole non-negative numbers", () => {
    const t = sanitizeTelemetry({ counters: { turns: -2, rounds: 1.5 }, errors: { rate_limited: "many", room_full: -1, rooms_full: 2.5, bad_token: 4 } });
    expect(t.errors).toEqual({ bad_token: 4 });
    expect(t.counters.turns).toBe(0);
  });
  it("counts only known names and keeps just the code of a `code:reason` error", () => {
    let t = count(emptyTelemetry(), "turns");
    t = count(t, "nickname", 5);
    t = count(t, "turns", -1);
    expect(t.counters.turns).toBe(1);
    expect(Object.keys(t.counters)).toHaveLength(COUNTERS.length);
    t = countError(t, "photo_rejected:person_visible");
    t = countError(t, "a nickname");
    expect(t.errors).toEqual({ photo_rejected: 1 });
    expect(errorCodeOf("nudge_denied:spook_round_limit")).toBe("nudge_denied");
  });
  it("refuses the 21st join from one hashed IP in a minute, forgets old attempts, and keeps IPs apart", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 60 }), (n) => {
      let log: JoinLog = {};
      let ok = 0;
      for (let k = 0; k < n; k++) { const r = acceptJoin(log, "ip", 1000 + k, JOINS_PER_MINUTE); log = r.log; if (r.ok) ok++; }
      if (ok !== Math.min(n, JOINS_PER_MINUTE)) return false;
      return acceptJoin(log, "other", 1100).ok && acceptJoin(log, "ip", 1000 + 61_000).ok;
    }), propParams());
  });
  it("allows one active Room per session and 20 in total, and refuses everything with the switch off", () => {
    const rooms = Array.from({ length: ROOM_TOTAL_CAP }, (_, i) => ({ code: `R${i}`, sessionId: `s${i}` }));
    expect(acceptRoom(rooms, "new", { enabled: true })).toEqual({ ok: false, code: "rooms_full" });
    expect(acceptRoom(rooms.slice(1), "new", { enabled: true })).toEqual({ ok: true });
    expect(acceptRoom(rooms, "s3", { enabled: true })).toEqual({ ok: false, code: "session_has_room", existing: "R3" });
    expect(acceptRoom([], "new", { enabled: false })).toEqual({ ok: false, code: "party_disabled" });
  });
});
