import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import { STOCK_SONGS } from "@hauntology/shared/songs/stock";
import { useEffect, useRef, useState } from "react";
import { ThemeSong } from "../ThemeSong";
import { eventLine, type Names } from "./words";

/**
 * The ending screen (party-mode 8.5, 8.14; integration 4.2). It reads only the ending the Room sent: the answer, who
 * won (ranked for First Detective) or "The haunting continues", who joined the haunting, the Most Haunting award, where
 * each Residue was, the two Nudge counts, and the recap told entry by entry with every Bluff named in words. Skip shows
 * the whole recap at once. Never the word "Poltergeist": players "joined the haunting".
 */
export const RECAP_STEP_MS = 1200;

/**
 * The ending song (game-songs 6.5): a ready-made Stock Song, played only when the visitor taps Play (browsers block
 * sound that starts alone). Its words always show, so the song is never the only way to get anything.
 */
export function EndingSong({ id }: { id: "fb-house" | "fb-detectives" }) {
  const song = STOCK_SONGS.find((s) => s.id === id);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { audio.current?.pause(); }, []);
  if (!song) return null;

  const toggle = () => {
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    const a = audio.current ?? new Audio(`/songs/${id}.mp3`);
    audio.current = a;
    a.onended = () => setPlaying(false);
    a.onerror = () => { setFailed(true); setPlaying(false); };
    a.play().then(() => setPlaying(true)).catch(() => { setFailed(true); setPlaying(false); });
  };

  return (
    <section aria-label="The ending song" className="ui-stack--tight">
      <h3 className="ui-heading">{song.title}</h3>
      <button type="button" className="ui-button" onClick={toggle}>{playing ? "Stop the song" : "Play the song"}</button>
      {failed ? <p role="status">The song would not play. The words are below.</p> : null}
      <pre className="ui-lyrics">{(song.lyrics ?? "").replace(/\[[^\]]+\]\n?/g, "")}</pre>
    </section>
  );
}

export function Ending({
  view,
  n,
  reducedMotion = false,
  songLine = null,
}: {
  view: PublicSnapshot;
  n: Names;
  reducedMotion?: boolean;
  songLine?: { title: string; captions: string } | null;
}) {
  const e = view.ending!;
  const lines = e.recap.entries
    .map((x) => {
      const line = eventLine(x, n);
      return line === null ? null : x.kind === "suggest" && x.bluff ? `${line} It was a bluff.` : line;
    })
    .filter((x): x is string => x !== null);
  const [shown, setShown] = useState(reducedMotion ? lines.length : 0);
  useEffect(() => {
    if (shown >= lines.length) return;
    const id = setTimeout(() => setShown((k) => k + 1), RECAP_STEP_MS);
    return () => clearTimeout(id);
  }, [shown, lines.length]);

  const joined = view.seats.filter((s) => s.poltergeist);
  const residue = Object.entries(e.residueAt);
  const [first, ...rest] = e.winners;

  return (
    <section className="ui-panel ui-stack case-ending" aria-labelledby="case-end-title">
      <p className="ui-eyebrow">The final chapter</p>
      <h2 id="case-end-title" className="ui-title">{e.houseWins ? "The haunting continues" : "The case is solved"}</h2>
      <p className="ui-lead">
        It was {n.card(e.solution.suspect)}, in the {n.card(e.solution.zone)}, with the {n.card(e.solution.relic)}.
      </p>

      {e.houseWins ? (
        <p>Nobody named it in time. The house, I regret to say, keeps its secret.</p>
      ) : (
        <dl className="ui-facts">
          {first !== undefined ? (<><dt>First Detective</dt><dd>{n.seat(first)}</dd></>) : null}
          {rest.length > 0 ? (<><dt>Also right</dt><dd>{rest.map((w) => n.seat(w)).join(", ")}</dd></>) : null}
        </dl>
      )}

      <dl className="ui-facts">
        <dt>Joined the haunting</dt>
        <dd>{joined.length > 0 ? joined.map((s) => n.seat(s.seat)).join(", ") : "Nobody"}</dd>
        {e.mostHaunting !== null ? (<><dt>Most Haunting</dt><dd>{n.seat(e.mostHaunting)}, {e.scare[e.mostHaunting] ?? 0} Scare points</dd></>) : null}
        <dt>Nudges</dt>
        <dd>{e.nudges.help} to help, {e.nudges.spook} to spook</dd>
      </dl>

      {residue.length > 0 ? (
        <section aria-label="Where the clues were">
          <h3 className="ui-heading">Where the clues were</h3>
          <ul className="ui-stack--tight">
            {residue.map(([zone, card]) => <li key={zone}>The {n.card(card)}, in the {n.card(zone)}.</li>)}
          </ul>
        </section>
      ) : null}

      {songLine !== null ? (
        <p className="ui-speech ui-hint" data-ending-song-line>
          {songLine.title}: {songLine.captions}
        </p>
      ) : null}
      <EndingSong id={e.houseWins ? "fb-house" : "fb-detectives"} />
      <ThemeSong kind="outro" heading="h3" />

      <section aria-label="What happened">
        <h3 className="ui-heading">What happened, in order</h3>
        <ol className="ui-log" aria-live="polite">
          {lines.slice(0, shown).map((l, i) => <li key={i} className="ui-log-row">{l}</li>)}
        </ol>
        {shown < lines.length ? (
          <button type="button" className="ui-button ui-button--quiet" onClick={() => setShown(lines.length)}>Skip to the end</button>
        ) : null}
      </section>
    </section>
  );
}
