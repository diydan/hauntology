import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { pawnsOf, type PawnPublicInput } from "./pawns";

const ZONES = [{ id: "z1" }, { id: "z2" }, { id: "z3" }, { id: "z4" }, { id: "z5" }, { id: "z6" }] as const;
const ZONE_IDS = ZONES.map((z) => z.id);

const seatsArb = fc
  .integer({ min: 2, max: 6 })
  .chain((n) =>
    fc.tuple(
      ...Array.from({ length: n }, (_, i) =>
        fc.record({
          seat: fc.constant(i + 1),
          nickname: fc.string({ minLength: 1, maxLength: 10 }),
          poltergeist: fc.boolean(),
        }),
      ),
    ),
  );

type Ev = { kind: string; seat?: number; zone?: string };

const eventsArb = (seatCount: number): fc.Arbitrary<Ev[]> =>
  fc.array(
    fc.oneof(
      fc.record({ kind: fc.constant("suggest"), seat: fc.integer({ min: 1, max: seatCount }), zone: fc.constantFrom(...ZONE_IDS) }),
      fc.record({ kind: fc.constant("inspect"), seat: fc.integer({ min: 1, max: seatCount }), zone: fc.constantFrom(...ZONE_IDS) }),
      fc.record({ kind: fc.constantFrom("visit", "turn-start", "accuse", "seal"), seat: fc.integer({ min: 1, max: seatCount }), zone: fc.constantFrom(...ZONE_IDS) }),
      fc.record({ kind: fc.constantFrom("haunt", "phone-cue", "rattle", "nudge") }),
    ),
    { maxLength: 30 },
  );

describe("Property 3: Pawns stand where the public log says", () => {
  // Feature: spirit-table, Property 3: Pawns stand where the public log says
  // Validates: Requirements 2.2
  it("puts every seat at its newest suggest or inspect Zone or 'door', rings the active turn seat, and sets mono from Poltergeist", () => {
    fc.assert(
      fc.property(
        seatsArb.chain((seats) =>
          fc.tuple(
            fc.constant(seats),
            eventsArb(seats.length),
            fc.oneof(fc.constant(null), fc.integer({ min: 1, max: seats.length })),
            fc.constantFrom<"lobby" | "playing" | "ended">("lobby", "playing", "ended"),
          ),
        ),
        ([seats, events, active, phase]) => {
          const pub: PawnPublicInput = { phase, active, seats, zones: ZONES, events };
          const pawns = pawnsOf(pub);
          if (pawns.length !== seats.length) return false;
          for (const [i, s] of seats.entries()) {
            const p = pawns[i]!;
            if (p.seat !== s.seat || p.nickname !== s.nickname) return false;
            const latest = [...events].reverse().find((e) => (e.kind === "suggest" || e.kind === "inspect") && e.seat === s.seat);
            const expectedZone = latest?.zone ?? "door";
            if (p.zone !== expectedZone) return false;
            if (p.mono !== s.poltergeist) return false;
            const expectedActive = phase !== "ended" && active === s.seat;
            if (p.active !== expectedActive) return false;
          }
          // Non-monotonic sanity: once poltergeist turns true on any seat, mono stays true and never turns back
          const turned = seats.map((s) => ({ ...s, poltergeist: true }));
          return pawnsOf({ ...pub, seats: turned }).every((p) => p.mono);
        },
      ),
      propParams(),
    );
  });
});
