import type { CaseSetup } from "@hauntology/shared/app/case-setup";
import type { ConditionsChoice } from "@hauntology/shared/conditions/types";
import type { LoadViewer } from "../viewer/types";

/**
 * The seam between the shell and the party Host page, for "Play a case" (Requirement 13). The shell
 * knows only this: it hands a container, the setup and a message callback to `mountHost`, and awaits
 * `dispose()` (which ends the Room and releases the Viewer) before it mounts another Screen. The
 * real Host (`host.tsx`, party-mode task 8.15) and the demo stand-in (`?demo=1`) both implement it, so the Case
 * Screen cannot tell them apart. The Host runs `soloSetup`, makes the Room, seats the visitor as
 * Master, adds the Bots and starts; the shell holds no game rule. Messages from the Host arrive as
 * `unknown` and are checked with `parseHostMessage`.
 */
export type HostSetup = {
  container: HTMLElement;
  worldId: string;
  setup: CaseSetup;
  /** The sky the visitor chose on Haunt, or nothing for the Host's own clock and a clear sky. */
  sky: ConditionsChoice | undefined;
  onMessage: (message: unknown) => void;
  /** The world view to show beside the table. Without it, or if it will not load, the table plays alone. */
  loadViewer?: LoadViewer;
};

export type HostHandle = {
  /** Starts a new game in the same Room, after an ending. */
  playAgain(): void;
  /** Ends the Room, then releases the Viewer, its listeners and its canvas. Safe to call twice. */
  dispose(): Promise<void>;
};

export type HostModule = {
  mountHost(setup: HostSetup): HostHandle | Promise<HostHandle>;
};

export type LoadHost = () => Promise<HostModule>;

/** Loaded only when a case opens, so Home's first load does not carry it (Requirement 10.1). */
export const defaultLoadHost: LoadHost = () => import("./host");
