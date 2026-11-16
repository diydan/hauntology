import { describe, expect, it } from "vitest";
import {
  AtmosphereSchema, ConditionsChoiceSchema, ConditionsSnapshotSchema, MAX_STARS, MOON_PHASES, PlaceSchema,
  PromptFieldsSchema, PublicConditionsSchema, SkyStarSchema,
} from "./types";

const place = { lat: 49.61, lon: 6.13, tz: "Europe/Luxembourg", label: "Luxembourg" };
const snapshot = {
  place, timeOfDay: "dusk", weather: "rain", tempBand: "cold", windBand: "breezy", moon: "full moon",
  stars: [{ id: 3, az: 120.5, alt: 40, mag: 1.2 }], moonSky: { az: 200, alt: 15, lit: 0.9 }, source: "live",
};

describe("Place", () => {
  it("accepts a position rounded to two decimals, and a null time zone", () => {
    expect(PlaceSchema.safeParse(place).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...place, tz: null }).success).toBe(true);
  });

  it("refuses a finer position, a range error, an extra field, a long label and a control character", () => {
    const bad: unknown[] = [
      { ...place, lat: 49.611 }, { ...place, lon: 6.1299 }, { ...place, lat: 91 }, { ...place, lon: -181 },
      { ...place, lat: Number.NaN }, { ...place, accuracy: 12 }, { ...place, address: "1 Rue X" },
      { ...place, label: "x".repeat(81) }, { ...place, label: "" }, { ...place, label: "a\nb" }, { ...place, tz: "" },
    ];
    for (const p of bad) expect(PlaceSchema.safeParse(p).success, JSON.stringify(p)).toBe(false);
  });
});

describe("ConditionsSnapshot and its projections", () => {
  it("accepts a full snapshot", () => {
    expect(ConditionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("has exactly eight moon phases", () => {
    expect(MOON_PHASES).toHaveLength(8);
    expect(new Set(MOON_PHASES).size).toBe(8);
  });

  it("refuses more than 300 stars, a star out of range, and an unknown weather class", () => {
    const stars = Array.from({ length: MAX_STARS + 1 }, (_, i) => ({ id: i % MAX_STARS, az: 1, alt: 1, mag: 1 }));
    expect(ConditionsSnapshotSchema.safeParse({ ...snapshot, stars }).success).toBe(false);
    expect(SkyStarSchema.safeParse({ id: 300, az: 1, alt: 1, mag: 1 }).success).toBe(false);
    expect(SkyStarSchema.safeParse({ id: 0, az: 361, alt: 1, mag: 1 }).success).toBe(false);
    expect(ConditionsSnapshotSchema.safeParse({ ...snapshot, weather: "hail" }).success).toBe(false);
  });

  it("an Atmosphere has no place and no source, and a snapshot's place cannot slip in", () => {
    const { place: _p, source: _s, ...atmosphere } = snapshot;
    expect(AtmosphereSchema.safeParse(atmosphere).success).toBe(true);
    expect(AtmosphereSchema.safeParse({ ...atmosphere, place }).success).toBe(false);
    expect(AtmosphereSchema.safeParse({ ...atmosphere, source: "live" }).success).toBe(false);
  });

  it("public conditions and prompt fields carry only their own few fields", () => {
    expect(PublicConditionsSchema.safeParse({ timeOfDay: "night", weather: "fog", moon: "new moon" }).success).toBe(true);
    expect(PublicConditionsSchema.safeParse({ timeOfDay: "night", weather: "fog", moon: "new moon", tempBand: "cold" }).success).toBe(false);
    expect(PromptFieldsSchema.safeParse({ weather: "fog", timeBucket: "night", moon: "new moon" }).success).toBe(true);
    expect(PromptFieldsSchema.safeParse({ weather: "fog", timeBucket: "night", moon: "new moon", place: "x" }).success).toBe(false);
  });
});

describe("ConditionsChoice", () => {
  it("takes a host hour from 0 to 23 and an optional place and Memory Day", () => {
    expect(ConditionsChoiceSchema.safeParse({ hostHour: 0 }).success).toBe(true);
    expect(ConditionsChoiceSchema.safeParse({ hostHour: 23, place: { lat: 49.6123, lon: 6.1299 } }).success).toBe(true);
    expect(ConditionsChoiceSchema.safeParse({ hostHour: 12, memoryDay: { date: "1987-06-14", timeOfDay: "dusk" } }).success).toBe(true);
    for (const bad of [{}, { hostHour: 24 }, { hostHour: -1 }, { hostHour: 1.5 }, { hostHour: 5, memoryDay: { date: "14/06/1987", timeOfDay: "dusk" } }]) {
      expect(ConditionsChoiceSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
