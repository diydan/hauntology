import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineState } from "./engine";
import { NUDGE_CAP_MS, applyNudge, canNudge, nudgeCost, type LastSpook, type NudgeCheck, type NudgeKind } from "./nudge";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

describe("Property 31: Nudges obey cost, floor and limits", () => {
  it("costs 1 and 2, keeps Resolve at 0 or more, Help up to 120 s, Spook only with 20 s left and a 30 s floor, one of each per Turn", () => {
    const base: Omit<NudgeCheck, "seat"> = { bot: false, activeSeat: 1, resolve: 3, setting: "all", clockRunning: true, budgetMs: 60_000, leftMs: 40_000, usedThisTurn: { help: false, spook: false }, round: 2, turnIndex: 9, lastSpook: null };
    fc.assert(fc.property(
      fc.constantFrom<NudgeKind>("help", "spook"), fc.integer({ min: 1, max: 4 }), fc.nat(3), fc.constantFrom<"all" | "help-only" | "off">("all", "help-only", "off"),
      fc.boolean(), fc.integer({ min: 15_000, max: 130_000 }), fc.nat(130_000), fc.boolean(), fc.boolean(), fc.boolean(),
      fc.option(fc.record({ seat: fc.integer({ min: 1, max: 4 }), round: fc.integer({ min: 0, max: 2 }), turnIndex: fc.integer({ min: 0, max: 9 }) }), { nil: null }),
      (kind, seat, resolve, setting, running, budget, left, usedH, usedS, bot, last) => {
        const c: NudgeCheck = { ...base, seat, resolve, setting, clockRunning: running, budgetMs: budget, leftMs: left, usedThisTurn: { help: usedH, spook: usedS }, bot, lastSpook: last as LastSpook | null };
        const res = canNudge(c, kind);
        const expectOk = !bot && setting !== "off" && !(kind === "spook" && setting === "help-only") && running && seat !== 1
          && (kind === "help" ? !usedH && budget < NUDGE_CAP_MS
            : !usedS && left >= 20_000 && budget - 10_000 >= 30_000 && !(last !== null && last.round === 2) && !(last !== null && 9 - last.turnIndex < 4))
          && resolve >= nudgeCost(kind);
        expect(res.ok).toBe(expectOk);
        if (res.ok) {
          const n = applyNudge(budget, resolve, kind);
          expect(n.resolve).toBe(resolve - nudgeCost(kind));
          expect(n.resolve).toBeGreaterThanOrEqual(0);
          expect(n.budgetMs).toBe(kind === "help" ? Math.min(NUDGE_CAP_MS, budget + 10_000) : budget - 10_000);
          if (kind === "spook") expect(n.budgetMs).toBeGreaterThanOrEqual(30_000);
        }
      }), { numRuns: 1000 });
  });

  it("never allows a Spook on a 30 s clock, and names the reason for each refusal", () => {
    const c: NudgeCheck = { seat: 2, bot: false, activeSeat: 1, resolve: 3, setting: "all", clockRunning: true, budgetMs: 30_000, leftMs: 30_000, usedThisTurn: { help: false, spook: false }, round: 1, turnIndex: 1, lastSpook: null };
    expect(canNudge(c, "spook")).toEqual({ ok: false, reason: "spook_turn_too_short" });
    expect(canNudge({ ...c, budgetMs: 60_000, leftMs: 50_000, lastSpook: { seat: 2, round: 0, turnIndex: 0 } }, "spook")).toEqual({ ok: false, reason: "spook_repeat" });
    expect(canNudge({ ...c, budgetMs: 60_000, leftMs: 50_000, lastSpook: { seat: 3, round: 0, turnIndex: -1 } }, "spook")).toEqual({ ok: false, reason: "spook_gap" });
    expect(canNudge({ ...c, budgetMs: 60_000, leftMs: 50_000, lastSpook: { seat: 3, round: 1, turnIndex: -9 } }, "spook")).toEqual({ ok: false, reason: "spook_round_limit" });
    expect(canNudge({ ...c, resolve: 1, budgetMs: 60_000, leftMs: 50_000 }, "spook")).toEqual({ ok: false, reason: "no_resolve" });
    expect(canNudge({ ...c, seat: 1 }, "help")).toEqual({ ok: false, reason: "own_turn" });
  });
});

