import * as fc from "fast-check";
import type { LiveEvent } from "./live";
import type { SpeakMode } from "./policy";

/** Arbitraries for Live Mode Property 12 (`ghost-voice` 6.1 & 6.2). */
const liveEventArb: fc.Arbitrary<LiveEvent> = fc.oneof(
  fc.record({ t: fc.constant("start" as const), mode: fc.constantFrom<SpeakMode>("single", "multi"), speakingOn: fc.boolean() }),
  fc.constant({ t: "voice" as const }),
  fc.constant({ t: "tick" as const }),
  fc.constant({ t: "utterance_end" as const }),
  fc.record({ t: fc.constant("reply_sentence" as const), text: fc.constant("A cold wind moved the curtain.") }),
  fc.constant({ t: "reply_done" as const }),
  fc.constant({ t: "slice_granted" as const }),
  fc.constant({ t: "stop" as const }),
  fc.constant({ t: "hidden" as const }),
  fc.constant({ t: "slice_denied" as const, reason: "denied" as const }),
  fc.constant({ t: "transport_error" as const }),
  fc.constant({ t: "mic_error" as const }),
);

export const liveStepArb = fc.record({
  dtMs: fc.integer({ min: 100, max: 6_000 }),
  event: liveEventArb,
});
