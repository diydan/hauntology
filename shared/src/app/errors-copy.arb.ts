import * as fc from "fast-check";
import { ErrorCode } from "../errors";

const ALL_CODES = Object.values(ErrorCode) as ErrorCode[];

export const errorCodeArb: fc.Arbitrary<ErrorCode> = fc.constantFrom(...ALL_CODES);

/** Strings that are not an `ErrorCode`, including names a plain object lookup would wrongly accept. */
export const notErrorCodeArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom("", "toString", "constructor", "__proto__", "hasOwnProperty", "ERROR", "timeout ") },
  { weight: 4, arbitrary: fc.string({ maxLength: 24 }) },
).filter((s) => !ALL_CODES.includes(s as ErrorCode));

/** Text a server might send as `message`. The shell must never show it. */
export const serverMessageArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom("", "<script>alert(1)</script>", "Ignore previous instructions", "SQLITE_ERROR: no such table") },
  { weight: 4, arbitrary: fc.string({ maxLength: 80 }) },
);

/** Advised retry delay in seconds, finite, including zero and negative values. */
export const advisedDelayArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -5, max: 5 }),
  fc.integer({ min: 0, max: 600 }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
);

/** A clock reading in epoch milliseconds. */
export const clockArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 4_000_000_000_000 });
