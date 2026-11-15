import { describe, expect, it } from "vitest";
import { parseArchive, parseForecast, parseGeocode } from "./open-meteo-answers";

describe("parseForecast", () => {
  it("keeps the current code, temperature and wind and the zone, and drops everything else the service says", () => {
    const answer = {
      latitude: 51.5, longitude: -0.120000124, generationtime_ms: 0.05, utc_offset_seconds: 3600, timezone: "Europe/London", timezone_abbreviation: "BST", elevation: 23,
      current_units: { weather_code: "wmo code" }, current: { time: "2024-06-21T23:30", interval: 900, weather_code: 61, temperature_2m: 8.4, wind_speed_10m: 19.2 },
      api_host: "api.open-meteo.com",
    };
    const got = parseForecast(answer);
    expect(got).toEqual({ code: 61, tempC: 8.4, windKmh: 19.2, tz: "Europe/London" });
    expect(JSON.stringify(got)).not.toMatch(/open-meteo|elevation|51\.5|0\.12|BST/);
  });

  it("gives null for a value the service left out, and for an answer that is not one", () => {
    expect(parseForecast({ timezone: "UTC", current: { weather_code: null, temperature_2m: 5 } })).toEqual({ code: null, tempC: 5, windKmh: null, tz: "UTC" });
    expect(parseForecast({ current: {} })).toEqual({ code: null, tempC: null, windKmh: null, tz: null });
    for (const bad of [null, undefined, "x", 5, [], {}, { current: 5 }, { current: { weather_code: "61" } }, { current: { weather_code: NaN } }, { timezone: 5, current: {} }, { timezone: "x".repeat(65), current: {} }, { error: true, reason: "Latitude must be in range" }]) expect(parseForecast(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("parseArchive", () => {
  const day = (over: Record<string, unknown> = {}) => ({
    timezone: "Europe/London",
    hourly: {
      time: Array.from({ length: 24 }, (_, h) => `1999-12-31T${String(h).padStart(2, "0")}:00`),
      weather_code: Array.from({ length: 24 }, (_, h) => h * 3), temperature_2m: Array.from({ length: 24 }, (_, h) => h - 5), wind_speed_10m: Array.from({ length: 24 }, (_, h) => h + 0.5),
    },
    ...over,
  });

  it("takes the hour that is asked for", () => {
    expect(parseArchive(day(), 6)).toEqual({ code: 18, tempC: 1, windKmh: 6.5, tz: "Europe/London" });
    expect(parseArchive(day(), 19)).toEqual({ code: 57, tempC: 14, windKmh: 19.5, tz: "Europe/London" });
    expect(parseArchive(day(), 0)).toMatchObject({ code: 0 });
    expect(parseArchive(day(), 23)).toMatchObject({ code: 69 });
  });

  it("takes the entry by its hour stamp even when the list does not start at midnight, and by index when the stamps are not usable and the day is whole", () => {
    const partial = { hourly: { time: ["x-T11:00", "x-T12:00", "x-T13:00"], weather_code: [1, 2, 3], temperature_2m: [10, 11, 12], wind_speed_10m: [1, 2, 3] } };
    expect(parseArchive(partial, 12)).toEqual({ code: 2, tempC: 11, windKmh: 2, tz: null });
    const unstamped = day();
    unstamped.hourly.time = unstamped.hourly.time.map(() => "?");
    expect(parseArchive(unstamped, 5)).toMatchObject({ code: 15 });
  });

  it("is null when that hour is not there, and null values stay null (the archive had no data for it)", () => {
    expect(parseArchive(partial3(), 20)).toBeNull();
    const empty = { hourly: { time: ["d-T06:00"], weather_code: [null], temperature_2m: [null], wind_speed_10m: [null] } };
    expect(parseArchive(empty, 6)).toEqual({ code: null, tempC: null, windKmh: null, tz: null });
  });

  it("is null for an hour that is not an hour of the day, and for an answer that is not one", () => {
    for (const h of [-1, 24, 1.5, NaN]) expect(parseArchive(day(), h), String(h)).toBeNull();
    for (const bad of [null, "x", {}, { hourly: {} }, { hourly: { time: "x" } }, { hourly: { time: [], weather_code: 5 } }]) expect(parseArchive(bad, 6), JSON.stringify(bad)).toBeNull();
  });

  function partial3() {
    return { hourly: { time: ["x-T11:00", "x-T12:00", "x-T13:00"], weather_code: [1, 2, 3], temperature_2m: [10, 11, 12], wind_speed_10m: [1, 2, 3] } };
  }
});

describe("parseGeocode", () => {
  const match = (i: number) => ({ id: 1000 + i, name: `City ${i}`, latitude: 10 + i + 0.12345, longitude: 20 + i + 0.98765, elevation: 5, feature_code: "PPLA", country_code: "XX", admin1_id: 7, timezone: "Europe/Paris", population: 123456, country: "Land", admin1: "Region" });

  it("returns at most five Places, rounded, labelled with the name, region and country, and with nothing else from the service", () => {
    const got = parseGeocode({ results: Array.from({ length: 9 }, (_, i) => match(i)), generationtime_ms: 1.2 });
    expect(got).toHaveLength(5);
    expect(got?.[0]).toEqual({ lat: 10.12, lon: 20.99, tz: "Europe/Paris", label: "City 0, Region, Land" });
    expect(JSON.stringify(got)).not.toMatch(/population|elevation|PPLA|123456|\.12345|\.98765/);
  });

  it("leaves out a part of the label the service did not give, and an unknown zone becomes null", () => {
    expect(parseGeocode({ results: [{ name: "Smalltown", latitude: 1, longitude: 2 }] })).toEqual([{ lat: 1, lon: 2, tz: null, label: "Smalltown" }]);
    expect(parseGeocode({ results: [{ name: "Z", country: "Land", latitude: 1, longitude: 2, timezone: "Not/AZone" }] })).toEqual([{ lat: 1, lon: 2, tz: null, label: "Z, Land" }]);
  });

  it("no match at all is an empty list (the service leaves `results` out), and anything that is not an answer is null", () => {
    expect(parseGeocode({ generationtime_ms: 0.4 })).toEqual([]);
    expect(parseGeocode({ results: [] })).toEqual([]);
    for (const bad of [null, "x", 5, [], { results: "x" }, { results: [{ name: 5, latitude: 1, longitude: 2 }] }, { results: [{ name: "a", latitude: "1", longitude: 2 }] }]) expect(parseGeocode(bad), JSON.stringify(bad)).toBeNull();
  });

  it("drops a match whose position is off the globe, and keeps the five that are left", () => {
    const off = { name: "Nowhere", latitude: 99, longitude: 0 };
    const got = parseGeocode({ results: [off, off, ...Array.from({ length: 6 }, (_, i) => match(i))] });
    expect(got).toHaveLength(5);
    expect(got?.every((p) => p.label.startsWith("City"))).toBe(true);
  });
});
