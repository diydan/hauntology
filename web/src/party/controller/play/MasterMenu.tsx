import { useState, type ReactNode } from "react";
import type { GameView } from "../game-view";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;
export type WorldChoice = Readonly<{ id: string; name: string; walkRadius: number; authoredZones: boolean }>;

function Segments<T extends string | number | boolean | null>({ label, value, options, onChange }: { label: string; value: T | undefined; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }): ReactNode {
  return (
    <div className="ui-stack--tight" role="radiogroup" aria-label={label}>
      <p className="ui-field-label">{label}</p>
      <div className="ui-segments">
        {options.map(([v, text]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} className="ui-button" onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={on} className="ui-button ui-switch" onClick={() => onChange(!on)}>
      <span className="ui-switch-name">{label}</span><span className="ui-switch-state">{on ? "On" : "Off"}</span>
    </button>
  );
}

/**
 * The Master's menu (party-mode 9.10, 9.15, 9.21), shown to the Master only: the world, the presets (Classic, Gentle, Quick) and the separate
 * switches they set (clock, Haunt maximum, Nudges, Frames, sound, auto-cross, Bot level, spoken narration), then the room switches (the sky, the
 * hour strike, the light bar, Rattle, Stitch), Bots, start, pause, hand-over, end and Play again. Every control only sends a message; the Room
 * checks the Master and answers with the new settings, which this menu shows. The lobby settings are the Room's own words, so nothing is guessed.
 */
export function MasterMenu({ game, me, send, worlds }: { game: GameView; me: number; send: Send; worlds: readonly WorldChoice[] }): ReactNode {
  const lobby = game.lobby;
  const [handTo, setHandTo] = useState<number | "">("");
  if (lobby === null || lobby.masterSeat !== me) return null;
  const s = lobby.settings as Record<string, unknown>;
  const sw = lobby.switches as Record<string, unknown>;
  const playing = game.pub !== null && game.pub.phase === "playing";
  const ended = game.pub?.phase === "ended";
  const started = lobby.started || playing;
  const set = (patch: Record<string, unknown>): void => send({ t: "settings", ...patch });
  const room = (patch: Record<string, unknown>): void => send({ t: "roomSettings", ...patch });
  const humans = lobby.seats.filter((x) => !x.bot && x.seat !== me);
  const ready = !started && lobby.seats.length >= 2 && lobby.worldId !== null;
  return (
    <section className="pc-master ui-stack" aria-label="Master controls">
      <h2 className="ui-heading">Master</h2>
      {!started ? (
        <div className="ui-stack--tight">
          <label className="ui-field-label" htmlFor="pc-world">World</label>
          <select id="pc-world" className="ui-select" value={lobby.worldId ?? ""} onChange={(e) => { const w = worlds.find((x) => x.id === e.target.value); if (w) send({ t: "world", id: w.id, walkRadius: w.walkRadius, authoredZones: w.authoredZones }); }}>
            <option value="" disabled>Choose a place</option>
            {worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {worlds.length === 0 ? <p className="ui-hint">No places to choose from yet.</p> : null}
          {game.refusal?.code === "world_too_small" ? <p className="ui-notice" role="alert">That place is too small. Pick another.</p> : null}
        </div>
      ) : null}
      <Segments label="Preset" value={s.preset as string | undefined} options={[["classic", "Classic"], ["gentle", "Gentle"], ["quick", "Quick"]]} onChange={(preset) => set({ preset })} />
      {!started ? <Segments label="Time per turn" value={(s.baseSeconds as number | null | undefined) ?? 60} options={[[30, "30 s"], [45, "45 s"], [60, "60 s"], [90, "90 s"], [null as number | null, "No clock"]]} onChange={(baseSeconds) => set({ baseSeconds })} /> : null}
      {!started ? <Segments label="Haunt maximum" value={(s.hauntMax as number | undefined) ?? 10} options={[[8, "8"], [10, "10"], [12, "12"]]} onChange={(hauntMax) => set({ hauntMax })} /> : null}
      <Segments label="Nudges" value={(s.nudges as string | undefined) ?? "all"} options={[["all", "All"], ["help-only", "Help only"], ["off", "Off"]]} onChange={(nudges) => set({ nudges })} />
      <Switch label="Frames" on={s.frames !== false} onChange={(frames) => set({ frames })} />
      <Switch label="Allow phone sounds" on={s.sounds !== false} onChange={(sounds) => set({ sounds })} />
      <Switch label="Auto-cross in the notebook" on={s.autoCross === true} onChange={(autoCross) => set({ autoCross })} />
      <Segments label="Bot level" value={(s.botLevel as string | undefined) ?? "standard"} options={[["standard", "Standard"], ["gentle", "Gentle"]]} onChange={(botLevel) => set({ botLevel })} />
      <Switch label="Spoken narration" on={false} onChange={(on) => send({ t: "speech", action: on ? "on" : "off" })} />
      <h3 className="ui-heading">The house</h3>
      <Segments label="Sky" value={(sw.conditions as string | undefined) ?? "off"} options={[["off", "Off"], ["place", "A place"], ["table", "This table"]]} onChange={(conditions) => room({ conditions })} />
      <Switch label="Hour strike" on={sw.hourStrike !== false} onChange={(hourStrike) => room({ hourStrike })} />
      <Switch label="Light bar" on={sw.lightBar !== false} onChange={(lightBar) => room({ lightBar })} />
      <Switch label="Rattle" on={sw.rattle !== false} onChange={(rattle) => room({ rattle })} />
      <Switch label="Stitch (voices)" on={sw.stitch === true} onChange={(stitch) => { room({ stitch }); send({ t: "stitchSetting", on: stitch }); }} />
      {!started ? <button type="button" className="ui-button" onClick={() => send({ t: "addBot" })} disabled={lobby.seats.length >= 6}>Add a Bot</button> : null}
      {!started ? (
        <div className="ui-stack--tight">
          <button type="button" className="ui-button ui-button--primary ui-button--block" disabled={!ready} onClick={() => send({ t: "start" })}>Start the game</button>
          {!ready ? <p className="ui-hint">{lobby.worldId === null ? "Choose a place first." : "At least two players are needed."}</p> : null}
        </div>
      ) : null}
      {playing ? (
        <div className="ui-row">
          <button type="button" className="ui-button" onClick={() => send({ t: game.pub?.paused ? "resume" : "pause" })}>{game.pub?.paused ? "Resume" : "Pause"}</button>
        </div>
      ) : null}
      {ended ? <button type="button" className="ui-button ui-button--primary ui-button--block" onClick={() => send({ t: "playAgain" })}>Play again</button> : null}
      {humans.length > 0 ? (
        <div className="ui-row">
          <label className="ui-sr-only" htmlFor="pc-hand">Hand the Master role to</label>
          <select id="pc-hand" className="ui-select" value={handTo} onChange={(e) => setHandTo(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Hand over to…</option>
            {humans.map((h) => <option key={h.seat} value={h.seat}>{h.nickname}</option>)}
          </select>
          <button type="button" className="ui-button" disabled={handTo === ""} onClick={() => { if (handTo !== "") send({ t: "handOver", seat: handTo }); }}>Hand over</button>
        </div>
      ) : null}
      <button type="button" className="ui-button ui-button--danger" onClick={() => send({ t: "end" })}>End the game for everyone</button>
    </section>
  );
}
