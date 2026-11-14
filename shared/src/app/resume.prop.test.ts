import * as fc from "fast-check";
import { describe, it } from "vitest";
import { propParams } from "./prop-config";
import { resumedFlow, resumeTarget } from "./resume";
import { guardRoute } from "./routes";
import { resumeFactsArb, sessionOrNullArb } from "./session.arb";

describe("Property 10: Resume picks a reachable, correct target", () => {
  // Validates: Requirements 4.5, 6.8, 7.7
  it("holds for any Session and any world status", () => {
    fc.assert(
      fc.property(sessionOrNullArb, resumeFactsArb, (session, facts) => {
        const route = resumeTarget(session, facts);
        const flow = resumedFlow(session, facts);

        // A missing or expired Session is home, and so is a Session with no last world.
        if (session === null || session.lastWorldId === undefined) return route.screen === "home";

        const inFlight = facts.worldStatus === "queued" || facts.worldStatus === "generating" || facts.worldStatus === "ingesting";
        const playLive = facts.playLive && session.lastPlayId !== undefined;

        // Haunt only for a world that is still being made.
        if (route.screen === "haunt" && !(inFlight && !playLive)) return false;
        // Play only for a ready world or a live play session, and never for a world the API lost.
        if (route.screen === "play" && !(facts.worldStatus === "ready" || playLive)) return false;
        if (route.screen === "play" && facts.worldStatus === "missing") return false;

        // And the other way round: the cases that should resume do.
        if (facts.worldStatus === "missing" && route.screen !== "home") return false;
        if (playLive && facts.worldStatus !== "missing" && route.screen !== "play") return false;
        if (!playLive && inFlight && route.screen !== "haunt") return false;
        if (!playLive && facts.worldStatus === "ready" && route.screen !== "play") return false;
        if (facts.worldStatus === "failed" && !playLive && route.screen !== "home") return false;

        // Only the Session's own world, and a route that passes the guard for the flow it leaves.
        if (route.screen !== "home" && route.worldId !== session.lastWorldId) return false;
        if (!guardRoute(route, flow).allow) return false;
        if (flow.noticeAcked !== session.ackNotice || flow.playEnded || "pickedImageId" in flow) return false;
        return flow.ghostReady === (route.screen === "play");
      }),
      propParams(),
    );
  });
});
