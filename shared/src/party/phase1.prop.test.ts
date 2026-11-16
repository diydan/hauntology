import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hauntRise } from "./accuse";
import { dealCase } from "./deal";
import {
  CHOICE_MS, HAUNT_OPTIONS, applyEvent, chooseOption, chooserFor, coldSpotIn, defaultOption, eventOptions, fireEvent, takeBlackout,
  type Haunt, type HauntOption,
} from "./haunt";
import { buildPool } from "./pool";
import { canSuggest } from "./suggest";
import { EAVESDROP_MS, RESOLVE_MAX, canEavesdrop, eavesdrop, gainResolve, spendResolve, type EavesdropWindow } from "./resolve";
import { INSPECT_MS, canInspect, inspectRefusal, placeResidue, publicInspect, settleInspect, startInspect } from "./residue";
import { turnBudget } from "./clock";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const ZONES = ["z1", "z2", "z3", "z4", "z5", "z6"];

describe("Property 28: Residue is hidden, and inspection is private and once only", () => {
  it("hides three non-Solution cards in three different Zones, in no Hand", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), (seed, n) => {
      const pool = buildPool([], PRESETS, seed);
      const deal = dealCase(pool, Array.from({ length: n }, (_, i) => i + 1), seed);
      const at = placeResidue(pool.zones.map((z) => z.id), deal.residue, seed);
      expect(Object.keys(at)).toHaveLength(3);
      expect(new Set(Object.keys(at)).size).toBe(3);
      expect(Object.values(at).sort()).toEqual(deal.residue.map((c) => c.id).sort());
      const sol = Object.values(deal.solution);
      const inHands = Object.values(deal.hands).flat().map((c) => c.id);
      for (const c of Object.values(at)) { expect(sol).not.toContain(c); expect(inHands).not.toContain(c); }
      expect(placeResidue(pool.zones.map((z) => z.id), deal.residue, seed)).toEqual(at);
    }));
  });

  it("lets only the active Detective inspect, inside a Zone, once per Zone; a Cold Spot does not stop it", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 6 }), fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }), fc.boolean(), fc.option(fc.constantFrom(...ZONES), { nil: null }), fc.subarray(ZONES), fc.boolean(), (seat, active, polt, inZone, inspected, running) => {
      const ok = canInspect({ seat, activeSeat: active, poltergeist: polt, inZone, inspected, inspecting: running });
      expect(ok).toBe(seat === active && !running && !polt && inZone !== null && !inspected.includes(inZone));
      if (!ok) expect(inspectRefusal({ seat, activeSeat: active, poltergeist: polt, inZone, inspected, inspecting: running })).not.toBeNull();
    }));
  });

  it("gives the card only after 10 seconds still inside and still on the Turn, and the public trace is the Zone only", () => {
    fc.assert(fc.property(fc.constantFrom(...ZONES), fc.nat(1_000_000), fc.nat(20_000), fc.boolean(), fc.boolean(), (zone, t0, dt, inside, turn) => {
      const at = { z1: "s3", z4: "r2", z6: "z5" } as Record<string, string>;
      const i = startInspect(2, zone, t0);
      expect(i.untilMs - t0).toBe(INSPECT_MS);
      const res = settleInspect(i, t0 + dt, inside, turn, at);
      if (!inside || !turn) expect(res.status).toBe("cancelled");
      else if (dt < INSPECT_MS) expect(res.status).toBe("running");
      else expect(res).toEqual({ status: "done", zone, card: at[zone] ?? null });
      expect(Object.keys(publicInspect(1, 2, zone)).sort()).toEqual(["id", "kind", "seat", "zone"]);
    }));
  });
});

const fresh = (max = 10): Haunt => ({ level: 0, max, fired: [], pending: null, coldSpot: null, blackoutNext: false });

