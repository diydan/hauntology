import type { ReactNode } from "react";
import { eventLine, type GameView } from "../game-view";
import { nameOf } from "./play-logic";
import { SeatRow } from "./SeatPortrait";

const SENT: Readonly<Record<string, string>> = { "house-cue": "sent a sound", frame: "sent a frame", rattle: "rattled the house", "haunting-puzzle": "solved a haunting puzzle", errand: "did an errand" };

type Ending = NonNullable<NonNullable<GameView["pub"]>["ending"]> & { stitch?: readonly { seat: number; templateId: string; subtitle: string }[] };

/**
 * The ending on the phone (party-mode 9.22): the Solution, who won (or "the haunting continues"), the recap as a plain list with a text line each,
 * each Bluff marked in words, and the senders of Frames and House Cues at the end. It needs no Display and no sound.
 */
export function Recap({ game, me }: { game: GameView; me: number }): ReactNode {
  const pub = game.pub;
  const end = pub?.ending as Ending | null | undefined;
  if (pub === null || end == null) return null;
  const name = (seat: number | null): string => (seat === null ? "the house" : seat === me ? "You" : pub.seats.find((s) => s.seat === seat)?.nickname ?? `Player ${seat}`);
  const solution = `${nameOf(pub, end.solution.suspect)}, in the ${nameOf(pub, end.solution.zone)}, with the ${nameOf(pub, end.solution.relic)}`;
  const recap = (end as unknown as { recap?: { entries?: readonly Readonly<Record<string, unknown>>[]; reveal?: readonly { eventId: number; kind: string; from: number | null }[] } }).recap;
  const lines = (recap?.entries ?? []).flatMap((e) => { const text = eventLine(game, e); return text === null ? [] : [{ text, bluff: e.bluff === true }]; });
  return (
    <section className="ui-card ui-stack" aria-label="The ending">
      <h2 className="ui-heading">{end.houseWins ? "The haunting continues" : end.winners.length > 0 ? `${end.winners.map(name).join(" and ")} solved it` : "Nobody solved it"}</h2>
      <SeatRow game={game} me={me} reducedMotion={typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches} />
      <p className="ui-lead">It was {solution}.</p>
      {end.mostHaunting !== null ? <p className="ui-hint">Most haunting: {name(end.mostHaunting)}.</p> : null}
      <p className="ui-hint">Help given: {end.nudges.help}. Spooks: {end.nudges.spook}.</p>
      {lines.length > 0 ? (
        <ol className="ui-log" aria-label="What happened">
          {lines.map((l, i) => <li key={i} className="ui-log-row">{l.text}{l.bluff ? " (a bluff)" : ""}</li>)}
        </ol>
      ) : null}
      {recap?.reveal && recap.reveal.length > 0 ? (
        <ul className="ui-log" aria-label="Who sent the sounds">
          {recap.reveal.map((s) => <li key={s.eventId} className="ui-log-row">{s.kind === "house-cue" ? "The house" : name(s.from)} {SENT[s.kind] ?? "did something"}.</li>)}
        </ul>
      ) : null}
      {end.stitch && end.stitch.length > 0 ? (
        <ul className="ui-log" aria-label="Whispered lines">
          {end.stitch.map((s, i) => <li key={i} className="ui-log-row">“{s.subtitle}” used {name(s.seat)}'s voice.</li>)}
        </ul>
      ) : null}
    </section>
  );
}
