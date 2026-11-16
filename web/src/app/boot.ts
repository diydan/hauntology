import type { ShellApi } from "@hauntology/shared/app/api";
import { resumeTarget, resumedFlow } from "@hauntology/shared/app/resume";
import { guardRoute } from "@hauntology/shared/app/routes";
import type { FlowState, ResumeFacts, Route, SessionRecord } from "@hauntology/shared/app/types";
import type { QuotaStore } from "./QuotaStore";
import type { Router } from "./router";

/**
 * Where the visitor lands when the app opens. `resumeTarget` runs only on `/` or on a stale route,
 * and it never overrides a deep link that already passes its guard (Requirement 4.5).
 */

export type StartPlan = { route: Route; flow: FlowState };

/** What the API says about the Session's last world and play session. `null` when there is nothing to ask. */
export async function loadResumeFacts(
  api: Pick<ShellApi, "world" | "playGet">,
  session: SessionRecord,
): Promise<ResumeFacts | null> {
  if (session.lastWorldId === undefined) return null;
  const world = await api.world(session.lastWorldId);
  // A world that is gone is `missing`. A failure to ask at all (offline, 5xx) is not an answer, so no resume.
  if (!world.ok && world.code !== "world_not_found") return null;
  const worldStatus = world.ok ? world.value.status : ("missing" as const);

  let playLive = false;
  if (world.ok && session.lastPlayId !== undefined) {
    const play = await api.playGet(session.lastPlayId);
    playLive = play.ok && !play.value.view.ended;
  }
  return { worldStatus, playLive };
}

const isWorldScreen = (route: Route): boolean => route.screen === "haunt" || route.screen === "play" || route.screen === "end";

export function freshFlow(session: SessionRecord | null): FlowState {
  return { ghostReady: false, noticeAcked: session?.ackNotice ?? false, playEnded: false };
}

/**
 * - `/` with a last world: the resume target.
 * - A world route for the Session's own last world: the flow the resume leaves behind, so the guard
 *   lets a route through when the world and play state allow it; a world the API no longer knows
 *   is the `expired` Screen.
 * - Anything else: the route if its guard passes, else the guard's redirect.
 */
export function startPlan(route: Route, session: SessionRecord, facts: ResumeFacts | null): StartPlan {
  if (route.screen === "home" && facts !== null) {
    return { route: resumeTarget(session, facts), flow: resumedFlow(session, facts) };
  }

  if (isWorldScreen(route) && facts !== null && route.worldId === session.lastWorldId) {
    if (facts.worldStatus === "missing") return { route: { screen: "expired" }, flow: freshFlow(session) };
    const flow = resumedFlow(session, facts);
    const guard = guardRoute(route, flow);
    return { route: guard.allow ? route : guard.redirect, flow };
  }

  const flow = freshFlow(session);
  const guard = guardRoute(route, flow);
  return { route: guard.allow ? route : guard.redirect, flow };
}

/**
 * Loads the boot data (once, through the store) and the resume facts, then starts the router.
 * `isCurrent` says whether the caller is still there: after an `await` a gone caller changes
 * nothing. The router is started at most once, however many callers run this at the same time.
 */
export async function runBoot(
  deps: { api: Pick<ShellApi, "world" | "playGet">; router: Router; quota: QuotaStore },
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const { api, router, quota } = deps;
  const state = await quota.load();
  if (!isCurrent() || state.status !== "ready" || router.getSnapshot().ready) return;
  const facts = await loadResumeFacts(api, state.session);
  if (!isCurrent() || router.getSnapshot().ready) return;
  router.start(startPlan(router.addressRoute(), state.session, facts));
}
