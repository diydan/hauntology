import type { PlayView } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { memoryCardSvg } from "@hauntology/shared/app/memory-card";
import { routeForApiError } from "@hauntology/shared/app/routes";
import { useCallback, useEffect, useState } from "react";
import { useRouterState, useShell } from "../context";
import { Link } from "../Link";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import { ScreenHeading } from "../RouteFocus";

/**
 * The ending (Requirement 6.5): what the ghost said last, the memories that were found, "Save
 * memory card" and "Haunt again". It is opened only by the single navigation Play makes at the end,
 * or by an address that passes its guard. It reads the memories from the play session, so what it
 * shows is what the API holds.
 */
type State = { k: "loading" } | { k: "ready"; view: PlayView } | { k: "failed"; code: string; retryAfterSec?: number } | { k: "missing" };

export default function End() {
  const { api, router, memory, platform } = useShell();
  const worldId = useRouterState().route.worldId ?? "";
  const announce = useAnnounce();
  const [state, setState] = useState<State>({ k: "loading" });

  const load = useCallback(() => {
    const playId = memory.get().playId;
    if (playId === undefined) {
      setState({ k: "missing" });
      return () => {};
    }
    let live = true;
    setState({ k: "loading" });
    void api.playGet(playId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setState({ k: "ready", view: result.value.view });
        return;
      }
      const gone = routeForApiError(result.code);
      if (gone) router.navigate(gone);
      else setState({ k: "failed", code: result.code, ...(result.retryAfterSec === undefined ? {} : { retryAfterSec: result.retryAfterSec }) });
    });
    return () => {
      live = false;
    };
  }, [api, memory, router]);

  useEffect(() => load(), [load]);

  const save = (view: PlayView) => {
    const svg = memoryCardSvg(view.journal.map((j) => ({ anchorId: j.anchorId, text: j.text })));
    platform.saveFile("hauntology-memory-card.svg", new Blob([svg], { type: "image/svg+xml" }));
    announce("Memory card saved.");
  };

  const hauntAgain = () => {
    memory.set({ playId: undefined, startFresh: true, farewell: undefined });
    router.setFlow({ playEnded: false, ghostReady: true });
    router.navigate({ screen: "play", worldId });
  };

  return (
    <main className="screen">
      <ScreenHeading>You remembered</ScreenHeading>
      {state.k === "loading" ? <p aria-busy="true">Gathering your memories…</p> : null}
      {state.k === "failed" ? (
        <section>
          <h2>{errorCopy(state.code).title}</h2>
          <p>{errorCopy(state.code).body}</p>
          <p>
            Code: <code>{state.code}</code>
          </p>
          <p>
            <RetryButton retryAfterSec={state.retryAfterSec} onRetry={load} />
          </p>
        </section>
      ) : null}
      {state.k === "missing" ? <p>Your memories are not available any more. You can go home and start again.</p> : null}
      {state.k === "ready" ? (
        <>
          {memory.get().farewell ? <blockquote className="farewell">{memory.get().farewell}</blockquote> : null}
          <ol className="journal" aria-label="The memories you found">
            {state.view.journal.map((entry) => (
              <li key={entry.anchorId}>{entry.text}</li>
            ))}
          </ol>
          <p className="actions-row">
            <button className="button" type="button" onClick={() => save(state.view)}>
              Save memory card
            </button>{" "}
            <button className="button" type="button" onClick={hauntAgain}>
              Haunt again
            </button>
          </p>
        </>
      ) : null}
      <p>
        <Link className="button" to={{ screen: "home" }}>
          Home
        </Link>{" "}
        <Link className="button" to={{ screen: "gallery" }}>
          Gallery
        </Link>
      </p>
    </main>
  );
}
