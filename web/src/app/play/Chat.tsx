import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRetryGate } from "../useRetryGate";
import { BUTTON_LABELS, MAX_INPUT_CHARS, QUICK_BUTTONS, type PlayUi, type QuickButton } from "./controller";
import type { GhostFace } from "./ghost-face";
import type { VoiceUi } from "./voice";

/**
 * The Chat with the ghost (ghost-engine 6.1, built from the design elements, Requirement 10.3): a
 * sheet on a phone and a side panel from 900 px, with the ghost on a lit stage (portrait, nameplate
 * and its latest words), the transcript as the log of everything said, five quiet quick buttons, a
 * text box, and the voice controls in Single player (the speak switch and hold-to-talk). The
 * transcript is the subtitle of everything the ghost says, spoken or not; the one polite live
 * region of the app (not this log) announces new lines, so the log itself stays `aria-live="off"`
 * and nothing is read twice. After a rate limit the controls wait for the advised delay.
 */

const WHO: Record<"you" | "ghost" | "system", string> = { you: "You", ghost: "Ghost", system: "Note" };

/** One line, under the text box: the words a visitor types may go to a model (ghost-engine Requirement 2.4; `ghost-safety.md`). It says so where they type, and only when the server says a model is really on (`flags.ghostModel`), so it never tells a visitor something that is not so. */
export const MODEL_NOTE = "What you type may be sent to an AI model (Claude Haiku) to help word the ghost's replies.";

/** Shown on the stage before the ghost has said anything. */
export const STAGE_WAITING = "Press a button, or say something.";

export function Chat({
  ui, voice, voiceAvailable, modelOn, ghost, onSubmit, onClose, onSpeak, onPress, onRelease,
}: {
  ui: PlayUi;
  voice: VoiceUi;
  /** `flags.voiceEnabled`: when false the voice controls are not shown at all. */
  voiceAvailable: boolean;
  /** `flags.ghostModel`: the ghost's words may come from an AI model. Only then is the note about typed words shown. */
  modelOn: boolean;
  /** Who the visitor is talking to: a name, a portrait and the Speaker's colour. */
  ghost: GhostFace;
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
  const latest = ui.reply?.text ?? null;

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
    <aside className="chat ui-sheet is-open" aria-label="Chat with the ghost" onKeyDown={onKeyDown} data-chat>
      <div className="ui-sheet-head">
        <h2 className="ui-sheet-title">The ghost</h2>
        <button className="ui-button ui-button--quiet" type="button" onClick={onClose}>
          Close chat
        </button>
      </div>

      <div className={`chat-stage ui-stage ui-stage--${ghost.speaker}`} data-stage aria-busy={ui.busy}>
        <div className={`ui-portrait ui-portrait--${ghost.speaker}${voice.speaking ? " is-speaking" : ""}`} data-portrait>
          {ghost.sprite === null ? (
            <div className={`ui-orb${ghost.speaker === "whisper" ? " ui-orb--whisper" : ""}${voice.speaking ? " is-speaking" : ""}`} />
          ) : (
            <img src={ghost.sprite} alt="" />
          )}
        </div>
        <div className={`ui-nameplate ui-nameplate--${ghost.speaker}`} data-nameplate>
          {ghost.name}
        </div>
        <div className="ui-dialogue" data-dialogue>
          <p className={`ui-speech${latest === null ? " ui-speech-tail" : ""}`}>{latest ?? STAGE_WAITING}</p>
        </div>
      </div>

      <ol ref={log} className="transcript ui-log" role="log" aria-live="off" aria-label="Conversation">
        {ui.lines.map((line) => (
          <li key={line.id} className="ui-log-row" data-who={line.who}>
            <span className="ui-log-who">{WHO[line.who]}: </span>
            {line.text}
          </li>
        ))}
      </ol>
      {!gate.enabled ? <p className="ui-note">Please wait {gate.secondsLeft} seconds.</p> : null}

      <div className="ui-choices chat-quick" role="group" aria-label="Quick actions">
        {QUICK_BUTTONS.map((b) => (
          <button key={b} className="ui-button ui-button--quiet" type="button" disabled={waiting} onClick={() => onSubmit({ button: b })}>
            {BUTTON_LABELS[b]}
          </button>
        ))}
      </div>

      <form onSubmit={send}>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="chat-input">Say something</label>
          <input
            className="ui-input" id="chat-input" ref={input} type="text" value={text} maxLength={MAX_INPUT_CHARS} autoComplete="off"
            {...(modelOn ? { "aria-describedby": "chat-model-note" } : {})}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {modelOn ? <p className="ui-note" id="chat-model-note" data-model-note>{MODEL_NOTE}</p> : null}
        <button className="ui-button ui-button--primary" type="submit" disabled={waiting || text.trim() === ""}>
          Send
        </button>
      </form>

      {voiceAvailable ? (
        <div role="group" aria-label="Voice">
          <div className="ui-field ui-field--check">
            <input className="ui-check" id="chat-speak" type="checkbox" checked={voice.speak} onChange={(e) => onSpeak(e.target.checked)} />
            <label className="ui-field-label" htmlFor="chat-speak">Speak aloud</label>
          </div>
          {voice.mic === "unsupported" ? null : (
            <button
              className="ui-button" type="button" aria-pressed={voice.mic === "recording"} disabled={voice.mic === "unavailable" || waiting}
              onPointerDown={(e) => { e.preventDefault(); onPress(); }}
              onPointerUp={onRelease} onPointerLeave={onRelease} onPointerCancel={onRelease}
              onKeyDown={(e) => { if (isHold(e)) { e.preventDefault(); onPress(); } }}
              onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onRelease(); } }}
            >
              Hold to talk
            </button>
          )}
          {voice.mic === "starting" ? <span className="ui-hint">Waiting for the microphone…</span> : null}
          {voice.mic === "recording" ? <span className="ui-hint" data-mic-indicator>● Listening… let go to send</span> : null}
          {voice.mic === "sending" ? <span className="ui-hint">Sending…</span> : null}
          {voice.note !== null ? <p className="ui-note">{voice.note}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
