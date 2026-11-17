import type { ShellToViewer } from "@hauntology/shared/app/events";

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

export type ViewerHandle = {
  send(message: ShellToViewer): void;
  /** Releases the renderer, its listeners and its canvas. */
  dispose(): Promise<void>;
};

export type ViewerModule = {
  mountViewer(setup: ViewerSetup): ViewerHandle | Promise<ViewerHandle>;
};

export type LoadViewer = () => Promise<ViewerModule>;

/** Loaded only when the visitor enters Play, so Home's first load does not carry it (Requirement 10.1). */
export const defaultLoadViewer: LoadViewer = () => import("./mount");
