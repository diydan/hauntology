import type { ReactNode } from "react";
import { describePiece, type Piece, type TableModel } from "./model";
import type { CameraStatus } from "./camera";
import "./table.css";

/**
 * The row of four controls (spirit-table 6.2): Camera, Place, Tilt, Clues. Each is 48 pixels or more and all four share one row at 320 CSS
 * pixels. The state is in words (On, Off, a count), never in colour alone.
 */
export type TableControlsProps = Readonly<{
  camera: CameraStatus;
  onCamera: () => void;
  onPlace: () => void;
  tilt: "on" | "off" | "unavailable";
  onTilt: () => void;
  /** How many Spirit clues are read, or null where there is no Clue ring (the Clues control is then not drawn as live). */
  clueCount: number | null;
  onClues: () => void;
}>;

export function TableControls(p: TableControlsProps): ReactNode {
  const camOn = p.camera === "on" || p.camera === "starting";
  return (
    <div className="st-controls" role="group" aria-label="Table controls">
      <button type="button" className="ui-button st-control" aria-pressed={camOn} onClick={p.onCamera}>
        <span className="st-control-name">Camera</span><span className="st-control-state">{p.camera === "starting" ? "Asking" : camOn ? "On" : "Off"}</span>
      </button>
      <button type="button" className="ui-button st-control" onClick={p.onPlace}>
        <span className="st-control-name">Place</span><span className="st-control-state">Here</span>
      </button>
      <button type="button" className="ui-button st-control" aria-pressed={p.tilt === "on"} disabled={p.tilt === "unavailable"} onClick={p.onTilt}>
        <span className="st-control-name">Tilt</span><span className="st-control-state">{p.tilt === "unavailable" ? "No sensor" : p.tilt === "on" ? "On" : "Off"}</span>
      </button>
      <button type="button" className="ui-button st-control" onClick={p.onClues} aria-label={p.clueCount === null ? "Clues" : `Clues, ${p.clueCount} read`}>
        <span className="st-control-name">Clues</span><span className="st-control-state">{p.clueCount === null ? "—" : p.clueCount}</span>
      </button>
    </div>
  );
}

/** The card that names a tapped piece and says what the Player may know of it (2.6), with a Close of 48 pixels. */
export function PieceCard({ model, piece, onClose }: { model: TableModel; piece: Piece; onClose: () => void }): ReactNode {
  const title = piece.kind === "room" || piece.kind === "suspect" || piece.kind === "relic" || piece.kind === "whisper" ? piece.name : piece.nickname;
  return (
    <aside className="st-card ui-panel" aria-label={`${title}, details`} role="dialog" aria-modal="false">
      <div className="st-card-head">
        <h2 className="ui-heading">{title}</h2>
        <button type="button" className="ui-button st-close" onClick={onClose}>Close</button>
      </div>
      <p className="st-card-text">{describePiece(model, piece)}</p>
    </aside>
  );
}

/** The arrow at the edge of the view, labelled "board", pointing at the Table once it has been out of view for 2 seconds (4.6). `angle` is on the screen, 0 to the right, counter-clockwise. */
export function BoardArrow({ angle }: { angle: number }): ReactNode {
  // The arrow's own position on the screen edge is set by CSS custom properties from the angle; the label is the text.
  const dx = Math.cos(angle), dy = -Math.sin(angle);
  return (
    <div className="st-arrow" role="img" aria-label="board: the table is out of view in this direction" style={{ ["--st-dx" as string]: String(dx), ["--st-dy" as string]: String(dy), ["--st-angle" as string]: `${-angle}rad` }}>
      <span className="st-arrow-head" aria-hidden="true">➤</span>
      <span className="st-arrow-label">board</span>
    </div>
  );
}

export type { TableModel };
