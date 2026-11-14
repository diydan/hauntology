import * as fc from "fast-check";
import { VIEWER_RUNGS, type PlayEvent } from "./types";

export const playEventArb: fc.Arbitrary<PlayEvent> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<PlayEvent>({ t: "ack_notice" }) },
  { weight: 3, arbitrary: fc.constant<PlayEvent>({ t: "open_chat" }) },
  { weight: 3, arbitrary: fc.constant<PlayEvent>({ t: "close_chat" }) },
  { weight: 1, arbitrary: fc.constant<PlayEvent>({ t: "exit" }) },
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

export const playEventsArb: fc.Arbitrary<PlayEvent[]> = fc.array(playEventArb, { maxLength: 30 });
