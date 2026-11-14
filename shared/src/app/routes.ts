import type { ErrorCode } from "../errors";
import type { FlowState, GuardResult, Route, ScreenId } from "./types";

/**
 * Route table of the web shell. Pure: no history, no window.
 *
 *   /                  home
 *   /gallery           gallery
 *   /create            create
 *   /confirm           confirm
 *   /haunt/:worldId    haunt
 *   /play/:worldId     play
 *   /end/:worldId      end
 *   /expired           expired
 *   anything else      not_found  (pathFor gives /not-found)
 */

/** A world id is 1 to 64 URL-safe characters. Anything else never enters a route or an API path. */
export const WORLD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const isWorldId = (s: string): boolean => WORLD_ID_PATTERN.test(s);

const NOT_FOUND: Route = { screen: "not_found" };

const STATIC_PATHS = new Map<string, ScreenId>([
  ["gallery", "gallery"],
  ["create", "create"],
  ["confirm", "confirm"],
  ["expired", "expired"],
]);

const WORLD_PATHS = new Map<string, ScreenId>([
  ["haunt", "haunt"],
  ["play", "play"],
  ["end", "end"],
]);

/**
 * Maps any string to exactly one route. A query string or fragment is ignored, one trailing slash is
 * allowed, and everything else that is not in the table (wrong case, extra or empty segments,
 * percent-escapes, a bad world id, text that is not a path) is `not_found`.
 */
export function resolveRoute(path: string): Route {
  const cut = path.search(/[?#]/);
  const p = cut === -1 ? path : path.slice(0, cut);
  if (!p.startsWith("/")) return { ...NOT_FOUND };
  if (p === "/") return { screen: "home" };

  const parts = p.slice(1).split("/");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();

  // An empty segment (from "//") matches no table entry and is not a world id, so it falls through.
  const [first, second] = parts;
  if (first === undefined) return { ...NOT_FOUND };
  if (parts.length === 1) {
    const screen = STATIC_PATHS.get(first);
    return screen ? { screen } : { ...NOT_FOUND };
  }
  if (parts.length === 2 && second !== undefined) {
    const screen = WORLD_PATHS.get(first);
    if (screen && isWorldId(second)) return { screen, worldId: second };
  }
  return { ...NOT_FOUND };
}

/** The canonical path of a route. A world route without a valid world id gives the not-found path. */
export function pathFor(route: Route): string {
  switch (route.screen) {
    case "home": return "/";
    case "gallery": return "/gallery";
    case "create": return "/create";
    case "confirm": return "/confirm";
    case "expired": return "/expired";
    case "haunt":
    case "play":
    case "end":
      return route.worldId !== undefined && isWorldId(route.worldId) ? `/${route.screen}/${route.worldId}` : "/not-found";
    case "not_found": return "/not-found";
  }
}

/**
 * Whether the visitor may see `route` with this flow state, or where to send them.
 * A redirect never lands on a route that redirects again.
 *
 * - `confirm` needs a picked Place Image, else `create`.
 * - `haunt`, `play` and `end` are about one world: the route's world id must be the flow's `worldId`,
 *   else `gallery`.
 * - `play` also needs `ghostReady`, else `haunt` for that world.
 * - `end` also needs `playEnded`, else the place `play` would give.
 */
export function guardRoute(route: Route, flow: FlowState): GuardResult {
  switch (route.screen) {
    case "confirm":
      return flow.pickedImageId !== undefined ? ALLOW : redirect({ screen: "create" });
    case "haunt":
      return knowsWorld(route, flow) ? ALLOW : redirect({ screen: "gallery" });
    case "play": {
      if (!knowsWorld(route, flow)) return redirect({ screen: "gallery" });
      return flow.ghostReady ? ALLOW : redirect({ screen: "haunt", worldId: route.worldId as string });
    }
    case "end": {
      if (!knowsWorld(route, flow)) return redirect({ screen: "gallery" });
      if (flow.playEnded) return ALLOW;
      const play = guardRoute({ screen: "play", worldId: route.worldId as string }, flow);
      return redirect(play.allow ? { screen: "play", worldId: route.worldId as string } : play.redirect);
    }
    case "home":
    case "gallery":
    case "create":
    case "not_found":
    case "expired":
      return ALLOW;
  }
}

const ALLOW: GuardResult = { allow: true };
const redirect = (to: Route): GuardResult => ({ allow: false, redirect: to });
const knowsWorld = (route: Route, flow: FlowState): boolean =>
  route.worldId !== undefined && flow.worldId !== undefined && route.worldId === flow.worldId;

/**
 * The Screen an API error sends the visitor to, or `null` when the Screen stays and shows the
 * message. A world that is gone, or a Session that ended, is the `expired` Screen (Requirement 7.6
 * and 7.7). The server answers `world_not_found` for a missing and a foreign world alike.
 */
export function routeForApiError(code: ErrorCode): Route | null {
  return code === "world_not_found" || code === "session_expired" ? { screen: "expired" } : null;
}
