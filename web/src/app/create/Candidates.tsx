import type { Candidate } from "@hauntology/shared/app/api";

/**
 * The candidates a sketch was turned into (Requirements 2.3, 2.5): each with alt text from the caption,
 * the image quota that is left, and three ways on: pick one, go back to the sketch, or redraw from nothing.
 * Picking is the only thing that moves the visitor towards the Confirm Gate, and even that spends nothing.
 */
export function altFor(caption: string, index: number): string {
  const what = caption.trim() === "" ? "your sketch" : `"${caption.trim()}"`;
  return `Option ${index + 1}: ${what}, made into a picture`;
}

export function Candidates({
  candidates, caption, picturesLeft, busy, onPick, onBack, onRedraw,
}: {
  candidates: Candidate[];
  caption: string;
  picturesLeft: number;
  busy: boolean;
  onPick: (imageId: string) => void;
  onBack: () => void;
  onRedraw: () => void;
}) {
  return (
    <section className="candidates" aria-labelledby="cand-title">
      <h2 id="cand-title">Pick the one that feels right</h2>
      <ul className="candidate-list">
        {candidates.map((c, i) => (
          <li key={c.imageId}>
            <img src={c.imageUrl} alt={altFor(caption, i)} />
            <button className="button" type="button" disabled={busy} onClick={() => onPick(c.imageId)}>
              {`Use option ${i + 1}`}
            </button>
          </li>
        ))}
      </ul>
      <p data-pictures-left>Pictures left this visit: {picturesLeft}</p>
      <p>
        <button className="button" type="button" disabled={busy} onClick={onBack}>
          Back to the sketch
        </button>{" "}
        <button className="button" type="button" disabled={busy} onClick={onRedraw}>
          Redraw
        </button>
      </p>
    </section>
  );
}
