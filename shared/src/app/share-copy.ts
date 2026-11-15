import { isWorldId, pathFor } from "./routes";

/**
 * The words of sharing a place (shell Requirement 15) and the link itself. Pure. The link is the page address of this app and the
 * world id and nothing else: no name, no owner, no Session, no query. Whether it still opens is the server's answer.
 */

export const SHARE_HEADING = "Share this place";
export const SHARE_OFF_LINE = "Give a friend a link and they can walk into this place too. Sharing is off until you turn it on.";
export const SHARE_ON_LINE = "Anyone who has this link can walk into your place. It stops working when you stop sharing, when you delete the place, and when its time runs out.";
export const SHARE_TURN_ON = "Share this place";
export const SHARE_TURN_OFF = "Stop sharing";
export const SHARE_COPY_LABEL = "Copy link";
export const SHARE_LINK_LABEL = "Your link";
export const SHARE_COPIED = "Link copied.";
export const SHARE_COPY_BY_HAND = "Your browser would not copy it. The link is selected: copy it by hand.";
export const SHARE_ON_ANNOUNCE = "Sharing is on. Your link is ready.";
export const SHARE_OFF_ANNOUNCE = "Sharing stopped. The link no longer works.";

export const SHARED_HEADING = "A shared place";
export const SHARED_LINE = "Someone shared this place with you.";
/** For the owner who opens their own link: it says whose place it is, and whether anyone else can open the link now. */
export const SHARED_OWN_ON_LINE = "This is your place. Your link is on, so anyone who has it can open this page.";
export const SHARED_OWN_OFF_LINE = "This is your place. Your link is off, so only you can open this page.";
export const SHARED_OPENING = "Opening the place…";
export const SHARED_WALK_IN = "Walk in";

/** An address of this app: `http` or `https`, a host, no path, no query, no fragment, no login. */
const ORIGIN = /^https?:\/\/[^\s/?#@\\]+$/;

/** The link to give a friend, or `null` for an origin or a world id that cannot make one. */
export function shareUrl(origin: string, worldId: string): string | null {
  if (!ORIGIN.test(origin) || !isWorldId(worldId)) return null;
  return `${origin}${pathFor({ screen: "shared", worldId })}`;
}
