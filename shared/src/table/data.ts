import { theoryOf } from "../party/theory";
import { tableLayout } from "./layout";
import { markOf, type TableMark, type TableNotebook } from "./notebook";
import { pawnsOf, type TablePawn } from "./pawns";

/**
 * What the Spirit table draws (spirit-table 2.1-2.4, 3.1-3.3, 9.2): built purely from what the phone may already
 * see (the public snapshot, the Player's own seat id, the Player's own notebook + Theory marks, and the Room Code).
 * Reads no secret outside what has already reached this phone, and reveals the ending only when phase === "ended".
 */
export type TableCardRef = Readonly<{ id: string; name: string }>;
export type TableEnding = Readonly<{ solution: Readonly<{ zone: string; suspect: string; relic: string }> }>;

export type TablePublicInput = Readonly<{
  phase: "lobby" | "playing" | "ended";
  active: number | null;
  seats: readonly Readonly<{ seat: number; nickname: string; poltergeist: boolean }>[] ;
  haunt: Readonly<{ level: number; max: number; coldSpot: string | null }>;
  zones: readonly TableCardRef[];
  suspects: readonly TableCardRef[];
  relics: readonly TableCardRef[];
  events: readonly Readonly<{ kind: string; seat?: number; zone?: string }>[];
  ending: TableEnding | null;
}>;

export type TablePrivateInput = Readonly<{ seat: number }>;

export type TableRoom = Readonly<{
  zone: string;
  name: string;
  slot: number;
  coldSpot: boolean;
  inspected: boolean;
  mark?: TableMark;
}>;

export type TableSuspect = Readonly<{
  card: string;
  name: string;
  mark?: TableMark;
  placedIn?: string;
}>;

export type TableRelic = Readonly<{
  card: string;
  name: string;
  mark?: TableMark;
}>;

export type TableAnswer = Readonly<{ zone: string; suspect: string; relic: string }>;

export type TableData = Readonly<{
  rooms: TableRoom[];
  pawns: TablePawn[];
  suspects: TableSuspect[];
  relics: TableRelic[];
  haunt: Readonly<{ level: number; max: number }>;
  ended?: TableAnswer;
}>;

export function tableData(
  pub: TablePublicInput,
  priv: TablePrivateInput | null,
  notebook: TableNotebook,
  roomCode = "",
): TableData {
  const layout = tableLayout(roomCode, pub.zones.map((z) => z.id));
  const slotByZone = new Map(layout.map((r) => [r.zone, r.slot] as const));
  const validZones = new Set(pub.zones.map((z) => z.id));

  const inspected = new Set<string>();
  if (priv !== null) {
    for (const e of pub.events) {
      if (e.kind === "inspect" && e.seat === priv.seat && typeof e.zone === "string") {
        inspected.add(e.zone);
      }
    }
  }

  const rooms: TableRoom[] = pub.zones.map((z) => {
    const mark = markOf(notebook, z.id);
    return {
      zone: z.id,
      name: z.name,
      slot: slotByZone.get(z.id) ?? 0,
      coldSpot: pub.haunt.coldSpot === z.id,
      inspected: inspected.has(z.id),
      ...(mark !== undefined ? { mark } : {}),
    };
  });

  const theory = notebook.theory ?? {};
  const suspects: TableSuspect[] = pub.suspects.map((s) => {
    const mark = markOf(notebook, s.id);
    const rawPlaced = theoryOf(theory, s.id);
    const placedIn = rawPlaced !== undefined && validZones.has(rawPlaced) ? rawPlaced : undefined;
    return {
      card: s.id,
      name: s.name,
      ...(mark !== undefined ? { mark } : {}),
      ...(placedIn !== undefined ? { placedIn } : {}),
    };
  });

  const relics: TableRelic[] = pub.relics.map((r) => {
    const mark = markOf(notebook, r.id);
    return {
      card: r.id,
      name: r.name,
      ...(mark !== undefined ? { mark } : {}),
    };
  });

  const ended: TableAnswer | undefined =
    pub.phase === "ended" && pub.ending !== null
      ? {
          zone: pub.ending.solution.zone,
          suspect: pub.ending.solution.suspect,
          relic: pub.ending.solution.relic,
        }
      : undefined;

  return {
    rooms,
    pawns: pawnsOf(pub),
    suspects,
    relics,
    haunt: { level: pub.haunt.level, max: pub.haunt.max },
    ...(ended !== undefined ? { ended } : {}),
  };
}
