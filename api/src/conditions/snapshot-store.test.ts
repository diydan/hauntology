import { FakeClock, FakeTimers, RAIN } from "@hauntology/shared/conditions/snapshot-kit";
import { describe, expect, it } from "vitest";
import { createLogger } from "../log";
import { MemoryConditionsCache } from "./cache";
import { PUBLIC_HOSTS, type WeatherFetch } from "./open-meteo";
import { choiceFrom, conditionsFromEnv, createConditionsService } from "./snapshot-store";

const NOW = Date.UTC(2024, 5, 21, 22, 30);
const LONDON = { lat: 51.50735, lon: -0.127758, tz: "Europe/London", label: "London" };
const FORECAST_BODY = JSON.stringify({ timezone: "Europe/London", current: { weather_code: 61, temperature_2m: 8, wind_speed_10m: 20 } });

/** The whole service over fakes: a weather host that is a function, a cache on a clock you move, a timer you run by hand, and a log you can read. */
function kit(env: { CONDITIONS_ENABLED?: string; WEATHER_BASE_URL?: string } = {}, answer: (url: string) => string | Error = () => FORECAST_BODY) {
  const clock = new FakeClock(NOW);
  const timers = new FakeTimers();
  const urls: string[] = [];
  const lines: string[] = [];
  const fetch: WeatherFetch = async (url) => {
    urls.push(url);
    const a = answer(url);
    if (a instanceof Error) throw a;
    return { ok: true, status: 200, text: async () => a };
  };
  const service = conditionsFromEnv(env, { fetch, cache: new MemoryConditionsCache(clock.now), now: clock.now, sleep: timers.sleep, log: createLogger((l) => void lines.push(l), clock.now) });
  const read = async (raw: unknown) => {
    const p = service.read(raw);
    await timers.flush();
    return p;
  };
  return { read, urls, lines, clock };
}
const logged = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

describe("choiceFrom", () => {
  it("takes the host's hour when it is a whole hour from 0 to 23, else the hour of the clock in UTC", () => {
    expect(choiceFrom({ hostHour: 7 }, NOW).hostHour).toBe(7);
    expect(choiceFrom({ hostHour: 0 }, NOW).hostHour).toBe(0);
    expect(choiceFrom({ hostHour: 23 }, NOW).hostHour).toBe(23);
    for (const bad of [24, -1, 1.5, "7", null, NaN]) expect(choiceFrom({ hostHour: bad }, NOW).hostHour, String(bad)).toBe(22);
    for (const raw of [undefined, null, "x", 5, [], true]) expect(choiceFrom(raw, NOW)).toEqual({ hostHour: 22 });
  });

  it("passes on a Place and a Memory Day as they came (the reader refuses what is wrong), and drops every other field", () => {
    const c = choiceFrom({ hostHour: 9, place: { lat: 1.234, lon: 5.678, accuracy: 4 }, memoryDay: { date: "1999-12-31", timeOfDay: "dusk", note: "x" }, token: "secret", query: "home" }, NOW);
    expect(Object.keys(c).sort()).toEqual(["hostHour", "memoryDay", "place"]);
    expect(c.memoryDay).toEqual({ date: "1999-12-31", timeOfDay: "dusk" });
    expect(choiceFrom({ place: "here", memoryDay: [1] }, NOW)).toEqual({ hostHour: 22 });
  });
});

describe("the service: one read for a game that is starting", () => {
  it("with no choice, or one that is not an object, gives the Default and makes no call", async () => {
    const k = kit();
    for (const raw of [undefined, null, "x", 5, {}, { hostHour: 12 }]) expect((await k.read(raw)).source, String(raw)).toBe("default");
    expect(k.urls).toEqual([]);
  });

  it("with a Place reads the forecast once from the public host, and the snapshot has the rounded Place and the sky", async () => {
    const k = kit();
    const s = await k.read({ hostHour: 12, place: { ...LONDON, accuracy: 20, altitude: 3 } });
    expect(k.urls).toEqual([`${PUBLIC_HOSTS.forecast}/v1/forecast?latitude=51.51&longitude=-0.13&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto`]);
    expect(s).toMatchObject({ source: "live", weather: "rain", tempBand: "cold", windBand: "breezy", timeOfDay: "night", place: { lat: 51.51, lon: -0.13, tz: "Europe/London", label: "London" } });
    expect(Object.keys(s.place ?? {}).sort()).toEqual(["label", "lat", "lon", "tz"]);
  });

  it("with a Memory Day and a Place reads the archive for that date", async () => {
    const day = { hourly: { time: ["1999-12-31T19:00"], weather_code: [71], temperature_2m: [-2], wind_speed_10m: [4] } };
    const k = kit({}, () => JSON.stringify(day));
    const s = await k.read({ hostHour: 12, place: LONDON, memoryDay: { date: "1999-12-31", timeOfDay: "dusk" } });
    expect(k.urls).toHaveLength(1);
    expect(k.urls[0]).toContain("archive-api.open-meteo.com/v1/archive");
    expect(k.urls[0]).toContain("start_date=1999-12-31&end_date=1999-12-31");
    expect(s).toMatchObject({ source: "memory", weather: "snow", timeOfDay: "dusk" });
  });

  it("answers a second game at the same Place within 15 minutes from the cache, and calls again after 15 minutes", async () => {
    const k = kit();
    await k.read({ hostHour: 12, place: LONDON });
    await k.read({ hostHour: 12, place: LONDON });
    expect(k.urls).toHaveLength(1);
    k.clock.advance(15 * 60 * 1000);
    await k.read({ hostHour: 12, place: LONDON });
    expect(k.urls).toHaveLength(2);
  });

  it("a failure of the weather host, a bad status's body, and a host that never answers all give the Default weather, not an error", async () => {
    for (const answer of [() => new Error("down"), () => "not json", () => JSON.stringify({ error: true })]) {
      const s = await kit({}, answer).read({ hostHour: 12, place: LONDON });
      expect([s.weather, s.source]).toEqual(["clear", "default"]);
      expect(s.place?.lat).toBe(51.51);
    }
  });
});

