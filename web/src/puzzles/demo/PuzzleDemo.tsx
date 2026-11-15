import { useMemo, useRef, useState, type ReactNode } from "react";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { ATTEMPTS, KINDS, LEVELS, type Kind, type Level, type Sight } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { createBrowserFeel } from "../feel/create";
import { useFeelValue } from "../hooks";
import { PuzzleHost, type AttemptReply } from "../PuzzleHost";
import { DEFAULT_DEVICE_SETTINGS, PuzzleSettings, type DeviceSettings } from "../PuzzleSettings";
import { SightsPage } from "../SightsPage";
import { createBrowserHear } from "../speech";

type Config = Readonly<{ kind: Kind; level: Level; seed: number; faded: boolean; assist: boolean }>;

/** Read `?kind=&level=&seed=&faded=&assist=`; anything unknown falls back to a sensible default. */
export function parseConfig(search: string): Config {
  const q = new URLSearchParams(search);
  const kind = KINDS.find((k) => k === q.get("kind")) ?? "lockpick";
  const level = LEVELS.find((l) => l === q.get("level")) ?? "easy";
  const seed = Number.parseInt(q.get("seed") ?? "1", 10);
  return { kind, level, seed: Number.isFinite(seed) ? seed : 1, faded: q.get("faded") !== "0", assist: q.get("assist") === "1" };
}

const href = (c: Config, over: Partial<Config>): string => {
  const n = { ...c, ...over };
  return `?kind=${n.kind}&level=${n.level}&seed=${n.seed}${n.faded ? "" : "&faded=0"}${n.assist ? "&assist=1" : ""}`;
};

/**
 * Play one Lock on this phone with no Room: the Lock is made here, and the answer is checked here with the shared checker.
 * For trying the screens (touch, tilt, buzz, sound, the mic) on a real device. The Spirit board speaks with this phone's voice.
 */
export function PuzzleDemo({ search }: { search: string }): ReactNode {
  const cfg = useMemo(() => parseConfig(search), [search]);
  const lock = useMemo(() => makeLock(cfg.kind, cfg.level, cfg.seed), [cfg]);
  const [device, setDevice] = useState<DeviceSettings>({ ...DEFAULT_DEVICE_SETTINGS, assist: cfg.assist });
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const feel = useMemo(() => createBrowserFeel(() => deviceRef.current), []);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const tries = useRef(0);
  const [again, setAgain] = useState(0);
  const canVibrate = feel.haptics.supported;
  const faded: Sight | null = cfg.faded && lock.sight !== null ? { kind: cfg.kind, payload: lock.sight, showMs: 8000 } : null;
  const clue: Sight | null = lock.sight !== null ? { kind: cfg.kind, payload: lock.sight, showMs: 8000 } : null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hear = lock.kind === "board" ? createBrowserHear(lock.secret.word, lock.view.clue) : undefined;

  const onAttempt = (t: Parameters<typeof verify>[1]): AttemptReply => {
    const v = verify(lock, t);
    if (v.ok) return { outcome: "solved" };
    tries.current += 1;
    return tries.current >= ATTEMPTS ? { outcome: "failed", reason: v.code } : { outcome: "wrong", attemptsLeft: ATTEMPTS - tries.current };
  };

  return (
    <>
      <PuzzleHost
        key={`${cfg.kind}-${cfg.level}-${cfg.seed}-${again}`}
        kind={cfg.kind} view={lock.view} faded={faded} clue={clue} capMs={null} attempts={ATTEMPTS} feel={feel} assist={device.assist} reducedMotion={reduced}
        onAttempt={onAttempt} onGiveUp={() => { tries.current = 0; setAgain((a) => a + 1); }} onFinish={() => { tries.current = 0; setAgain((a) => a + 1); }}
        {...(hear ? { onHear: hear } : {})}
      />
      <nav className="pzd-nav" aria-label="Puzzle kinds">
        {KINDS.map((k) => <a key={k} className="ui-button" href={href(cfg, { kind: k })} {...(k === cfg.kind ? { "aria-current": "page" as const } : {})}>{k}</a>)}
      </nav>
      <div className="pzd-tools">
        <a className="ui-button" href={href(cfg, { level: LEVELS[(LEVELS.indexOf(cfg.level) + 1) % LEVELS.length] as Level })}>Level: {cfg.level}</a>
        <a className="ui-button" href={href(cfg, { seed: cfg.seed + 1 })}>New seed ({cfg.seed})</a>
        <button type="button" className="ui-button" aria-pressed={tilt === "on"} onClick={() => { if (tilt === "on") feel.motion.disable(); else void feel.motion.enable(); }}>Tilt: {tilt}</button>
        <button type="button" className="ui-button" onClick={() => void feel.synth.unlock()}>Sound</button>
      </div>
      <details className="pzd-more">
        <summary className="ui-button">Clues you saw</summary>
        <SightsPage assist={device.assist} sights={clue ? [clue] : []} />
      </details>
      <details className="pzd-more">
        <summary className="ui-button">Settings</summary>
        <PuzzleSettings device={device} onDevice={setDevice} tiltState={tilt} canVibrate={canVibrate} />
      </details>
    </>
  );
}
