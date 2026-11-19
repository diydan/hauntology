import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { buildNarrationPrompt, validateGhostReply } from "../ghost/narration";
import { REAL_WORLD_ATTACKS, mentionsRealWorld } from "./real-world-terms";
import { toPromptFields } from "./snapshot";
import { pickStarLine } from "./star-lines";
import { STAR_LIST } from "./star-list";
import { MOON_PHASES, TEMP_BANDS, TIMES_OF_DAY, WEATHER_CLASSES, WIND_BANDS, type ConditionsSnapshot, type SkyStar } from "./types";
import { WEATHER_LINES } from "./weather-lines";

const hostileLabelArb = fc.constantFrom(
  "Murder Creek News",
  "Headline Plaza",
  "Police Station Row",
  "Election Square",
  "Pandemic Memorial",
  "Crash Junction",
);

const snapshotArb: fc.Arbitrary<ConditionsSnapshot> = fc.record({
  place: fc.option(
    fc.record({
      lat: fc.constant(51.51),
      lon: fc.constant(-0.13),
      tz: fc.constant("Europe/London"),
      label: hostileLabelArb,
    }),
    { nil: undefined },
  ),
  timeOfDay: fc.constantFrom(...TIMES_OF_DAY),
  weather: fc.constantFrom(...WEATHER_CLASSES),
  tempBand: fc.constantFrom(...TEMP_BANDS),
  windBand: fc.constantFrom(...WIND_BANDS),
  moon: fc.constantFrom(...MOON_PHASES),
  memoryDay: fc.option(
    fc.record({ date: fc.constant("1998-07-14"), timeOfDay: fc.constantFrom(...TIMES_OF_DAY) }),
    { nil: undefined },
  ),
  source: fc.constantFrom("live" as const, "memory" as const, "default" as const),
});

/**
 * Property 11: Scripted lines and the narrator prompt carry no news, crime, death or real events (conditions 5.6).
 * Validates: Requirements 5.1, 5.2, 5.3.
 */
describe("Property 11: Scripted lines and the narrator prompt carry no news, crime, death or real events", () => {
  it("narrator prompt omits sky when source is default, carries only enum words when set, and never leaks hostile place labels, coords or dates", () => {
    fc.assert(
      fc.property(snapshotArb, (snap) => {
        const fields = toPromptFields(snap);
        const prompt = buildNarrationPrompt({
          voice: "wistful",
          directive: { kind: "ambient" },
          brief: "A quiet kitchen with one high window.",
          memories: [],
          history: [],
          ...(fields ? { sky: fields } : {}),
        });
        const baseline = buildNarrationPrompt({
          voice: "wistful",
          directive: { kind: "ambient" },
          brief: "A quiet kitchen with one high window.",
          memories: [],
          history: [],
        });
        expect(prompt).not.toBeNull();
        expect(baseline).not.toBeNull();

        if (snap.source === "default") {
          return JSON.stringify(prompt) === JSON.stringify(baseline);
        }

        const joined = `${prompt!.system}\n${prompt!.user}`;
        expect(joined).toContain(snap.weather);
        expect(joined).toContain(snap.timeOfDay);
        expect(joined).not.toMatch(/51\.51|-0\.13|1998-07-14|Murder Creek|Headline Plaza|Police Station|Election Square|Pandemic Memorial|Crash Junction/);
        return true;
      }),
      propParams(),
    );
  });

  it("scripted lines pass mentionsRealWorld, hostile replies fail validateGhostReply, and at most one star is named over any sequence of turns", () => {
    for (const w of WEATHER_CLASSES) {
      for (const t of TIMES_OF_DAY) {
        for (const l of WEATHER_LINES[w][t]) {
          expect(mentionsRealWorld(l)).toBe(false);
        }
      }
    }
    for (const bad of REAL_WORLD_ATTACKS) {
      expect(validateGhostReply(bad).ok).toBe(false);
    }

    const starIds = STAR_LIST.map((_, id) => id).filter((id) => STAR_LIST[id]?.name);
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 2, maxLength: 10 }),
        (draws) => {
          const stars: SkyStar[] = starIds.map((id, i) => ({ id, az: (i * 37) % 360, alt: 35, mag: 1.5 }));
          let alreadyNamed = false;
          let count = 0;
          for (const d of draws) {
            const res = pickStarLine(stars, d, alreadyNamed, { weather: "clear", timeOfDay: "night" });
            if (res !== null) {
              expect(mentionsRealWorld(res.line)).toBe(false);
              count++;
              alreadyNamed = true;
            }
          }
          return count <= 1;
        },
      ),
      propParams(),
    );
  });
});
