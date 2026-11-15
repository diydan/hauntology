import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KIND_INFO } from "@hauntology/shared/puzzles/kinds";
import type { Kind, LockView, Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { FeelEvent, PuzzleFeel } from "./feel/types";
import { useFeelValue, useWakeLock } from "./hooks";
import { KIND_SCREENS } from "./kinds/registry";
import type { KindProps } from "./kinds/types";
import { SightCard } from "./SightCard";
import "./puzzles.css";

/** What the Room (or the local demo) answers to an Attempt. It says nothing about which part was wrong. */
export type AttemptReply =
  | Readonly<{ outcome: "solved" }>
  | Readonly<{ outcome: "wrong"; attemptsLeft: number }>
  | Readonly<{ outcome: "failed"; reason: string }>;

export type PuzzleHostProps = Readonly<{
  kind: Kind;
  view: LockView;
  /** The clue to show first when the Sight was missed. */
  faded: Sight | null;
  /** The most Turn time this Lock may use, or null (Wander has no clock). */
  capMs: number | null;
  attempts: number;
  feel: PuzzleFeel;
  assist: boolean;
  reducedMotion: boolean;
  onAttempt: (t: Transcript) => AttemptReply | Promise<AttemptReply>;
  onGiveUp: () => void;
  /** The Cap ran out. */
  onTimeUp?: () => void;
  /** The Player tapped Done on the result. */
  onFinish?: (reply: AttemptReply) => void;
  /** Wander only: Skip is offered (after 20 s or two wrong Attempts). */
  onSkip?: () => void;
  /** Spirit board only: say the word (the Whisper's line, or a voice). */
  onHear?: () => boolean | void | Promise<boolean | void>;
  now?: () => number;
}>;

type Screen = ComponentType<KindProps<Kind>>;

const fmtS = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/**
 * The frame around every Kind: the faded clue (when the Sight was missed), the timer, the Attempts, the Touch-path
 * controls, the result and a live region for screen readers. It owns the clock and the answers; the Kind screen only
 * draws and plays. Heavy screens load only when needed, and nothing here needs motion, sound or buzz.
 */
export function PuzzleHost(props: PuzzleHostProps): ReactNode {
  const { kind, view, faded, capMs, attempts, feel, assist, reducedMotion, onAttempt, onGiveUp, onTimeUp, onFinish, onSkip, onHear } = props;
  const now = props.now ?? (() => performance.now());
  const [phase, setPhase] = useState<"faded" | "play" | "done">(faded ? "faded" : "play");
  const [wrong, setWrong] = useState(0);
  const [reply, setReply] = useState<AttemptReply | null>(null);
  const [message, setMessage] = useState("");
  const [shown, setShown] = useState(0);
  const [twin, setTwin] = useState<FeelEvent | null>(null);
  const [glow, setGlow] = useState(0);
  const startedAt = useRef(0);
  const pending = useRef(false);
  const timedOut = useRef(false);
  const nowRef = useRef(now);
  nowRef.current = now;

  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const info = KIND_INFO[kind];
  useWakeLock(phase === "play"); // the screen stays awake while the Lock is open

  // the clock starts when the Lock itself appears (after the faded clue)
  useEffect(() => { if (phase === "play") startedAt.current = nowRef.current(); }, [phase]);
  const elapsed = useCallback((): number => (phase === "play" ? nowRef.current() - startedAt.current : 0), [phase]);

  // the timer text, a few times a second; and the Cap
  useEffect(() => {
    if (phase !== "play") return undefined;
    const id = setInterval(() => {
      const e = nowRef.current() - startedAt.current;
      setShown(e);
      if (capMs !== null && e >= capMs && !timedOut.current) { timedOut.current = true; onTimeUp?.(); }
    }, 250);
    return () => clearInterval(id);
  }, [phase, capMs, onTimeUp]);

  // the visual twin of every buzz and sound
  useEffect(() => feel.onEvent((e) => {
    setTwin(e);
    if (e.type === "buzz" && !reducedMotion) setGlow((g) => g + 1);
  }), [feel, reducedMotion]);
  useEffect(() => {
    if (twin === null) return undefined;
    const id = setTimeout(() => setTwin(null), 800);
    return () => clearTimeout(id);
  }, [twin]);
  useEffect(() => () => { feel.closeLock(); }, [feel]);

  const announce = useCallback((text: string): void => setMessage(text), []);

  const submit = useCallback((payload: Record<string, unknown>): void => {
    if (phase !== "play" || pending.current) return;
    pending.current = true;
    const transcript = { kind, ...payload, elapsedMs: Math.round(nowRef.current() - startedAt.current) } as Transcript;
    void Promise.resolve(onAttempt(transcript)).then((r) => {
      pending.current = false;
      if (r.outcome === "wrong") {
        feel.haptics.buzz("buzz");
        feel.synth.play("zap");
        feel.haptics.newAttempt();
        setWrong((w) => w + 1);
        setMessage(`Not right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? "try" : "tries"} left.`);
        return;
      }
      if (r.outcome === "solved") { feel.haptics.buzz("thunk"); feel.synth.play("thunk"); setMessage("Opened."); }
      else setMessage("Nothing came loose.");
      setReply(r);
      setPhase("done");
    }, () => { pending.current = false; setMessage("That did not go through. Try again."); });
  }, [phase, kind, onAttempt, feel]);

  const Screen = KIND_SCREENS[kind] as unknown as Screen;
  const pips = useMemo(() => Array.from({ length: attempts }, (_, i) => i < wrong), [attempts, wrong]);
  const skipOffered = onSkip !== undefined && (wrong >= 2 || shown >= 20_000);

  if (phase === "faded" && faded) {
    return (
      <section className="pz-host" aria-label="Puzzle">
        <SightCard sight={faded} title="A faded memory…" feel={feel} onDone={() => setPhase("play")} now={now} />
      </section>
    );
  }
  return (
    <section className={`pz-host${glow === 0 ? "" : glow % 2 === 1 ? " pz-glow-a" : " pz-glow-b"}`} aria-label="Puzzle">
      <header className="pz-bar-row">
        <div className="pz-pips" role="img" aria-label={`${attempts - wrong} of ${attempts} tries left`}>{pips.map((used, i) => <span key={i} className={used ? "pz-pip pz-pip-used" : "pz-pip"} />)}</div>
        <span className="pz-timer" aria-hidden="true">{capMs === null ? fmtS(shown) : `${fmtS(shown)} / ${Math.round(capMs / 1000)} s`}</span>
      </header>
      <div className="pz-stage">
        <Suspense fallback={<div className="pz-skeleton" aria-busy="true" aria-label="Loading the puzzle" />}>
          <Screen view={view as never} feel={feel} assist={assist} reducedMotion={reducedMotion} elapsed={elapsed} submit={submit as never} resetKey={wrong} announce={announce} hear={onHear} />
        </Suspense>
      </div>
      <p className="pz-status" role="status" aria-live="polite">{message}</p>
      {twin ? <p className="pz-twin" aria-hidden="true">{twin.type === "buzz" ? `buzz · ${twin.name}` : `♪ ${twin.name}${twin.muted ? " (muted)" : ""}`}</p> : null}
      {phase === "done" && reply ? (
        <div className="pz-result" data-outcome={reply.outcome}>
          <p className="pz-result-title">{reply.outcome === "solved" ? "Opened" : "Nothing came loose"}</p>
          <button type="button" className="pz-btn pz-btn-primary" onClick={() => onFinish?.(reply)}>Done</button>
        </div>
      ) : (
        <footer className="pz-foot">
          {info.usesTilt ? (
            tilt === "on"
              ? (<><button type="button" className="pz-btn" onClick={() => feel.motion.holdLevel()}>Hold level</button><button type="button" className="pz-btn" onClick={() => feel.motion.disable()}>Tilt off</button></>)
              : (<button type="button" className="pz-btn" onClick={() => void feel.motion.enable()}>Use tilt</button>)
          ) : null}
          {skipOffered ? <button type="button" className="pz-btn" onClick={onSkip}>Let the ghost open it</button> : null}
          <button type="button" className="pz-btn pz-btn-quiet" onClick={onGiveUp}>Give up</button>
        </footer>
      )}
    </section>
  );
}
