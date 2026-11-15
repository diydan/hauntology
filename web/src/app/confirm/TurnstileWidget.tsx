import {
  TURNSTILE_DID_NOT_WORK, TURNSTILE_LOADING, TURNSTILE_LOAD_FAILED, TURNSTILE_NOT_SET_UP, TURNSTILE_RAN_OUT,
} from "@hauntology/shared/app/confirm-copy";
import { useEffect, useRef, useState } from "react";
import { useShell } from "../context";
import { useAnnounce } from "../LiveRegion";

/**
 * The Turnstile widget, inside the Confirm Gate (Requirement 3.5). It exists only while the Gate is
 * waiting for the check, so the script is not loaded for anyone else. It shows that it is loading, and
 * when it cannot load (or the quote gave no site key) it says so in a line and offers the Gallery
 * through the Gate; the Screen is never an error page. A result goes to `onResult` and nowhere else.
 * `onResult` must be a stable function (the Gate passes its controller's), or the widget would be drawn again at every render.
 */
export function TurnstileWidget({ siteKey, onResult }: { siteKey: string | undefined; onResult: (token: string) => void }) {
  const { platform } = useShell();
  const announce = useAnnounce();
  const holder = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [note, setNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (siteKey === undefined) {
      setPhase("failed");
      return;
    }
    let live = true;
    let widget: { api: Awaited<ReturnType<typeof platform.loadTurnstile>>; id: string } | null = null;
    setPhase("loading");
    setNote(null);
    platform.loadTurnstile().then(
      (api) => {
        if (!live || holder.current === null) return;
        const id = api.render(holder.current, {
          sitekey: siteKey,
          theme: "dark",
          // The widget is removed when this Screen goes, so no result arrives after that; and a result the Gate does not expect is ignored by its reducer.
          callback: onResult,
          "error-callback": () => {
            if (!live) return;
            setNote(TURNSTILE_DID_NOT_WORK);
            announce(TURNSTILE_DID_NOT_WORK);
          },
          "expired-callback": () => {
            if (!live) return;
            setNote(TURNSTILE_RAN_OUT);
            announce(TURNSTILE_RAN_OUT);
            api.reset(id);
          },
        });
        widget = { api, id };
        setPhase("ready");
      },
      () => {
        if (live) setPhase("failed");
      },
    );
    return () => {
      live = false;
      widget?.api.remove(widget.id);
    };
  }, [siteKey, platform, attempt, announce, onResult]);

  return (
    <div className="turnstile">
      {phase === "loading" ? <p aria-busy="true">{TURNSTILE_LOADING}</p> : null}
      {phase === "failed" ? (
        <p className="reason" data-turnstile-problem>
          {siteKey === undefined ? TURNSTILE_NOT_SET_UP : TURNSTILE_LOAD_FAILED}{" "}
          {siteKey === undefined ? null : (
            <button className="button" type="button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          )}
        </p>
      ) : null}
      {note ? <p className="reason">{note}</p> : null}
      <div ref={holder} className="turnstile-box" data-turnstile />
    </div>
  );
}
