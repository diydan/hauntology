import type { ReactNode } from "react";
import { knockWords } from "@hauntology/shared/puzzles/knock";
import type { Sight } from "@hauntology/shared/puzzles/types";
import { PictureSvg } from "./art/Picture";
import { StoppedClock } from "./art/ClockFace";
import { SafePlaque } from "./art/safe";
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
        <SafePlaque code={p.code} />
      </>
    );
    case "moved": return (<><p className="ui-hint pz-hint">A shelf:</p><Shelf items={p.shelf} cols={p.shelf.length === 6 ? 3 : 4} /></>);
    case "photo": return (<><p className="ui-hint pz-hint">A photo, pinned to the wall:</p><div className="pz-sight-picture" style={{ aspectRatio: `${p.cols} / ${p.rows}` }}><PictureSvg picture={p.picture} cols={p.cols} rows={p.rows} label="The whole photo" /></div></>);
    case "knock": return (
      <>
        <p className="ui-hint pz-hint">Someone knocks at a door, a secret knock:</p>
        <p className="pz-knock-marks" aria-hidden="true">{p.groups.map((g, i) => "●".repeat(g).split("").join(" ") + (i < p.groups.length - 1 ? (p.long === i ? "      " : "   ") : "")).join("")}</p>
        <p className="ui-hint">{knockWords(p)}</p>
      </>
    );
  }
}
