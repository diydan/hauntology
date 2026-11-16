/**
 * Single flight (ghost-voice 3.12): while a call for a key is running, every other request for the same key waits for it and gets its answer, so two
 * requests for one line make one upstream call. Pure and in memory: the map lives as long as the object, which the caller keeps for as long as it wants
 * calls shared (the Worker keeps one per isolate).
 *
 * A flight is not a cache. When the call ends, successfully or not, the key is forgotten at once, so the next request makes a new call (and finds the
 * result in the speech cache if it was kept). A call that fails fails for everyone who joined it, and the next request tries again.
 */
export interface SingleFlight {
  /** Runs `make` unless a call for `key` is already running, and then waits for that one. `make` is called at most once at a time per key. */
  run<T>(key: string, make: () => Promise<T>): Promise<T>;
  /** Whether a call for `key` is running now. */
  has(key: string): boolean;
  /** How many keys have a call running now. */
  readonly size: number;
}

export function singleFlight(): SingleFlight {
  const running = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, make: () => Promise<T>): Promise<T> {
      const joined = running.get(key);
      if (joined !== undefined) return joined as Promise<T>;
      // `make` may throw before it returns a promise: that is a rejection, like any other.
      const flight: Promise<T> = Promise.resolve().then(make).finally(() => {
        if (running.get(key) === flight) running.delete(key);
      });
      running.set(key, flight);
      return flight;
    },
    has: (key) => running.has(key),
    get size() {
      return running.size;
    },
  };
}
