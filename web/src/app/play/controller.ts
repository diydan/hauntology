import type { PlayReply, PlayView, ShellApi, WanderLockView } from "@hauntology/shared/app/api";
import { parseViewerMessage, type ShellToViewer, type Vec3 } from "@hauntology/shared/app/events";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { playReduce, playStart } from "@hauntology/shared/app/play";
import { routeForApiError } from "@hauntology/shared/app/routes";
import type { FlowState, PlayEffect, PlayEvent, PlayState, Route, SessionRecord } from "@hauntology/shared/app/types";
import type { ErrorCode } from "@hauntology/shared/errors";
import type { Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { AttemptReply } from "../../puzzles/PuzzleHost";
import type { PlayMemoryStore } from "./memory";

/**
 * Runs one Play screen: it starts or restores the play session, runs the effects that
 * `playReduce` returns, validates what the Viewer says, sends the Viewer what it needs, and asks the
 * API for each turn. It holds no DOM and no React; the Screen subscribes to its state.
 *
 * The Viewer is reached only through `ViewerPort`. Effects run one after another, so the Viewer is
 * disposed (and its promise awaited) before the next Screen is mounted (Requirement 10.2).
 */

export type ViewerPort = {
  /** Loads and mounts the Viewer. Called once, after the content notice is acknowledged. */
  start(): Promise<void>;
  send(message: ShellToViewer): void;
  dispose(): Promise<void>;
};

export const QUICK_BUTTONS = ["look", "listen", "touch", "ask", "hint"] as const;
export type QuickButton = (typeof QUICK_BUTTONS)[number];
export const BUTTON_LABELS: Record<QuickButton, string> = { look: "Look", listen: "Listen", touch: "Touch", ask: "Ask", hint: "Hint" };
/** The Engine truncates input to 200 characters (ghost-engine 2.2); so does the shell, before sending. */
export const MAX_INPUT_CHARS = 200;
const SPAWN_POSE = { pos: [0, 0, 0] as Vec3, yaw: 0 };

export type ChatLine = { id: number; who: "you" | "ghost" | "system"; text: string };
export type Failure = { code: ErrorCode; retryAfterSec?: number };

export type PlayUi = {
  phase: "loading" | "ready" | "failed";
  failure: Failure | null;
  play: PlayState;
  view: PlayView | null;
  /** What the Viewer last said the visitor is near. */
  prompt: "anchor" | "ghost" | null;
  lines: ChatLine[];
  busy: boolean;
  /** A scripted line was used at least once this game (Requirement 5.4). */
  scripted: boolean;
  /** The ghost's latest reply; `n` changes with each one, so a repeated line is still new. */
  reply: { n: number; text: string; voice?: { lineId: string } | undefined } | null;
  turnFailure: Failure | null;
  journalOpen: boolean;
  /** Open Wander Lock (`puzzles` Requirement 2); movement & pointer lock stay suspended while non-null. */
  activeLock: WanderLockView | null;
  /** Sight card revealed after a memory (`puzzles` Requirement 2.5); movement stays suspended while non-null. */
  pendingSight: Sight | null;
};

export type PlayDeps = {
  api: Pick<ShellApi, "playStart" | "playTurn" | "playGet" | "ackNotice" | "playLockOpen" | "playLockAttempt" | "playLockSkip">;
  worldId: string;
  memory: PlayMemoryStore;
  session: Pick<SessionRecord, "ackNotice" | "lastPlayId" | "lastWorldId">;
  port: ViewerPort;
  navigate(route: Route): void;
  setFlow(patch: Partial<FlowState>): void;
  /** The notice was acknowledged: tell the shared boot data. */
  onNoticeAcked(): void;
  /** The Viewer's frame rate, for the debug overlay; unused when debug is off. */
  onFps?(fps: number): void;
};

export type PlayController = {
  getSnapshot(): PlayUi;
  subscribe(listener: () => void): () => void;
  begin(): Promise<void>;
  retry(): Promise<void>;
  acknowledgeNotice(): Promise<void>;
  openChat(): void;
  closeChat(): void;
  submit(input: { text: string } | { button: QuickButton }): Promise<void>;
  openJournal(): void;
  closeJournal(): void;
  submitLockAttempt(transcript: Transcript): Promise<AttemptReply>;
  finishLock(): void;
  skipLock(): Promise<void>;
  closeLock(): void;
  dismissSight(): void;
  exit(to?: "home" | "gallery"): Promise<void>;
  /** A raw message from the Viewer; anything that is not in the contract is dropped. */
  onViewerMessage(raw: unknown): void;
  /** The Screen is going away: release the Viewer if it is still up. */
  destroy(): Promise<void>;
  /** Resolves when every queued effect has finished. */
  settled(): Promise<void>;
};

export const viewMessage = (view: PlayView): ShellToViewer => ({
  t: "apply_view",
  found: view.found,
  anchors: view.anchors,
  hauntLevel: view.hauntLevel,
  ghostVisible: view.ghostVisible,
});

export function createPlayController(deps: PlayDeps): PlayController {
  const { api, worldId, memory, port } = deps;

  const first = playStart(deps.session.ackNotice);
  let ui: PlayUi = {
    phase: "loading", failure: null, play: first.state, view: null, prompt: null, lines: [], busy: false,
    scripted: false, reply: null, turnFailure: null, journalOpen: false, activeLock: null, pendingSight: null,
  };
  let queuedSight: Sight | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PlayUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  let playId: string | null = null;
  let viewerUp = false;
  let lastPose: { pos: Vec3; yaw: number } = SPAWN_POSE;
  let lineN = 0;
  let replyN = 0;
  let began = false;
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void> | void): Promise<void> => {
    queue = queue.then(work).catch(() => {});
    return queue;
  };

  const addLine = (who: ChatLine["who"], text: string) => set({ lines: [...ui.lines, { id: ++lineN, who, text }] });

  /** A Viewer that throws must not take the Chat down with it. */
  const send = (message: ShellToViewer): void => {
    try {
      port.send(message);
    } catch {
      // The Chat and Exit keep working.
    }
  };

  /** What the Viewer needs once it is up: the sky, the view and the input mode. */
  let synced = false;
  const syncInputMode = () => {
    if (!viewerUp) return;
    const suspended = ui.play.mode === "chat" || ui.activeLock !== null || ui.pendingSight !== null;
    send({ t: "set_input_mode", mode: suspended ? "chat" : "play" });
  };
  const sync = () => {
    if (!viewerUp || ui.view === null || synced) return;
    synced = true;
    send({ t: "set_atmosphere", atmosphere: ui.view.atmosphere });
    send(viewMessage(ui.view));
    syncInputMode();
  };

  const runEffect = async (effect: PlayEffect): Promise<void> => {
    switch (effect.e) {
      case "start_viewer":
        if (viewerUp) return;
        try {
          await port.start();
        } catch {
          // The Viewer would not start: the Chat and Exit still work, with a still picture of the place.
          void dispatch({ t: "viewer_degraded", rung: "thumb" });
          return;
        }
        viewerUp = true;
        sync();
        return;
      case "set_input_mode":
        syncInputMode();
        return;
      case "dispose_viewer":
        if (!viewerUp) return;
        viewerUp = false;
        await port.dispose();
        return;
      case "navigate":
        if (effect.to.screen === "end") deps.setFlow({ playEnded: true });
        deps.navigate(effect.to);
        return;
    }
  };

  const dispatch = (event: PlayEvent): Promise<void> => {
    const step = playReduce(ui.play, event, worldId);
    set({ play: step.state });
    return enqueue(async () => {
      for (const effect of step.effects) await runEffect(effect);
    });
  };

  /** Leaves the Screen for `route`: the Viewer is released first. */
  const leaveFor = (route: Route): Promise<void> =>
    enqueue(async () => {
      await runEffect({ e: "dispose_viewer" });
      await runEffect({ e: "navigate", to: route });
    });

  const failure = (code: ErrorCode, retryAfterSec?: number): Failure => (retryAfterSec === undefined ? { code } : { code, retryAfterSec });

  const adopt = (id: string, view: PlayView): Promise<void> => {
    playId = id;
    memory.set({ playId: id, startFresh: false });
    set({ phase: "ready", failure: null, view, activeLock: view.lock ?? null });
    // A restored game keeps what was found; the reducer starts from none.
    const catchUp = dispatch({ t: "view", found: view.found.length, ended: false });
    const start = first.effects.length > 0 ? enqueue(() => runEffect({ e: "start_viewer" })) : Promise.resolve();
    // If the notice was acknowledged while this was loading, the Viewer is already up and has nothing yet.
    return Promise.all([catchUp, start]).then(() => enqueue(sync));
  };

  /** A live session of this world: from this tab, or the one the Session names (unless a fresh start was asked for). */
  const restoreCandidate = (): string | undefined => {
    const m = memory.get();
    if (m.playId !== undefined) return m.playId;
    if (m.startFresh) return undefined;
    return deps.session.lastWorldId === worldId ? deps.session.lastPlayId : undefined;
  };

  const startNew = async (): Promise<void> => {
    const m = memory.get();
    const result = await api.playStart({
      worldId,
      ...(m.ghostPreset === undefined ? {} : { ghostPreset: m.ghostPreset }),
      ...(m.conditions === undefined ? {} : { conditions: m.conditions }),
      ...(m.wanderLocks === true ? { locks: true } : {}),
    });
    if (!result.ok) {
      const gone = routeForApiError(result.code);
      if (gone) await leaveFor(gone);
      else set({ phase: "failed", failure: failure(result.code, result.retryAfterSec) });
      return;
    }
    await adopt(result.value.playId, result.value.view);
  };

  const begin = async (): Promise<void> => {
    if (began) return;
    began = true;
    const candidate = restoreCandidate();
    if (candidate !== undefined) {
      const got = await api.playGet(candidate);
      if (got.ok && got.value.worldId === worldId && !got.value.view.ended) {
        await adopt(candidate, got.value.view);
        return;
      }
      if (!got.ok) {
        const gone = routeForApiError(got.code);
        if (gone) {
          await leaveFor(gone);
          return;
        }
      }
      // Gone, ended or someone else's: begin a new game instead.
    }
    await startNew();
  };

  const applyReply = (reply: PlayReply, view: PlayView): Promise<void> => {
    set({ view, scripted: ui.scripted || reply.scripted, reply: { n: ++replyN, text: reply.text, voice: reply.voice } });
    addLine("ghost", reply.text);
    if (view.ended) memory.set({ farewell: reply.text });
    enqueue(() => {
      if (viewerUp) send(viewMessage(view));
    });
    return dispatch({ t: "view", found: view.found.length, ended: view.ended });
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    begin,
    async retry() {
      if (ui.phase !== "failed") return;
      began = false;
      set({ phase: "loading", failure: null });
      await begin();
    },
    async acknowledgeNotice() {
      if (ui.play.noticeAcked) return;
      const done = dispatch({ t: "ack_notice" });
      // The notice is acknowledged for this visit even if the call to remember it fails.
      void api.ackNotice();
      deps.onNoticeAcked();
      await done;
    },
    openChat() {
      void dispatch({ t: "open_chat" });
    },
    closeChat() {
      void dispatch({ t: "close_chat" });
    },
    async submit(input) {
      if (ui.phase !== "ready" || ui.busy || ui.play.ended || playId === null) return;
      let sent: { text: string } | { button: QuickButton };
      if ("text" in input) {
        const text = input.text.trim().slice(0, MAX_INPUT_CHARS);
        if (text === "") return;
        sent = { text };
        addLine("you", text);
      } else {
        sent = { button: input.button };
        addLine("you", BUTTON_LABELS[input.button]);
      }
      set({ busy: true, turnFailure: null });
      const result = await api.playTurn(playId, { input: sent, pose: lastPose });
      if (!result.ok) {
        set({ busy: false });
        const gone = routeForApiError(result.code);
        if (gone) {
          await leaveFor(gone);
          return;
        }
        const copy = errorCopy(result.code);
        addLine("system", `${copy.title}. ${copy.body}`);
        set({ turnFailure: failure(result.code, result.retryAfterSec) });
        return;
      }
      set({ busy: false });
      if (result.value.lock !== undefined) {
        set({ activeLock: result.value.lock, play: { ...ui.play, mode: "play" } });
        syncInputMode();
      }
      await applyReply(result.value.reply, result.value.view);
      if (result.value.sight !== undefined) {
        set({ pendingSight: result.value.sight });
        syncInputMode();
      }
    },
    openJournal() {
      set({ journalOpen: true });
    },
    closeJournal() {
      set({ journalOpen: false });
    },
    async submitLockAttempt(transcript) {
      if (playId === null || !api.playLockAttempt) return { outcome: "wrong", attemptsLeft: 3 };
      const r = await api.playLockAttempt(playId, transcript);
      if (!r.ok) {
        const gone = routeForApiError(r.code);
        if (gone) await leaveFor(gone);
        return { outcome: "wrong", attemptsLeft: 3 };
      }
      if (r.value.outcome === "wrong") {
        set({ view: r.value.view, activeLock: r.value.view.lock ?? ui.activeLock });
        return { outcome: "wrong", attemptsLeft: 3 };
      }
      queuedSight = r.value.sight ?? null;
      await applyReply(r.value.reply, r.value.view);
      return { outcome: "solved" };
    },
    finishLock() {
      const nextSight = queuedSight;
      queuedSight = null;
      set({ activeLock: null, pendingSight: nextSight });
      syncInputMode();
    },
    async skipLock() {
      if (playId === null || !api.playLockSkip) return;
      const r = await api.playLockSkip(playId);
      if (!r.ok) {
        const gone = routeForApiError(r.code);
        if (gone) await leaveFor(gone);
        return;
      }
      set({ activeLock: null, pendingSight: r.value.sight ?? null });
      syncInputMode();
      await applyReply(r.value.reply, r.value.view);
    },
    closeLock() {
      queuedSight = null;
      set({ activeLock: null });
      syncInputMode();
    },
    dismissSight() {
      set({ pendingSight: null });
      syncInputMode();
    },
    async exit(to) {
      await dispatch(to === undefined ? { t: "exit" } : { t: "exit", to });
    },
    onViewerMessage(raw) {
      const message = parseViewerMessage(raw);
      if (message === null) return;
      switch (message.t) {
        case "pose":
          lastPose = { pos: message.pos, yaw: message.yaw };
          return;
        case "prompt":
          if (message.target !== ui.prompt) set({ prompt: message.target });
          return;
        case "degraded":
          void dispatch({ t: "viewer_degraded", rung: message.rung });
          return;
        case "fps":
          deps.onFps?.(message.fps);
          return;
        case "clue_seen":
          return;
      }
    },
    async destroy() {
      await enqueue(() => runEffect({ e: "dispose_viewer" }));
    },
    settled: () => queue,
  };
}
