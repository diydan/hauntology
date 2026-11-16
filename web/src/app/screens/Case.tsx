import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBoot, useRouterState, useShell } from "../context";
import { createCaseController, type HostPort } from "../case/controller";
import type { HostHandle } from "../case/types";
import { useAnnounce } from "../LiveRegion";
import { ScreenHeading } from "../RouteFocus";

/**
 * The Case Screen (Requirement 13.2, 13.3): one screen for a solo case against Bots. It hosts the
 * party Host page and leaves the work to `CaseController`. Exit is always on the page and ends the
 * Room and releases the Viewer before the next Screen mounts. At the end the party ending is on
 * screen, and this Screen adds "Play again", Home and the Gallery. A reload shows the setup again
 * on Haunt; a refusal goes back to Haunt too, which says why. There is no error screen.
 */
export default function Case() {
  const { router, memory, platform } = useShell();
  const boot = useBoot();
  const worldId = useRouterState().route.worldId ?? "";
  const container = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();

  // One controller per visit to this Screen. Creating it has no side effect; `begin` runs in an effect.
  const [controller] = useState(() => {
    let handle: HostHandle | null = null;
    // eslint-disable-next-line prefer-const
    let self: ReturnType<typeof createCaseController>;
    const port: HostPort = {
      async start(setup, sky) {
        const mod = await platform.loadHost();
        if (container.current === null) throw new Error("no container");
        handle = await mod.mountHost({ container: container.current, worldId, setup, sky, onMessage: (m) => self.onHostMessage(m), loadViewer: platform.loadViewer });
      },
      playAgain: () => handle?.playAgain(),
      async dispose() {
        const h = handle;
        handle = null;
        await h?.dispose();
      },
    };
    self = createCaseController({
      worldId, memory, port,
      partyEnabled: boot.status === "ready" && boot.session.flags.partyEnabled,
      navigate: (route, options) => router.navigate(route, options),
    });
    return self;
  });

  const ui = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    void controller.begin();
    return () => void controller.destroy();
  }, [controller]);

  const last = useRef(ui.phase);
  useEffect(() => {
    if (ui.phase === last.current) return;
    if (ui.phase === "playing" && last.current === "starting") announce("The case has begun.");
    if (ui.phase === "ended") announce("The case is over.");
    last.current = ui.phase;
  }, [ui.phase, announce]);

  return (
    <main className="case-layout ui-stack">
      <ScreenHeading>Play a case</ScreenHeading>
      <p className="case-bar ui-row">
        <button className="ui-button" type="button" onClick={() => void controller.exit()}>
          Exit
        </button>{" "}
        {ui.scripted ? <small className="scripted ui-hint">scripted ghost</small> : null}
      </p>
      {ui.phase === "starting" ? <p aria-busy="true">Setting the scene…</p> : null}
      <div ref={container} className="case-host" data-host />
      {ui.phase === "ended" ? (
        <p className="case-after ui-row">
          <button className="ui-button ui-button--primary" type="button" onClick={() => controller.playAgain()}>
            Play again
          </button>{" "}
          <button className="ui-button" type="button" onClick={() => void controller.exit("home")}>
            Home
          </button>{" "}
          <button className="ui-button" type="button" onClick={() => void controller.exit("gallery")}>
            Gallery
          </button>
        </p>
      ) : null}
    </main>
  );
}
