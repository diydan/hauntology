import type { PlayEvent, PlayState, PlayStep, ViewerRung } from "./types";

/**
 * The Play screen as a pure state machine: it returns the next state and the effects the screen
 * must run (start or dispose the Viewer, set its input mode, navigate), and does no I/O.
 *
 * - The Viewer starts only after the content notice is acknowledged, once.
 * - Input mode is `chat` exactly while the Chat is open. Opening and closing each emit one
 *   `set_input_mode`. The Chat cannot open before the notice is acknowledged or after the end.
 * - Leaving the screen, by `exit` or because the game ended, disposes the Viewer first and then
 *   navigates. The end navigates to the Ending exactly once.
 * - `found` never goes down and never passes 3. A fallback rung never gets better.
 *
 * `worldId` is the world on screen; it stays the same for the life of the screen.
 */

export function playStart(noticeAcked: boolean): PlayStep {
  return {
    state: { mode: "play", found: 0, noticeAcked, ended: false },
    effects: noticeAcked ? [{ e: "start_viewer" }] : [],
  };
}

const RUNG_RANK: Record<ViewerRung, number> = { pano: 1, thumb: 2 };

export function playReduce(state: PlayState, event: PlayEvent, worldId: string): PlayStep {
  const ignore: PlayStep = { state, effects: [] };

  switch (event.t) {
    case "ack_notice":
      if (state.noticeAcked) return ignore;
      return { state: { ...state, noticeAcked: true }, effects: [{ e: "start_viewer" }] };

    case "open_chat":
      if (!state.noticeAcked || state.ended || state.mode === "chat") return ignore;
      return { state: { ...state, mode: "chat" }, effects: [{ e: "set_input_mode", mode: "chat" }] };

    case "close_chat":
      if (state.ended || state.mode !== "chat") return ignore;
      return { state: { ...state, mode: "play" }, effects: [{ e: "set_input_mode", mode: "play" }] };

    case "exit":
      return {
        state,
        effects: [{ e: "dispose_viewer" }, { e: "navigate", to: { screen: event.to ?? "home" } }],
      };

    case "view": {
      const found = Number.isInteger(event.found) ? Math.min(3, Math.max(state.found, event.found)) : state.found;
      if (event.ended && !state.ended) {
        return {
          state: { ...state, found, ended: true },
          effects: [{ e: "dispose_viewer" }, { e: "navigate", to: { screen: "end", worldId } }],
        };
      }
      return found === state.found ? ignore : { state: { ...state, found }, effects: [] };
    }

    case "viewer_degraded":
      if (state.degraded !== undefined && RUNG_RANK[state.degraded] >= RUNG_RANK[event.rung]) return ignore;
      return { state: { ...state, degraded: event.rung }, effects: [] };
  }
}
