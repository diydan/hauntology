import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRetryGate } from "../useRetryGate";
import { BUTTON_LABELS, MAX_INPUT_CHARS, QUICK_BUTTONS, type PlayUi, type QuickButton } from "./controller";
import type { GhostFace } from "./ghost-face";
import { LIVE_QUOTA_UNAVAILABLE, LIVE_SPEAK_REQUIRED, VOICE_STT_UNAVAILABLE, VOICE_TTS_UNAVAILABLE, type VoiceUi } from "./voice";

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
  ui, voice, voiceAvailable, ttsAvailable = true, sttAvailable = true, liveEnabled = false, liveAvailable = true, modelOn, ghost, onSubmit, onClose, onSpeak, onPress, onRelease, onStartLive, onStopLive,
}: {
  ui: PlayUi;
  voice: VoiceUi;
  /** `flags.voiceEnabled`: when false the voice controls are not shown at all. */
  voiceAvailable: boolean;
  /** Remaining TTS quota (`tts > 0`): when false, Speak aloud is shown as unavailable with subtitles on. */
  ttsAvailable?: boolean;
  /** Remaining STT quota (`stt > 0`): when false, Hold to talk is shown as unavailable with typing open. */
  sttAvailable?: boolean;
  /** `flags.liveEnabled`: whether Live mode controls are shown (ghost-voice 4.5). */
  liveEnabled?: boolean;
  /** Remaining Live quota (`live > 0`). */
  liveAvailable?: boolean;
  /** `flags.ghostModel`: the ghost's words may come from an AI model. Only then is the note about typed words shown. */
  modelOn: boolean;
  /** Who the visitor is talking to: a name, a portrait and the Speaker's colour. */
  ghost: GhostFace;
  onSubmit: (input: { text: string } | { button: QuickButton }) => void;
  onClose: () => void;
  onSpeak: (on: boolean) => void;
  onPress: () => void;
  onRelease: () => void;
  onStartLive?: () => void;
  onStopLive?: () => void;
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
            <input
              className="ui-check" id="chat-speak" type="checkbox"
              checked={ttsAvailable && voice.speak} disabled={!ttsAvailable}
              onChange={(e) => { if (ttsAvailable) onSpeak(e.target.checked); }}
            />
            <label className="ui-field-label" htmlFor="chat-speak">Speak aloud</label>
          </div>
          {!ttsAvailable ? <p className="ui-note" data-tts-unavailable>{VOICE_TTS_UNAVAILABLE}</p> : null}
          {voice.mic === "unsupported" || (liveEnabled && voice.live !== undefined && voice.live !== "off") ? null : (
            <button
              className="ui-button" type="button" aria-pressed={voice.mic === "recording"}
              disabled={!sttAvailable || voice.mic === "unavailable" || waiting}
              onPointerDown={(e) => { if (!sttAvailable) return; e.preventDefault(); onPress(); }}
              onPointerUp={() => { if (sttAvailable) onRelease(); }}
              onPointerLeave={() => { if (sttAvailable) onRelease(); }}
              onPointerCancel={() => { if (sttAvailable) onRelease(); }}
              onKeyDown={(e) => { if (sttAvailable && isHold(e)) { e.preventDefault(); onPress(); } }}
              onKeyUp={(e) => { if (sttAvailable && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onRelease(); } }}
            >
              Hold to talk
            </button>
          )}
          {!sttAvailable && !(liveEnabled && voice.live !== undefined && voice.live !== "off") ? <p className="ui-note" data-stt-unavailable>{VOICE_STT_UNAVAILABLE}</p> : null}
          {liveEnabled ? (
            voice.live !== undefined && voice.live !== "off" ? (
              <>
                <span className="ui-hint" data-mic-indicator>● Live listening…</span>
                <button className="ui-button" type="button" onClick={onStopLive}>
                  Stop live
                </button>
              </>
            ) : (
              <>
                <button
                  className="ui-button" type="button"
                  disabled={!ttsAvailable || !voice.speak || !liveAvailable || waiting}
                  onClick={onStartLive}
                >
                  Live mode
                </button>
                {!ttsAvailable || !voice.speak ? (
                  <p className="ui-note" data-live-reason>{LIVE_SPEAK_REQUIRED}</p>
                ) : !liveAvailable ? (
                  <p className="ui-note" data-live-reason>{LIVE_QUOTA_UNAVAILABLE}</p>
                ) : null}
              </>
            )
          ) : null}
          {voice.mic === "starting" ? <span className="ui-hint">Waiting for the microphone…</span> : null}
          {voice.mic === "recording" ? <span className="ui-hint" data-mic-indicator>● Listening… let go to send</span> : null}
          {voice.mic === "sending" ? <span className="ui-hint">Sending…</span> : null}
          {voice.note !== null ? <p className="ui-note">{voice.note}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
