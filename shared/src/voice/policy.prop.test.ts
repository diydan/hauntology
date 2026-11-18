import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { VOICE_ROOM_LATE_AT, VOICE_ROOM_LINE_CAP } from "./limits";
import { LINE_KINDS } from "./line";
import { canSwitchSpeaking, decideSpeak, type SpeakActor, type SpeakMode } from "./policy";

const modeArb: fc.Arbitrary<SpeakMode> = fc.constantFrom("single", "multi");
const switchArb: fc.Arbitrary<boolean | null> = fc.constantFrom(true, false, null);
const kindArb = fc.constantFrom(...LINE_KINDS);
const actorArb: fc.Arbitrary<SpeakActor> = fc.constantFrom("visitor", "master", "player");

describe("Property 4: The speaking policy", () => {
  // Feature: ghost-voice, Property 4: The speaking policy
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4
  it("matches Single player default-on and Multiplayer default-off, 20-line room cap, and 15-line key-moment reserve", () => {
    fc.assert(
      fc.property(modeArb, switchArb, kindArb, fc.integer({ min: 0, max: 30 }), (mode, sw, kind, roomSpoken) => {
        const res = decideSpeak({ mode, switch: sw, kind, roomSpoken });
        const expectedOn = sw ?? (mode === "single");
        if (!expectedOn) {
          expect(res).toEqual({ speak: false, reason: "off" });
          return;
        }
        if (mode === "single") {
          expect(res).toEqual({ speak: true });
          return;
        }
        if (roomSpoken >= VOICE_ROOM_LINE_CAP) {
          expect(res).toEqual({ speak: false, reason: "room_cap" });
          return;
        }
        if (roomSpoken >= VOICE_ROOM_LATE_AT && kind === "narration") {
          expect(res).toEqual({ speak: false, reason: "late_line" });
          return;
        }
        expect(res).toEqual({ speak: true });
      }),
      propParams(),
    );
  });

  it("canSwitchSpeaking allows only the visitor in Single player and only the Master in Multiplayer", () => {
    fc.assert(
      fc.property(modeArb, actorArb, (mode, actor) => {
        expect(canSwitchSpeaking(mode, actor)).toBe(mode === "single" ? actor === "visitor" : actor === "master");
      }),
      propParams(),
    );
  });
});
