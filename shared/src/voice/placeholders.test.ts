import { describe, expect, it } from "vitest";
import { MOON_PHASES, TIMES_OF_DAY, WEATHER_CLASSES } from "../conditions/types";
import { FINITE_PLACEHOLDER_NAMES } from "./speakable";
import { BAND_WORDS, BEARING_WORDS, FINITE_VALUES, MOON_WORDS, TIME_WORDS, WEATHER_WORDS, moonWord, timeWord, weatherWord } from "./placeholders";

describe("the spoken words of the finite placeholders", () => {
  it("covers every weather class, part of the day and moon phase, with no gaps and no repeats", () => {
    for (const c of WEATHER_CLASSES) expect(WEATHER_WORDS[c]).toBeTruthy();
    for (const t of TIMES_OF_DAY) expect(TIME_WORDS[t]).toBeTruthy();
    for (const m of MOON_PHASES) expect(MOON_WORDS[m]).toBeTruthy();
    expect(new Set(Object.values(WEATHER_WORDS)).size).toBe(WEATHER_CLASSES.length);
    expect(new Set(Object.values(TIME_WORDS)).size).toBe(TIMES_OF_DAY.length);
    expect(new Set(Object.values(MOON_WORDS)).size).toBe(MOON_PHASES.length);
  });

  it("says the weather as an adjective, so \"Today it is cloudy\" and never \"Today it is cloud\"", () => {
    expect(weatherWord("cloud")).toBe("cloudy");
    expect(weatherWord("fog")).toBe("foggy");
    expect(weatherWord("rain")).toBe("rainy");
    expect(weatherWord("storm")).toBe("stormy");
    expect(weatherWord("snow")).toBe("snowy");
    expect(weatherWord("clear")).toBe("clear");
    // a bare noun class would read as a label
    for (const noun of ["cloud", "fog", "rain", "storm", "snow"]) expect(Object.values(WEATHER_WORDS)).not.toContain(noun);
  });

  it("keeps the time of day and the moon phase as they are", () => {
    expect(timeWord("dusk")).toBe("dusk");
    expect(moonWord("waxing gibbous")).toBe("waxing gibbous");
  });

  it("has values for exactly the finite placeholders, in the sizes the spec gives (6, 4, 8, 8 and 3)", () => {
    expect(Object.keys(FINITE_VALUES).sort()).toEqual([...FINITE_PLACEHOLDER_NAMES].sort());
    expect(FINITE_VALUES.weather).toHaveLength(6);
    expect(FINITE_VALUES.time).toHaveLength(4);
    expect(FINITE_VALUES.moon).toHaveLength(8);
    expect(FINITE_VALUES.bearing).toHaveLength(8);
    expect(FINITE_VALUES.band).toHaveLength(3);
    expect(BEARING_WORDS).toHaveLength(8);
    expect(BAND_WORDS).toEqual(["far", "nearer", "very close"]);
  });

  it("lists the values in a fixed order, the order of the enums", () => {
    expect(FINITE_VALUES.weather).toEqual(["clear", "cloudy", "foggy", "rainy", "stormy", "snowy"]);
    expect(FINITE_VALUES.time).toEqual(["dawn", "day", "dusk", "night"]);
    expect(FINITE_VALUES.moon?.[0]).toBe("new moon");
  });

  it("holds no markup, no placeholder and nothing a speaker could not say", () => {
    for (const values of Object.values(FINITE_VALUES)) for (const v of values) expect(v).toMatch(/^[a-z][a-z -]*$/);
  });
});
