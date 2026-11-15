import type { WorldRecord } from "./store";

/**
 * Who a request is, as far as one world is concerned. A Gallery world is `public`. A user world is
 * `owner` for the Session that made it and `none` for everybody else, including a request with no
 * cookie (that gets a brand-new Session id, which owns nothing). A user world with no owner is `none`
 * for all: the rule fails closed.
 */
export type Access = "owner" | "public" | "none";

export function accessOf(world: WorldRecord, sid: string): Access {
  if (world.kind === "gallery") return "public";
  return world.ownerSid !== "" && world.ownerSid === sid ? "owner" : "none";
}

/** Reading, playing in and fetching assets of a world. */
export const mayRead = (a: Access): boolean => a !== "none";
/** Deleting a world: only its owner. Never a Gallery world, for anyone. */
export const mayDelete = (a: Access): boolean => a === "owner";