describe("Property 26: The Haunt rises by the rules and events fire once", () => {
  it("fires 3, 6 and 9 once each, below the maximum, with two different options, for any run of rises and choices", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom(8, 10, 12), fc.array(fc.tuple(fc.constantFrom("round-end", "timeout", "wrong-accusation") as fc.Arbitrary<"round-end" | "timeout" | "wrong-accusation">, fc.boolean(), fc.constantFrom(...HAUNT_OPTIONS)), { maxLength: 40 }), (seed, max, steps) => {
      let h = fresh(max);
      const firedLog: number[] = [];
      for (const [cause, spook, pick] of steps) {
        const before = h.level;
        h = { ...h, ...hauntRise(h, cause, spook) };
        expect(h.level - before).toBe(before >= max || (cause === "timeout" && spook) ? 0 : 1);
        h = fireEvent(h, seed, null, 0);
        for (let guard = 0; h.pending !== null; guard++) {
          expect(guard).toBeLessThan(3); // at most 3, 6 and 9 in one step
          const p = h.pending;
          firedLog.push(p.level);
          expect(p.options[0]).not.toBe(p.options[1]);
          expect(p.level).toBeLessThan(max);
          const opt = p.options.includes(pick) ? pick : defaultOption(p);
          h = fireEvent(applyEvent(h, opt, ZONES, 1, seed), seed, null, 0);
        }
        expect(h.level).toBeGreaterThanOrEqual(0);
        expect(h.level).toBeLessThanOrEqual(max);
      }
      expect(new Set(firedLog).size).toBe(firedLog.length);
      for (const l of firedLog) expect([3, 6, 9]).toContain(l);
    }), { numRuns: 400 });
  });

  it("lets only the chooser pick, only an offered option, only in 15 seconds; Poltergeists choose in the order they joined, Bots never", () => {
    const polts = [{ seat: 4, bot: false, joinedRound: 2 }, { seat: 2, bot: true, joinedRound: 1 }, { seat: 1, bot: false, joinedRound: 2 }, { seat: 5, bot: false, joinedRound: 1 }];
    expect([0, 1, 2, 3].map((k) => chooserFor(polts, k))).toEqual([5, 1, 4, 5]);
    expect(chooserFor([{ seat: 2, bot: true, joinedRound: 1 }], 0)).toBeNull();
    const h = fireEvent({ ...fresh(), level: 3 }, 7, 5, 1000);
    const p = h.pending!;
    const other = HAUNT_OPTIONS.find((o) => !p.options.includes(o)) as HauntOption;
    expect(chooseOption(h, 5, p.options[1], 1000 + CHOICE_MS)).toBe(p.options[1]);
    expect(chooseOption(h, 5, p.options[1], 1001 + CHOICE_MS)).toBeNull();
    expect(chooseOption(h, 4, p.options[1], 1000)).toBeNull();
    expect(chooseOption(h, 5, other, 1000)).toBeNull();
    expect(eventOptions(7, 3)).toEqual(p.options);
  });

  it("Cold Spot blocks Suggestions (not Inspect) in its Zone until the end of the next Round; Blackout once; Lull one down", () => {
    const h = applyEvent(fresh(), "cold-spot", ZONES, 4, 1);
    const z = h.coldSpot!.zone;
    for (const r of [4, 5]) expect(coldSpotIn(h, r)).toBe(z);
    expect(coldSpotIn(h, 6)).toBeNull();
    expect(canSuggest({ seat: 1, activeSeat: 1, poltergeist: false, inZone: z, coldSpot: coldSpotIn(h, 5), suggestedThisTurn: false })).toBe(false);
    expect(canInspect({ seat: 1, activeSeat: 1, poltergeist: false, inZone: z, inspected: [], inspecting: false })).toBe(true);
    const b = applyEvent(fresh(), "blackout", ZONES, 1, 1);
    const t1 = takeBlackout(b);
    expect(t1.blackout).toBe(true);
    expect(takeBlackout(t1.haunt).blackout).toBe(false);
    expect(turnBudget({ baseSeconds: 30, bonusSeconds: 0, blackout: true })).toBe(15);
    expect(applyEvent({ ...fresh(), level: 0 }, "lull", ZONES, 1, 1).level).toBe(0);
    expect(applyEvent({ ...fresh(), level: 6 }, "lull", ZONES, 1, 1).level).toBe(5);
  });
});

describe("Property 29: Resolve is bounded and Eavesdrop reveals one card that was not shown", () => {
  it("stays 0 to 3, rises one a Round, and each spend costs exactly what it says or is refused", () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.constant("round" as const), fc.integer({ min: 1, max: 2 }))), (ops) => {
      let r = 0;
      for (const op of ops) {
        if (op === "round") { const n = gainResolve(r); expect(n).toBe(Math.min(RESOLVE_MAX, r + 1)); r = n; }
        else { const n = spendResolve(r, op); if (r >= op) expect(n).toBe(r - op); else expect(n).toBeNull(); r = n ?? r; }
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(RESOLVE_MAX);
      }
    }));
  });

  it("lets only a Detective with Resolve, not the suggester or the shower, hear one named card that was not shown, in 10 seconds", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 6 }), fc.boolean(), fc.nat(3), fc.nat(20_000), fc.boolean(), fc.integer(), fc.constantFrom(0, 1, 2), (seat, polt, res, dt, heard, seed, si) => {
      const named = ["s2", "z4", "r6"];
      const w: EavesdropWindow = { eventId: 9, suggester: 1, refuter: 3, named, shown: named[si] as string, untilMs: 1000 + EAVESDROP_MS };
      const ok = canEavesdrop(w, seat, polt, res, 1000 + dt, heard);
      expect(ok).toBe(!polt && res >= 1 && dt <= EAVESDROP_MS && seat !== 1 && seat !== 3 && !heard);
      const card = eavesdrop(w, seat, seed);
      expect(named).toContain(card);
      expect(card).not.toBe(w.shown);
    }));
    expect(canEavesdrop(null, 2, false, 3, 0, false)).toBe(false);
  });
});
