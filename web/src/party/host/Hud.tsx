import type { ReactNode } from "react";
import { SeatRow } from "../controller/play/SeatPortrait";
import { achievementsOf, clockWords, nameOf, remainingMs, WARNING_MS } from "../controller/play/play-logic";
import type { HostView } from "./host-view";

/**
 * The public HUD (party-mode 8.2, 8.9, 8.10, 8.11, 8.14): the active Player, the clock, the round, the Haunt level, the Cold Spot, a marker on the
 * Zone being searched (never what was found), how many Accusations are sealed this Round, who joined the haunting (in those words), the
 * Achievements earned, the narrator's line and the public log, in polite live regions. It reads only the Public View, so it cannot name a hidden card.
 */
export function Hud({ host, offsetMs, nowMs, reducedMotion = false }: { host: HostView; offsetMs: number; nowMs: number; reducedMotion?: boolean }): ReactNode {
  const g = host.game;
  const pub = g.pub;
  if (pub === null) return null;
  const left = remainingMs(pub.deadlineMs, nowMs, offsetMs);
  const warning = left !== null && !pub.paused && left <= WARNING_MS && left > 0;
  const active = pub.seats.find((s) => s.seat === pub.active);
  const haunting = pub.seats.filter((s) => s.poltergeist);
  const sealed = pub.seats.filter((s) => s.sealed && !s.poltergeist).length;
  const humansLeft = pub.seats.filter((s) => !s.poltergeist).length;
  const cold = pub.haunt.coldSpot === null ? null : nameOf(pub, pub.haunt.coldSpot);
  const searching = pub.inspecting === null ? null : nameOf(pub, pub.inspecting);
  const narrator = [...g.log].reverse().find((l) => l.text !== "") ?? null;
  const lastSpoken = host.spoken.at(-1) ?? null;
  const achievements = pub.seats.flatMap((s) => achievementsOf(pub, s.seat).map((a) => ({ seat: s.seat, name: s.nickname, label: a.label })));
  return (
    <div className="ph-hud ui-stack" aria-label="Game status">
      <header className="ph-top ui-row ui-row--between">
        <div>
          <p className="ui-eyebrow">Round {pub.round}</p>
          <h1 className="ui-title">{active ? `${active.nickname}'s turn` : pub.phase === "ended" ? "The game is over" : "Waiting"}</h1>
        </div>
        <p className={`ph-clock ui-chip${warning ? " is-active" : ""}`} role="timer" aria-label={`Time left ${clockWords(left, pub.paused)}`}>{clockWords(left, pub.paused)}</p>
      </header>
      <section className="ph-haunt" aria-label="The haunting">
        <div className="ui-meter" role="meter" aria-label="Haunt level" aria-valuemin={0} aria-valuemax={pub.haunt.max} aria-valuenow={pub.haunt.level}>
          <span className="ui-gauge-fill" style={{ width: `${Math.round((pub.haunt.level / Math.max(1, pub.haunt.max)) * 100)}%` }} />
        </div>
        <p className="ui-hint">Haunting {pub.haunt.level} of {pub.haunt.max}.{cold ? ` The ${cold} is cold.` : ""}{pub.haunt.choosing ? " Something is stirring…" : ""}</p>
      </section>
      <ul className="ph-zones ui-chips" aria-label="Rooms">
        {pub.zones.map((z) => (
          <li key={z.id} className={`ui-chip${pub.at === z.id ? " is-active" : ""}`} data-searching={pub.inspecting === z.id ? "true" : undefined}>
            {z.name}{pub.haunt.coldSpot === z.id ? " (cold)" : ""}{pub.inspecting === z.id ? " (searching)" : ""}{pub.closedZones.includes(z.id) ? " (shut)" : ""}
          </li>
        ))}
      </ul>
      {searching ? <p className="ui-hint" role="status">{active?.nickname ?? "Someone"} is searching the {searching}.</p> : null}
      <p className="ui-hint" role="status">{sealed} of {humansLeft} Accusations sealed this round.</p>
      <SeatRow game={g} reducedMotion={reducedMotion} />
      {haunting.length > 0 ? <p className="ui-hint">Joined the haunting: {haunting.map((s) => s.nickname).join(", ")}.</p> : null}
      {achievements.length > 0 ? (
        <ul className="ui-chips" aria-label="Achievements">
          {achievements.map((a, i) => <li key={i} className="ui-chip">{a.name}: {a.label}</li>)}
        </ul>
      ) : null}
      <section className="ph-narrator" aria-label="The house speaks">
        <p className="ui-speech" role="status" aria-live="polite">{lastSpoken?.text ?? narrator?.text ?? ""}</p>
      </section>
      {host.tvCues.length > 0 ? <p className="ui-hint" role="status" aria-live="polite" data-testid="ph-cue">{host.tvCues.at(-1)?.caption}</p> : null}
      <ol className="ui-log" aria-label="What is happening" aria-live="polite" aria-relevant="additions">
        {g.log.slice(-10).map((l) => <li key={l.id} className="ui-log-row">{l.text}</li>)}
      </ol>
    </div>
  );
}
