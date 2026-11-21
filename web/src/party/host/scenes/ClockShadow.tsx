import { useEffect, useRef, useState, type ReactNode } from "react";
import { CLOCK_RAN_OUT, CLOCK_SHADOW_CLIP, CLOCK_SHADOW_SECONDS, SHADOW_MIN_STEP_MS, frameTime, shadowMode, shadowReading } from "@hauntology/shared/party/scenes";
import { clockWords } from "../../controller/play/play-logic";
import { footageRuns, type SceneDeps } from "./types";

/**
 * The clock shadow on the Host (puzzles 14.2, Requirements 19.1 to 19.5): one clip of a shadow climbing a stair, scrubbed and never played, whose
 * position is `1 - remaining / base` of the public Turn Clock. It reads nothing but the clock the HUD already shows, stands still while paused, is
 * not drawn where the Master chose no clock, moves once a second (never ahead of the clock) under reduced motion, data saver or footage off, sets
 * the clip's time at most ten times a second, and always has the clock as numbers beside it. When the clock reaches zero it shows the last frame
 * and says so in words.
 */
export function ClockShadow({ baseMs, remainingMs, paused, nowMs, reducedMotion, deps }: {
  baseMs: number | null; remainingMs: number | null; paused: boolean; nowMs: number; reducedMotion: boolean; deps?: SceneDeps;
}): ReactNode {
  const hasClock = baseMs !== null && remainingMs !== null;
  const footage = footageRuns(deps, reducedMotion);
  const mode = shadowMode({ hasClock, footage: deps?.footage === true, reducedMotion, saveData: deps?.saveData === true });
  const last = useRef(0);
  const lastSetMs = useRef(Number.NEGATIVE_INFINITY);
  const video = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const position = shadowReading({ baseMs, remainingMs, paused, mode, lastPosition: last.current });
  // the number carried between renders is what stands still while paused
  useEffect(() => { if (!paused) last.current = position; });
  const ranOut = hasClock && !paused && remainingMs <= 0;

  // scrub: set the clip's time at most ten times a second (the last frame is always set)
  const shown = mode === "scrub" && !failed;
  useEffect(() => {
    const v = video.current;
    if (v === null || !shown) return;
    if (nowMs - lastSetMs.current < SHADOW_MIN_STEP_MS && !ranOut) return;
    lastSetMs.current = nowMs;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : CLOCK_SHADOW_SECONDS;
    v.currentTime = frameTime(position, dur);
  }, [nowMs, position, shown, ranOut]);

  if (mode === "none") return null;
  const webm = deps?.clipUrl(CLOCK_SHADOW_CLIP, "webm") ?? null;
  const mp4 = deps?.clipUrl(CLOCK_SHADOW_CLIP, "mp4") ?? null;
  const still = deps?.clipUrl(CLOCK_SHADOW_CLIP, "jpg") ?? null;
  const pct = Math.round(position * 100);
  return (
    <section className="ph-shadow ui-stack--tight" aria-label="The shadow on the stairs" data-mode={mode} data-position={pct}>
      {footage && !failed && (webm !== null || mp4 !== null) ? (
        <figure className="ui-figure ph-shadow-picture">
          <video ref={video} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} poster={still ?? undefined} onError={() => setFailed(true)}>
            {webm !== null ? <source src={webm} type="video/webm" /> : null}
            {mp4 !== null ? <source src={mp4} type="video/mp4" /> : null}
          </video>
        </figure>
      ) : still !== null && deps?.footage === true ? (
        <figure className="ui-figure ph-shadow-picture"><img src={still} alt="" /></figure>
      ) : null}
      {/* the picture is never the only signal: the same clock as numbers, and in a gauge of its own */}
      <div className="ui-gauge ui-gauge--thin" aria-hidden="true"><span className="ui-gauge-fill" style={{ width: `${pct}%` }} /></div>
      <p className="ui-hint">The shadow has climbed {pct} per cent of the stair. Time left {clockWords(remainingMs, paused)}.</p>
      <p className="ui-sr-only" role="status" aria-live="polite">{ranOut ? CLOCK_RAN_OUT : ""}</p>
    </section>
  );
}
