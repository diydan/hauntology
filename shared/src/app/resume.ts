import type { FlowState, ResumeFacts, Route, SessionRecord } from "./types";

/**
 * Where to send a visitor who opens `/` or a stale route, from the Session and what the API says
 * about its last world and play session. Pure: the caller fetches the facts.
 *
 * - no Session, or no `lastWorldId`, or a world the API no longer knows (`missing`): `home`
 * - a live play session for the last world: `play`
 * - a world still being made (`queued`, `generating`, `ingesting`): `haunt`
 * - a ready world with no live play session: `play` (a ghost is chosen or the default is used)
 * - a failed world, or anything else: `home`
 *
 * It never overrides a deep link that already passes its guard; the router decides that.
 */
export function resumeTarget(session: SessionRecord | null, facts: ResumeFacts): Route {
  const home: Route = { screen: "home" };
  if (session === null || session.lastWorldId === undefined) return home;
  const worldId = session.lastWorldId;

  if (facts.worldStatus === "missing") return home;
  if (facts.playLive && session.lastPlayId !== undefined) return { screen: "play", worldId };

  switch (facts.worldStatus) {
    case "queued":
    case "generating":
    case "ingesting":
      return { screen: "haunt", worldId };
    case "ready":
      return { screen: "play", worldId };
    default:
      return home;
  }
}

/**
 * The flow state a resume leaves behind, so that `guardRoute` lets the target through: the world is
 * known, a ghost is ready if the target is `play`, and the notice flag comes from the Session.
 * Nothing the visitor picked in this tab (a Place Image) is restored.
 */
export function resumedFlow(session: SessionRecord | null, facts: ResumeFacts): FlowState {
  const route = resumeTarget(session, facts);
  const flow: FlowState = {
    ghostReady: route.screen === "play",
    noticeAcked: session?.ackNotice ?? false,
    playEnded: false,
  };
  if (route.worldId !== undefined) flow.worldId = route.worldId;
  return flow;
}
