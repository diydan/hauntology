import { useEffect, useRef, useState, type ReactNode } from "react";
import { LINE_AT, SHOTS, SHOT_TEXT, endingCard, shotLine } from "@hauntology/shared/party/scenes";
import { footageRuns, type SceneDeps } from "./types";

/**
 * The ending scene on the Host (puzzles 14.4, Requirement 21): when the game ends the Host plays `dawn` (a Detective win) or `house` (the house
 * wins) with the line written for it, then a title card of our own words, then the recap (the children). A Skip of at least 48 pixels is on screen
 * while the shot plays and shows the card at once. With footage off (reduced motion, data saver, no clip, a clip that cannot load) the card shows
 * at once with the still. It reads only public state: who won or that the house did, and the nicknames of those who joined the haunting, so
 * the Solution is not shown before the recap's own order allows it (the children are the recap). The card never says the word Poltergeist.
 */
export function EndingFilm({ outcome, joined, reducedMotion, deps, roomLineBusy = false, children }: {
  outcome: "detectives" | "house"; joined: readonly string[]; reducedMotion: boolean; deps?: SceneDeps; /** The Room's own ending line is speaking or due: the shot's line is then in words only (20.9). */ roomLineBusy?: boolean; children?: ReactNode;
}): ReactNode {
  const card = endingCard(outcome, joined);
  const clip = SHOTS[card.shot];
  const webm = deps?.clipUrl(clip, "webm") ?? null;
  const mp4 = deps?.clipUrl(clip, "mp4") ?? null;
  const still = deps?.clipUrl(clip, "jpg") ?? null;
  const hasVideo = footageRuns(deps, reducedMotion) && (webm !== null || mp4 !== null);
  const [stage, setStage] = useState<"shot" | "card">(hasVideo ? "shot" : "card");
  const [lineText, setLineText] = useState("");
  const d = useRef(deps);
  d.current = deps;
  const busy = useRef(roomLineBusy);
  busy.current = roomLineBusy;

  // the line: in words whatever the Master chose, aloud only where narration is on, at its moment in the shot; dropped by Skip
  useEffect(() => {
    if (stage !== "shot") return;
    const entry = shotLine(card.shot);
    if (entry === null) return;
    const h = setTimeout(() => {
      setLineText(entry.text);
      if (d.current?.narrationOn === true && !busy.current) d.current.speak?.(entry);
    }, LINE_AT[card.shot] * 1000);
    return () => clearTimeout(h);
  }, [stage, card.shot]);

  // no film to play (footage off, no clip, one that failed before it started): the line is said at once, with the still (20.8)
  const stillLine = !hasVideo ? shotLine(card.shot) : null;
  useEffect(() => {
    if (stillLine !== null && d.current?.narrationOn === true && !busy.current) d.current.speak?.(stillLine);
  }, [stillLine]);

  const showCard = stage === "card";
  return (
    <div className="ph-ending-film ui-stack" data-outcome={outcome} data-stage={stage}>
      {!showCard ? (
        <section className="ph-film ui-stack--tight" aria-label="The ending">
          <figure className="ui-figure ph-film-picture">
            <video muted playsInline autoPlay preload="auto" aria-hidden="true" tabIndex={-1} onEnded={() => setStage("card")} onError={() => setStage("card")}>
              {webm !== null ? <source src={webm} type="video/webm" /> : null}
              {mp4 !== null ? <source src={mp4} type="video/mp4" /> : null}
            </video>
          </figure>
          <p className="ui-hint">{SHOT_TEXT[card.shot]}</p>
          {lineText !== "" ? <p className="ui-speech" role="status" aria-live="polite" data-testid="ph-ending-line">{lineText}</p> : null}
          <button type="button" className="ui-button ui-button--main ph-skip" onClick={() => setStage("card")}>Skip</button>
        </section>
      ) : (
        <section className="ph-card ui-card ui-stack--tight" aria-label="The ending card" data-testid="ph-ending-card">
          {still !== null && deps?.footage === true ? <figure className="ui-figure ph-film-picture"><img src={still} alt="" /></figure> : null}
          <h2 className="ui-title">{card.title}</h2>
          {card.lines.map((l) => <p key={l} className="ui-lead">{l}</p>)}
          <p className="ui-hint">{SHOT_TEXT[card.shot]}</p>
          {stillLine !== null ? <p className="ui-speech" role="status" aria-live="polite" data-testid="ph-ending-line">{stillLine.text}</p> : null}
        </section>
      )}
      {showCard ? children : null}
    </div>
  );
}
