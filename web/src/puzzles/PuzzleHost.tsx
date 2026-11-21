import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KIND_INFO } from "@hauntology/shared/puzzles/kinds";
import type { Kind, LockView, Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { Sign } from "@hauntology/shared/puzzles/world-clues";
import type { FeelEvent, PuzzleFeel } from "./feel/types";
import { useFeelValue, useWakeLock } from "./hooks";
import { KIND_SCREENS } from "./kinds/registry";
import type { KindProps } from "./kinds/types";
import { HelpCard } from "./HelpCard";
import { SightCard } from "./SightCard";
import { SightClue } from "./SightClue";
import { SignChip } from "./SignBadge";
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
  /** This Lock's clue, to look at again while playing. Offered only with Assist on: otherwise a clue is seen once, and remembering it is the puzzle. */
  clue?: Sight | null;
  /** World Clue mark & prompt when clues live in the shared world (world-clues 3.1, 4.3). Shows no answer. */
  sign?: Sign;
  prompt?: string;
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
  /** Spirit board only, with Assist on: the word as text, sent by the Room to this seat alone. */
  assistText?: string;
  /** The Player pressed the Tilt button: on (true) or off (false). The device's settings keep that wish, so tilt stays off once they turned it off. */
  onTiltChoice?: (on: boolean) => void;
  /** What the page that hosts the puzzle puts in the puzzle's own bar, after the time (the Controller's Menu button), so it needs no bar of its own above the puzzle. */
  barExtra?: ReactNode;
  now?: () => number;
}>;

type Screen = ComponentType<KindProps<Kind>>;

const fmtS = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/** The Kinds that turn Tilt on by themselves where the phone has a sensor: the four that play by tilt, and the Safe and the Clock, whose Twist is the turn of the phone. */
const TWIST_KINDS: ReadonlySet<Kind> = new Set<Kind>(["safe", "clock"]);

/**
 * The frame around every Kind: the faded clue (when the Sight was missed), the timer, the Attempts, the Touch-path
 * controls, the result and a live region for screen readers. It owns the clock and the answers; the Kind screen only
 * draws and plays. Heavy screens load only when needed, and nothing here needs motion, sound or buzz.
 */
