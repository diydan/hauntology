import { useState, type ReactNode } from "react";
import { STITCH_QUESTION } from "@hauntology/shared/voice/stitch/consent";
import { WORD_BANK } from "@hauntology/shared/voice/stitch/wordbank";
import { encodeB64 } from "@hauntology/shared/party/room-stitch";
import { browserRecorder, type Recorder } from "../../phone/recorder";
import type { GameView } from "../game-view";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;
const WORD_RESULT: Readonly<Record<string, string>> = { not_heard: "That did not sound like the word. Try again.", limit: "No more tries for that word.", check_unavailable: "Checking is not available now. Try later.", voice_unavailable: "Checking is not available now. Try later." };

/**
 * Stitch on the phone (party-mode 9.20): the join question in plain words with the age-or-guardian tick, the Player's own yes, and recording the
 * twelve words. Nothing is asked until the Master turned Stitch on. Each word is checked by the Room and the answer shown in words; leaving
 * deletes the clips (this sends `stitchLeave`, and "No" deletes this seat's clips as well). The recording never leaves the phone except to the Room.
 */
export function StitchPanel({ game, send, record = browserRecorder }: { game: GameView; send: Send; record?: Recorder }): ReactNode {
  const on = (game.lobby?.switches as { stitch?: boolean } | undefined)?.stitch === true;
  const [yes, setYes] = useState(false);
  const [tick, setTick] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  if (!on) return null;
  const answer = (y: boolean, t: boolean): void => { setYes(y); setTick(t); send({ t: "stitchAnswer", yes: y, tick: t }); if (!y) { setDone([]); } };
  const go = async (word: string): Promise<void> => {
    setBusy(word); setNote(null);
    const clip = await record(2000);
    if (clip === null) { setBusy(null); setNote("This phone could not record. You can skip this."); return; }
    send({ t: "stitchClip", word, audio: encodeB64(clip.bytes), contentType: clip.contentType, durationMs: Math.max(1, Math.min(2000, clip.durationMs)) });
    setBusy(null);
  };
  const last = game.stitch;
  const ok = yes && tick;
  const heard = last?.ok === true && !done.includes(last.word) ? [...done, last.word] : done;
  return (
    <section className="ui-card ui-stack" aria-label="Stitch">
      <h2 className="ui-heading">Let the ghost whisper in your voice?</h2>
      <p className="ui-hint">{STITCH_QUESTION.prompt}</p>
      <div className="ui-field ui-field--check">
        <input id="pc-stitch-yes" type="checkbox" className="ui-check" checked={yes} onChange={(e) => answer(e.currentTarget.checked, tick)} />
        <label className="ui-field-label" htmlFor="pc-stitch-yes">Yes, you may use my voice</label>
      </div>
      <div className="ui-field ui-field--check">
        <input id="pc-stitch-tick" type="checkbox" className="ui-check" checked={tick} onChange={(e) => answer(yes, e.currentTarget.checked)} />
        <label className="ui-field-label" htmlFor="pc-stitch-tick">{STITCH_QUESTION.tickLabel}</label>
      </div>
      {ok ? (
        <div className="ui-stack--tight">
          <p className="ui-hint">Say each word clearly after you tap it. {heard.length} of {WORD_BANK.length} done. You can stop any time.</p>
          <ul className="ui-chips">
            {WORD_BANK.map((w) => (
              <li key={w}><button type="button" className="ui-button" disabled={busy !== null} aria-label={`Record the word ${w}${heard.includes(w) ? " again" : ""}`} onClick={() => void go(w)}>{w}{heard.includes(w) ? " ✓" : ""}</button></li>
            ))}
          </ul>
          {busy !== null ? <p className="ui-hint" role="status">Listening for “{busy}”…</p> : null}
          {last !== null && !last.ok ? <p className="ui-notice" role="alert">{WORD_RESULT[last.reason ?? ""] ?? "That word was not kept."}</p> : null}
          {note !== null ? <p className="ui-hint" role="status">{note}</p> : null}
          <button type="button" className="ui-button ui-button--quiet" onClick={() => { send({ t: "stitchLeave" }); setDone([]); setYes(false); setTick(false); send({ t: "stitchAnswer", yes: false, tick: false }); }}>Delete my recordings</button>
        </div>
      ) : null}
    </section>
  );
}
