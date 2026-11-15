import { READY_ANNOUNCEMENT, STAGE_COPY } from "@hauntology/shared/app/haunt-copy";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlayChoice } from "../case/PlayChoice";
import { useRouterState, useShell } from "../context";
import { createHauntController } from "../haunt/controller";
import { DeletePlace } from "../haunt/DeletePlace";
import { GhostChoice } from "../haunt/GhostChoice";
import { SkyCard } from "../haunt/SkyCard";
import { StagePanel } from "../haunt/StagePanel";
import { useAnnounce } from "../LiveRegion";
import { ScreenHeading } from "../RouteFocus";

/**
 * Haunt (Requirements 4.1 to 4.7, 5.2, 12.1, 13.1): the visitor waits here while the world is made.
 * `HauntController` asks for the Stage; this Screen shows it with calm progress and, while the visitor
 * waits, the ghost choice and the optional sky card. When the place is ready it says so and offers
 * "Play a case" and "Wander", and starts neither the Viewer nor a Room by itself. A Gallery world is
 * ready at once and shows the same choice. Nothing on this Screen is a paid call.
 */
export default function Haunt() {
  const { api, router, platform } = useShell();
  const worldId = useRouterState().route.worldId ?? "";
  const announce = useAnnounce();

  const [controller] = useState(() =>
    createHauntController({
      api,
      worldId,
      now: () => platform.now().getTime(),
      visible: () => document.visibilityState !== "hidden",
      onVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
      scheduler: platform.scheduler,
    }),
  );
  const ui = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.begin();
    return () => controller.destroy();
  }, [controller]);

  // A world that is gone, or a Session that ended, is the Expired Screen.
  useEffect(() => {
    if (ui.leaveTo !== null) router.navigate(ui.leaveTo, { replace: true });
  }, [ui.leaveTo, router]);

  // Each change of Stage is said once, in the polite live region; the first answer is not (the page title already was).
  const last = useRef(ui.stage);
  useEffect(() => {
    const before = last.current;
    last.current = ui.stage;
    if (before === null || ui.stage === null || before === ui.stage) return;
    announce(ui.stage === "ready" ? READY_ANNOUNCEMENT : `${STAGE_COPY[ui.stage].label}. ${STAGE_COPY[ui.stage].line}`);
  }, [ui.stage, announce]);

  const waiting = ui.stage !== "failed";
  return (
    <main className="screen ui-stack haunt">
      <ScreenHeading>Your place</ScreenHeading>
      <StagePanel ui={ui} />
      {waiting ? (
        <>
          <GhostChoice worldId={worldId} />
          <SkyCard />
        </>
      ) : null}
      {ui.stage === "ready" ? <PlayChoice worldId={worldId} /> : null}
      <DeletePlace worldId={worldId} leave={() => router.navigate({ screen: "home" })} />
    </main>
  );
}
