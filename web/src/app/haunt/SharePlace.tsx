import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { routeForApiError } from "@hauntology/shared/app/routes";
import {
  SHARE_COPIED,
  SHARE_COPY_BY_HAND,
  SHARE_COPY_LABEL,
  SHARE_HEADING,
  SHARE_LINK_LABEL,
  SHARE_OFF_ANNOUNCE,
  SHARE_OFF_LINE,
  SHARE_ON_ANNOUNCE,
  SHARE_ON_LINE,
  SHARE_TURN_OFF,
  SHARE_TURN_ON,
  shareUrl,
} from "@hauntology/shared/app/share-copy";
import { useEffect, useRef, useState } from "react";
import { useGallery, useRouterState, useShell } from "../context";
import { useAnnounce } from "../LiveRegion";

/**
 * "Share this place" (shell Requirement 15), on Haunt, for the visitor's own ready place only. Sharing is off until the visitor
 * turns it on; then the card shows the link (this app's address and the world id, nothing else), a Copy link action and Stop
 * sharing. The card is not shown for a Gallery place (the public list tells them apart, as for "Delete my place"), for a place not
 * ready, or for a place the visitor walked into from someone's link. A place that is gone, or a Session that ended, is the Expired
 * Screen; any other failure says why and leaves the card as it was. When the browser cannot copy, the link is selected in its
 * field so it can be copied by hand. Nothing here is a paid call.
 */
export function SharePlace({ worldId, ready }: { worldId: string; ready: boolean }) {
  const { api, router, memory, gallery, platform } = useShell();
  const { flow } = useRouterState();
  const list = useGallery();
  const announce = useAnnounce();
  const [shared, setShared] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // Set when the visitor turns the link on, so the field takes focus once: never on a page that opens with sharing already on.
  const [focusField, setFocusField] = useState(false);

  useEffect(() => {
    void gallery.load();
  }, [gallery]);

  const own = ready && flow.sharedWorldId !== worldId && list.status === "ready" && !list.items.some((g) => g.id === worldId);

  // Whether the link is on is the server's to say: a status says `shared` only to the owner.
  useEffect(() => {
    if (!own) return;
    let live = true;
    void api.world(worldId).then((r) => {
      if (live && r.ok) setShared(r.value.shared === true);
    });
    return () => {
      live = false;
    };
  }, [own, api, worldId]);

  // After the visitor turns the link on, the field takes focus with its text selected, so it can be copied at once.
  useEffect(() => {
    if (focusField && shared === true) {
      field.current?.focus();
      field.current?.select();
      setFocusField(false);
    }
  }, [focusField, shared]);

  const link = shareUrl(platform.origin(), worldId);
  if (!own || shared === null || link === null) return null;

  const fail = (code: string) => {
    const gone = routeForApiError(code as Parameters<typeof routeForApiError>[0]);
    if (gone !== null) {
      memory.clear();
      router.clearPlace();
      router.navigate(gone);
      return;
    }
    const c = errorCopy(code);
    setProblem(`${c.title}. ${c.body}`);
  };

  const turn = async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    const r = await api.shareWorld(worldId, on);
    setBusy(false);
    if (!r.ok) return fail(r.code);
    setShared(r.value.shared);
    setFocusField(r.value.shared);
    announce(r.value.shared ? SHARE_ON_ANNOUNCE : SHARE_OFF_ANNOUNCE);
  };

  const copy = async () => {
    setProblem(null);
    if (await platform.copyText(link)) {
      announce(SHARE_COPIED);
      return;
    }
    field.current?.focus();
    field.current?.select();
    setProblem(SHARE_COPY_BY_HAND);
  };

  return (
    <section className="ui-panel ui-stack" aria-labelledby="share-heading">
      <h2 id="share-heading" className="ui-eyebrow">
        {SHARE_HEADING}
      </h2>
      <p>{shared ? SHARE_ON_LINE : SHARE_OFF_LINE}</p>
      {shared ? (
        <>
          <label className="ui-stack ui-stack--tight">
            {SHARE_LINK_LABEL}
            <input ref={field} className="ui-input" type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <div className="ui-row">
            <button className="ui-button" type="button" onClick={() => void copy()}>
              {SHARE_COPY_LABEL}
            </button>
            <button className="ui-button ui-button--quiet" type="button" disabled={busy} onClick={() => void turn(false)}>
              {busy ? "Stopping…" : SHARE_TURN_OFF}
            </button>
          </div>
        </>
      ) : (
        <button className="ui-button" type="button" disabled={busy} onClick={() => void turn(true)}>
          {busy ? "Turning on…" : SHARE_TURN_ON}
        </button>
      )}
      {problem ? (
        <p className="ui-note is-warn" role="status">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
