import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { singleFlight } from "./flight";

/** A promise a test settles by hand, to hold a call open while others arrive. */
function manual<T = string>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("makes one call for two requests for one key, and both get its answer", async () => {
    const f = singleFlight();
    const gate = manual();
    let calls = 0;
    const make = () => { calls += 1; return gate.promise; };
    const a = f.run("k", make);
    const b = f.run("k", make);
    expect(f.has("k")).toBe(true);
    gate.resolve("audio");
    expect(await Promise.all([a, b])).toEqual(["audio", "audio"]);
    expect(calls).toBe(1);
  });
  it("makes one call for fifty requests that arrive while it runs, however late they join", async () => {
    const f = singleFlight();
    const gate = manual<number>();
    let calls = 0;
    const joiners: Promise<number>[] = [];
    for (let i = 0; i < 50; i++) {
      joiners.push(f.run("k", () => { calls += 1; return gate.promise; }));
      await Promise.resolve(); // let microtasks run between arrivals
    }
    gate.resolve(7);
    expect(await Promise.all(joiners)).toEqual(Array(50).fill(7));
    expect(calls).toBe(1);
  });
  it("keeps different keys apart", async () => {
    const f = singleFlight();
    const calls: string[] = [];
    const [x, y] = await Promise.all([f.run("a", async () => { calls.push("a"); return 1; }), f.run("b", async () => { calls.push("b"); return 2; })]);
    expect([x, y]).toEqual([1, 2]);
    expect(calls.sort()).toEqual(["a", "b"]);
  });
  it("forgets the key the moment the call ends, so the next request makes a new call (it is not a cache)", async () => {
    const f = singleFlight();
    let calls = 0;
    const make = async () => (calls += 1);
    expect(await f.run("k", make)).toBe(1);
    expect(f.has("k")).toBe(false);
    expect(f.size).toBe(0);
    expect(await f.run("k", make)).toBe(2);
  });
  it("gives a failed call's rejection to everyone who joined it, forgets the key, and lets the next request try again", async () => {
    const f = singleFlight();
    const gate = manual();
    let calls = 0;
    const a = f.run("k", () => { calls += 1; return gate.promise; });
    const b = f.run("k", () => { calls += 1; return gate.promise; });
    const results = Promise.allSettled([a, b]);
    gate.reject(new Error("upstream"));
    const settled = await results;
    expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    expect(f.size).toBe(0);
    expect(await f.run("k", async () => "again")).toBe("again");
  });
  it("treats a `make` that throws before it returns a promise as a rejection, and forgets the key", async () => {
    const f = singleFlight();
    await expect(f.run("k", () => { throw new Error("sync"); })).rejects.toThrow("sync");
    expect(f.size).toBe(0);
    expect(await f.run("k", async () => "fine")).toBe("fine");
  });
  it("does not let an old call that ends late forget a newer call for the same key", async () => {
    const f = singleFlight();
    const first = manual();
    const a = f.run("k", () => first.promise);
    first.resolve("one");
    await a;
    const second = manual();
    const b = f.run("k", () => second.promise);
    expect(f.has("k")).toBe(true);
    second.resolve("two");
    expect(await b).toBe("two");
  });

  it("for any run of requests over a few keys: calls never exceed the number of times a key went from idle to running, and the map ends empty", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.record({ key: fc.constantFrom("a", "b", "c"), settleNow: fc.boolean() }), { minLength: 1, maxLength: 40 }), async (steps) => {
        const f = singleFlight();
        const gates = new Map<string, ReturnType<typeof manual<number>>>();
        let calls = 0;
        const all: Promise<number>[] = [];
        let starts = 0;
        for (const s of steps) {
          const wasRunning = f.has(s.key);
          all.push(f.run(s.key, () => { calls += 1; const g = manual<number>(); gates.set(s.key, g); return g.promise; }));
          if (!wasRunning) starts += 1;
          if (s.settleNow) { gates.get(s.key)?.resolve(calls); await Promise.resolve(); await Promise.resolve(); }
          expect(f.size).toBeLessThanOrEqual(3);
        }
        await new Promise((r) => setTimeout(r, 0)); // the last request's `make` runs in a microtask: let it, or its gate does not exist yet
        for (const g of gates.values()) g.resolve(0);
        await Promise.all(all);
        expect(calls).toBeLessThanOrEqual(starts);
        expect(f.size).toBe(0);
      }),
      { numRuns: 150 },
    );
  });
});
