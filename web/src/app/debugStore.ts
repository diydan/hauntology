/**
 * What the debug overlay shows besides the Quota Snapshot: the current Stage (set by the Haunt
 * screen) and the Viewer's frame rate (set by Play). Screens call `setStage` and `setFps`; nothing
 * else reads these. It holds numbers and a Stage name only.
 */
export type DebugSnapshot = { stage: string | null; fps: number | null };

export type DebugStore = {
  getSnapshot(): DebugSnapshot;
  subscribe(listener: () => void): () => void;
  setStage(stage: string | null): void;
  setFps(fps: number | null): void;
};

export function createDebugStore(): DebugStore {
  let state: DebugSnapshot = { stage: null, fps: null };
  const listeners = new Set<() => void>();
  const set = (next: DebugSnapshot) => {
    if (next.stage === state.stage && next.fps === state.fps) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setStage: (stage) => set({ ...state, stage }),
    setFps: (fps) => set({ ...state, fps: fps === null ? null : Math.round(fps) }),
  };
}
