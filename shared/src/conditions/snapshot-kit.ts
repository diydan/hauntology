import { CACHE_TTL_MS, isFresh, type ConditionsCache, type RawWeather, type ReadDeps, type ReadNote, type WeatherRequest } from "./snapshot";

/**
 * Fakes for the tests of the conditions snapshot (and of the code that starts a game from it): a clock you move, a timer you run by hand, a cache that counts, and a
 * weather call that is good, slow, failing or malformed. Nothing here touches a network, and nothing outside tests imports it.
 */

export const RAIN: RawWeather = { code: 61, tempC: 8, windKmh: 20, tz: "Europe/London" };
export const CLEAR: RawWeather = { code: 0, tempC: 15, windKmh: 3, tz: "Europe/London" };

export class FakeClock {
  constructor(public t: number) {}
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

/** A timer on a clock of its own: nothing fires until `flush`, which fires them in order of time, with the real event loop turning between each. */
export class FakeTimers {
  private readonly pending: { at: number; fire: () => void }[] = [];
  private time = 0;
  schedule(delay: number, fire: () => void): void {
    this.pending.push({ at: this.time + delay, fire });
  }
  sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => this.schedule(ms, resolve));
  async flush(): Promise<void> {
    for (let guard = 0; guard < 100; guard++) {
      await new Promise<void>((r) => setTimeout(r, 0)); // let every promise that is ready run, so both timers of a read are in place
      if (this.pending.length === 0) return;
      this.pending.sort((a, b) => a.at - b.at);
      const next = this.pending.shift()!;
      this.time = Math.max(this.time, next.at);
      next.fire();
    }
  }
}

/** A cache that counts, keeps answers for the time `put` is given (on the injected clock) and can be told to fail. */
export class FakeCache implements ConditionsCache {
  readonly store = new Map<string, { at: number; value: RawWeather; ttlMs: number }>();
  gets = 0;
  puts = 0;
  failGet = false;
  failPut = false;
  constructor(private readonly clock: { now(): number }) {}
  async get(key: string): Promise<RawWeather | null> {
    this.gets += 1;
    if (this.failGet) throw new Error("cache down");
    const e = this.store.get(key);
    return e !== undefined && isFresh(e.at, this.clock.now(), e.ttlMs) ? e.value : null;
  }
  async put(key: string, value: RawWeather, ttlSeconds: number): Promise<void> {
    this.puts += 1;
    if (this.failPut) throw new Error("cache down");
    this.store.set(key, { at: this.clock.now(), value, ttlMs: ttlSeconds * 1000 });
  }
}

export type Behaviour = { kind: "ok"; value: unknown; latencyMs?: number } | { kind: "reject" } | { kind: "throw" } | { kind: "never" };

/** The whole set of injected parts of a read. `requests` is every weather call made, in order. */
export function makeDeps(opts: { clock?: FakeClock; enabled?: boolean; behaviour?: Behaviour } = {}) {
  const clock = opts.clock ?? new FakeClock(Date.UTC(2024, 5, 21, 22, 30)); // 21 June 2024, 22:30 UTC
  const timers = new FakeTimers();
  const cache = new FakeCache(clock);
  const requests: WeatherRequest[] = [];
  const notes: ReadNote[] = [];
  const state = { behaviour: opts.behaviour ?? ({ kind: "ok", value: RAIN } as Behaviour) };
  const deps: ReadDeps = {
    now: clock.now,
    enabled: opts.enabled ?? true,
    cache,
    sleep: timers.sleep,
    note: (n) => void notes.push(n),
    fetchWeather: (request) => {
      requests.push(request);
      const b = state.behaviour;
      if (b.kind === "throw") throw new Error("sync failure");
      if (b.kind === "reject") return Promise.reject(new Error("upstream down"));
      if (b.kind === "never") return new Promise<RawWeather>(() => {});
      return new Promise<RawWeather>((resolve) => timers.schedule(b.latencyMs ?? 50, () => resolve(b.value as RawWeather)));
    },
  };
  return { deps, clock, timers, cache, requests, notes, state };
}

export { CACHE_TTL_MS };
