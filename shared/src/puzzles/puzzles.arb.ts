import * as fc from "fast-check";
import { HAPTIC_NAMES } from "./haptics";
import { makeLock } from "./make";
import { RECIPES, type SoundName } from "./sound";
import { KINDS, LEVELS, type Kind, type Level, type Lock } from "./types";
import type { Tilt } from "./motion";

export const seedArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 4_294_967_295 });
export const kindArb: fc.Arbitrary<Kind> = fc.constantFrom<Kind>(...KINDS);
export const levelArb: fc.Arbitrary<Level> = fc.constantFrom<Level>(...LEVELS);
export const lockArb: fc.Arbitrary<Lock> = fc.tuple(kindArb, levelArb, seedArb).map(([k, l, s]) => makeLock(k, l, s));

/** Numbers a sensor can hand over: ordinary, huge, and the ones that are not numbers at all. */
export const weirdNumberArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: -720, max: 720, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300, 0, -0) },
);
export const rawOrientationArb: fc.Arbitrary<{ beta: number; gamma: number }> = fc.record({ beta: weirdNumberArb, gamma: weirdNumberArb });
export const tiltArb: fc.Arbitrary<Tilt> = fc.record({ x: weirdNumberArb, y: weirdNumberArb });
export const finiteTiltArb: fc.Arbitrary<Tilt> = fc.record({ x: fc.double({ min: -90, max: 90, noNaN: true }), y: fc.double({ min: -90, max: 90, noNaN: true }) });
export const screenAngleArb: fc.Arbitrary<number> = fc.oneof(fc.constantFrom(0, 90, 180, 270, -90, 360), weirdNumberArb);

/** Things that are not a Transcript: anything at all, plus the near misses. */
export const junkArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.anything() },
  { weight: 1, arbitrary: fc.constantFrom<unknown>(null, undefined, 0, "", "x", [], {}, { kind: "clock" }, { kind: "clock", elapsedMs: Number.NaN, h: 1, m: 5 }, { kind: "wires", pairs: "no", elapsedMs: 9999 }, { kind: "lockpick", sets: [null], elapsedMs: 9999 }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constantFrom("lockpick", "wires", "clock", "safe"), elapsedMs: weirdNumberArb, h: weirdNumberArb, m: weirdNumberArb, pairs: fc.array(fc.tuple(weirdNumberArb, weirdNumberArb), { maxLength: 80 }), sets: fc.array(fc.anything(), { maxLength: 80 }) }) },
);

export const hapticEventsArb = fc.array(
  fc.record({ t: fc.integer({ min: 0, max: 12_000 }), name: fc.constantFrom(...HAPTIC_NAMES) }),
  { maxLength: 80 },
);
const SOUND_NAMES = Object.keys(RECIPES) as SoundName[];
/** Sounds spread over three seconds, or a burst of the long ones inside 100 ms (the case that can pass four voices). */
export const soundEventsArb = fc.oneof(
  fc.array(fc.record({ t: fc.integer({ min: 0, max: 3000 }), name: fc.constantFrom(...SOUND_NAMES) }), { maxLength: 40 }),
  fc.array(fc.record({ t: fc.integer({ min: 0, max: 100 }), name: fc.constantFrom<SoundName>("note0", "note1", "note2", "note3", "note4", "creak", "gutter", "thunk") }), { minLength: 5, maxLength: 14 }),
);

/** Loudness samples in time order, with the odd NaN and gaps. */
export const loudnessArb: fc.Arbitrary<Array<{ t: number; level: number }>> = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 60 }), fc.oneof({ weight: 8, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) }, { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY) })), { maxLength: 80 })
  .map((steps) => { let t = 0; return steps.map(([dt, level]) => { t += dt * 4; return { t, level }; }); });
