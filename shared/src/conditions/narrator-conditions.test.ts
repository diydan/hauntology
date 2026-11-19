import { describe, expect, it } from "vitest";
import { validateGhostReply } from "../ghost/narration";
import { REAL_WORLD_ATTACKS, mentionsRealWorld } from "./real-world-terms";
import { STAR_LIST } from "./star-list";
import { STAR_LINE_TEMPLATES, pickStarLine } from "./star-lines";
import { TIMES_OF_DAY, WEATHER_CLASSES, type SkyStar } from "./types";
import { WEATHER_LINES } from "./weather-lines";

describe("mentionsRealWorld & red-team fixture (conditions 5.2, 5.4)", () => {
  it("contains at least 20 distinct real-world news, crime, death, and event strings and rejects every one", () => {
    expect(REAL_WORLD_ATTACKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(REAL_WORLD_ATTACKS).size).toBe(REAL_WORLD_ATTACKS.length);
    for (const sample of REAL_WORLD_ATTACKS) {
      expect(mentionsRealWorld(sample), sample).toBe(true);
      expect(validateGhostReply(sample)).toEqual({ ok: false, reason: "real_world" });
    }
  });

  it("does not false-positive ordinary atmospheric ghost prose", () => {
    for (const calm of [
      "The room is warm by the hearth and it is quiet for you tonight.",
      "Step in to the room; a faint draft is in the air around us.",
      "I warn you kindly to mind the bottom step in this light.",
      "The rain is soft on the glass tonight.",
    ]) {
      expect(mentionsRealWorld(calm), calm).toBe(false);
      expect(validateGhostReply(calm), calm).toMatchObject({ ok: true });
    }
  });
});

describe("scripted weather and star lines (conditions 5.3)", () => {
  it("provides at least five valid scripted variants for every Weather Class and Time of Day", () => {
    const failures: string[] = [];
    for (const w of WEATHER_CLASSES) {
      for (const t of TIMES_OF_DAY) {
        const lines = WEATHER_LINES[w][t];
        expect(lines.length, `${w}/${t}`).toBeGreaterThanOrEqual(5);
        expect(new Set(lines).size, `${w}/${t} unique`).toBe(lines.length);
        for (const l of lines) {
          if (mentionsRealWorld(l)) failures.push(`realWorld(${w}/${t}): ${l}`);
          const chk = validateGhostReply(l, { noPetName: true });
          if (!chk.ok) failures.push(`${chk.reason}(${w}/${t}): ${l}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("pickStarLine names at most one star above 20 degrees altitude and returns null once alreadyNamed is set", () => {
    const siriusId = STAR_LIST.findIndex((s) => s.name === "Sirius");
    const polarisId = STAR_LIST.findIndex((s) => s.name === "Polaris");
    const low: SkyStar = { id: siriusId, az: 180, alt: 12, mag: -1.46 };
    const high: SkyStar = { id: polarisId, az: 0, alt: 51, mag: 1.98 };

    expect(pickStarLine([low], 0.5, false, { weather: "clear", timeOfDay: "night" })).toBeNull();
    expect(pickStarLine([high], 0.5, false, { weather: "fog", timeOfDay: "night" })).toBeNull();
    expect(pickStarLine([high], 0.5, true, { weather: "clear", timeOfDay: "night" })).toBeNull();

    const picked = pickStarLine([low, high], 0.25, false, { weather: "clear", timeOfDay: "night" });
    expect(picked).toEqual({
      starName: "Polaris",
      line: expect.stringContaining("Polaris"),
    });
    expect(mentionsRealWorld(picked!.line)).toBe(false);
    expect(validateGhostReply(picked!.line).ok).toBe(true);
    expect(STAR_LINE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });
});
