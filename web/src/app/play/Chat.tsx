import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRetryGate } from "../useRetryGate";
import { BUTTON_LABELS, MAX_INPUT_CHARS, QUICK_BUTTONS, type PlayUi, type QuickButton } from "./controller";
import type { VoiceUi } from "./voice";

/**
 * The Chat with the ghost: a transcript, five quick buttons and a text box, plus the voice
 * controls in Single player (the speak switch and hold-to-talk). The transcript is the subtitle of
 * everything the ghost says, spoken or not; the one polite live region of the app (not this log)
 * announces new lines. After a rate limit the controls wait for the advised delay.
 */

const WHO: Record<"you" | "ghost" | "system", string> = { you: "You", ghost: "Ghost", system: "Note" };

export function Chat({
  ui, voice, voiceAvailable, onSubmit, onClose, onSpeak, onPress, onRelease,
}: {
  ui: PlayUi;
  voice: VoiceUi;
  /** `flags.voiceEnabled`: when false the voice controls are not shown at all. */
  voiceAvailable: boolean;
  onSubmit: (input: { text: string } | { button: QuickButton }) => void;
  onClose: () => void;
  onSpeak: (on: boolean) => void;
  onPress: () => void;
  onRelease: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const gate = useRetryGate();

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [ui.lines.length]);
  useEffect(() => {
    if (ui.turnFailure?.retryAfterSec !== undefined) gate.arm(ui.turnFailure.retryAfterSec);
  }, [ui.turnFailure]);

  const waiting = ui.busy || !gate.enabled;

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (waiting || text.trim() === "") return;
    onSubmit({ text });
    setText("");
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  const isHold = (e: KeyboardEvent) => (e.key === " " || e.key === "Enter") && !e.repeat;

  return (
    <aside className="chat" aria-label="Chat with the ghost" onKeyDown={onKeyDown} data-chat>
      <div className="chat-head">
        <h2>The ghost</h2>
        <button className="button" type="button" onClick={onClose}>
          Close chat
        </button>
      </div>

      <ol ref={log} className="transcript" role="log" aria-live="off" aria-label="Conversation">
        {ui.lines.map((line) => (
          <li key={line.id} className={`line ${line.who}`}>
            <span className="who">{WHO[line.who]}: </span>
            {line.text}
          </li>
        ))}
      </ol>
      {!gate.enabled ? <p className="note">Please wait {gate.secondsLeft} seconds.</p> : null}

      <div className="quick" role="group" aria-label="Quick actions">
        {QUICK_BUTTONS.map((b) => (
          <button key={b} className="button" type="button" disabled={waiting} onClick={() => onSubmit({ button: b })}>
            {BUTTON_LABELS[b]}
          </button>
        ))}
      </div>

      <form className="say" onSubmit={send}>
        <label htmlFor="chat-input">Say something</label>
        <input
          id="chat-input" ref={input} type="text" value={text} maxLength={MAX_INPUT_CHARS} autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="button" type="submit" disabled={waiting || text.trim() === ""}>
          Send
        </button>
      </form>

      {voiceAvailable ? (
        <div className="voice" role="group" aria-label="Voice">
          <label>
            <input type="checkbox" checked={voice.speak} onChange={(e) => onSpeak(e.target.checked)} /> Speak aloud
          </label>
          {voice.mic === "unsupported" ? null : (
            <button
              className="button" type="button" aria-pressed={voice.mic === "recording"} disabled={voice.mic === "unavailable" || waiting}
              onPointerDown={(e) => { e.preventDefault(); onPress(); }}
              onPointerUp={onRelease} onPointerLeave={onRelease} onPointerCancel={onRelease}
              onKeyDown={(e) => { if (isHold(e)) { e.preventDefault(); onPress(); } }}
              onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onRelease(); } }}
            >
              Hold to talk
            </button>
          )}
          {voice.mic === "starting" ? <span className="mic">Waiting for the microphone…</span> : null}
          {voice.mic === "recording" ? <span className="mic" data-mic-indicator>● Listening… let go to send</span> : null}
          {voice.mic === "sending" ? <span className="mic">Sending…</span> : null}
          {voice.note !== null ? <p className="note">{voice.note}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
