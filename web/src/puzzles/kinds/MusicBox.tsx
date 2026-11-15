import { useEffect, useRef, useState } from "react";
import { useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./MusicBox.css";

type Note = 0 | 1 | 2 | 3 | 4;
/** Each key differs by shape and number, never by colour alone. */
const SHAPES = ["●", "■", "▲", "◆", "★"] as const;
const SHAPE_NAMES = ["circle", "square", "triangle", "diamond", "star"] as const;
const KEYS: readonly Note[] = [0, 1, 2, 3, 4];
/** Time between the notes of the tune, and how long a key stays lit. */
const NOTE_MS = 650;
const LIT_TUNE_MS = 420;
const LIT_TAP_MS = 260;

/**
 * Music box: press Wind to hear the tune (up to three times), then play it back on the five keys. Every note, heard or
 * played, also lights its key and buzzes once, so the tune can be followed with the sound off. The answer goes in by
 * itself once as many notes as the tune has are played; Clear starts the notes again.
 */
export default function MusicBox({ view, feel, submit, announce, resetKey }: KindProps<"musicbox">) {
  const [notes, setNotes] = useState<number[]>([]);
  const [used, setUsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const latest = useLatest({ notes, used, playing });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  };
  // every timer goes when the screen does
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const id of all) clearTimeout(id);
      all.clear();
      if (litTimer.current !== null) clearTimeout(litTimer.current);
      litTimer.current = null;
    };
  }, []);

  /** The note's key lights (the visual twin, it happens with the sound muted too), buzzes once and sounds. */
  const sound = (i: Note, litMs: number): void => {
    setLit(i);
    if (litTimer.current !== null) clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => { litTimer.current = null; setLit(null); }, litMs);
    feel.synth.note(i);
    feel.haptics.buzz("tick");
  };

  const wind = (): void => {
    const cur = latest.current;
    if (cur.playing || cur.used >= view.plays) return;
    cur.playing = true;
    cur.used += 1;
    setPlaying(true);
    setUsed(cur.used);
    announce("The tune plays. Watch the keys light up.");
    const step = (k: number): void => {
      const note = view.tune[k];
      if (note === undefined) { latest.current.playing = false; setPlaying(false); return; }
      sound(note as Note, LIT_TUNE_MS);
      later(() => step(k + 1), NOTE_MS);
    };
    step(0);
  };

  const press = (i: Note): void => {
    const cur = latest.current;
    if (cur.playing || cur.notes.length >= view.n) return;
    sound(i, LIT_TAP_MS);
    const next = [...cur.notes, i];
    cur.notes = next;
    setNotes(next);
    if (next.length === view.n) submit({ notes: next });
  };
  const clear = (): void => { latest.current.notes = []; setNotes([]); };

  // A wrong Attempt clears the notes (the host raises resetKey); the winds already used stay used.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.notes = [];
    setNotes([]);
  }, [resetKey, latest]);

  const left = view.plays - used;
  const windText = playing ? "Playing…" : left > 0 ? `Wind (${left} left)` : "No winds left";
  return (
    <div className="pz-musicbox">
      <p className="ui-hint pz-hint">Press Wind to hear the {view.n}-note tune, then play it back on the keys.</p>
      <div className="ui-row ui-row--center">
        <button type="button" className="ui-button ui-button--primary" disabled={playing || left <= 0} onClick={wind}>{windText}</button>
      </div>
      <div className="pz-field">
        <div className="pz-keys" role="group" aria-label="Keys">
          {KEYS.map((i) => (
            <button key={i} type="button" className="pz-key" disabled={playing} aria-label={`Key ${i + 1}, ${SHAPE_NAMES[i]}`} data-lit={lit === i ? "true" : "false"} onClick={() => press(i)}>
              <span className="pz-key-shape" aria-hidden="true">{SHAPES[i]}</span>
              <span className="pz-key-num" aria-hidden="true">{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="pz-digits pz-notes" role="img" aria-label={`Played so far: ${notes.length} of ${view.n} notes`}>
          {Array.from({ length: view.n }, (_, i) => <span key={i}>{notes[i] === undefined ? "·" : SHAPES[notes[i] as Note]}</span>)}
        </div>
      </div>
      <div className="ui-row ui-row--center">
        <button type="button" className="ui-button" disabled={notes.length === 0} onClick={clear}>Clear</button>
      </div>
      <p className="ui-hint pz-hint">No sound? Watch the keys light up: the tune is shown by the shapes.</p>
    </div>
  );
}
