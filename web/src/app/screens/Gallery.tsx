import type { GalleryItem } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { useEffect } from "react";
import { useGallery, useShell } from "../context";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import { ScreenHeading } from "../RouteFocus";

/**
 * The Gallery (Requirements 5.1, 5.5, 10.4): thumbnail, title and a short description for each
 * place, from a static list that needs no paid call. A failure shows a message and a Retry action,
 * never an empty grid. Choosing a place records it and goes to Haunt, where the ghost is chosen;
 * no world asset is asked for before that.
 */
export default function Gallery() {
  const { gallery, router } = useShell();
  const state = useGallery();

  useEffect(() => void gallery.load(), [gallery]);

  const visit = (item: GalleryItem) => {
    router.setFlow({ worldId: item.id, ghostReady: false, playEnded: false });
    router.navigate({ screen: "haunt", worldId: item.id });
  };

  return (
    <main className="screen">
      <ScreenHeading>Visit a place</ScreenHeading>
      {state.status === "failed" ? (
        <Failure code={state.code} retryAfterSec={state.retryAfterSec} onRetry={() => void gallery.retry()} />
      ) : state.status === "ready" ? (
        state.items.length === 0 ? (
          <p>No places are in the Gallery right now. Please come back later.</p>
        ) : (
          <ul className="gallery">
            {state.items.map((item) => (
              <li key={item.id} className="card">
                <img src={item.thumbUrl} alt={item.title} loading="lazy" />
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <p className="attribution">{item.attribution}</p>
                <button className="button" type="button" aria-label={`Visit ${item.title}`} onClick={() => visit(item)}>
                  Visit
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p aria-busy="true">Loading places…</p>
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
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <p>
        Code: <code>{code}</code>
      </p>
      <p>
        <RetryButton retryAfterSec={retryAfterSec} onRetry={onRetry} />
      </p>
    </section>
  );
}
