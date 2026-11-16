import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { routeForApiError } from "@hauntology/shared/app/routes";
import { SHARED_HEADING, SHARED_LINE, SHARED_OPENING, SHARED_OWN_OFF_LINE, SHARED_OWN_ON_LINE, SHARED_WALK_IN } from "@hauntology/shared/app/share-copy";
import { useEffect, useState } from "react";
import { useRouterState, useShell } from "../context";
import { Link } from "../Link";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import { ScreenHeading } from "../RouteFocus";

type Opened =
  | { k: "loading" }
  | { k: "ready"; title: string; thumbUrl: string | undefined; link: "own-on" | "own-off" | "not-own" }
  | { k: "failed"; code: string; retryAfterSec: number | undefined };

/**
 * A place somebody shared (shell Requirement 15.4 and 15.5): the page a share link opens. It asks the API for the world once. A place
 * that is ready shows its title and thumbnail and "Walk in", which records it as opened by a link and goes to Haunt to choose a ghost,
 * as a Gallery visit does. A place that is not there for this visitor (deleted, out of time, not shared any more, or never made) is the
 * Expired Screen: the server gives one answer for all of them. If the visitor owns the place (only the owner's status has `shared`, true
 * or false), it is recorded as theirs and the Screen says so, and whether the link is on; a visitor is told that someone shared it. The Screen
 * never says who made the place. Nothing here is a paid call.
 */
export default function Shared() {
  const { api, router } = useShell();
  const worldId = useRouterState().route.worldId ?? "";
  const [opened, setOpened] = useState<Opened>({ k: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setOpened({ k: "loading" });
    void api.world(worldId).then((r) => {
      if (!live) return;
      if (!r.ok) {
        const gone = routeForApiError(r.code);
        if (gone !== null) router.navigate(gone, { replace: true });
        else setOpened({ k: "failed", code: r.code, retryAfterSec: r.retryAfterSec });
        return;
      }
      // Only a ready place can be walked into; the server shares nothing else, so any other state is the same answer as a place that is gone.
      if (r.value.status !== "ready") router.navigate({ screen: "expired" }, { replace: true });
      else setOpened({ k: "ready", title: r.value.title ?? "A place", thumbUrl: r.value.thumbUrl, link: r.value.shared === undefined ? "not-own" : r.value.shared ? "own-on" : "own-off" });
    });
    return () => {
      live = false;
    };
  }, [api, router, worldId, attempt]);

  const walkIn = (link: "own-on" | "own-off" | "not-own") => {
    router.setFlow({ worldId, ghostReady: false, playEnded: false, ...(link === "not-own" ? { sharedWorldId: worldId } : {}) });
    router.navigate({ screen: "haunt", worldId });
  };

  return (
    <main className="screen ui-stack">
      <ScreenHeading>{SHARED_HEADING}</ScreenHeading>
      {opened.k === "loading" ? (
        <p aria-busy="true">{SHARED_OPENING}</p>
      ) : opened.k === "failed" ? (
        <Failure code={opened.code} retryAfterSec={opened.retryAfterSec} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <section className="ui-panel ui-stack">
          {opened.thumbUrl !== undefined ? (
            <figure className="ui-figure ui-figure--thumb">
              <img src={opened.thumbUrl} alt={opened.title} />
            </figure>
          ) : null}
          <h2 className="ui-heading">{opened.title}</h2>
          <p>{opened.link === "own-on" ? SHARED_OWN_ON_LINE : opened.link === "own-off" ? SHARED_OWN_OFF_LINE : SHARED_LINE}</p>
          <p className="ui-row">
            <button className="ui-button ui-button--primary" type="button" onClick={() => walkIn(opened.link)}>
              {SHARED_WALK_IN}
            </button>
            <Link className="ui-button" to={{ screen: "gallery" }}>
              Gallery
            </Link>
          </p>
        </section>
      )}
    </main>
  );
}

function Failure({ code, retryAfterSec, onRetry }: { code: string; retryAfterSec: number | undefined; onRetry: () => void }) {
  const copy = errorCopy(code);
  const announce = useAnnounce();
  useEffect(() => announce(copy.title), [announce, copy.title]);
  return (
    <section>
      <h2 className="ui-heading">{copy.title}</h2>
      <p>{copy.body}</p>
      <p>
        <RetryButton retryAfterSec={retryAfterSec} onRetry={onRetry} />
      </p>
    </section>
  );
}
