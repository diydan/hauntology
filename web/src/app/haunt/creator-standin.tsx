import { createRoot } from "react-dom/client";
import type { CreatorHandle, CreatorSetup } from "./creator";

/**
 * A stand-in for the Ghost Creator (the `ghost-creator` spec), used until that is built and in
 * `?demo=1`. It makes no ghost. Its one button is the Creator's own "skip" (the default ghost for
 * this world), and reports `chosen` the way the real Creator reports a ghost it saved.
 */
export function mountCreator({ container, onMessage }: CreatorSetup): CreatorHandle {
  const root = createRoot(container);
  root.render(
    <div className="ui-stack" data-standin-creator>
      <p>Stand-in Ghost Creator. The Creator is not built yet.</p>
      <div className="ui-row" role="group" aria-label="Pretend">
        <button type="button" className="ui-button" onClick={() => onMessage({ t: "chosen" })}>
          Use the default ghost
        </button>
      </div>
    </div>,
  );
  let up = true;
  return {
    async dispose() {
      if (!up) return;
      up = false;
      root.unmount();
    },
  };
}
