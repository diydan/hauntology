import type { InputEvent, InputMode } from "./types";

/**
 * The input router's fold (Requirement 4.2; world-viewer task 2.14): opening the chat
 * suspends movement, closing it always restores play. Movement is enabled exactly in
 * `play` mode; a `move` event never changes the mode, so input during chat is dropped
 * by the caller checking `movementEnabled`.
 */
export function inputReduce(mode: InputMode, event: InputEvent): { mode: InputMode; movementEnabled: boolean } {
  const next: InputMode = event === "open_chat" ? "chat" : event === "close_chat" ? "play" : mode;
  return { mode: next, movementEnabled: next === "play" };
}