// ---------------------------------------------------------------- inside the Engine
const seats = (n: number): EngineSeat[] => Array.from({ length: n }, (_, i) => ({ seat: i + 1, nickname: `P${i + 1}`, bot: i !== 0, botLevel: "standard" as const }));
/** Start a game and run alarms until a Bot is the active Player and its clock runs. */
function toBotTurn(seed: number, n = 4): { s: EngineState; now: number } {
  let s = createEngine({ seed, seats: seats(n), settings: { baseSeconds: 60, hauntMax: 12 }, presetIds: PRESETS });
  let now = 0;
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, now);
  s = r.state;
  for (let k = 0; k < 400 && !(s.turn && s.turn.seat !== 1 && s.turn.clock.pausedSinceMs === null); k++) {
    if (s.turn?.seat === 1) { r = step(s, { kind: "client", seat: 1, msg: { t: "pass" } }, now); s = r.state; continue; }
    now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state;
  }
  return { s, now };
}

describe("Nudges, Eavesdrop and the Master pause in the Engine", () => {
  it("a Help moves the deadline 10 s for every screen, costs 1 Resolve, once per Turn, and is counted", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const { s, now } = toBotTurn(seed);
      if (s.phase !== "playing" || s.turn === null) return;
      const before = publicSnapshot(s, now).deadlineMs as number;
      const r = step(s, { kind: "client", seat: 1, msg: { t: "nudge", kind: "help" } }, now);
      expect(r.refused).toBeUndefined();
      expect(publicSnapshot(r.state, now).deadlineMs).toBe(Math.min(before + 10_000, s.turn.clock.startedMs + s.turn.clock.pausedMs + 120_000));
      expect(privateSnapshot(r.state, 1)?.resolve).toBe((privateSnapshot(s, 1)?.resolve ?? 0) - 1);
      expect(r.state.nudgeCounts.others).toBe(1);
      expect(step(r.state, { kind: "client", seat: 1, msg: { t: "nudge", kind: "help" } }, now).refused).toBe("help_turn_limit");
      expect(r.state.log.at(-1)).toMatchObject({ kind: "nudge", seat: 1, nudge: "help" });
    }), { numRuns: 60 });
  });

  it("a Turn lost to the clock raises the Haunt by one, but not when a Spook was used on it", () => {
    let spooked = 0;
    fc.assert(fc.property(fc.integer(), fc.boolean(), (seed, spook) => {
      const { s, now } = toBotTurn(seed);
      if (s.phase !== "playing" || s.turn === null) return;
      let st: EngineState = { ...s, players: s.players.map((p) => (p.seat === 1 ? { ...p, resolve: 3 } : p)) };
      if (spook) {
        const r = step(st, { kind: "client", seat: 1, msg: { t: "nudge", kind: "spook" } }, now);
        if (r.refused !== undefined) { expect(["spook_time_left", "spook_turn_too_short", "spook_round_limit", "spook_gap", "spook_repeat"]).toContain(r.refused); return; }
        spooked++;
        st = r.state;
      }
      const t = st.turn!;
      st = { ...st, turn: { ...t, botDueMs: null } }; // the Bot sits still, so the clock runs out
      const end = (t.clock.startedMs + t.clock.pausedMs + (t.clock.budgetMs as number));
      const after = step(st, { kind: "alarm" }, end).state;
      expect(after.log.some((e) => e.kind === "timeout" && e.seat === t.seat)).toBe(true);
      const rose = after.haunt.level - st.haunt.level;
      if (spook) expect(rose).toBe(0);
      else expect(rose).toBeGreaterThanOrEqual(1); // one, plus any Round-end rise if this was the last Turn
    }), { numRuns: 80 });
    expect(spooked).toBeGreaterThan(5);
  });

  it("the Master's pause freezes every deadline and refuses play; resume moves them on by the pause", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 1, max: 600_000 }), (seed, len) => {
      const { s, now } = toBotTurn(seed);
      if (s.phase !== "playing" || s.turn === null) return;
      const d0 = publicSnapshot(s, now).deadlineMs as number;
      const due0 = s.turn.botDueMs;
      const p = step(s, { kind: "client", seat: 1, msg: { t: "pause" } }, now);
      expect(p.wakeAtMs).toBeNull();
      expect(step(p.state, { kind: "client", seat: 2, msg: { t: "resume" } }, now).refused).toBe("not_master");
      expect(step(p.state, { kind: "client", seat: 1, msg: { t: "nudge", kind: "help" } }, now).refused).toBe("paused");
      expect(step(p.state, { kind: "alarm" }, now + len).state).toBe(p.state); // nothing happens while paused
      const r = step(p.state, { kind: "client", seat: 1, msg: { t: "resume" } }, now + len);
      expect(publicSnapshot(r.state, now + len).deadlineMs).toBe(d0 + len);
      expect(r.state.turn?.botDueMs).toBe(due0 === null ? null : due0 + len);
      expect(r.state.pausedSinceMs).toBeNull();
    }), { numRuns: 60 });
  });

  it("Eavesdrop gives one named card that was not shown, privately, costs 1, once, and the public log says only who", () => {
    let checked = 0;
    for (let seed = 0; seed < 200 && checked < 15; seed++) {
      let s = createEngine({ seed, seats: seats(4), settings: { baseSeconds: 60, hauntMax: 12 }, presetIds: PRESETS });
      let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
      s = r.state;
      let now = 0;
      for (let k = 0; k < 600 && s.phase === "playing"; k++) {
        const w = s.eavesdrop;
        if (w && w.suggester !== 1 && w.refuter !== 1 && now <= w.untilMs && (privateSnapshot(s, 1)?.resolve ?? 0) >= 1 && !s.players[0]?.poltergeist && !s.players[0]?.heard.some((h) => h.eventId === w.eventId)) {
          expect(privateSnapshot(s, 1)?.canEavesdrop).toBe(w.eventId);
          const res = step(s, { kind: "client", seat: 1, msg: { t: "eavesdrop", eventId: w.eventId } }, now);
          expect(res.refused).toBeUndefined();
          const heard = privateSnapshot(res.state, 1)?.heard.at(-1);
          expect(heard?.eventId).toBe(w.eventId);
          expect(w.named).toContain(heard?.card);
          expect(heard?.card).not.toBe(w.shown);
          expect(privateSnapshot(res.state, 1)?.resolve).toBe((privateSnapshot(s, 1)?.resolve ?? 0) - 1);
          expect(JSON.stringify(publicSnapshot(res.state, now))).not.toContain(`"card":"${heard?.card}"`);
          expect(res.state.log.at(-1)).toEqual({ id: res.state.log.at(-1)?.id, kind: "eavesdrop", seat: 1 });
          expect(step(res.state, { kind: "client", seat: 1, msg: { t: "eavesdrop", eventId: w.eventId } }, now).refused).toBe("eavesdrop_denied");
          checked++;
          break;
        }
        if (s.turn?.seat === 1) { r = step(s, { kind: "client", seat: 1, msg: { t: "pass" } }, now); s = r.state; continue; }
        const next = r.wakeAtMs ?? now + 1000;
        now = Math.min(next, s.eavesdrop && s.eavesdrop.untilMs >= now ? Math.max(now + 1, Math.min(next, s.eavesdrop.untilMs - 1)) : next);
        r = step(s, { kind: "alarm" }, now);
        s = r.state;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});
