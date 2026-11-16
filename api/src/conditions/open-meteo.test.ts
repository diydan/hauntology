import { describe, expect, it } from "vitest";
import { BODY_MAX, PUBLIC_HOSTS, QUERY_MAX, REQUEST_TIMEOUT_MS, archive, forecast, geocode, weatherBaseFrom, weatherFetcher, type OpenMeteoDeps, type WeatherResponse } from "./open-meteo";

type Call = { url: string; signal: AbortSignal; headers: Record<string, string> };
/** A weather service that is a plain function: it records each call and answers what it is told. Nothing here opens a connection. */
function fake(answer: (url: string) => WeatherResponse | Promise<WeatherResponse> | Error, base: string | null = null) {
  const calls: Call[] = [];
  const limits: number[] = [];
  const deps: OpenMeteoDeps = {
    base,
    signal: (ms) => (limits.push(ms), new AbortController().signal),
    fetch: async (url, init) => {
      calls.push({ url, signal: init.signal, headers: init.headers });
      const a = answer(url);
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return { deps, calls, limits };
}
const json = (body: unknown, status = 200): WeatherResponse => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const FORECAST = { timezone: "Europe/London", current: { weather_code: 61, temperature_2m: 8.4, wind_speed_10m: 19.2 }, elevation: 23, latitude: 51.5, longitude: -0.12 };
const day = (hour: number) => ({
  timezone: "Europe/London",
  hourly: { time: Array.from({ length: 24 }, (_, h) => `1999-12-31T${String(h).padStart(2, "0")}:00`), weather_code: Array.from({ length: 24 }, (_, h) => (h === hour ? 71 : 0)), temperature_2m: Array.from({ length: 24 }, () => -2), wind_speed_10m: Array.from({ length: 24 }, () => 4) },
});

describe("weatherBaseFrom", () => {
  it("unset or blank is the public hosts", () => {
    for (const v of [undefined, "", "   "]) expect(weatherBaseFrom(v)).toEqual({ ok: true, base: null });
  });

  it("takes an https address, and an http one only on this machine, with the trailing slash gone and a path kept", () => {
    expect(weatherBaseFrom("https://weather.example.org")).toEqual({ ok: true, base: "https://weather.example.org" });
    expect(weatherBaseFrom("https://weather.example.org/")).toEqual({ ok: true, base: "https://weather.example.org" });
    expect(weatherBaseFrom("https://weather.example.org/open-meteo//")).toEqual({ ok: true, base: "https://weather.example.org/open-meteo" });
    expect(weatherBaseFrom("http://127.0.0.1:8788")).toEqual({ ok: true, base: "http://127.0.0.1:8788" });
    expect(weatherBaseFrom("http://localhost:9000/")).toEqual({ ok: true, base: "http://localhost:9000" });
  });

  it("refuses plain http elsewhere, a login in the address, a query or a fragment, another scheme, and text that is not an address", () => {
    for (const v of ["http://weather.example.org", "http://192.168.1.5", "https://user:pw@weather.example.org", "https://weather.example.org?key=1", "https://weather.example.org#x", "ftp://weather.example.org", "file:///etc/passwd", "weather.example.org", "not a url", "javascript:alert(1)"])
      expect(weatherBaseFrom(v), v).toEqual({ ok: false });
  });
});

describe("forecast", () => {
  it("asks the public forecast host for the rounded position, with a 3 second limit, and gives the boiled-down answer", async () => {
    const { deps, calls, limits } = fake(() => json(FORECAST));
    const got = await forecast(51.50735, -0.127758, deps);
    expect(got).toEqual({ code: 61, tempC: 8.4, windKmh: 19.2, tz: "Europe/London" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${PUBLIC_HOSTS.forecast}/v1/forecast?latitude=51.51&longitude=-0.13&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto`);
    expect(calls[0]?.headers).toEqual({ Accept: "application/json" });
    expect(limits).toEqual([3000]);
    expect(REQUEST_TIMEOUT_MS).toBe(3000);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the real AbortSignal.timeout when none is injected", async () => {
    let seen: AbortSignal | undefined;
    const deps: OpenMeteoDeps = { base: null, fetch: async (_u, init) => ((seen = init.signal), json(FORECAST)) };
    await forecast(1, 2, deps);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
  });

  it("puts every path on WEATHER_BASE_URL when it is set", async () => {
    const { deps, calls } = fake(() => json(FORECAST), "http://127.0.0.1:8788");
    await forecast(1, 2, deps);
    expect(calls[0]?.url).toBe("http://127.0.0.1:8788/v1/forecast?latitude=1.00&longitude=2.00&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto");
  });

  it("throws a bare weather_unavailable for a bad status, a network error, a body that is not JSON, one that is too large, and one that is not weather; none of it holds the address or the position", async () => {
    const cases: [string, () => WeatherResponse | Error][] = [
      ["429", () => json({ error: true }, 429)],
      ["500", () => json({}, 500)],
      ["network", () => new Error("connect ECONNREFUSED https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13")],
      ["not JSON", () => ({ ok: true, status: 200, text: async () => "<html>" })],
      ["too large", () => ({ ok: true, status: 200, text: async () => " ".repeat(BODY_MAX + 1) + JSON.stringify(FORECAST) })],
      ["not weather", () => json({ error: true, reason: "Latitude must be in range of -90 to 90" })],
      ["text() fails", () => ({ ok: true, status: 200, text: async () => { throw new Error("stream https://api.open-meteo.com 51.51"); } })],
    ];
    for (const [name, answer] of cases) {
      const { deps } = fake(() => answer());
      const error = await forecast(51.51, -0.13, deps).then(() => null, (e: unknown) => e as Error);
      expect(error?.message, name).toBe("weather_unavailable");
      // the error is a fresh one: nothing of the original (its message, its address, its position) is kept as a cause
      expect(String(error), name).toBe("Error: weather_unavailable");
      expect((error as { cause?: unknown }).cause, name).toBeUndefined();
    }
  });

  it("does not call for a position that is not a number", async () => {
    const { deps, calls } = fake(() => json(FORECAST));
    for (const bad of [NaN, Infinity]) await expect(forecast(bad, 0, deps)).rejects.toThrow("weather_unavailable");
    expect(calls).toHaveLength(0);
  });
});

describe("archive", () => {
  it("asks the archive host for one date, with the hour of its Time of Day, and takes that hour", async () => {
    const { deps, calls } = fake(() => json(day(19)));
    const got = await archive(51.51, -0.13, "1999-12-31", 19, deps);
    expect(got).toEqual({ code: 71, tempC: -2, windKmh: 4, tz: "Europe/London" });
    expect(calls[0]?.url).toBe(`${PUBLIC_HOSTS.archive}/v1/archive?latitude=51.51&longitude=-0.13&start_date=1999-12-31&end_date=1999-12-31&hourly=weather_code,temperature_2m,wind_speed_10m&timezone=auto`);
    expect((await archive(51.51, -0.13, "1999-12-31", 6, fake(() => json(day(6))).deps)).code).toBe(71);
  });

  it("an archive with no data for the hour is an answer with a null code (the reader calls that no weather), and an answer with no such hour is an error", async () => {
    const empty = { hourly: { time: ["1999-12-31T06:00"], weather_code: [null], temperature_2m: [null], wind_speed_10m: [null] } };
    expect(await archive(1, 2, "1999-12-31", 6, fake(() => json(empty)).deps)).toMatchObject({ code: null });
    await expect(archive(1, 2, "1999-12-31", 20, fake(() => json(empty)).deps)).rejects.toThrow("weather_unavailable");
  });

  it("makes no call for a date that is not real, or an hour that is not an hour", async () => {
    const { deps, calls } = fake(() => json(day(6)));
    for (const [date, hour] of [["1999-02-30", 6], ["yesterday", 6], ["1999-12-31&x=1", 6], ["1999-12-31", 24], ["1999-12-31", -1], ["1999-12-31", 1.5]] as const) await expect(archive(1, 2, date, hour, deps), `${date} ${hour}`).rejects.toThrow("weather_unavailable");
    expect(calls).toHaveLength(0);
  });
});

describe("geocode", () => {
  const answer = { results: Array.from({ length: 8 }, (_, i) => ({ name: `Paris ${i}`, latitude: 48.85341 + i, longitude: 2.3488, country: "France", admin1: "Île-de-France", timezone: "Europe/Paris", population: 2000000 })) };

  it("searches by a trimmed, encoded name of at most 60 characters, and returns at most five rounded Places", async () => {
    const { deps, calls } = fake(() => json(answer));
    const got = await geocode("  Paris & Co/ 100% ", deps);
    expect(calls[0]?.url).toBe(`${PUBLIC_HOSTS.geocoding}/v1/search?name=Paris%20%26%20Co%2F%20100%25&count=5&language=en&format=json`);
    expect(got).toHaveLength(5);
    expect(got[0]).toEqual({ lat: 48.85, lon: 2.35, tz: "Europe/Paris", label: "Paris 0, Île-de-France, France" });
    expect(JSON.stringify(got)).not.toMatch(/population|2000000|\.853|\.3488/);
  });

  it("cuts a long name at 60 characters and strips control characters", async () => {
    const { deps, calls } = fake(() => json(answer));
    await geocode(`${"a".repeat(100)}`, deps);
    expect(decodeURIComponent((calls[0]?.url.match(/name=([^&]*)/) ?? [])[1] ?? "")).toBe("a".repeat(QUERY_MAX));
    await geocode("Pa\u0000r\nis\t\u007f", deps);
    expect(decodeURIComponent((calls[1]?.url.match(/name=([^&]*)/) ?? [])[1] ?? "")).toBe("Pa r is");
    expect(calls[1]?.url).not.toMatch(/%00|%0A|%09|%7F/i);
  });

  it("asks nothing for an empty name, and finds nothing", async () => {
    const { deps, calls } = fake(() => json(answer));
    for (const q of ["", "   ", "\n\t", 5 as unknown as string]) expect(await geocode(q, deps)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("no result is an empty list, and a failure is weather_unavailable", async () => {
    expect(await geocode("Nowhereville", fake(() => json({ generationtime_ms: 0.2 })).deps)).toEqual([]);
    await expect(geocode("Paris", fake(() => json({}, 503)).deps)).rejects.toThrow("weather_unavailable");
    await expect(geocode("Paris", fake(() => json("nonsense")).deps)).rejects.toThrow("weather_unavailable");
  });
});

describe("weatherFetcher", () => {
  it("sends a forecast request to the forecast and an archive request to the archive, and nothing else", async () => {
    const { deps, calls } = fake((url) => json(url.includes("/archive") ? day(12) : FORECAST));
    const fetchWeather = weatherFetcher(deps);
    expect(await fetchWeather({ kind: "forecast", lat: 1, lon: 2 })).toMatchObject({ code: 61 });
    expect(await fetchWeather({ kind: "archive", lat: 1, lon: 2, date: "1999-12-31", hour: 12 })).toMatchObject({ code: 71 });
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["api.open-meteo.com", "archive-api.open-meteo.com"]);
  });
});
