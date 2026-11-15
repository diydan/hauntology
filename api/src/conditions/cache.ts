import { CACHE_TTL_MS, RawWeatherSchema, isFresh, type ConditionsCache, type RawWeather } from "@hauntology/shared/conditions/snapshot";

/**
 * `ConditionsCache` (conditions 3.2, Requirement 2.5): a weather answer is kept for 15 minutes by rounded Place, so a rematch or a second game at the same table is
 * answered with no outside call. Two kinds: over the Workers Cache API (`caches.default`), and over a variable (for tests, a Worker without the Cache API, and local
 * dev). The Cache API is not available on every kind of address (it does nothing on a `workers.dev` one); there it simply never answers, which only means more calls,
 * and Spike conditions 1.1 decides whether KV is needed instead. A key is only a request key made of rounded numbers and a date: no session, no label. Every failure of
 * a cache is a miss and never an error. The stored value carries its own time, so the 15 minutes hold whatever the store does with its own expiry.
 */

/** The part of a Cache API cache this reads and writes. */
export interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

const KEY_HOST = "https://conditions.cache.invalid/";

export class CacheApiConditionsCache implements ConditionsCache {
  constructor(private readonly cache: CacheLike, private readonly now: () => number) {}

  async get(key: string): Promise<RawWeather | null> {
    try {
      const hit = await this.cache.match(KEY_HOST + encodeURIComponent(key));
      if (hit === undefined) return null;
      const stored = JSON.parse(await hit.text()) as { at?: unknown; v?: unknown };
      const value = RawWeatherSchema.safeParse(stored.v);
      return typeof stored.at === "number" && isFresh(stored.at, this.now()) && value.success ? value.data : null;
    } catch {
      return null;
    }
  }

  async put(key: string, value: RawWeather, ttlSeconds: number): Promise<void> {
    try {
      await this.cache.put(KEY_HOST + encodeURIComponent(key), new Response(JSON.stringify({ at: this.now(), v: value }), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.max(1, Math.floor(ttlSeconds))}` } }));
    } catch {
      // an answer that cannot be kept is simply not kept
    }
  }
}

/** The most answers kept in a variable: the oldest goes first. */
export const MEMORY_CACHE_MAX = 200;

export class MemoryConditionsCache implements ConditionsCache {
  private readonly entries = new Map<string, { at: number; ttlMs: number; value: RawWeather }>();
  constructor(private readonly now: () => number) {}

  async get(key: string): Promise<RawWeather | null> {
    const e = this.entries.get(key);
    if (e === undefined) return null;
    if (!isFresh(e.at, this.now(), e.ttlMs)) {
      this.entries.delete(key);
      return null;
    }
    return e.value;
  }

  async put(key: string, value: RawWeather, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), ttlMs: Math.min(ttlSeconds * 1000, CACHE_TTL_MS), value });
    while (this.entries.size > MEMORY_CACHE_MAX) this.entries.delete(this.entries.keys().next().value as string);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** `caches.default` where the Worker has it, else a variable. */
export function defaultConditionsCache(now: () => number): ConditionsCache {
  const caches = (globalThis as { caches?: { default?: CacheLike } }).caches;
  return caches?.default !== undefined ? new CacheApiConditionsCache(caches.default, now) : new MemoryConditionsCache(now);
}
