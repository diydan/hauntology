import { useEffect, useRef, useState } from "react";
import { KNOCK_READ, readKnocks } from "@hauntology/shared/puzzles/knock";
import { useFrame } from "../hooks";
import type { KindProps } from "./types";
import "./Knock.css";

/** A click the microphone hears counts as a knock when its loudness jumps past this and past three times the room. */
const MIC_KNOCK = 0.12;
/** One knock cannot count twice inside this. */
const DEBOUNCE_MS = 150;

/**
 * Secret knock (puzzles Requirement 24): a locked door that opens only to the ghost's knock, heard once in an earlier place (the Sight).
 * Press Knock, then knock the pattern on the table: the microphone hears the clicks (a loudness number only, nothing is recorded or sent),
 * and the Tap control always counts as a knock, so the touch path is complete. After a quiet spell the knocks go in by themselves.
 * Each knock thunks, buzzes and adds a dot, so the knocking can be followed with the sound off. The right knock opens the door slowly (the host
 * shows the result); a wrong one shakes nothing and says what was heard.
 */
export default function Knock({ view, feel, elapsed, submit, announce, resetKey, reducedMotion }: KindProps<"knock">) {
  const [listening, setListening] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const latest = useRef({ listening: false, times: [] as number[], last: -Infinity, prev: 0 }); // the live values, read inside a frame and a tap

  useEffect(() => () => { feel.breath.stop(); }, [feel]);

  const knock = (): void => {
    const cur = latest.current;
    if (!cur.listening) return;
    const t = elapsed();
    if (t - cur.last < DEBOUNCE_MS) return;
    cur.last = t;
    const next = [...cur.times, t];
    cur.times = next;
    setTimes(next);
    feel.synth.play("thunk");
    feel.haptics.buzz("tick");
  };

  const finish = (): void => {
    const cur = latest.current;
    if (!cur.listening) return;
    cur.listening = false;
    setListening(false);
    feel.breath.stop();
    const heard = readKnocks(cur.times);
    announce(heard.groups.length ? `You knocked ${heard.groups.join(", ")}.` : "No knock was heard.");
    submit({ times: cur.times });
  };

  // every frame while listening: a click from the microphone is a knock, and a quiet spell after the last knock ends the try
  useFrame(() => {
    const cur = latest.current;
    if (!cur.listening) return;
    const b = feel.breath;
    if (b.state === "on") {
      const level = b.level;
      const needed = Math.max(MIC_KNOCK, b.threshold);
      if (level >= needed && cur.prev < needed) knock();
      cur.prev = level;
    }
    if (cur.times.length > 0 && elapsed() - (cur.times[cur.times.length - 1] as number) >= KNOCK_READ.quietMs) finish();
  }, listening);

  const start = (): void => {
    const cur = latest.current;
    if (cur.listening) return;
    cur.listening = true;
    cur.times = [];
    cur.last = -Infinity;
    cur.prev = 0;
    setTimes([]);
    setListening(true);
    feel.haptics.newAttempt();
    void feel.breath.start(); // from this tap, so a phone that asks can ask; the Tap control works whatever it answers
    announce("Knock now. Tap the door if you cannot knock.");
  };

  // a wrong Attempt clears the knocks (the host raises resetKey)
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.times = [];
    setTimes([]);
  }, [resetKey]);

  const heard = readKnocks(times).groups;
  const shape = `${view.groups} groups${view.longPause ? ", one long pause" : ""}`;
  return (
    <div className="pz-knock">
      <p className="ui-hint pz-hint">Knock the ghost&apos;s knock on the table: {shape}. Press Knock first.</p>
      <div className="pz-field pz-visual">
        <button
          type="button"
          className="pz-door"
          data-listening={listening ? "true" : "false"}
          data-still={reducedMotion ? "true" : "false"}
          disabled={!listening}
          aria-label="Tap the door: one knock"
          onClick={knock}
        >
          <span className="pz-door-knocker" aria-hidden="true" />
          <span className="pz-door-handle" aria-hidden="true" />
        </button>
        <p className="pz-knock-marks" role="img" aria-label={times.length ? `Knocked so far: ${heard.join(", ")}` : "No knocks yet"}>
          {times.length ? heard.map((g) => "●".repeat(g).split("").join(" ")).join("   ") : "·"}
        </p>
      </div>
      <div className="ui-row ui-row--center">
        <button type="button" className="ui-button ui-button--primary" disabled={listening} onClick={start}>{listening ? "Listening…" : "Knock"}</button>
        <button type="button" className="ui-button" disabled={!listening || times.length === 0} onClick={finish}>Done</button>
      </div>
      <p className="ui-hint pz-hint pz-more">The phone listens for knocks on the table. It hears loudness only. Or tap the door, once a knock.</p>
    </div>
  );
}
