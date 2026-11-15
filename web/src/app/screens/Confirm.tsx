import { errorCopy } from "@hauntology/shared/app/errors-copy";
import {
  CONFIRM_IMAGE_ALT, CONFIRM_IMAGE_CAPTION, CONFIRM_NOTHING_YET, CONFIRM_QUESTION, ENTER_BUSY, TURNSTILE_ASK, TURNSTILE_HEADING, noPlacesLine, placesLeftLine,
} from "@hauntology/shared/app/confirm-copy";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createConfirmController } from "../confirm/controller";
import { TurnstileWidget } from "../confirm/TurnstileWidget";
import { useRouterState, useShell } from "../context";
import { Link } from "../Link";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import { ScreenHeading } from "../RouteFocus";

/**
 * The Confirm Gate (Requirements 3.1 to 3.7, 9.1): the one Screen that can start a world. It shows the
 * exact picture from the quote, the places that are left and the question, and nothing is made until the
 * visitor presses "Enter this place". `ConfirmController` runs `confirmReduce`; this Screen only draws its
 * state. While a place is being made, Back and Pick another are off; a rejection says why in words that
 * belong to its code, offers the Gallery, and "Try again" makes a new quote.
 *
 * The Confirm Token is in the reducer's state and nowhere on this page: not in a URL, an attribute or a
 * log. A visit with no picked image never gets here: the router's guard sends it to Create (3.7).
 */
export default function Confirm() {
  const { api, router, quota } = useShell();
  const { flow } = useRouterState();
  const announce = useAnnounce();
  // The router's guard sends a visit with no picked image to Create before this mounts, so this is always set.
  const imageId = flow.pickedImageId ?? "";

  const [controller] = useState(() =>
    createConfirmController({
      api, imageId,
      setQuota: (q) => quota.setQuota(q),
      setFlow: (patch) => router.setFlow(patch),
      navigate: (route) => router.navigate(route),
    }),
  );
  const ui = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.begin();
    return () => controller.destroy();
  }, [controller]);

  // Each change of the Gate is said once.
  const s = ui.state;
  const last = useRef<string>("quoting");
  useEffect(() => {
    if (s.k === last.current) return;
    last.current = s.k;
    if (s.k === "ready") announce("Your picture is ready to look at.");
    else if (s.k === "challenge") announce(TURNSTILE_ASK);
    else if (s.k === "creating") announce(ENTER_BUSY);
    else if (s.k === "rejected") announce(`${errorCopy(s.code).title}. ${errorCopy(s.code).body}`);
  }, [s, announce]);

  // The picture and the count stay on the page through the check and the wait; the controller keeps them from the quote.
  const quote = s.k === "ready" || s.k === "challenge" || s.k === "creating" || s.k === "created" ? ui.quote : undefined;
  const busy = s.k === "creating" || s.k === "created";
  const noPlaces = s.k === "ready" ? noPlacesLine(s.quota) : null;

  return (
    <main className="screen ui-stack confirm">
      <ScreenHeading>{CONFIRM_QUESTION}</ScreenHeading>

      {s.k === "quoting" ? <p aria-busy="true">Looking at your picture…</p> : null}

      {quote !== undefined ? (
        <>
          <figure className="confirm-figure ui-figure">
            <img className="confirm-image" src={quote.imageUrl} alt={CONFIRM_IMAGE_ALT} />
            <figcaption>{CONFIRM_IMAGE_CAPTION}</figcaption>
          </figure>
          <p className="ui-hint" data-places-left>{placesLeftLine(quote.quota)}</p>
          <p>{CONFIRM_NOTHING_YET}</p>
        </>
      ) : null}

      {s.k === "ready" ? (
        <p>
          <button
            className="ui-button ui-button--primary"
            type="button"
            aria-disabled={noPlaces === null ? undefined : "true"}
            aria-describedby={noPlaces === null ? undefined : "confirm-reason"}
            onClick={() => noPlaces === null && controller.enter()}
          >
            Enter this place
          </button>
        </p>
      ) : null}
      {noPlaces !== null ? (
        <p id="confirm-reason" className="ui-note is-warn">
          {noPlaces}{" "}
          <Link className="ui-button" to={{ screen: "gallery" }}>
            Visit a gallery place
          </Link>
        </p>
      ) : null}

      {s.k === "challenge" ? (
        <section className="confirm-check ui-panel ui-stack" aria-labelledby="confirm-check-title">
          <h2 className="ui-heading" id="confirm-check-title">{TURNSTILE_HEADING}</h2>
          <p>{TURNSTILE_ASK}</p>
          <TurnstileWidget siteKey={ui.siteKey} onResult={controller.turnstileOk} />
        </section>
      ) : null}

      {s.k === "creating" ? (
        <p>
          <button className="ui-button" type="button" disabled aria-busy="true">
            {ENTER_BUSY}
          </button>
        </p>
      ) : null}

      {s.k === "rejected" ? (
        <section className="confirm-error ui-panel ui-panel--danger ui-stack" aria-labelledby="confirm-error-title">
          <h2 className="ui-heading" id="confirm-error-title">{errorCopy(s.code).title}</h2>
          <p>{errorCopy(s.code).body}</p>
          <p className="ui-row">
            {errorCopy(s.code).next === "retry" || errorCopy(s.code).next === "wait" ? (
              <>
                <RetryButton retryAfterSec={ui.retryAfterSec} onRetry={() => controller.retry()} />{" "}
              </>
            ) : null}
            <Link className="ui-button" to={{ screen: "gallery" }}>
              Visit a gallery place
            </Link>
          </p>
        </section>
      ) : null}

      <p className="confirm-nav ui-row">
        <button className="ui-button ui-button--quiet" type="button" disabled={busy} onClick={() => controller.back()}>
          Back
        </button>{" "}
        <button className="ui-button ui-button--quiet" type="button" disabled={busy} onClick={() => controller.pickAnother()}>
          Pick another place
        </button>
      </p>
    </main>
  );
}
