import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PuzzleSettings, type DeviceSettingsControl } from "../../puzzles/PuzzleSettings";
import { usePuzzleDevice } from "../../puzzles/usePuzzleDevice";
import type { Connection, ControllerPort, RoomPhase, RoomView } from "./controller-port";
import { DoorControls } from "./DoorControls";
import { ErrandOptOut, ErrandsPanel } from "./ErrandsControls";
import { LockArea } from "./LockArea";
import { MenuSheet } from "./MenuSheet";
import { Slot } from "./Slot";
import type { Theory } from "@hauntology/shared/party/theory";
import { SpiritTableSection, SpiritTableSwitch, useSpiritTable } from "../../table/SpiritTableSwitch";
import { WorldClueNotebook } from "./WorldClueNotebook";
import { LobbyPanel } from "./play/LobbyPanel";
import { MasterMenu, type WorldChoice } from "./play/MasterMenu";
import { SoundLightSettings } from "./play/PlayerSettings";
import { PlayPanel } from "./play/PlayPanel";
import type { SoundDeps } from "./play/phone-sound";
import type { StorageLike } from "./play/notebook-store";
import type { Recorder } from "../phone/recorder";

export type Layout = "pad" | "panel";

/** What the real game screens need from the page around them: the places to choose from, the phone's storage, sound and microphone. A page without them (the scripted demo) still works. */
export type PlayExtras = Readonly<{ worlds: readonly WorldChoice[]; storage: StorageLike; soundDeps: SoundDeps; unlock: () => Promise<boolean>; record?: Recorder; now?: () => number }>;

const CONNECTION_WORDS: Readonly<Record<Connection, string>> = { connecting: "Connecting…", online: "Connected", reconnecting: "Reconnecting…", offline: "Offline" };
const PHASE_WORDS: Readonly<Record<RoomPhase, string>> = {
  lobby: "In the lobby. The Master starts the game.",
  playing: "The game is on.",
  paused: "The game is paused.",
  ended: "The game has ended.",
};

/** Whether the phone is held sideways now. Without `matchMedia` (a test, an old browser) it is upright. */
function useLandscape(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== "function") return () => undefined;
      const query = matchMedia("(orientation: landscape)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => typeof matchMedia === "function" && matchMedia("(orientation: landscape)").matches,
    () => false,
  );
}

/**
 * The Controller once a seat is taken (party-mode 9.2, Requirement 2.1): the header (Room Code, nickname, connection in words, Menu), the two
 * layouts with a switch (the pad held sideways, the panel held upright; the Player's choice wins over the phone's turn), the Lock when the
 * Room gives one, and the menu with this phone's settings. The pad and the panel are named regions waiting for their parts; nothing here plays
 * the game. The settings come in as a `DeviceSettingsControl` and are kept by `useDeviceSettings` in the caller, so they outlive the page.
 */
