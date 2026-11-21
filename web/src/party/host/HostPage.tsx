import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ShellToViewer } from "@hauntology/shared/app/events";
import { useWakeLock } from "../phone/wake-lock";
import type { HostConnection, RoomHostPort } from "../phone/host-port";
import type { SoundDeps } from "../controller/play/phone-sound";
import { useNow } from "../controller/play/useNow";
import type { ControllerPort } from "../controller/controller-port";
import type { PlayExtras } from "../controller/SeatedFrame";
import { Ending } from "./Ending";
import { PlayHere } from "./PlayHere";
import { HostEffects } from "./HostEffects";
import { Hud } from "./Hud";
import { RoomCodeCard } from "./RoomCodeCard";
import { remoteMove, viewerMessages, type HostViewer } from "./host-viewer";
import { useNarration, type NarrationDeps } from "./narration";
import { useWhisper, type WhisperDeps } from "./whisper";
import { MASTER_AWAY_NOTE } from "./words";

const CONNECTION_WORDS: Readonly<Record<HostConnection, string>> = { idle: "Not started", creating: "Making the game…", connecting: "Connecting…", online: "Connected", reconnecting: "Connection lost. Trying again…", ended: "The game has ended.", failed: "Could not start." };
const FAILURES: Readonly<Record<string, string>> = {
  party_disabled: "Party games are switched off right now.", rooms_full: "Every table is taken. Try again in a little while.", session_has_room: "You already have a game open. End it first.", unreachable: "The game could not be reached. Check the connection and try again.",
};

export type HostExtras = Readonly<{
  origin: string;
  soundDeps: SoundDeps;
  narration: NarrationDeps | null;
  /** Plays a whispered line's recorded words (absent: the subtitle only). */
  whisper?: WhisperDeps;
  reducedMotion: boolean;
  now?: () => number;
  /** Mounts the 3D world into the box it is given, and gives back its handle (absent: the HUD stands alone). */
  mountViewer?: (container: HTMLElement, worldId: string) => Promise<HostViewer & { dispose(): Promise<void> }>;
  /** What "Play on this screen" (party-mode 8.6) needs: a Controller port of its own (a second socket with its own token) and the phone extras for it. */
  playHere?: Readonly<{ port: ControllerPort; extras: PlayExtras }>;
  qr?: ReactNode;
}>;

/**
 * The Host page (party-mode 8.1 to 8.14): display only. It makes the Room, shows the Room Code until the game starts, keeps the screen awake, shows
 * "Connection lost" when the socket drops, then the world (when a Viewer is given) with the public HUD, and at the end the ending screen. It sends
 * nothing but the screen's own pose and clock and the End that the Host token is allowed; every control is on a phone.
 */
