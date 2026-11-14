import * as fc from "fast-check";
import { quotaSnapshotArb } from "./capabilities.arb";
import { errorCodeArb } from "./errors-copy.arb";
import { worldIdArb } from "./routes.arb";
import type { ConfirmEvent } from "./types";

const tokenArb: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/);
const imageUrlArb: fc.Arbitrary<string> = fc.stringMatching(/^\/api\/uploads\/[a-z0-9_-]{8,32}\.(png|jpg|webp)$/);

const quoteOk: fc.Arbitrary<ConfirmEvent> = fc.record({
  t: fc.constant("quote_ok" as const),
  imageUrl: imageUrlArb,
  token: tokenArb,
  quota: quotaSnapshotArb,
  needsTurnstile: fc.boolean(),
});

export const confirmEventArb: fc.Arbitrary<ConfirmEvent> = fc.oneof(
  { weight: 4, arbitrary: quoteOk },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("quote_fail" as const), code: errorCodeArb }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("turnstile_ok" as const), turnstile: tokenArb }) },
  { weight: 5, arbitrary: fc.constant<ConfirmEvent>({ t: "enter" }) },
  { weight: 1, arbitrary: fc.constant<ConfirmEvent>({ t: "back" }) },
  { weight: 2, arbitrary: fc.constant<ConfirmEvent>({ t: "retry" }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("create_ok" as const), worldId: worldIdArb }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("create_fail" as const), code: errorCodeArb }) },
);

/** Random event sequences. Weights make `quote_ok` then `enter` common, so `create` effects are reached. */
export const confirmEventsArb: fc.Arbitrary<ConfirmEvent[]> = fc.array(confirmEventArb, { maxLength: 30 });
