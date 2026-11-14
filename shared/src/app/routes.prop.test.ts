import * as fc from "fast-check";
import { describe, it } from "vitest";
import { DEFAULT_SEED, propParams } from "./prop-config";
import { GUARD_RUNS, anyPathArb, routeArb, routeWithFlowArb } from "./routes.arb";
import { guardRoute, isWorldId, pathFor, resolveRoute } from "./routes";
import { SCREEN_IDS, type Route } from "./types";

/** An independent reading of the route table: one regular expression, no splitting. */
function oracle(path: string): Route {
  const base = path.replace(/[?#][\s\S]*$/, "");
  if (base === "/") return { screen: "home" };
  const m = /^\/(?:(gallery|create|confirm|expired)|(haunt|play|case|end)\/([A-Za-z0-9_-]{1,64}))\/?$/.exec(base);
  if (!m) return { screen: "not_found" };
  if (m[1]) return { screen: m[1] as Route["screen"] };
  return { screen: m[2] as Route["screen"], worldId: m[3] as string };
}

describe("Property 1: Routes are total and round-trip", () => {
  // Validates: Requirements 1.5, 7.6, 13.2
  const paths = fc.oneof(anyPathArb, fc.string({ unit: "binary", maxLength: 40 }));

  it("returns exactly one known screen for any string, and not_found for every unknown path", () => {
    fc.assert(
      fc.property(paths, (path) => {
        const route = resolveRoute(path);
        if (!SCREEN_IDS.includes(route.screen)) return false;
        const needsWorld = route.screen === "haunt" || route.screen === "play" || route.screen === "case" || route.screen === "end";
        if (needsWorld !== (route.worldId !== undefined)) return false;
        if (route.worldId !== undefined && !isWorldId(route.worldId)) return false;
        const expected = oracle(path);
        return route.screen === expected.screen && route.worldId === expected.worldId;
      }),
      propParams(),
    );
  });

  it("gives back the same route from its own path, for any path and for any route", () => {
    fc.assert(
      fc.property(paths, (path) => {
        const route = resolveRoute(path);
        return JSON.stringify(resolveRoute(pathFor(route))) === JSON.stringify(route);
      }),
      propParams(),
    );
    fc.assert(
      fc.property(routeArb, (route) => {
        const path = pathFor(route);
        return JSON.stringify(resolveRoute(path)) === JSON.stringify(route) && pathFor(resolveRoute(path)) === path;
      }),
      propParams(),
    );
  });
});

describe("Property 2: Guards never expose a screen without its prerequisites", () => {
  // Validates: Requirements 3.7, 5.2, 6.5, 13.2
  it("allows confirm, play and end only when their prerequisites hold, and nothing else is blocked", () => {
    fc.assert(
      fc.property(routeWithFlowArb, ({ route, flow }) => {
        const result = guardRoute(route, flow);
        const knowsWorld = route.worldId !== undefined && route.worldId === flow.worldId;
        switch (route.screen) {
          case "confirm":
            return result.allow === (flow.pickedImageId !== undefined);
          case "haunt":
          case "case":
            // A case needs no ghost: it fills every Suspect from the Preset Ghosts (Requirement 13.2).
            return result.allow === knowsWorld;
          case "play":
            // The design's own words are a necessary condition: a world is set and the ghost is ready.
            return result.allow === (knowsWorld && flow.ghostReady) && (!result.allow || (flow.worldId !== undefined && flow.ghostReady));
          case "end":
            return result.allow === (knowsWorld && flow.playEnded) && (!result.allow || flow.playEnded);
          default:
            return result.allow;
        }
      }),
      propParams(DEFAULT_SEED, GUARD_RUNS),
    );
  });

  it("redirects to a route that itself passes the guard, and to a screen the design names", () => {
    fc.assert(
      fc.property(routeWithFlowArb, ({ route, flow }) => {
        const result = guardRoute(route, flow);
        if (result.allow) return true;
        const target = result.redirect;
        if (!["create", "gallery", "haunt", "play"].includes(target.screen)) return false;
        if (target.worldId !== undefined && target.worldId !== flow.worldId) return false;
        return guardRoute(target, flow).allow;
      }),
      propParams(DEFAULT_SEED, GUARD_RUNS),
    );
  });

  it("does not change its inputs", () => {
    fc.assert(
      fc.property(routeWithFlowArb, ({ route, flow }) => {
        const before = JSON.stringify({ route, flow });
        guardRoute(route, flow);
        return JSON.stringify({ route, flow }) === before;
      }),
      propParams(DEFAULT_SEED, GUARD_RUNS),
    );
  });
});
