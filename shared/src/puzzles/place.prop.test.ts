import * as fc from "fast-check";
import { describe, it } from "vitest";
import { propParams } from "../app/prop-config";
import { kindForDiscovery, placePuzzles } from "./place";
import { seedArb } from "./puzzles.arb";
import { BUILT_KINDS, MEMORY_KINDS, type BuiltKind } from "./types";

/** Distinct Zone names and an enabled set big enough to use each Kind at most twice. */
const placementArb = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 2, maxLength: 6 })
  .chain((zones) =>
    fc.tuple(fc.constant(zones), fc.subarray<BuiltKind>([...BUILT_KINDS], { minLength: Math.ceil(zones.length / 2), maxLength: BUILT_KINDS.length })),
  );
const settingArb = fc.constantFrom("easy" as const, "normal" as const);

describe("Property 5: Locks are placed one per Zone with a valid Sight source", () => {
  // Feature: puzzles, Property 5: Locks are placed one per Zone with a valid Sight source
  // Validates: Requirements 1.5, 2.4
  it("puts one Lock in every Zone, no Kind more than twice, and every Sight in a Zone of its own", () => {
    fc.assert(
      fc.property(seedArb, placementArb, settingArb, (seed, [zones, enabled], setting) => {
        const res = placePuzzles(seed, zones, setting, enabled);
        if (!res.ok) return false;
        const locks = res.value;
        if (locks.length !== zones.length) return false;
        if (!locks.every((l, i) => l.zone === zones[i] && l.level === setting && enabled.includes(l.kind))) return false;
        const count = new Map<string, number>();
        for (const l of locks) count.set(l.kind, (count.get(l.kind) ?? 0) + 1);
        if ([...count.values()].some((c) => c > 2)) return false;
        const sights = locks.flatMap((l) => (l.sightZone === null ? [] : [l.sightZone]));
        if (new Set(sights).size !== sights.length) return false; // at most one Sight in any Zone
        for (const l of locks) {
          const memory = MEMORY_KINDS.includes(l.kind);
          if (memory && (l.sightZone === null || l.sightZone === l.zone || !zones.includes(l.sightZone))) return false;
          if (!memory && l.sightZone !== null) return false;
        }
        if (new Set(locks.map((l) => l.lockId)).size !== locks.length) return false;
        const again = placePuzzles(seed, zones, setting, enabled); // deterministic
        return again.ok && JSON.stringify(again.value) === JSON.stringify(locks);
      }),
      propParams(),
    );
  });

  it("never makes the first discovery a Memory Kind", () => {
    fc.assert(
      fc.property(seedArb, fc.subarray<BuiltKind>([...BUILT_KINDS]), (seed, enabled) => {
        const first = kindForDiscovery(seed, 0, enabled);
        if (first === null) return enabled.every((k) => MEMORY_KINDS.includes(k));
        return !MEMORY_KINDS.includes(first) && enabled.includes(first);
      }),
      propParams(),
    );
  });
});