export function HostPage({ port, extras }: { port: RoomHostPort; extras: HostExtras }): ReactNode {
  const state = useSyncExternalStore((l) => port.subscribe(() => l()), () => port.getState(), () => port.getState());
  const now = extras.now ?? Date.now;
  const nowMs = useNow(now);
  const host = state.view;
  const game = host.game;
  const phase = game.pub?.phase ?? (game.lobby?.started ? "playing" : "lobby");
  const playing = phase === "playing";
  useWakeLock(state.connection === "online" || state.connection === "reconnecting");
  const narration = useNarration(host, { roomCode: state.code, hostToken: state.hostToken }, extras.narration);
  const whisperText = useWhisper(host, extras.whisper ?? null);
  const worldBox = useRef<HTMLDivElement>(null);
  const viewer = useRef<(HostViewer & { dispose(): Promise<void> }) | null>(null);
  const lastSky = useRef<{ sky: string | null }>({ sky: null });
  const offsetMs = 0;

  // mount the world once the game is on, and tear it down when the page goes
  const worldId = game.lobby?.worldId ?? null;
  useEffect(() => {
    if (!playing || extras.mountViewer === undefined || worldBox.current === null || worldId === null) return;
    let live = true;
    void extras.mountViewer(worldBox.current, worldId).then((v) => { if (!live) { void v.dispose(); return; } viewer.current = v; }).catch(() => { viewer.current = null; });
    return () => { live = false; void viewer.current?.dispose(); viewer.current = null; };
  }, [playing, extras, worldId]);

  // the sky and the Haunt, and the active Detective's walk, go to the Viewer
  useEffect(() => { for (const m of viewerMessages(host, lastSky.current)) viewer.current?.send(m as ShellToViewer); }, [host.game.atmosphere, host]);
  useEffect(() => { const i = host.input; if (i !== null && viewer.current?.move) viewer.current.move(remoteMove(i)); }, [host.input]);

  const [creating, setCreating] = useState(false);
  const [here, setHere] = useState(false);
  const failure = state.failure === null ? null : FAILURES[state.failure] ?? "The game could not be started.";
  const phones = game.lobby?.seats.filter((s) => !s.bot).length ?? 0;
  const code = state.code;

  const connectionNote = useMemo(() => (state.connection === "online" ? null : CONNECTION_WORDS[state.connection]), [state.connection]);

  if (state.connection === "idle" || state.connection === "creating" || state.connection === "failed") {
    return (
      <main className="ph-page ph-start ui-stack">
        <h1 className="ui-title">Hauntology</h1>
        <p className="ui-lead">A ghost story for a table of friends. This screen shows the house; everyone plays on their phone.</p>
        <button type="button" className="ui-button ui-button--primary" disabled={creating || state.connection === "creating"} onClick={() => { setCreating(true); void port.create(true).finally(() => setCreating(false)); }}>Make a game</button>
        {connectionNote && state.connection !== "idle" ? <p className="ui-hint" role="status">{connectionNote}</p> : null}
        {failure ? <p className="ui-notice" role="alert">{failure}</p> : null}
      </main>
    );
  }

  if (phase === "ended" && game.pub?.ending) {
    return (
      <div className="ph-page">
        <Ending game={game} skipped={host.recapSkipped} reducedMotion={extras.reducedMotion} />
        <p className="ui-sr-only" role="status">{connectionNote ?? ""}</p>
      </div>
    );
  }

  return (
    <div className="ph-page" data-phase={phase}>
      <HostEffects host={host} offsetMs={offsetMs} nowMs={nowMs} deps={extras.soundDeps} reducedMotion={extras.reducedMotion} />
      {connectionNote ? <p className="ph-conn ui-notice" role="status">{connectionNote}</p> : null}
      {here && extras.playHere && code !== null ? <PlayHere port={extras.playHere.port} code={code} extras={extras.playHere.extras} /> : null}
      {playing ? (
        <div className="ph-stage">
          {extras.mountViewer ? <div className="ph-world" ref={worldBox} aria-label="The house" /> : null}
          <Hud host={host} offsetMs={offsetMs} nowMs={nowMs} reducedMotion={extras.reducedMotion} />
          {extras.narration !== null && !narration.unlocked ? <button type="button" className="ui-button" onClick={narration.unlock}>Tap to let the house speak</button> : null}
          {narration.subtitle !== "" ? <p className="ui-speech" data-host-subtitle role="status" aria-live="polite">{narration.subtitle}</p> : null}
          {whisperText !== "" ? <p className="ui-speech" data-host-whisper role="status" aria-live="polite">{whisperText}</p> : null}
        </div>
      ) : (
        <main className="ph-lobby ui-stack">
          {code !== null ? <RoomCodeCard code={code} origin={extras.origin} qr={extras.qr} /> : null}
          {extras.narration !== null && !narration.unlocked ? <button type="button" className="ui-button" onClick={narration.unlock}>Tap to let the house speak</button> : null}
          <section aria-label="Players" className="ui-stack--tight">
            <h2 className="ui-heading">At the table</h2>
            {(game.lobby?.seats ?? []).length === 0 ? <p className="ui-hint">Nobody has joined yet.</p> : (
              <ul className="ui-chips">
                {(game.lobby?.seats ?? []).map((s) => <li key={s.seat} className={`ui-chip${s.connected || s.bot ? " is-active" : ""}`}>{s.nickname}{s.bot ? " (Bot)" : ""}{s.seat === game.lobby?.masterSeat ? " · Master" : ""}</li>)}
              </ul>
            )}
            <p className="ui-hint">{game.lobby?.worldId ? "A place is chosen." : "The Master chooses the place."} The Master starts the game from their phone.</p>
            {phones === 0 && extras.playHere && !here ? <button type="button" className="ui-button" onClick={() => setHere(true)}>Play on this screen</button> : null}
          </section>
        </main>
      )}
      {playing && game.lobby !== null && game.lobby.seats.some((s) => !s.connected && !s.bot && s.seat === game.lobby?.masterSeat) ? <p className="ui-hint" role="status">{MASTER_AWAY_NOTE}</p> : null}
    </div>
  );
}
