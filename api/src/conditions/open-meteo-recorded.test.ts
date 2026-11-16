import { parseArchive, parseForecast, parseGeocode } from "@hauntology/shared/conditions/open-meteo-answers";
import { describe, expect, it } from "vitest";
import recorded from "../../../shared/fixtures/weather/open-meteo-2026-11-15.json";
import { archive, forecast, geocode, type WeatherFetch } from "./open-meteo";

/**
 * Contract test against what Open-Meteo REALLY answered (conditions Spike 1.1, docs/spikes/conditions-1.1.md): `shared/fixtures/weather/open-meteo-2026-11-15.json` holds
 * the raw answers recorded on 2026-11-15 to the very calls `open-meteo.ts` makes. The module and the parsers are run over them, so a change to either that would break on
 * the real service fails here, with no network. (The addresses below are the ones the real service accepted.)
 */

const answering = (body: unknown, status = 200): { fetch: WeatherFetch; urls: string[] } => {
  const urls: string[] = [];
  return { urls, fetch: async (url) => { urls.push(url); return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }; } };
};

describe("Open-Meteo, as it really answered (recorded 2026-11-15)", () => {
  it("geocoding: at most five Places with a label, rounded to two decimals, and nothing else of the answer", async () => {
    const a = answering(recorded.geocodeParis);
    const places = await geocode("Paris", { fetch: a.fetch, base: null });
    expect(a.urls).toEqual(["https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=5&language=en&format=json"]);
    expect(places.length).toBeGreaterThan(0);
    expect(places.length).toBeLessThanOrEqual(5);
    expect(places[0]).toEqual({ lat: 48.85, lon: 2.35, tz: "Europe/Paris", label: "Paris, Île-de-France Region, France" });
    for (const p of places) {
      expect(Object.keys(p).sort()).toEqual(["label", "lat", "lon", "tz"]);
      expect(Math.round(p.lat * 100) / 100).toBe(p.lat);
      expect(Math.round(p.lon * 100) / 100).toBe(p.lon);
    }
    const reykjavik = await geocode("Reykjavik", { fetch: answering(recorded.geocodeReykjavik).fetch, base: null });
    expect(reykjavik[0]).toEqual({ lat: 64.14, lon: -21.9, tz: "Atlantic/Reykjavik", label: "Reykjavik, Capital Region, Iceland" });
  });

  it("geocoding: a name with no match is an answer with no `results` at all, and is an empty list, not a failure", async () => {
    expect(Object.keys(recorded.geocodeNoMatch)).toEqual(["generationtime_ms"]);
    expect(await geocode("zzzzqqqqxx", { fetch: answering(recorded.geocodeNoMatch).fetch, base: null })).toEqual([]);
  });

  it("forecast: the current code, temperature, wind and the place's own time zone, from the address the service accepted", async () => {
    const a = answering(recorded.forecastParis);
    expect(await forecast(48.85, 2.35, { fetch: a.fetch, base: null })).toEqual({ code: 3, tempC: 10.8, windKmh: 16.4, tz: "Europe/Paris" });
    expect(a.urls).toEqual(["https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto"]);
    expect(await forecast(64.14, -21.9, { fetch: answering(recorded.forecastReykjavik).fetch, base: null })).toEqual({ code: 0, tempC: -6.3, windKmh: 11.9, tz: "Atlantic/Reykjavik" });
    expect(recorded.forecastParis.current_units).toMatchObject({ temperature_2m: "°C", wind_speed_10m: "km/h", weather_code: "wmo code" });
  });

  it("archive: a whole day of 24 hours of local time, from 1940, read at the hour asked for, from the address the service accepted", async () => {
    const a = answering(recorded.archiveParis19991231);
    expect(await archive(48.85, 2.35, "1999-12-31", 22, { fetch: a.fetch, base: null })).toEqual({ code: 3, tempC: 6.2, windKmh: 5.4, tz: "Europe/Paris" });
    expect(a.urls).toEqual(["https://archive-api.open-meteo.com/v1/archive?latitude=48.85&longitude=2.35&start_date=1999-12-31&end_date=1999-12-31&hourly=weather_code,temperature_2m,wind_speed_10m&timezone=auto"]);
    expect(recorded.archiveParis19991231.hourly.time).toHaveLength(24);
    expect(recorded.archiveParis19991231.hourly.time[22]).toBe("1999-12-31T22:00");
    expect(await archive(48.85, 2.35, "1940-01-01", 12, { fetch: answering(recorded.archiveParis19400101).fetch, base: null })).toEqual({ code: 2, tempC: 1.1, windKmh: 11.6, tz: "Europe/Paris" });
  });

  it("archive: a recent day has every hour filled in (no missing codes), so yesterday and earlier are safe to ask for", () => {
    const h = recorded.archiveParisRecentDay.hourly;
    expect(h.weather_code).toHaveLength(24);
    expect(h.weather_code.every((c) => typeof c === "number")).toBe(true);
    for (let hour = 0; hour < 24; hour += 1) expect(parseArchive(recorded.archiveParisRecentDay, hour)?.code).toBe(h.weather_code[hour]);
  });

  it("a refused request (before 1940, off the globe) is a 400 with a reason, and for the game that is the Default, never an error to the visitor", async () => {
    expect(recorded.archiveBefore1940Error).toEqual({ error: true, reason: "Parameter 'start_date' is out of allowed range from 1940-01-01 to 2026-11-15" });
    expect(recorded.forecastOffGlobeError.error).toBe(true);
    expect(parseArchive(recorded.archiveBefore1940Error, 12)).toBeNull();
    expect(parseForecast(recorded.forecastOffGlobeError)).toBeNull();
    expect(parseGeocode(recorded.forecastOffGlobeError)).toBeNull();
    await expect(archive(48.85, 2.35, "1939-12-31", 12, { fetch: answering(recorded.archiveBefore1940Error, 400).fetch, base: null })).rejects.toThrow("weather_unavailable");
  });

  it("the forecast can also give local sunrise and sunset, as ISO times in the place's own zone (kept for a later look: the game still uses its fixed hour table)", () => {
    expect(recorded.forecastDailySun.daily.sunrise[0]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
    expect(recorded.forecastDailySun.daily.sunset[0]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
    expect(recorded.forecastDailySun.timezone).toBe("Europe/Paris");
  });

  it("only WMO weather codes the game maps appear in the recorded answers", () => {
    const codes = new Set<number>([recorded.forecastParis.current.weather_code, recorded.forecastReykjavik.current.weather_code, ...recorded.archiveParis19991231.hourly.weather_code, ...recorded.archiveParis19400101.hourly.weather_code, ...recorded.archiveParisRecentDay.hourly.weather_code].filter((c): c is number => typeof c === "number"));
    for (const c of codes) expect([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]).toContain(c);
  });
});
