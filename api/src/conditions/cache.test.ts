import { CACHE_TTL_MS, type RawWeather } from "@hauntology/shared/conditions/snapshot";
import { describe, expect, it } from "vitest";
import { CacheApiConditionsCache, MEMORY_CACHE_MAX, MemoryConditionsCache, defaultConditionsCache, type CacheLike } from "./cache";

const RAIN: RawWeather = { code: 61, tempC: 8, windKmh: 20, tz: "Europe/London" };
const clock = (t = 1_000_000) => ({ t, now() { return this.t; } });

/** A Cache API in a variable, keyed by the request address, that ignores `Cache-Control` the way a store that has lost the header would. */
class FakeCacheApi implements CacheLike {
  readonly store = new Map<string, Response>();
  readonly headers: string[] = [];
  readonly urls: string[] = [];
  failMatch = false;
  failPut = false;
  async match(request: string): Promise<Response | undefined> {
    this.urls.push(request);
    if (this.failMatch) throw new Error("cache down");
    const hit = this.store.get(request);
    return hit === undefined ? undefined : hit.clone();
  }
  async put(request: string, response: Response): Promise<void> {
    if (this.failPut) throw new Error("cache down");
    this.headers.push(response.headers.get("Cache-Control") ?? "");
    this.store.set(request, response);
  }
}

describe("CacheApiConditionsCache", () => {
  it("keeps an answer for 15 minutes on the clock it is given, whatever the store does with its own expiry", async () => {
    const c = clock();
    const api = new FakeCacheApi();
    const cache = new CacheApiConditionsCache(api, () => c.now());
    await cache.put("forecast:51.51:-0.13", RAIN, 900);
    expect(await cache.get("forecast:51.51:-0.13")).toEqual(RAIN);
    c.t += CACHE_TTL_MS - 1;
    expect(await cache.get("forecast:51.51:-0.13")).toEqual(RAIN);
    c.t += 1;
    expect(await cache.get("forecast:51.51:-0.13")).toBeNull();
  });

  it("is a miss for a key it has not kept, and keeps each key apart", async () => {
    const api = new FakeCacheApi();
    const cache = new CacheApiConditionsCache(api, () => 5);
    await cache.put("forecast:1.00:2.00", RAIN, 900);
    expect(await cache.get("forecast:1.00:3.00")).toBeNull();
    expect(await cache.get("archive:1.00:2.00:1999-12-31:6")).toBeNull();
  });

  it("asks the store to expire it at 900 seconds, and uses an address made only of the key", async () => {
    const api = new FakeCacheApi();
    const cache = new CacheApiConditionsCache(api, () => 5);
    await cache.put("forecast:1.00:2.00", RAIN, 900);
    expect(api.headers).toEqual(["public, max-age=900"]);
    const [url] = [...api.store.keys()] as [string];
    expect(url).toBe("https://conditions.cache.invalid/forecast%3A1.00%3A2.00");
    expect(new URL(url).search).toBe("");
  });

  it("stores the boiled-down answer and the time and nothing else", async () => {
    const api = new FakeCacheApi();
    await new CacheApiConditionsCache(api, () => 77).put("k", RAIN, 900);
    const body = JSON.parse(await [...api.store.values()][0]!.text()) as unknown;
    expect(body).toEqual({ at: 77, v: RAIN });
  });

  it("any failure of the store, and anything stored that does not fit, is a miss and never an error", async () => {
    const api = new FakeCacheApi();
    const cache = new CacheApiConditionsCache(api, () => 5);
    await cache.put("k", RAIN, 900);
    api.failMatch = true;
    expect(await cache.get("k")).toBeNull();
    api.failMatch = false;
    api.failPut = true;
    await expect(cache.put("k2", RAIN, 900)).resolves.toBeUndefined();
    for (const body of ["not json", "{}", JSON.stringify({ at: "x", v: RAIN }), JSON.stringify({ at: 5, v: { code: "61" } }), JSON.stringify({ at: 6, v: RAIN }), JSON.stringify({ at: 5, v: { ...RAIN, extra: 1 } })]) {
      const bad = new CacheApiConditionsCache({ match: async () => new Response(body), put: async () => {} }, () => 5);
      expect(await bad.get("bad"), body).toBeNull(); // the last two are from the future, or carry a field the game does not use
    }
  });
});

describe("MemoryConditionsCache", () => {
  it("keeps an answer for 15 minutes and not a moment longer, and never longer than that whatever the ttl asked for", async () => {
    const c = clock();
    const cache = new MemoryConditionsCache(() => c.now());
    await cache.put("k", RAIN, 900);
    c.t += CACHE_TTL_MS - 1;
    expect(await cache.get("k")).toEqual(RAIN);
    c.t += 1;
    expect(await cache.get("k")).toBeNull();
    expect(cache.size).toBe(0);
    await cache.put("long", RAIN, 99_999);
    c.t += CACHE_TTL_MS;
    expect(await cache.get("long")).toBeNull();
  });

  it("keeps at most 200 answers, the oldest going first, and a key put again is the newest", async () => {
    const cache = new MemoryConditionsCache(() => 1);
    expect(MEMORY_CACHE_MAX).toBe(200);
    for (let i = 0; i < MEMORY_CACHE_MAX + 5; i++) await cache.put(`k${i}`, RAIN, 900);
    expect(cache.size).toBe(MEMORY_CACHE_MAX);
    expect(await cache.get("k0")).toBeNull();
    expect(await cache.get("k4")).toBeNull();
    expect(await cache.get("k5")).toEqual(RAIN);
    await cache.put("k5", RAIN, 900);
    await cache.put("k-new", RAIN, 900);
    expect(await cache.get("k5")).toEqual(RAIN);
    expect(await cache.get("k6")).toBeNull();
  });
});

describe("defaultConditionsCache", () => {
  it("is a variable where the runtime has no Cache API (the tests, local dev), and the Cache API where it has one", async () => {
    expect(defaultConditionsCache(() => 1)).toBeInstanceOf(MemoryConditionsCache);
    const g = globalThis as { caches?: unknown };
    const before = g.caches;
    try {
      g.caches = { default: new FakeCacheApi() };
      expect(defaultConditionsCache(() => 1)).toBeInstanceOf(CacheApiConditionsCache);
    } finally {
      if (before === undefined) delete g.caches;
      else g.caches = before;
    }
  });
});
