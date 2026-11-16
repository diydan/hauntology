import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { FakeClock, RAIN, makeDeps, type Behaviour } from "./snapshot-kit";
import { CACHE_TTL_MS, cacheKey, readSnapshot } from "./snapshot";
import { weatherRequestFor } from "./memory-day";
import { normalizePlace } from "./place";
import { ConditionsSnapshotSchema, type ConditionsChoice } from "./types";

/** 100 games of up to a dozen steps each, with a fake clock and timers: about 3 to 5 seconds, which is the default limit of 5, so it flaked on a busy machine (one run in three). The work is fixed by the seed, so this is room, not a retry. */
const SLOW_MS = 30_000;

const PLACES = [
  { lat: 51.50735, lon: -0.127758, tz: "Europe/London", label: "London" },
  { lat: 48.8566, lon: 2.3522, tz: "Europe/Paris", label: "Paris" },
  { lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney", label: "Sydney" },
];
const DAYS = [undefined, undefined, { date: "1999-12-31", timeOfDay: "dusk" as const }, { date: "2012-06-30", timeOfDay: "dawn" as const }];

const choiceArb = fc.record({ p: fc.integer({ min: 0, max: PLACES.length - 1 }), d: fc.integer({ min: 0, max: DAYS.length - 1 }), hostHour: fc.integer({ min: 0, max: 23 }) }).map(({ p, d, hostHour }): ConditionsChoice => ({ place: PLACES[p]!, ...(DAYS[d] === undefined ? {} : { memoryDay: DAYS[d] }), hostHour }));
const stepArb = fc.record({ choice: choiceArb, waitMs: fc.oneof(fc.integer({ min: 0, max: 60_000 }), fc.integer({ min: 0, max: 2 * CACHE_TTL_MS }), fc.constantFrom(CACHE_TTL_MS - 1, CACHE_TTL_MS, CACHE_TTL_MS + 1)) });

const keyOf = (c: ConditionsChoice): string => {
  const place = normalizePlace(c.place);
  if (!place.ok) throw new Error("test place");
  return cacheKey(weatherRequestFor(place.place, c.memoryDay));
};

async function readWith(kit: ReturnType<typeof makeDeps>, choice: ConditionsChoice) {
  const p = readSnapshot(choice, kit.deps);
  await kit.timers.flush();
  return p;
}

/**
 * Property 4: One frozen snapshot per game, one call, cached 15 minutes.
 * Validates: Requirements 2.1, 2.5.
 */
describe("Property 4: one frozen snapshot per game, one call, cached 15 minutes", () => {
  it("each game makes at most one weather call; a repeat of the same request within 15 minutes makes none; one 15 minutes or more later is allowed; every snapshot is deeply frozen", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { minLength: 1, maxLength: 12 }), async (steps) => {
        const kit = makeDeps();
        const storedAt = new Map<string, number>(); // the model: when each request's answer was kept
        for (const step of steps) {
          kit.clock.advance(step.waitMs);
          const key = keyOf(step.choice);
          const at = storedAt.get(key);
          const mayBeCached = at !== undefined && kit.clock.now() >= at && kit.clock.now() - at < CACHE_TTL_MS;
          const before = kit.requests.length;
          const snapshot = await readWith(kit, step.choice);
          const made = kit.requests.length - before;
          expect(made).toBeLessThanOrEqual(1);
          expect(made).toBe(mayBeCached ? 0 : 1);
          if (made === 1) storedAt.set(key, kit.clock.now());
          expect(Object.isFrozen(snapshot)).toBe(true);
          expect(Object.isFrozen(snapshot.place)).toBe(true);
          expect(ConditionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
          expect(snapshot.source).toBe(step.choice.memoryDay === undefined ? "live" : "memory");
        }
        return true;
      }),
      propParams(),
    );
  }, SLOW_MS);
});

type Failure = Behaviour | "disabled" | "no_place";
const failureArb: fc.Arbitrary<Failure> = fc.oneof(
  fc.constant<Failure>({ kind: "reject" }),
  fc.constant<Failure>({ kind: "throw" }),
  fc.constant<Failure>({ kind: "never" }),
  fc.integer({ min: 3000, max: 60_000 }).map((latencyMs): Failure => ({ kind: "ok", value: RAIN, latencyMs })),
  fc.constantFrom<unknown>(null, undefined, "x", 3, [], {}, { code: null, tempC: null, windKmh: null, tz: null }, { code: "61" }, { ...RAIN, host: "api.open-meteo.com" }, { code: NaN, tempC: 1, windKmh: 1, tz: null }).map((value): Failure => ({ kind: "ok", value })),
  fc.constant<Failure>("disabled"),
  fc.constant<Failure>("no_place"),
);

/**
 * Property 5: A timeout or failure falls back to the default.
 * Validates: Requirements 2.4.
 */
describe("Property 5: a timeout or failure falls back to the default", () => {
  it("whatever fails (a rejection, a late answer, a null code, a malformed answer), with conditions off, or with no Place, the snapshot is valid, clear, mild and calm, with no call when off or with no Place and at most one otherwise, and it never rejects", async () => {
    await fc.assert(
      fc.asyncProperty(failureArb, choiceArb, async (failure, choice) => {
        const kit = makeDeps({ enabled: failure !== "disabled", behaviour: typeof failure === "string" ? { kind: "ok", value: RAIN } : failure });
        const asked: ConditionsChoice = failure === "no_place" ? { hostHour: choice.hostHour } : choice;
        const snapshot = await readWith(kit, asked); // an await that rejects would fail the property
        expect(ConditionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
        expect([snapshot.weather, snapshot.tempBand, snapshot.windBand, snapshot.source]).toEqual(["clear", "mild", "calm", "default"]);
        if (failure === "disabled" || failure === "no_place") expect(kit.requests).toHaveLength(0);
        else expect(kit.requests).toHaveLength(1);
        if (failure === "disabled") expect(snapshot.place).toBeUndefined();
        return true;
      }),
      propParams(),
    );
  }, SLOW_MS);

  it("with no Place and conditions on or off, the Time of Day depends only on the host's hour", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 23 }), fc.boolean(), fc.integer({ min: 0, max: 4e12 }), async (hostHour, enabled, t) => {
        const a = await readWith(makeDeps({ enabled, clock: new FakeClock(t) }), { hostHour });
        const want = hostHour >= 5 && hostHour <= 7 ? "dawn" : hostHour >= 8 && hostHour <= 17 ? "day" : hostHour >= 18 && hostHour <= 20 ? "dusk" : "night";
        return a.timeOfDay === want && a.weather === "clear" && a.place === undefined;
      }),
      propParams(),
    );
  }, SLOW_MS);
});
