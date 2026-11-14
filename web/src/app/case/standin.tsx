import { CASE_PRESET_COPY } from "@hauntology/shared/app/case-setup";
import { createRoot } from "react-dom/client";
import type { HostHandle, HostSetup } from "./types";

/**
 * A stand-in for the party Host page (party-mode task 8.15), used until that is built and in
 * `?demo=1`. It plays no game. It says what it was asked for, reports `started` and `scripted`,
 * and has two buttons to walk the shell's whole flow through the real message contract: one ends
 * the case, one refuses the place as too small.
 */
export function mountHost({ container, setup, onMessage }: HostSetup): HostHandle {
  const root = createRoot(container);
  const render = (over: boolean) =>
    root.render(
      <div className="standin" data-standin-host>
        <p>Stand-in case. The party Host page is not built yet.</p>
        <p>
          {CASE_PRESET_COPY[setup.preset].label}, with {setup.bots} Bots.{over ? " The case is over." : ""}
        </p>
        <div className="standin-walk" role="group" aria-label="Pretend">
          <button type="button" className="button" disabled={over} onClick={() => onMessage({ t: "ended" })}>
            End the case
          </button>
          <button type="button" className="button" disabled={over} onClick={() => onMessage({ t: "refused", code: "world_too_small" })}>
            Say the place is too small
          </button>
        </div>
      </div>,
    );
  render(false);
  // Messages come after the mount returns, as a real Host's would.
  queueMicrotask(() => {
    onMessage({ t: "started" });
    onMessage({ t: "scripted" });
  });

  let up = true;
  return {
    playAgain() {
      render(false);
      onMessage({ t: "started" });
    },
    async dispose() {
      if (!up) return;
      up = false;
      root.unmount();
    },
  };
}
