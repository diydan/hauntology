import { normalizeCaseSetup, type CaseSetup } from "@hauntology/shared/app/case-setup";
import { parseHostMessage } from "@hauntology/shared/app/events";
import type { Route } from "@hauntology/shared/app/types";
import type { ConditionsChoice } from "@hauntology/shared/conditions/types";
import type { PlayMemoryStore } from "../play/memory";

/**
 * The Case Screen's controller (Requirement 13.2 to 13.4). Framework-free, so it is tested without
 * React. It starts the Host once, listens to what the Host says, and leaves the Screen the one way
 * that is safe: the Host is disposed (the Room ended, the Viewer released) before the next Screen mounts.
 *
 * It holds no game rule. A refusal (the world is too small, party mode is off, the Room could not be
 * made, the Host would not load) is not an error screen: the visitor goes back to Haunt, which says
 * why in one line and keeps Wander and the Gallery.
 *
 * A reload, or leaving and coming Back, never opens a Room by itself: `caseStart` is set only by the
 * setup card's Start, and cleared when this Screen is left. That is "a reload ends the Room".
 */

/** What the controller needs from the Host, with no DOM in it. */
export type HostPort = {
  start(setup: CaseSetup, sky: ConditionsChoice | undefined): Promise<void>;
  playAgain(): void;
  dispose(): Promise<void>;
};

export type CasePhase = "idle" | "starting" | "playing" | "ended";

export type CaseUi = {
  phase: CasePhase;
  /** The narration is scripted lines (the indicator of Requirement 5.4). */
  scripted: boolean;
};

export type CaseController = {
  getSnapshot(): CaseUi;
  subscribe(listener: () => void): () => void;
  /** Starts the Room once, or goes back to Haunt if this visit did not press Start. */
  begin(): Promise<void>;
  onHostMessage(message: unknown): void;
  /** After an ending: a new game in the same Room. */
  playAgain(): void;
  /** Ends the Room, releases the Viewer, then goes to `to` (Haunt for this world by default). */
  exit(to?: "haunt" | "home" | "gallery"): Promise<void>;
  /** The Screen is going away: the Host is disposed. */
  destroy(): Promise<void>;
  /** Resolves when everything queued so far has run (for tests). */
  settled(): Promise<void>;
};

export type CaseDeps = {
  worldId: string;
  memory: PlayMemoryStore;
  port: HostPort;
  /** `flags.partyEnabled`. When it is off the Room is not asked for. */
  partyEnabled: boolean;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
};

export function createCaseController(deps: CaseDeps): CaseController {
  const { worldId, memory, port, navigate } = deps;
  // Read once: the Screen may be mounted twice by StrictMode, and the first cleanup clears `caseStart`.
  const m0 = memory.get();
  const wantsStart = m0.caseStart && m0.caseSetup !== undefined;

  let ui: CaseUi = { phase: "idle", scripted: false };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<CaseUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  let began = false;
  let alive = false;
  let hostUp = false;
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void> | void): Promise<void> => {
    queue = queue.then(work, work);
    return queue;
  };

  const disposeHost = async (): Promise<void> => {
    if (!hostUp) return;
    hostUp = false;
    await port.dispose();
  };

  /** Leaves for `route`: the Room ends and the Viewer is released before the next Screen mounts. */
  const leaveFor = (route: Route, options?: { replace?: boolean }): Promise<void> => {
    alive = false;
    memory.set({ caseStart: false });
    return enqueue(async () => {
      await disposeHost();
      navigate(route, options);
    });
  };

  const haunt: Route = { screen: "haunt", worldId };

  const refuse = (code: string): Promise<void> => {
    memory.set({ caseRefusal: { worldId, code } });
    return leaveFor(haunt, { replace: true });
  };

  const begin = async (): Promise<void> => {
    if (began) return;
    began = true;
    if (!wantsStart) {
      // A reload, or Back: no Room opens by itself. Show the setup.
      alive = false;
      navigate(haunt, { replace: true });
      return;
    }
    if (!deps.partyEnabled) {
      await refuse("party_disabled");
      return;
    }
    alive = true;
    set({ phase: "starting" });
    const setup = normalizeCaseSetup(memory.get().caseSetup);
    const sky = memory.get().conditions;
    await enqueue(async () => {
      try {
        await port.start(setup, sky);
        hostUp = true;
      } catch {
        // The Host would not load or could not make a Room: the same quiet way back as a refusal.
        // Not awaited: the way back is queued after this work, and waiting for it here would wait forever.
        if (alive) void refuse("case_failed");
        return;
      }
      // If the Screen went away while this was starting, its own queued dispose runs next.
    });
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    begin,
    onHostMessage(message) {
      if (!alive) return;
      const m = parseHostMessage(message);
      if (m === null) return;
      switch (m.t) {
        case "started":
          if (ui.phase === "starting" || ui.phase === "ended") set({ phase: "playing" });
          return;
        case "scripted":
          if (!ui.scripted) set({ scripted: true });
          return;
        case "ended":
          if (ui.phase !== "idle") set({ phase: "ended" });
          return;
        case "refused":
          void refuse(m.code);
          return;
      }
    },
    playAgain() {
      if (!alive || ui.phase !== "ended") return;
      set({ phase: "playing" });
      port.playAgain();
    },
    exit(to = "haunt") {
      const route: Route = to === "haunt" ? haunt : { screen: to };
      return leaveFor(route);
    },
    async destroy() {
      alive = false;
      began = false;
      memory.set({ caseStart: false });
      await enqueue(disposeHost);
    },
    settled: () => queue,
  };
}
