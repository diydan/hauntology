import * as fc from "fast-check";
import { SCREEN_IDS, type FlowState, type Route, type ScreenId } from "./types";

/** An opaque world id: 22 to 43 URL-safe characters (at least 128 bits, as in world-pipeline 9.2). */
export const worldIdArb: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9_-]{22,43}$/);

const WITH_WORLD_ID: readonly ScreenId[] = ["haunt", "play", "end"];
const WITHOUT_WORLD_ID = SCREEN_IDS.filter((s) => !WITH_WORLD_ID.includes(s));

/** Any route the shell can hold: `haunt`, `play` and `end` carry a world id, the rest do not. */
export const routeArb: fc.Arbitrary<Route> = fc.oneof(
  fc.constantFrom(...WITHOUT_WORLD_ID).map((screen): Route => ({ screen })),
  fc.tuple(fc.constantFrom(...WITH_WORLD_ID), worldIdArb).map(([screen, worldId]): Route => ({ screen, worldId })),
);

const segment: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("", "gallery", "create", "confirm", "haunt", "play", "end", "api", "index.html", "..", ".", "%2e%2e"),
  fc.string({ maxLength: 12 }),
  worldIdArb,
);

const suffix: fc.Arbitrary<string> = fc.constantFrom("", "", "", "/", "?x=1", "#top", "/?a=b#c");

/** Paths shaped like the real route table, so valid routes are reached often and not only by luck. */
const wellFormedPath: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("/", "/gallery", "/create", "/confirm"),
  fc.tuple(fc.constantFrom("haunt", "play", "end"), worldIdArb, suffix).map(([screen, id, s]) => `/${screen}/${id}${s}`),
);

/** Strings to throw at `resolveRoute`: real paths, near misses, junk, and text that is not a path at all. */
export const anyPathArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: wellFormedPath },
  { weight: 5, arbitrary: fc.tuple(fc.array(segment, { maxLength: 4 }), suffix).map(([parts, s]) => `/${parts.join("/")}${s}`) },
  { weight: 2, arbitrary: fc.webPath() },
  { weight: 1, arbitrary: fc.string() },
);

/** Any flow state. Not filtered for consistency: guards must hold for impossible states too. */
export const flowStateArb: fc.Arbitrary<FlowState> = fc.record(
  {
    pickedImageId: fc.stringMatching(/^[A-Za-z0-9_-]{8,32}$/),
    worldId: worldIdArb,
    ghostReady: fc.boolean(),
    noticeAcked: fc.boolean(),
    playEnded: fc.boolean(),
  },
  { requiredKeys: ["ghostReady", "noticeAcked", "playEnded"] },
);
