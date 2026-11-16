import * as fc from "fast-check";
import { VIEWER_RUNGS, type PlayEvent } from "./types";

export const playEventArb: fc.Arbitrary<PlayEvent> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<PlayEvent>({ t: "ack_notice" }) },
  { weight: 3, arbitrary: fc.constant<PlayEvent>({ t: "open_chat" }) },
  { weight: 3, arbitrary: fc.constant<PlayEvent>({ t: "close_chat" }) },
  { weight: 1, arbitrary: fc.constant<PlayEvent>({ t: "exit" }) },
  { weight: 1, arbitrary: fc.constantFrom<("home" | "gallery")[]>("home", "gallery").map((to): PlayEvent => ({ t: "exit", to })) },
  {
    weight: 3,
    arbitrary: fc.record({
      t: fc.constant("view" as const),
      found: fc.integer({ min: 0, max: 3 }),
      // `ended` is not tied to `found`: the reducer must hold for any server answer.
      ended: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("viewer_degraded" as const), rung: fc.constantFrom(...VIEWER_RUNGS) }) },
);

const randomEvents: fc.Arbitrary<PlayEvent[]> = fc.array(playEventArb, { maxLength: 30 });

/**
 * Random events around a fixed story: the notice is acknowledged, the Chat opens, the game ends
 * with the Chat still open, and then the Chat is closed and opened again. Pure random sequences
 * rarely reach the end with the Chat open.
 */
const aroundTheEnd: fc.Arbitrary<PlayEvent[]> = fc
  .tuple(fc.array(playEventArb, { maxLength: 6 }), fc.array(playEventArb, { maxLength: 4 }), fc.array(playEventArb, { maxLength: 6 }))
  .map(([before, between, after]): PlayEvent[] => [
    ...before,
    { t: "ack_notice" }, { t: "open_chat" },
    ...between,
    { t: "view", found: 3, ended: true }, { t: "close_chat" }, { t: "open_chat" },
    ...after,
  ]);

export const playEventsArb: fc.Arbitrary<PlayEvent[]> = fc.oneof(
  { weight: 2, arbitrary: randomEvents },
  { weight: 1, arbitrary: aroundTheEnd },
);