export function PuzzleHost(props: PuzzleHostProps): ReactNode {
  const { kind, view, faded, clue = null, sign, prompt, capMs, attempts, feel, assist, reducedMotion, onAttempt, onGiveUp, onTimeUp, onFinish, onSkip, onHear, assistText, onTiltChoice, barExtra } = props;
  const now = props.now ?? (() => performance.now());
  const [phase, setPhase] = useState<"faded" | "play" | "done">(faded ? "faded" : "play");
  const [wrong, setWrong] = useState(0);
  const [reply, setReply] = useState<AttemptReply | null>(null);
  const [message, setMessage] = useState("");
  const [spoken, setSpoken] = useState("");
  const [peeking, setPeeking] = useState(false);
  const [helping, setHelping] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const wasHelping = useRef(false);
  const [confirmGive, setConfirmGive] = useState(false);
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

  // Tilt starts by itself where the phone has a sensor, for the Kinds that can use it (never for the others). Where the phone must be asked
  // (an iPhone) that happens inside a tap: the tap that ends the faded clue and starts the Lock, or the first tap in the Lock.
  const canSense = info.usesTilt || TWIST_KINDS.has(kind);
  useEffect(() => { if (phase === "play" && canSense) void feel.motion.autoEnable({ fromTap: false }); }, [phase, canSense, feel]);
  const askFromTap = useCallback((): void => { if (canSense && phase !== "done") void feel.motion.autoEnable({ fromTap: true }); }, [canSense, phase, feel]);

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

  const closeHelp = useCallback((): void => setHelping(false), []);
  // when the card closes, focus goes back to the "?" that opened it
  useEffect(() => {
    if (wasHelping.current && !helping) helpButton.current?.focus();
    wasHelping.current = helping;
  }, [helping]);
  /** What a screen says to a screen reader only: the screen already shows its own instructions, so this is not drawn a second time. */
  const announce = useCallback((text: string): void => setSpoken(text), []);

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
      if (r.outcome === "solved") { feel.haptics.buzz("thunk"); feel.synth.play("thunk"); setMessage(""); setSpoken("Opened."); } // the result box says it on screen; this is for a screen reader
      else { setMessage(""); setSpoken("Nothing came loose."); }
      setReply(r);
      setPhase("done");
    }, () => { pending.current = false; setMessage("That did not go through. Try again."); });
  }, [phase, kind, onAttempt, feel]);

  const Screen = KIND_SCREENS[kind] as unknown as Screen;
  // Tilt is a way to play, not a way out: its buttons go to the screen, in a row with the screen's own buttons.
  const tiltButtons = info.usesTilt ? (
    <>
      <button type="button" className="ui-button" aria-pressed={tilt === "on"} onClick={() => { if (tilt === "on") { feel.motion.disable(); onTiltChoice?.(false); } else { onTiltChoice?.(true); void feel.motion.enable(); } }}>{tilt === "on" ? "Tilt: on" : "Tilt"}</button>
      {tilt === "on" ? <button type="button" className="ui-button" aria-label="Hold level" onClick={() => feel.motion.holdLevel()}>Level</button> : null}
    </>
  ) : null;
  const timer = <span className="pz-timer" aria-hidden="true"><span className="pz-bar-label">Time</span> {capMs === null ? fmtS(shown) : `${fmtS(shown)} of ${Math.round(capMs / 1000)} s`}</span>;
  const pips = useMemo(() => Array.from({ length: attempts }, (_, i) => i < wrong), [attempts, wrong]);
  const skipOffered = onSkip !== undefined && (wrong >= 2 || shown >= 20_000);

  if (phase === "faded" && faded) {
    return (
      <section className="pz-host" aria-label="Puzzle" onClickCapture={askFromTap} onTouchEndCapture={askFromTap}>
        <SightCard sight={faded} title="A faded memory…" feel={feel} onDone={() => setPhase("play")} now={now} />
      </section>
    );
  }
  return (
    <section className={`pz-host${glow === 0 ? "" : glow % 2 === 1 ? " pz-glow-a" : " pz-glow-b"}`} data-kind={kind} aria-label="Puzzle" onClickCapture={askFromTap} onTouchEndCapture={askFromTap}>
      <header className="pz-bar-row">
        <div className="pz-bar-left">
          <button ref={helpButton} type="button" className="ui-button ui-button--round" aria-label="How this puzzle works" aria-expanded={helping} onClick={() => { setPeeking(false); setHelping((h) => !h); }}>?</button>
          <div className="pz-tries">
            <span className="pz-bar-label" aria-hidden="true">Tries</span>
            <div className="ui-lamps" role="img" aria-label={`${attempts - wrong} of ${attempts} tries left`}>{pips.map((used, i) => <span key={i} className={used ? "ui-lamp" : "ui-lamp is-on"} />)}</div>
          </div>
        </div>
        {barExtra ? <div className="pz-bar-right">{timer}<div className="pz-bar-extra">{barExtra}</div></div> : timer}
      </header>
      {helping ? <HelpCard kind={kind} clock={capMs !== null} onClose={closeHelp} /> : null}
      {sign !== undefined || prompt !== undefined ? (
        <div className="ui-stack--tight" role="note" aria-label="World clue mark">
          <div className="ui-row">
            {sign ? <SignChip sign={sign} active /> : null}
            {prompt ? <p className="ui-prompt">{prompt}</p> : null}
          </div>
          <p className="ui-hint">Look for this mark in the house.</p>
        </div>
      ) : null}
      {peeking && clue ? (
        <div className="ui-panel pz-card pz-peek" role="dialog" aria-label="The clue">
          <h2 className="ui-heading">The clue</h2>
          <SightClue sight={clue} />
          {capMs !== null ? <p className="ui-hint">The clock keeps running.</p> : null}
          <button type="button" className="ui-button ui-button--primary" onClick={() => setPeeking(false)}>Back to the puzzle</button>
        </div>
      ) : null}
      <div className="ui-panel pz-stage" hidden={peeking || helping}>
        <Suspense fallback={<div className="pz-skeleton" aria-busy="true" aria-label="Loading the puzzle" />}>
          <Screen view={view as never} feel={feel} assist={assist} reducedMotion={reducedMotion} elapsed={elapsed} submit={submit as never} resetKey={wrong} announce={announce} hear={onHear} assistText={assistText} tiltButtons={tiltButtons} />
        </Suspense>
      </div>
      <div className="pz-feedback">
        <p className="ui-status pz-status" role="status" aria-live="polite">{message}</p>
        <p className="ui-sr-only pz-sr" aria-live="polite">{spoken}</p>
        <p className="ui-note pz-twin" aria-hidden="true">{twin ? (twin.type === "buzz" ? `Buzz: ${twin.name}` : `♪ ${twin.name}${twin.muted ? " · sound is off" : ""}`) : ""}</p>
      </div>
      {phase === "done" && reply ? (
        <div className="ui-panel pz-result" data-outcome={reply.outcome}>
          <p className="pz-result-title">{reply.outcome === "solved" ? "Opened" : "Nothing came loose"}</p>
          <button type="button" className="ui-button ui-button--primary" onClick={() => onFinish?.(reply)}>Done</button>
        </div>
      ) : (
        <footer className="pz-foot-wrap">
          <div className="ui-row ui-row--center pz-foot">
            {assist && clue ? <button type="button" className="ui-button" onClick={() => { setHelping(false); setPeeking(true); }}>See the clue again</button> : null}
            {skipOffered ? <button type="button" className="ui-button" onClick={onSkip}>Let the ghost open it</button> : null}
            {confirmGive ? null : <button type="button" className="ui-button ui-button--quiet" onClick={() => setConfirmGive(true)}>Give up</button>}
          </div>
          {confirmGive ? (
            <div className="pz-give">
              <p className="ui-hint">Give up on this lock? Nothing will open.{capMs !== null ? " The time you used still counts." : ""}</p>
              <div className="pz-grid2 pz-confirm">
                <button type="button" className="ui-button ui-button--primary" onClick={() => setConfirmGive(false)}>Keep playing</button>
                <button type="button" className="ui-button ui-button--quiet" onClick={onGiveUp}>Yes, give up</button>
              </div>
            </div>
          ) : null}
        </footer>
      )}
    </section>
  );
}
