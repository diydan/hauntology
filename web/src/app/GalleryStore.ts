import type { GalleryItem, ShellApi } from "@hauntology/shared/app/api";
import type { ErrorCode } from "@hauntology/shared/errors";

/**
 * The Gallery list, asked for once and shared: Home prefetches it when idle, the Gallery screen
 * reads it. A second `load()` while it is loading or loaded does not ask again. After a failure
 * `retry()` asks once more. It holds only the public list (no world asset).
 */

export type GalleryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: GalleryItem[] }
  | { status: "failed"; code: ErrorCode; retryAfterSec?: number };

export type GalleryStore = {
  getSnapshot(): GalleryState;
  subscribe(listener: () => void): () => void;
  load(): Promise<GalleryState>;
  retry(): Promise<GalleryState>;
};

export function createGalleryStore(api: Pick<ShellApi, "gallery">): GalleryStore {
  let state: GalleryState = { status: "idle" };
  let inFlight: Promise<GalleryState> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: GalleryState) => {
    state = next;
    for (const l of [...listeners]) l();
  };

  const fetchList = async (): Promise<GalleryState> => {
    set({ status: "loading" });
    const result = await api.gallery();
    if (result.ok) set({ status: "ready", items: result.value });
    else set({ status: "failed", code: result.code, ...(result.retryAfterSec === undefined ? {} : { retryAfterSec: result.retryAfterSec }) });
    return state;
  };

  const load = (): Promise<GalleryState> => {
    inFlight ??= fetchList();
    return inFlight;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    retry() {
      if (state.status === "failed") inFlight = null;
      return load();
    },
  };
}
