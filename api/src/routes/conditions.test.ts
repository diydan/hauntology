import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Bindings } from "../http/env";
import { createLogger } from "../log";
import { SEARCH_LIMIT_PER_WINDOW } from "./conditions";

const ENV: Bindings = {
  HMAC_SECRET: "a".repeat(32),
  ORIGIN: "https://haunt.test",
  WORLD_GEN_ENABLED: "true",
  PARTY_ENABLED: "true",
  VOICE_ENABLED: "false",
  CREATE_LIVE_ENABLED: "false",
  GHOST_MODEL_ENABLED: "false",
};

async function withSessionCookie(app: ReturnType<typeof createApp>) {
  const res = await app.request("https://haunt.test/api/session", { method: "GET" }, ENV);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("hw_session=");
  return cookie;
}

describe("POST /api/conditions/search (conditions 3.4, 3.5, 3.7)", () => {
  it("requires a valid session cookie and origin, trims queries to 60 chars, caps matches at 5, and logs counter telemetry only", async () => {
    const entries: string[] = [];
    const seenQueries: string[] = [];
    const app = createApp({
      log: createLogger((line) => entries.push(line)),
      conditionsSearch: {
        enabled: true,
        search: async (q) => {
          seenQueries.push(q);
          return Array.from({ length: 7 }, (_, i) => ({
            lat: 49.61,
            lon: 6.13,
            tz: "Europe/Luxembourg",
            label: `${q}-${i}`,
          }));
        },
      },
    });

    // Cross-site origin is refused (403) and missing session cookie is refused (401)
    const badOrigin = await app.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Luxembourg" }),
      },
      ENV,
    );
    expect(badOrigin.status).toBe(403);

    const unauth = await app.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://haunt.test", "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Luxembourg" }),
      },
      ENV,
    );
    expect(unauth.status).toBe(401);

    const cookie = await withSessionCookie(app);
    const longQuery = `  ${"x".repeat(80)}  `;
    const ok = await app.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://haunt.test", Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ q: longQuery }),
      },
      ENV,
    );
    expect(ok.status).toBe(200);
    expect(seenQueries).toEqual(["x".repeat(60)]);
    const body = (await ok.json()) as unknown[];
    expect(body).toHaveLength(5);

    // Logs carry only conditions.geocode outcome & count, never the query string
    const serialized = entries.join("\n");
    expect(serialized).toContain("conditions.geocode");
    expect(serialized).not.toContain("xxxx");
  });

  it("answers conditions_disabled when off, geocode_unavailable on failure, and rate_limited past the cap", async () => {
    const entries: string[] = [];
    const log = createLogger((line) => entries.push(line));
    const disabledApp = createApp({
      log,
      conditionsSearch: { enabled: false, search: async () => [] },
    });
    const c1 = await withSessionCookie(disabledApp);
    const offRes = await disabledApp.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://haunt.test", Cookie: c1, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Lisbon" }),
      },
      ENV,
    );
    expect(offRes.status).toBe(503);
    expect(await offRes.json()).toEqual({ ok: false, code: "conditions_disabled" });

    const failingApp = createApp({
      log,
      conditionsSearch: {
        enabled: true,
        search: async () => { throw new Error("weather_unavailable"); },
      },
    });
    const c2 = await withSessionCookie(failingApp);
    const failRes = await failingApp.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://haunt.test", Cookie: c2, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Lisbon" }),
      },
      ENV,
    );
    expect(failRes.status).toBe(503);
    expect(await failRes.json()).toEqual({ ok: false, code: "geocode_unavailable" });

    const limApp = createApp({
      now: () => 1_000_000,
      conditionsSearch: { enabled: true, search: async () => [] },
    });
    const c3 = await withSessionCookie(limApp);
    for (let i = 0; i < SEARCH_LIMIT_PER_WINDOW; i++) {
      const r = await limApp.request(
        "https://haunt.test/api/conditions/search",
        {
          method: "POST",
          headers: { Origin: "https://haunt.test", Cookie: c3, "Content-Type": "application/json" },
          body: JSON.stringify({ q: "Kyoto" }),
        },
        ENV,
      );
      expect(r.status).toBe(200);
    }
    const capped = await limApp.request(
      "https://haunt.test/api/conditions/search",
      {
        method: "POST",
        headers: { Origin: "https://haunt.test", Cookie: c3, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "Kyoto" }),
      },
      ENV,
    );
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ ok: false, code: "rate_limited" });
  });
});
