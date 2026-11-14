import { useEffect, useState } from "react";
import { PlayChoice } from "../case/PlayChoice";
import { useRouterState, useShell } from "../context";
import { ScreenHeading } from "../RouteFocus";

/**
 * A stand-in until shell group 9 builds this Screen (the Stage, the Ghost Creator, "Set the sky").
 * It gives the router somewhere to go and, once the world is ready, hosts the choice of Requirement
 * 13.1, "Play a case" and "Wander", which group 9 keeps as it is.
 */
export default function Haunt() {
  const { api } = useShell();
  const worldId = useRouterState().route.worldId ?? "";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void api.world(worldId).then((w) => {
      if (live && w.ok && w.value.status === "ready") setReady(true);
    });
    return () => {
      live = false;
    };
  }, [api, worldId]);

  return (
    <main className="screen" data-placeholder="haunt">
      <ScreenHeading>Your place is coming</ScreenHeading>
      <p>This Screen is not built yet.</p>
      {ready ? <PlayChoice worldId={worldId} /> : null}
    </main>
  );
}
