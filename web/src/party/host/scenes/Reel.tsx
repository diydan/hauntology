import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { LINE_AT, SHOTS, SHOT_TEXT, SOUND_AT, reelShot, type Shot } from "@hauntology/shared/party/scenes";
import { REEL_START, lineFor, soundFor, stepReel } from "@hauntology/shared/party/reel";
import { footageRuns, type SceneDeps } from "./types";

/**
 * The Reel on the Host (puzzles 14.3, Requirements 20.1 to 20.9): the film plays forward as the public Haunt level rises. On each rise the shot
 * of the new level plays once, muted, and the Reel says in words what it shows and that a Haunt Event fired (the Haunt number and its meter stay
 * in the HUD). It never plays while `blocked` (the 15 seconds after a Suggestion, or an answer choice) and plays when that ends; it can always be
 * skipped; a Lull holds the lower shot on its last frame and says nothing; the line written for the picture is in words whatever the Master
 * chose, spoken only where narration is on and the Room is not speaking, and starts at its moment (at once for a still picture). The Blackout's
 * dim is the Host scene's own overlay (`HostEffects`), which sits above this picture, so the shot dims by the same amount over the same time.
 * Not shown on the Display. With no clip files it is the words alone.
 */
export function Reel({ level, max, blocked, roomLineBusy, reducedMotion, deps }: {
  level: number; max: number; blocked: boolean; roomLineBusy: boolean; reducedMotion: boolean; deps?: SceneDeps;
}): ReactNode {
  const [state, dispatch] = useReducer(stepReel, REEL_START);
  useEffect(() => { dispatch({ t: "level", level, max }); }, [level, max]);
  useEffect(() => { dispatch({ t: "blocked", blocked }); }, [blocked]);

  const footage = footageRuns(deps, reducedMotion);
  const playing = state.playing;
  const clip = playing === null ? null : SHOTS[playing];
  const webm = clip !== null ? deps?.clipUrl(clip, "webm") ?? null : null;
  const mp4 = clip !== null ? deps?.clipUrl(clip, "mp4") ?? null : null;
  const heldClip = state.held === null ? null : SHOTS[state.held];
  const heldStill = heldClip === null ? null : deps?.clipUrl(heldClip, "jpg") ?? null;
  const hasVideo = footage && (webm !== null || mp4 !== null);
  // a shot with no picture to wait for ends at once: its words (and sound and line, at once) are all there is
  const stillPicture = !hasVideo;

  // (a Lull never reaches here: the reducer holds the lower shot and plays nothing, so there is no line to say)
  // the line of the shot that plays now, its sound and its voice, each at its moment and dropped when the play changes
  const [lineText, setLineText] = useState("");
  const spoken = useRef(-1);
  const d = useRef(deps);
  d.current = deps;
  const busy = useRef(roomLineBusy);
  busy.current = roomLineBusy;
  useEffect(() => {
    if (state.playing === null) return;
    const shot: Shot = state.playing;
    const handles: ReturnType<typeof setTimeout>[] = [];
    const line = lineFor(shot, { narrationOn: d.current?.narrationOn === true, roomLineBusy: busy.current, stillPicture, lull: false }, LINE_AT[shot]);
    if (line !== null) {
      handles.push(setTimeout(() => {
        setLineText(line.line.text);
        if (line.speak && spoken.current !== state.plays) { spoken.current = state.plays; d.current?.speak?.(line.line); }
      }, line.atS * 1000));
    }
    const snd = soundFor(shot, { soundOn: d.current?.soundOn === true });
    if (snd !== null) handles.push(setTimeout(() => d.current?.playSound?.(snd.sound), (stillPicture ? 0 : SOUND_AT[snd.sound]) * 1000));
    if (stillPicture) handles.push(setTimeout(() => dispatch({ t: "done" }), 0));
    return () => { for (const h of handles) clearTimeout(h); };
    // a new play (not a re-render) starts the line, the sound and the voice afresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plays, state.playing]);
  // the line goes when the level moves on (a step back too) or the Reel is skipped
  useEffect(() => { setLineText(""); }, [state.level, state.skips]);

  if (state.held === null) return null;
  const shown = state.playing ?? state.held;
  return (
    <section className="ph-reel ui-stack--tight" aria-label="The film" data-shot={shown} data-playing={state.playing !== null ? "true" : undefined}>
      {hasVideo && state.playing !== null ? (
        <figure className="ui-figure ph-reel-picture" data-testid="ph-reel-video">
          <video key={state.plays} muted playsInline autoPlay preload="auto" aria-hidden="true" tabIndex={-1} onEnded={() => dispatch({ t: "done" })} onError={() => dispatch({ t: "done" })}>
            {webm !== null ? <source src={webm} type="video/webm" /> : null}
            {mp4 !== null ? <source src={mp4} type="video/mp4" /> : null}
          </video>
        </figure>
      ) : heldStill !== null && deps?.footage === true ? (
        <figure className="ui-figure ph-reel-picture"><img src={heldStill} alt="" /></figure>
      ) : null}
      {state.playing !== null && hasVideo ? <button type="button" className="ui-button ui-button--main ph-skip" onClick={() => dispatch({ t: "skip" })}>Skip the film</button> : null}
      <p className="ui-hint" data-testid="ph-reel-shows">{SHOT_TEXT[reelShot(state.level ?? level, max)]}</p>
      {lineText !== "" ? <p className="ui-speech" data-testid="ph-reel-line">{lineText}</p> : null}
      <ol className="ui-log ui-sr-only" aria-label="The film" aria-live="polite" aria-relevant="additions" data-testid="ph-reel-said">
        {state.said.slice(-6).map((w, i) => <li key={`${state.plays}-${i}-${w}`} className="ui-log-row">{w}</li>)}
      </ol>
    </section>
  );
}
