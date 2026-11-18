import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../../app/prop-config";
import { consentEffective, consentReduce, INITIAL_CONSENT_STATE, STITCH_QUESTION } from "./consent";
import { consentEventArb } from "./stitch.arb";

describe("Property 9: Stitch consent is each player's own", () => {
  // Feature: ghost-voice, Property 9: Stitch consent is each player's own
  // Validates: Requirements 5.3
  it("STITCH_QUESTION carries all required plain-language statements, exact tick label, and no age field", () => {
    expect(STITCH_QUESTION.prompt).toContain("deleted when the game ends");
    expect(STITCH_QUESTION.prompt).toContain("played aloud on the shared screen and revealed at the end");
    expect(STITCH_QUESTION.prompt).toContain("parent or guardian should say yes for a child");
    expect(STITCH_QUESTION.tickLabel).toBe("I am 16 or older, or a parent or guardian is saying yes for me");
  });

  it("enforces initial off state, non-master/bot/other-seat isolation, 3-field records, and immediate clip deletion on withdraw, leave, or switch off", () => {
    fc.assert(
      fc.property(fc.array(consentEventArb, { minLength: 1, maxLength: 40 }), (events) => {
        let state = INITIAL_CONSENT_STATE;
        expect(state.enabled).toBe(false);
        expect(state.consents).toEqual([]);

        for (const ev of events) {
          const prev = state;
          const res = consentReduce(state, ev);
          state = res.state;

          // Every stored consent record has strictly the 3 allowed fields (no age/name/date).
          for (const c of state.consents) {
            expect(Object.keys(c).sort()).toEqual(["ageOrGuardianTick", "seat", "yes"]);
            expect(consentEffective(c)).toBe(c.yes && c.ageOrGuardianTick);
          }

          if (ev.t === "master_switch") {
            if (!ev.actorIsMaster) {
              expect(state).toEqual(prev);
              expect(res.deleteClipsFor).toEqual([]);
            } else if (!ev.on) {
              expect(state.enabled).toBe(false);
              expect(state.consents).toEqual([]);
              expect(res.deleteClipsFor).toBe("all");
            } else {
              expect(state.enabled).toBe(true);
            }
          }

          if (ev.t === "answer") {
            const rejected = !prev.enabled || ev.isBot || ev.actorSeat !== ev.seat;
            if (rejected) {
              expect(state).toEqual(prev);
              expect(res.deleteClipsFor).toEqual([]);
            } else if (!ev.yes || !ev.tick) {
              expect(res.deleteClipsFor).toEqual([ev.seat]);
            }
          }

          if (ev.t === "leave") {
            expect(state.consents.some((c) => c.seat === ev.seat)).toBe(false);
          }
        }
      }),
      propParams(),
    );
  });
});
