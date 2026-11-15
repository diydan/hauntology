import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roundEnd, sealAccusation, type AccuseState } from "./accuse";
import { dealCase } from "./deal";
import { chooserFor } from "./haunt";
import { acceptMovement, sanitizeInput } from "./input";
import { buildPool } from "./pool";
import { canInspect } from "./residue";
import { canEavesdrop } from "./resolve";
import { canSuggest, resolveSuggestion } from "./suggest";
import { nextPlayer, roundOrder } from "./turns";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

describe("Property 27: Poltergeists keep their Hand and never take a Turn", () => {
  it("keeps seat, nickname and Hand, skips them in the order, refuses their moves, still makes them answer, never lets them win", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.nat(5), (seed, n, pi) => {
      const seats = Array.from({ length: n }, (_, i) => i + 1);
      const deal = dealCase(buildPool([], PRESETS, seed), seats, seed);
      const polt = seats[pi % n] as number;
      const wrong = { suspect: deal.solution.suspect === "s1" ? "s2" : "s1", zone: deal.solution.zone, relic: deal.solution.relic };
      const s0: AccuseState = { round: 1, phase: "playing", haunt: { level: 0, max: 10 }, winners: [], houseWins: false,
        players: seats.map((seat) => ({ seat, poltergeist: false, sealed: null, hasSealed: false, joinedRound: null })) };
      const sealed = sealAccusation(s0, polt, wrong);
      if (!sealed.ok) throw new Error("seal");
      const after = roundEnd(sealed.state, deal.solution).state;
      const p = after.players.find((x) => x.seat === polt);
      expect(p?.poltergeist).toBe(true);
      expect(p?.seat).toBe(polt);
      expect(after.winners).not.toContain(polt);
      // the Hand is untouched: it lives in the deal, which no Accusation changes
      expect(deal.hands[polt]).toEqual(dealCase(buildPool([], PRESETS, seed), seats, seed).hands[polt]);
      // no Turn
      const order = { seats, out: [polt] };
      for (const first of seats.filter((s) => s !== polt)) {
        expect(roundOrder(order, first)).not.toContain(polt);
        for (const cur of seats) if (cur !== polt) expect(nextPlayer(order, first, cur)).not.toBe(polt);
      }
      // refused: move, Suggest, a second Accusation, Inspect, Eavesdrop
      expect(acceptMovement(sanitizeInput({ seq: 1, move: [1, 0], look: [0, 0] }), polt, polt, [polt])).toBeNull();
      expect(canSuggest({ seat: polt, activeSeat: polt, poltergeist: true, inZone: "z1", coldSpot: null, suggestedThisTurn: false })).toBe(false);
      expect(sealAccusation(after, polt, deal.solution).ok).toBe(false);
      expect(canInspect({ seat: polt, activeSeat: polt, poltergeist: true, inZone: "z1", inspected: [], inspecting: false })).toBe(false);
      expect(canEavesdrop({ eventId: 1, suggester: 99, refuter: 98, named: ["a", "b", "c"], shown: "a", untilMs: 10 }, polt, true, 3, 0, false)).toBe(false);
      // still answers: a Suggestion naming a card in the Poltergeist's Hand stops at them when they come first
      const card = deal.hands[polt]?.[0];
      if (card && n > 1) {
        const suggester = seats[(seats.indexOf(polt) - 1 + n) % n] as number;
        const named = { zone: card.kind === "zone" ? card.id : "z9", suspect: card.kind === "suspect" ? card.id : "s9", relic: card.kind === "relic" ? card.id : "r9" };
        if (suggester !== polt) expect(resolveSuggestion(deal.hands, seats, suggester, named).refuter).toBe(polt);
      }
      // only Poltergeists choose Haunt options
      expect(chooserFor([{ seat: polt, bot: false, joinedRound: 1 }], 0)).toBe(polt);
      expect(chooserFor([], 0)).toBeNull();
    }), { numRuns: 300 });
  });
});
