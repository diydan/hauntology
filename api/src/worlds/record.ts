import { StoredWorldSchema } from "@hauntology/shared/world/record";
import type { WorldRecord } from "./store";

/** A stored record that fits, or `null`. */
export function parseStoredWorld(raw: unknown): WorldRecord | null {
  const r = StoredWorldSchema.safeParse(raw);
  // zod types an optional field as `T | undefined`; the parsed object never holds an `undefined` value.
  return r.success ? (r.data as WorldRecord) : null;
}