export function SeatedFrame({ port, view, control, extras }: { port: ControllerPort; view: RoomView; control: DeviceSettingsControl; extras?: PlayExtras }): ReactNode {
  const device = usePuzzleDevice(control, undefined, { soundAllowed: view.soundConsent !== false });
  const landscape = useLandscape();
  const [chosen, setChosen] = useState<Layout | null>(null);
  const layout: Layout = chosen ?? (landscape ? "pad" : "panel");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // The Spirit table (spirit-table 1.1 to 1.4): the Player's own device switch and the Player's own Theory marks, both in this page only.
  const spirit = useSpiritTable(view.table);
  const [theory, setTheory] = useState<Theory>({});

  const connection = <span className={`ui-chip${view.connection === "online" ? " is-active" : ""}`} role="status">{CONNECTION_WORDS[view.connection]}</span>;
  const menuButton = (
    <button
      ref={menuButtonRef} type="button" className="ui-button pc-menu-button" aria-expanded={menuOpen} aria-controls={menuOpen ? "pc-menu" : undefined}
      onClick={() => setMenuOpen((open) => !open)}
    >Menu</button>
  );

  return (
    <div className="pc-seated" data-layout={layout}>
      {view.lock ? null : (
        <header className="pc-bar">
          <div className="pc-who">
            <span className="ui-chip is-active" aria-label={`Room Code ${view.code ?? ""}`}>{view.code}</span>
            <span className="pc-name">{view.nickname}</span>
            {view.master ? <span className="ui-chip">Master</span> : null}
          </div>
          <div className="pc-side">
            {connection}
            {menuButton}
          </div>
        </header>
      )}

      {view.lock ? (
        // the Controller's bar is not drawn above a Lock: the Menu (and a connection that is not fine) go in the puzzle's own bar
        <LockArea port={port} offer={view.lock} device={device} barExtra={<>{view.connection === "online" ? null : connection}{menuButton}</>} />
      ) : (
        <main className="pc-main ui-stack">
          <div className="ui-segments pc-layouts" role="radiogroup" aria-label="Controller layout">
            <button type="button" role="radio" aria-checked={layout === "pad"} className="ui-button" onClick={() => setChosen("pad")}>Pad</button>
            <button type="button" role="radio" aria-checked={layout === "panel"} className="ui-button" onClick={() => setChosen("panel")}>Panel</button>
          </div>
          <p className="ui-hint pc-phase" role="status">{PHASE_WORDS[view.phase]}</p>
          {view.game !== undefined && extras !== undefined ? (
            view.game.pub !== null
              ? <PlayPanel port={port} view={view} layout={layout} storage={extras.storage} soundDeps={extras.soundDeps} {...(extras.now ? { now: extras.now } : {})} />
              : <LobbyPanel view={view} send={(m) => port.send?.(m)} worlds={extras.worlds} {...(extras.record ? { record: extras.record } : {})} />
          ) : layout === "pad" ? (
            <section className="pc-pad" aria-label="Pad">
              <Slot name="stick" label="Movement stick" />
              <Slot name="look" label="Look area" />
              <Slot name="faces" label="Face buttons" />
            </section>
          ) : (
            <section className="pc-panel" aria-label="Panel">
              <Slot name="hand" label="Your hand" />
              {device.device.assist && view.worldClues && view.worldClues.length > 0 ? <WorldClueNotebook clues={view.worldClues} /> : <Slot name="notebook" label="Notebook" />}
              <Slot name="contributions" label="Contributions" />
            </section>
          )}
          {view.phase === "playing" && view.errands ? <ErrandsPanel errands={view.errands} port={port} /> : null}
          {view.phase === "playing" ? <DoorControls port={port} view={view} /> : null}
          {spirit.on && view.table ? <SpiritTableSection device={spirit} feed={view.table} roomCode={view.code ?? ""} theory={theory} onTheory={setTheory} /> : null}
        </main>
      )}

      {menuOpen ? (
        <div id="pc-menu">
          <MenuSheet onClose={() => setMenuOpen(false)} returnFocusTo={menuButtonRef}>
            <div className="ui-stack">
              <PuzzleSettings
                {...(view.master ? { master: { value: view.master.puzzles, preset: view.master.preset, onChange: (s) => port.setPuzzles(s) } } : {})}
                device={device.device} onDevice={(next) => { if (next.soundConsent !== device.device.soundConsent) port.setSound?.(next.soundConsent); if (next.assist !== device.device.assist) port.setAssist?.(next.assist); device.changeDevice(next); }} tiltState={device.tilt} canVibrate={device.canVibrate}
              />
              {spirit.offered ? <SpiritTableSwitch device={spirit} /> : null}
              {view.master && port.setCluePlace ? (
                <div className="ui-stack--tight" role="radiogroup" aria-label="Clue place">
                  <p className="ui-hint">Clue place</p>
                  <div className="ui-segments">
                    <button type="button" role="radio" aria-checked={(view.master.cluePlace ?? "phone") === "phone"} className="ui-button" onClick={() => port.setCluePlace?.("phone")}>Phone</button>
                    <button type="button" role="radio" aria-checked={view.master.cluePlace === "world"} className="ui-button" onClick={() => port.setCluePlace?.("world")}>World</button>
                  </div>
                </div>
              ) : null}
              {view.master && port.setErrands ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(view.master.errands)}
                  className="ui-button ui-switch"
                  onClick={() => port.setErrands?.(!view.master?.errands)}
                >
                  <span className="ui-switch-name">Errands</span>
                  <span className="ui-switch-state">{view.master.errands ? "On" : "Off"}</span>
                </button>
              ) : null}
              {port.setErrandOptOut ? (
                <ErrandOptOut checked={Boolean(view.errands?.optOut)} onChange={(on) => port.setErrandOptOut?.(on)} />
              ) : null}
              {view.game !== undefined && extras !== undefined ? (
                <>
                  <SoundLightSettings send={(m) => port.send?.(m)} unlock={extras.unlock} />
                  {view.game.pub !== null && view.seat !== null ? <MasterMenu game={view.game} me={view.seat} send={(m) => port.send?.(m)} worlds={extras.worlds} /> : null}
                </>
              ) : null}
              <button type="button" className="ui-button ui-button--danger ui-button--block" onClick={() => void port.leave()}>Leave room</button>
            </div>
          </MenuSheet>
        </div>
      ) : null}
    </div>
  );
}
