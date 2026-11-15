import type { ReactNode } from "react";
import type { Kind, Sight } from "@hauntology/shared/puzzles/types";
import { SightClue } from "./SightClue";
import "./SightsPage.css";

const TITLES: Readonly<Partial<Record<Kind, string>>> = { wires: "The fuse box", clock: "The stopped clock", safe: "The brass plaque", moved: "The shelf", photo: "The photo" };

/**
 * The Sights page of the notebook: every clue shown to this Player, kept only where Assist is on. With Assist off a clue is
 * never shown again once it closes, so the page says how to get it and shows nothing. It lists what the seat was shown,
 * in the order it was shown, and never anything the seat did not see.
 */
export function SightsPage({ assist, sights }: { assist: boolean; sights: readonly Sight[] }): ReactNode {
  if (!assist) {
    return (
      <section className="pz-sights" aria-label="Clues">
        <h2 className="pz-title">Clues</h2>
        <p className="pz-muted">A clue is shown once. Turn on Assist to keep the clues you saw on this page.</p>
      </section>
    );
  }
  return (
    <section className="pz-sights" aria-label="Clues">
      <h2 className="pz-title">Clues you saw</h2>
      {sights.length === 0 ? <p className="pz-muted">No clues yet. Explore: some places hold one.</p> : (
        <ol className="pz-sight-list">
          {sights.map((sight, i) => (
            <li key={i} className="pz-sight-item">
              <h3 className="pz-sight-name">{TITLES[sight.kind] ?? "A clue"}</h3>
              <SightClue sight={sight} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
