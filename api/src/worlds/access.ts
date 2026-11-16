import type { WorldRecord } from "./store";

/**
 * Who a request is, as far as one world is concerned. A Gallery world is `public`. A user world is
 * `owner` for the Session that made it; for everybody else it is `none`, including a request with no
 * cookie (that gets a brand-new Session id, which owns nothing), unless the owner has turned the share
 * link on and the world is ready: then it is `shared`, which may read and may not change or delete.
 * A user world with no owner is `none` for all: the rule fails closed.
 */
export type Access = "owner" | "public" | "shared" | "none";

export function accessOf(world: WorldRecord, sid: string): Access {
  if (world.kind === "gallery") return "public";
  if (world.ownerSid !== undefined && world.ownerSid !== "" && world.ownerSid === sid) return "owner";
  return world.ownerSid !== undefined && world.ownerSid !== "" && world.shared === true && world.status === "ready" ? "shared" : "none";
}

/** Reading, playing in and fetching assets of a world. */
export const mayRead = (a: Access): boolean => a !== "none";
/** Deleting a world, and turning its share link on or off: only its owner. Never a Gallery world, for anyone. */
export const mayDelete = (a: Access): boolean => a === "owner";
/** Turning the share link of a world on or off: only its owner. A Gallery world is public already, and a reader through a link cannot pass the link on by changing it. */
export const mayShare = (a: Access): boolean => a === "owner";
