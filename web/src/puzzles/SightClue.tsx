import type { ReactNode } from "react";
import type { Sight } from "@hauntology/shared/puzzles/types";
import { PictureSvg } from "./art/Picture";
import { StoppedClock } from "./art/ClockFace";
import { Shelf } from "./art/shelf";
import { FuseBox } from "./art/wires";
import "./puzzles.css";

/** What a Sight shows: the fuse box, the stopped clock, the plaque, the shelf or the photo. Used by the card and by the notebook page. */
export function SightClue({ sight }: { sight: Sight }): ReactNode {
  const p = sight.payload;
  switch (p.kind) {
    case "wires": return (<><p className="ui-hint pz-hint">The fuse box, top to bottom:</p><FuseBox order={p.order} /></>);
    case "clock": return (<><p className="ui-hint pz-hint">A clock, stopped:</p><StoppedClock h={p.h} m={p.m} /><p className="ui-hint">{p.h}:{String(p.m).padStart(2, "0")}</p></>);
    case "safe": return (
      <>
        <p className="ui-hint pz-hint">A brass plaque, scratched with numbers:</p>
        <div className="pz-digits" role="img" aria-label={`Code: ${p.code.join(" ")}`}>{p.code.map((d, i) => <span key={i}>{d}</span>)}</div>
      </>
    );
    case "moved": return (<><p className="ui-hint pz-hint">A shelf:</p><Shelf items={p.shelf} cols={p.shelf.length === 6 ? 3 : 4} /></>);
    case "photo": return (<><p className="ui-hint pz-hint">A photo, pinned to the wall:</p><div className="pz-sight-picture"><PictureSvg picture={p.picture} cols={p.cols} rows={p.rows} label="The whole photo" /></div></>);
  }
}
