import { useEffect, useMemo, useState, type ReactNode } from "react";
import { effectLimits, type ReactionEvent } from "@hauntology/shared/party/display";
import { eventLine, type GameView } from "../controller/game-view";
import { nameOf } from "../controller/play/play-logic";
import { SeatRow } from "../controller/play/SeatPortrait";

type EndingView = NonNullable<NonNullable<GameView["pub"]>["ending"]> & { stitch?: readonly { seat: number; templateId: string; subtitle: string }[] };
type Entry = Readonly<Record<string, unknown>>;

/** The recap is played one entry at a time, this far apart, unless it is skipped. */
export const RECAP_STEP_MS = 1600;

/** The reactions an entry of the recap asks for, within the photosensitivity limits (nothing at all under reduced motion). */
export function recapReactions(entries: readonly Entry[], reducedMotion: boolean): ReturnType<typeof effectLimits> {
  const evs: ReactionEvent[] = [];
  entries.forEach((e, i) => {
    const atMs = i * RECAP_STEP_MS;
    if (e.kind === "suggest") evs.push({ id: i, atMs, kind: "suggest" });
    else if (e.kind === "accuse") evs.push({ id: i, atMs, kind: e.right === true ? "accuse-right" : "accuse-wrong" });
    else if (e.kind === "haunt-event") evs.push({ id: i, atMs, kind: "haunt-event" });
  });
  return effectLimits(evs, reducedMotion);
}

/**
 * The ending screen (party-mode 8.5, 8.14): the winners ranked for the First Detective title or "The haunting continues" when the house wins,
 * who joined the haunting, the Solution, where the Residue was, the Most Haunting award, the two Nudge counters, and the recap played entry by
 * entry (still, one after the other, under reduced motion) with each Bluff said in words. The Master can skip it from their phone (`skipped`
 * counts the Master's skips). The Host takes no input of its own: the Master's Play again is on their phone.
 */
export function Ending({ game, skipped, reducedMotion }: { game: GameView; skipped: number; reducedMotion: boolean }): ReactNode {
  const pub = game.pub;
  const end = pub?.ending as EndingView | null | undefined;
  const entries = useMemo(() => ((end as unknown as { recap?: { entries?: readonly Entry[] } } | null)?.recap?.entries ?? []).filter((e) => eventLine(game, e) !== null), [end, game]);
  const [shown, setShown] = useState(reducedMotion ? entries.length : 0);
  useEffect(() => {
    if (skipped > 0 || reducedMotion) { setShown(entries.length); return; }
    if (shown >= entries.length) return;
    const id = setTimeout(() => setShown((n) => Math.min(entries.length, n + 1)), RECAP_STEP_MS);
    return () => clearTimeout(id);
  }, [shown, entries.length, skipped, reducedMotion]);
  if (pub === null || end == null) return null;
  const name = (seat: number | null): string => (seat === null ? "The house" : pub.seats.find((s) => s.seat === seat)?.nickname ?? `Player ${seat}`);
  const haunting = pub.seats.filter((s) => s.poltergeist);
  const reveal = (end as unknown as { recap?: { reveal?: readonly { eventId: number; kind: string; from: number | null }[] } }).recap?.reveal ?? [];
  const where = Object.entries(end.residueAt);
  return (
    <main className="ph-ending ui-stack" aria-labelledby="ph-ending-title">
      <h1 className="ui-title" id="ph-ending-title">{end.houseWins ? "The haunting continues" : end.winners.length > 0 ? "The case is solved" : "Nobody solved it"}</h1>
      {end.houseWins ? <p className="ui-lead">Nobody named the Solution. The house keeps its secret.</p> : (
        <ol className="ui-stack--tight" aria-label="Winners, best first">
          {end.winners.map((seat, i) => <li key={seat} className="ui-lead">{i === 0 && end.winners.length > 0 ? "First Detective: " : "Also solved it: "}{name(seat)}</li>)}
        </ol>
      )}
      <SeatRow game={game} reducedMotion={reducedMotion} />
      <p className="ui-lead">It was <strong>{nameOf(pub, end.solution.suspect)}</strong>, in the <strong>{nameOf(pub, end.solution.zone)}</strong>, with the <strong>{nameOf(pub, end.solution.relic)}</strong>.</p>
      {haunting.length > 0 ? <p className="ui-hint">Joined the haunting: {haunting.map((s) => s.nickname).join(", ")}.</p> : null}
      {end.mostHaunting !== null ? <p className="ui-hint">Most Haunting: {name(end.mostHaunting)}, with {end.scare[end.mostHaunting] ?? 0} scare points.</p> : null}
      <p className="ui-hint">Help given: {end.nudges.help}. Spooks: {end.nudges.spook}.</p>
      {where.length > 0 ? (
        <ul className="ui-chips" aria-label="Where the Residue was">
          {where.map(([card, zone]) => <li key={card} className="ui-chip">{nameOf(pub, card)} in the {nameOf(pub, zone)}</li>)}
        </ul>
      ) : null}
      <ol className="ui-log" aria-label="What happened" aria-live="polite" aria-relevant="additions">
        {entries.slice(0, shown).map((e, i) => <li key={i} className="ui-log-row">{eventLine(game, e)}{e.bluff === true ? " (a bluff)" : ""}</li>)}
      </ol>
      {shown >= entries.length && reveal.length > 0 ? (
        <ul className="ui-log" aria-label="Who sent the sounds">
          {reveal.map((s) => <li key={s.eventId} className="ui-log-row">{s.kind === "house-cue" ? "The house" : name(s.from)} {s.kind === "rattle" ? "rattled the house" : s.kind === "frame" ? "sent a frame" : s.kind === "house-cue" ? "sent a sound" : "did something"}.</li>)}
        </ul>
      ) : null}
      {shown >= entries.length && end.stitch && end.stitch.length > 0 ? (
        <ul className="ui-log" aria-label="Whispered lines">
          {end.stitch.map((s, i) => <li key={i} className="ui-log-row">“{s.subtitle}” used {name(s.seat)}'s voice.</li>)}
        </ul>
      ) : null}
      {shown < entries.length ? <p className="ui-hint" role="status">The Master can skip this.</p> : <p className="ui-hint">The Master can play again from their phone.</p>}
    </main>
  );
}