describe("the settings", () => {
  it("CONDITIONS_ENABLED=false gives the Default and calls nothing, however much was chosen", async () => {
    const k = kit({ CONDITIONS_ENABLED: "false" });
    const s = await k.read({ hostHour: 12, place: LONDON, memoryDay: { date: "1999-12-31", timeOfDay: "dusk" } });
    expect(s.source).toBe("default");
    expect(s.place).toBeUndefined();
    expect(k.urls).toEqual([]);
  });

  it("anything but the word false leaves it on", async () => {
    for (const v of [undefined, "true", "", "1", "FALSE", "no"]) {
      const k = kit(v === undefined ? {} : { CONDITIONS_ENABLED: v });
      expect((await k.read({ hostHour: 12, place: LONDON })).source, String(v)).toBe("live");
    }
  });

  it("WEATHER_BASE_URL moves all three paths to it, and one that is not acceptable turns the feature off", async () => {
    const k = kit({ WEATHER_BASE_URL: "http://127.0.0.1:8788/" });
    await k.read({ hostHour: 12, place: LONDON });
    expect(k.urls[0]?.startsWith("http://127.0.0.1:8788/v1/forecast?")).toBe(true);
    for (const base of ["http://weather.example.org", "https://u:p@weather.example.org", "nonsense"]) {
      const off = kit({ WEATHER_BASE_URL: base });
      expect((await off.read({ hostHour: 12, place: LONDON })).source, base).toBe("default");
      expect(off.urls, base).toEqual([]);
    }
  });
});

describe("the counter line", () => {
  it("one line for each read, with a source, a reason and whether the cache answered, and no place, label, date or position", async () => {
    const k = kit();
    await k.read({ hostHour: 12, place: LONDON, memoryDay: { date: "1999-12-31", timeOfDay: "dusk" }, label: "my house" });
    await k.read({ hostHour: 12, place: LONDON });
    await k.read({ hostHour: 12, place: LONDON });
    await k.read({});
    const lines = logged(k.lines);
    expect(lines.map((l) => [l["event"], l["source"], l["reason"], l["cache"]])).toEqual([
      ["conditions.read", "default", "error", false], // the archive host answered a body that is not an archive answer
      ["conditions.read", "live", "ok", false],
      ["conditions.read", "live", "ok", true],
      ["conditions.read", "default", "no_place", false],
    ]);
    const text = k.lines.join("\n");
    expect(text).not.toMatch(/London|51\.5|0\.13|1999|Europe|my house|lat|lon/);
  });

  it("names why the Default was used: disabled, no place, a timeout, an error", async () => {
    const off = kit({ CONDITIONS_ENABLED: "false" });
    await off.read({ place: LONDON });
    expect(logged(off.lines)[0]).toMatchObject({ source: "default", reason: "disabled" });
    const down = kit({}, () => new Error("boom"));
    await down.read({ hostHour: 1, place: LONDON });
    expect(logged(down.lines)[0]).toMatchObject({ source: "default", reason: "error", cache: false });
  });

  it("a service made with no logger writes nothing and does not fail", async () => {
    const service = createConditionsService({ enabled: true, fetchWeather: async () => RAIN, cache: new MemoryConditionsCache(() => 1), now: () => NOW, sleep: () => new Promise(() => {}) });
    expect((await service.read({ hostHour: 12, place: LONDON })).source).toBe("live");
  });
});
