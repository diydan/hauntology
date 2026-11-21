import type { ShellToViewer } from "@hauntology/shared/app/events";
import type { FloorSampler } from "@hauntology/shared/ghost/anchors";
import type { Bounds, Vec3 } from "@hauntology/shared/ghost/types";

/**
 * The seam between the shell and the Viewer. The shell knows only this: it hands a container and a
 * message callback to `mountViewer`, sends `ShellToViewer` messages to the handle, and awaits
 * `dispose()` before it mounts another Screen. The real Viewer (world-viewer) and the demo
 * stand-in both implement it, so the shell's Play code cannot tell them apart. Messages from the
 * Viewer arrive as `unknown` and are validated by the shell with `parseViewerMessage`.
 */
export type ViewerSetup = {
  container: HTMLElement;
  worldId: string;
  onMessage: (message: unknown) => void;
};

/** What the shell needs to place the ghost's three anchors on the world's real floor (ghost-engine 6.3). */
export type AnchorGround = { sampler: FloorSampler; spawn: Vec3; bounds: Bounds };

export type ViewerHandle = {
  send(message: ShellToViewer): void;
  /**
   * The floor sampler, spawn and bounds once the collider is built: `undefined` while it is still being built (ask again), `null` when there never will be one
   * (a world with no collider, or one that would not parse). Absent on the stand-in, which has no floor.
   */
  anchorGround?(): AnchorGround | undefined | null;
  /** Releases the renderer, its listeners and its canvas. */
  dispose(): Promise<void>;
};

export type ViewerModule = {
  mountViewer(setup: ViewerSetup): ViewerHandle | Promise<ViewerHandle>;
};

export type LoadViewer = () => Promise<ViewerModule>;

/** Loaded only when the visitor enters Play, so Home's first load does not carry it (Requirement 10.1). */
export const defaultLoadViewer: LoadViewer = () => import("./mount");
