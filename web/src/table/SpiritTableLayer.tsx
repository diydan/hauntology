import { useMemo, useRef, type ReactNode } from "react";
import type { SpiritClue } from "@hauntology/shared/puzzles/clues";
import type { Theory } from "@hauntology/shared/party/theory";
import { tableData } from "@hauntology/shared/table/data";
import type { TableNotebook } from "@hauntology/shared/table/notebook";
import type { TableFeed } from "../party/controller/controller-port";
import { hangClueRing } from "../puzzles/clues/ringScene";
import { SpiritTable, type SpiritTableProps } from "./SpiritTable";

/**
 * The Spirit table as a Controller layer (spirit-table 3.5): the chunk that is loaded only when the Player turns the switch on. It turns the
 * feed (Public View as the table reads it, the Player's own seat and notebook) and the Player's own Theory marks into Table data and gives
 * that to the drawing. It sends nothing and stores nothing; a Theory mark goes back out through `onTheory` to whoever keeps the notebook.
 */
const EMPTY_NOTEBOOK: TableNotebook = { auto: new Map(), mine: new Map(), columns: [] };

export type SpiritTableLayerProps = Readonly<{
  feed: TableFeed;
  roomCode: string;
  theory: Theory;
  onTheory: (next: Theory) => void;
  /** The clues of the Clue ring last shown on this phone and which were read: they hang round the same viewpoint as the Table (spirit-table 3.6). */
  clueRing?: Readonly<{ clues: readonly SpiritClue[]; read: ReadonlySet<string> }> | null;
}> & Pick<SpiritTableProps, "orientation" | "initialTilt" | "reducedMotion" | "createRenderer" | "media" | "frame" | "clueCount" | "onClues" | "ring">;

export default function SpiritTableLayer(p: SpiritTableLayerProps): ReactNode {
  const { feed, roomCode, theory, onTheory, clueRing, ...rest } = p;
  const readNow = useRef<ReadonlySet<string>>(clueRing?.read ?? new Set());
  readNow.current = clueRing?.read ?? readNow.current;
  const ring = useMemo(() => (clueRing && clueRing.clues.length > 0 ? hangClueRing(clueRing.clues, () => readNow.current) : undefined), [clueRing?.clues]);
  const data = useMemo(() => tableData(feed.pub, feed.priv, { ...(feed.notebook ?? EMPTY_NOTEBOOK), theory }, roomCode), [feed, roomCode, theory]);
  if (feed.pub.zones.length === 0) return <p className="ui-notice" role="status">The table waits for the game to start.</p>;
  return <SpiritTable {...rest} {...(ring ? { ring } : {})} data={data} roomCode={roomCode} theory={theory} onTheory={onTheory} clueCount={clueRing ? clueRing.read.size : rest.clueCount ?? feed.clueCount ?? null} />;
}
