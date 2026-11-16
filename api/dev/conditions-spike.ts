/**
 * A LOCAL-ONLY Worker for conditions Spike 1.1 (docs/spikes/conditions-1.1.md): it runs the REAL `api/src/conditions/open-meteo.ts` against the real Open-Meteo, on the local
 * Worker runtime, and records what came back (status, time, size, the raw answer) so the answers can be saved as fixtures and the parsers checked against them.
 * It is not deployed (`wrangler.conditions.jsonc` is its own config). About 25 free calls with made-up queries (two capital cities and fixed dates): nothing about a visitor,
 * no key, no spend. It names no weather host: every address is built by the real module, and the two extra calls reuse the origin the module used.
 */
import { archive, forecast, geocode, type WeatherFetch, type WeatherResponse } from "../src/conditions/open-meteo";

type Call = { url: string; status: number; ms: number; bytes: number; headers: Record<string, string>; body: unknown };

const KEEP = /^(x-|retry-after|ratelimit|content-type|content-encoding|cache-control|age|server|cf-)/i;

function recorder(calls: Call[]): WeatherFetch {
  return async (url, init): Promise<WeatherResponse> => {
    const t0 = Date.now();
    const res = await fetch(url, init);
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (KEEP.test(k)) headers[k] = v; });
    let body: unknown = text.slice(0, 400);
    try { body = JSON.parse(text); } catch { /* keep the text */ }
    calls.push({ url, status: res.status, ms: Date.now() - t0, bytes: text.length, headers, body });
    return { ok: res.ok, status: res.status, text: async () => text };
  };
}

const deps = (calls: Call[]) => ({ fetch: recorder(calls), base: null });
const lastBody = (calls: Call[]): Record<string, unknown> => (calls[calls.length - 1]?.body ?? {}) as Record<string, unknown>;
const day = (offset: number): string => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const quantile = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] as number;

async function step(name: string, work: (calls: Call[]) => Promise<unknown>): Promise<unknown> {
  const calls: Call[] = [];
  try {
    return { step: name, ok: true, parsed: await work(calls), calls };
  } catch (e) {
    return { step: name, ok: false, error: e instanceof Error ? e.message : String(e), calls };
  }
}

export default {
  async fetch(request: Request, env: { RUN_TOKEN?: string }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/run") return new Response("not found", { status: 404 });
    if (env.RUN_TOKEN !== undefined && request.headers.get("x-spike-token") !== env.RUN_TOKEN) return new Response("forbidden", { status: 403 });
    const steps: unknown[] = [];
    let paris: { lat: number; lon: number } | null = null;
    let reykjavik: { lat: number; lon: number } | null = null;

    steps.push(await step("geocode Paris", async (c) => { const r = await geocode("Paris", deps(c)); paris = r[0] ?? null; return r; }));
    steps.push(await step("geocode Reykjavik", async (c) => { const r = await geocode("Reykjavik", deps(c)); reykjavik = r[0] ?? null; return r; }));
    steps.push(await step("geocode a name with no match", (c) => geocode("zzzzqqqqxx", deps(c))));
    const p = paris as { lat: number; lon: number } | null;
    const k = reykjavik as { lat: number; lon: number } | null;
    if (p === null || k === null) return Response.json({ steps, stopped: "geocoding found no city" });

    steps.push(await step("forecast Paris", (c) => forecast(p.lat, p.lon, deps(c))));
    steps.push(await step("forecast Reykjavik", (c) => forecast(k.lat, k.lon, deps(c))));

    const latency: number[] = [];
    steps.push(await step("forecast latency x6", async (c) => {
      for (let i = 0; i < 6; i += 1) { await forecast(p.lat, p.lon, deps(c)); latency.push(c[c.length - 1]!.ms); await new Promise((r) => setTimeout(r, 300)); }
      return { ms: latency, p50: quantile(latency, 0.5), p95: quantile(latency, 0.95), max: Math.max(...latency) };
    }));

    steps.push(await step("archive Paris 1999-12-31 22h", (c) => archive(p.lat, p.lon, "1999-12-31", 22, deps(c))));
    steps.push(await step("archive Paris 1940-01-01 12h (the oldest the game allows)", (c) => archive(p.lat, p.lon, "1940-01-01", 12, deps(c))));
    steps.push(await step("archive Paris 1939-12-31 12h (before 1940)", (c) => archive(p.lat, p.lon, "1939-12-31", 12, deps(c))));
    steps.push(await step("archive Paris today (a day with no data yet)", (c) => archive(p.lat, p.lon, day(0), 12, deps(c))));
    for (const back of [1, 2, 3, 5, 7]) {
      steps.push(await step(`archive Paris ${back} days ago 12h`, async (c) => {
        const r = await archive(p.lat, p.lon, day(back), 12, deps(c));
        const h = (lastBody(c).hourly ?? {}) as { weather_code?: Array<number | null> };
        return { parsed: r, hourlyCodesNull: (h.weather_code ?? []).filter((x) => x === null).length, hours: (h.weather_code ?? []).length };
      }));
    }

    // Two extra raw calls that reuse the origin the module used for the forecast: sunrise and sunset, and one refused request (a position off the globe).
    const firstForecast = (steps[3] as { calls: Call[] }).calls[0];
    if (firstForecast !== undefined) {
      const origin = new URL(firstForecast.url).origin;
      steps.push(await step("raw: sunrise and sunset in the forecast", async (c) => {
        await recorder(c)(`${origin}/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=sunrise,sunset&timezone=auto&forecast_days=1`, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
        return lastBody(c);
      }));
      steps.push(await step("raw: a position off the globe", async (c) => {
        await recorder(c)(`${origin}/v1/forecast?latitude=999&longitude=0&current=weather_code&timezone=auto`, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
        return lastBody(c);
      }));
    }
    return Response.json({ ranAt: new Date().toISOString(), latency, steps });
  },
};
