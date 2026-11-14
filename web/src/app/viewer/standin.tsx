import type { Anchor } from "@hauntology/shared/app/events";
import { parseShellMessage } from "@hauntology/shared/app/events";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { ViewerHandle, ViewerSetup } from "./types";

/**
 * A stand-in for the real Viewer (world-viewer), used until that is built and in `?demo=1`. It draws
 * nothing 3D. It shows what the shell told it, and lets the visitor "walk" to a memory with a
 * button, which sends the same `pose` and `prompt` messages the real Viewer sends, so the whole
 * Play flow can be walked and tested through the real message contract.
 */

type StandInState = { anchors: Anchor[]; found: string[]; hauntLevel: number; mode: "play" | "chat"; atmosphere: string };

const initial: StandInState = { anchors: [], found: [], hauntLevel: 0, mode: "play", atmosphere: "normal" };

export function mountViewer({ container, onMessage }: ViewerSetup): ViewerHandle {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: StandInState) => {
    state = next;
    for (const l of [...listeners]) l();
  };
  const store = {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    get: () => state,
  };

  const root = createRoot(container);
  root.render(<StandIn store={store} onMessage={onMessage} />);

  return {
    send(message) {
      const m = parseShellMessage(message);
      if (m === null) return;
      if (m.t === "apply_view") set({ ...state, anchors: m.anchors, found: m.found, hauntLevel: m.hauntLevel });
      else if (m.t === "set_input_mode") set({ ...state, mode: m.mode });
      else set({ ...state, atmosphere: m.atmosphere === null ? "normal" : `${m.atmosphere.weather}, ${m.atmosphere.timeOfDay}` });
    },
    async dispose() {
      root.unmount();
    },
  };
}

function StandIn({ store, onMessage }: { store: { subscribe(l: () => void): () => void; get(): StandInState }; onMessage: (m: unknown) => void }) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const walk = (anchor: Anchor) => {
    onMessage({ t: "pose", pos: [anchor.pos[0], 1.6, anchor.pos[2]], yaw: 0 });
    onMessage({ t: "prompt", target: "anchor" });
  };
  const wander = () => {
    onMessage({ t: "pose", pos: [20, 1.6, 20], yaw: 0 });
    onMessage({ t: "prompt", target: null });
  };
  const chatting = state.mode === "chat";
  return (
    <div className="standin" data-standin-viewer>
      <p>Stand-in view. The 3D Viewer is not built yet.</p>
      <p>
        Haunt level {Math.round(state.hauntLevel * 100)}%. Sky: {state.atmosphere}.
      </p>
      <div className="standin-walk" role="group" aria-label="Move">
        {state.anchors.map((a, i) => (
          <button key={a.id} type="button" className="button" disabled={chatting} onClick={() => walk(a)}>
            {state.found.includes(a.id) ? `Back to memory ${i + 1}` : `Walk to memory ${i + 1}`}
          </button>
        ))}
        <button type="button" className="button" disabled={chatting} onClick={wander}>
          Walk away
        </button>
      </div>
    </div>
  );
}
