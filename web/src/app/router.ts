import { guardRoute, pathFor, resolveRoute } from "@hauntology/shared/app/routes";
import type { FlowState, Route } from "@hauntology/shared/app/types";
import { freshFlow, type StartPlan } from "./boot";

/**
 * The History-API router. It holds the current route and the flow state, built on the pure
 * `resolveRoute`, `pathFor` and `guardRoute`. It never shows a route its guard refuses: it shows
 * the redirect instead, and the refused URL does not stay in the address bar or the history.
 *
 * Until `start` is called (the boot data is in), `ready` is false and the route is only what the
 * address says; the App shows its loading state.
 */

export type HistoryLike = {
  /** Path and query of the current address. */
  path(): string;
  push(path: string): void;
  replace(path: string): void;
  /** Calls back on Back and Forward. Returns the way to stop. */
  listen(onChange: () => void): () => void;
};

export function browserHistory(): HistoryLike {
  return {
    path: () => location.pathname + location.search,
    push: (path) => history.pushState(null, "", path),
    replace: (path) => history.replaceState(null, "", path),
    listen: (onChange) => {
      addEventListener("popstate", onChange);
      return () => removeEventListener("popstate", onChange);
    },
  };
}

export type RouterState = { ready: boolean; route: Route; flow: FlowState };

export type Router = {
  getSnapshot(): RouterState;
  subscribe(listener: () => void): () => void;
  /** The route the address names, before any guard. */
  addressRoute(): Route;
  /** Applies the boot plan: the first route and the flow state the resume left. */
  start(plan: StartPlan): void;
  /** Goes to a route, or to its guard's redirect. Does nothing if it is already there. */
  navigate(route: Route, options?: { replace?: boolean }): void;
  /** Merges into the flow state, then moves off the current route if its guard now refuses it. */
  setFlow(patch: Partial<FlowState>): void;
  /** Forgets the place: no world, no picked image, no ghost, no ended play. The notice answer stays. */
  clearPlace(): void;
  /** Stops listening to the history. */
  dispose(): void;
};

export function createRouter(history: HistoryLike = browserHistory()): Router {
  let state: RouterState = { ready: false, route: resolveRoute(history.path()), flow: freshFlow(null) };
  const listeners = new Set<() => void>();
  const set = (next: RouterState) => {
    state = next;
    for (const l of [...listeners]) l();
  };

  /** The route to show for `route`, following the guard (a redirect never redirects again). */
  const settle = (route: Route, flow: FlowState): Route => {
    const g = guardRoute(route, flow);
    return g.allow ? route : g.redirect;
  };

  const sameRoute = (a: Route, b: Route): boolean => a.screen === b.screen && a.worldId === b.worldId;

  const onPop = () => {
    const wanted = resolveRoute(history.path());
    if (!state.ready) {
      set({ ...state, route: wanted });
      return;
    }
    const shown = settle(wanted, state.flow);
    if (!sameRoute(shown, wanted)) history.replace(pathFor(shown));
    set({ ...state, route: shown });
  };
  const stop = history.listen(onPop);

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    addressRoute: () => resolveRoute(history.path()),

    start(plan) {
      const wanted = resolveRoute(history.path());
      // Rewrite the address only when the plan moved the visitor off the route they asked for.
      if (!sameRoute(plan.route, wanted)) history.replace(pathFor(plan.route));
      set({ ready: true, route: plan.route, flow: plan.flow });
    },

    navigate(route, options = {}) {
      const target = settle(route, state.flow);
      const path = pathFor(target);
      const here = pathFor(resolveRoute(history.path()));
      if (path !== here) (options.replace ? history.replace : history.push)(path);
      if (!sameRoute(target, state.route)) set({ ...state, route: target });
    },

    setFlow(patch) {
      const flow = { ...state.flow, ...patch };
      const shown = state.ready ? settle(state.route, flow) : state.route;
      if (!sameRoute(shown, state.route)) history.replace(pathFor(shown));
      set({ ...state, flow, route: shown });
    },

    clearPlace() {
      const flow: FlowState = { ghostReady: false, noticeAcked: state.flow.noticeAcked, playEnded: false };
      const shown = state.ready ? settle(state.route, flow) : state.route;
      if (!sameRoute(shown, state.route)) history.replace(pathFor(shown));
      set({ ...state, flow, route: shown });
    },

    dispose: stop,
  };
}
