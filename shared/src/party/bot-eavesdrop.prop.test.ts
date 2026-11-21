import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canEavesdrop } from "./resolve";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineState } from "./engine";
import { mindOf } from "./engine";

/** Party-mode 9.2 (Bots Eavesdrop when they have Resolve and the showing is not already resolved in their notes) and Property 59. */
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const seats = (n: number): EngineSeat[] => Array.from({ length: n }, (_, i) => ({ seat: i + 1, nickname: `B${i + 1}`, bot: true, botLevel: "standard" as const }));

/** Run an all-Bot game on the alarm alone, calling `look` after every step. */
function run(seed: number, n: number, look: (before: EngineState, after: EngineState) => void): EngineState {
  let s = createEngine({ seed, seats: seats(n), settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
  let now = 1_000;
  s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, now).state;
  for (let i = 0; i < 6000 && s.phase === "playing"; i++) {
    const wake = step(s, { kind: "alarm" }, now).wakeAtMs;
    now = Math.max(now + 1, wake ?? now + 1000);
    const before = s;
    s = step(s, { kind: "alarm" }, now).state;
    look(before, s);
  }
  return s;
}

describe("Bots that Eavesdrop (integration 2.2, party-mode 9.2)", () => {
  it("a Bot with Resolve that is neither the suggester nor the refuter hears one named card that was not shown, spends one Resolve, and keeps it in its own facts only", () => {
    let heardCount = 0;
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 3, max: 5 }), (seed, n) => {
      run(seed, n, (before, after) => {
        const w = after.eavesdrop;
        if (w === null || (before.eavesdrop !== null && before.eavesdrop.eventId === w.eventId)) return; // a window opened in this step
        const log = after.log.filter((e) => e.kind === "eavesdrop").length - before.log.filter((e) => e.kind === "eavesdrop").length;
        let hearers = 0;
        for (const p of after.players) {
          const b = before.players.find((x) => x.seat === p.seat)!;
          const heard = p.heard.find((h) => h.eventId === w.eventId);
          const eligible = p.seat !== w.suggester && p.seat !== w.refuter && !p.poltergeist && b.resolve >= 1;
          if (!heard) continue;
          hearers++;
          heardCount++;
          expect(eligible).toBe(true);
          expect(w.named).toContain(heard.card);
          expect(heard.card).not.toBe(w.shown);
          expect(p.resolve).toBe(b.resolve - 1);
          expect(after.botFacts[p.seat]?.some((f) => f.kind === "heard" && f.heard === heard.card && f.seat === w.refuter)).toBe(true);
        }
        expect(log).toBe(hearers);
      });
    }), { numRuns: 30 });
    expect(heardCount).toBeGreaterThan(0);
  });

  it("a Bot does not Eavesdrop when its notes already place a named card with the Player who showed", () => {
    let skipped = 0;
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), (seed) => {
      run(seed, 4, (before, after) => {
        const w = after.eavesdrop;
        if (w === null || (before.eavesdrop !== null && before.eavesdrop.eventId === w.eventId)) return;
        for (const p of after.players) {
          if (p.seat === w.suggester || p.seat === w.refuter || p.poltergeist || before.players.find((x) => x.seat === p.seat)!.resolve < 1) continue;
          const known = w.named.some((c) => mindOf(before, p.seat).place.get(c) === w.refuter);
          if (known) { skipped++; expect(p.heard.some((h) => h.eventId === w.eventId)).toBe(false); }
        }
      });
    }), { numRuns: 30 });
    expect(skipped).toBeGreaterThan(0);
  });

  it("the public view and the Master's private view carry no Bot's heard card; only the Bot's own facts do", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 300 }), (seed) => {
      let s = createEngine({ seed, seats: [{ seat: 1, nickname: "H", bot: false, botLevel: "standard" }, ...seats(4).slice(1)], settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
      let now = 1_000;
      s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, now).state;
      for (let i = 0; i < 400 && s.phase === "playing"; i++) {
        const wake = step(s, { kind: "alarm" }, now).wakeAtMs;
        now = Math.max(now + 1, wake ?? now + 1000);
        s = step(s, { kind: "alarm" }, now).state;
        expect(JSON.stringify(publicSnapshot(s, now))).not.toContain('"heard"');
        const mine = (privateSnapshot(s, 1) ?? { heard: [] }).heard;
        expect(mine).toEqual(s.players.find((p) => p.seat === 1)!.heard);
      }
    }), { numRuns: 10 });
  });

  it("canEavesdrop is still the one rule (smoke)", () => {
    expect(canEavesdrop(null, 1, false, 3, 0, false)).toBe(false);
  });
});
