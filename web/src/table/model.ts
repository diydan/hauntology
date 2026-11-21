import { SLOT_COUNT, slotCoord } from "@hauntology/shared/table/layout";
import { BOARD, lineupPos, placeSuspects, roomCenter, type Slot } from "@hauntology/shared/table/marks";
import type { TableData, TableRoom } from "@hauntology/shared/table/data";
import type { TableMark } from "@hauntology/shared/table/notebook";
import { WHISPER_HEIGHT, whisperAt, type WhisperState } from "@hauntology/shared/table/whisper";
import type { Theory } from "@hauntology/shared/party/theory";

/**
 * The Spirit table as plain data (spirit-table 2.1 to 2.6, 3.2, 3.3, 9.2): where every piece stands, in the board's own frame (metres in
 * the mockup's board units, x sideways, z towards the Player, the middle of the board at 0, 0), what it is called and what its tag says.
 * Built from Table data and the Player's own Theory marks only, so the drawing, the Table list and the picking read the same thing and
 * cannot disagree. No browser, no three.js, no clock inside: the Whisper's place comes in as a value.
 */

/** The board is 3 rooms across (0.9 board units). The Table is about 40 centimetres wide on the real table (4.4). */
export const BOARD_WIDTH = 3 * BOARD.W;
export const TABLE_SCALE = 0.4 / BOARD_WIDTH;
/** Piece heights in board units: a Pawn or a Suspect is about 10 cm tall and the Whisper about 20 cm at `TABLE_SCALE` (4.4). */
export const STANDEE_HEIGHT = 0.1 / TABLE_SCALE;
export const STANDEE_WIDTH = 0.6 * STANDEE_HEIGHT;
export const WHISPER_PICTURE_HEIGHT = 0.2 / TABLE_SCALE;
/** The Whisper's tap area is narrower than her picture, so she does not block the rooms behind her (4.5). */
export const WHISPER_TAP_WIDTH = 0.35 * (0.6 * WHISPER_PICTURE_HEIGHT);
export const RELIC_SIZE = 0.09;
export const SHELF_X = 1.5 * BOARD.W + 0.122;
/** Beside the front door: along the front edge, between the board and the line-up. */
export const DOOR_Z = BOARD.D + 0.04;

export type PieceId = string;
export type PieceKind = "room" | "pawn" | "suspect" | "relic" | "whisper";
export type Pt = Readonly<{ x: number; z: number }>;

export type RoomPiece = Readonly<{
  id: PieceId; kind: "room"; zone: string; name: string; slot: Slot; center: Pt; w: number; d: number;
  coldSpot: boolean; inspected: boolean; mark?: TableMark; solution: boolean;
}>;
export type PawnPiece = Readonly<{ id: PieceId; kind: "pawn"; seat: number; nickname: string; pos: Pt; zone: string | "door"; active: boolean; mono: boolean }>;
export type SuspectPiece = Readonly<{ id: PieceId; kind: "suspect"; card: string; name: string; pos: Pt; zone: string | null; mark?: TableMark; solution: boolean }>;
export type RelicPiece = Readonly<{ id: PieceId; kind: "relic"; card: string; name: string; pos: Pt; mark?: TableMark; solution: boolean }>;
export type WhisperPiece = Readonly<{ id: "whisper"; kind: "whisper"; name: string; pos: Pt; height: number; glow: number }>;
export type Piece = RoomPiece | PawnPiece | SuspectPiece | RelicPiece | WhisperPiece;

/** A floating tag tied by a thin stem to its piece: ruled out (a cross), maybe (a question mark) or the Player's own "maybe here" (3.2, 6.2). */
export type Tag = Readonly<{ piece: PieceId; kind: "ruled_out" | "maybe" | "maybe_here"; glyph: "✕" | "?" | "maybe here"; at: Pt; height: number }>;

export type TableModel = Readonly<{
  rooms: readonly RoomPiece[];
  pawns: readonly PawnPiece[];
  suspects: readonly SuspectPiece[];
  relics: readonly RelicPiece[];
  whisper: WhisperPiece;
  tags: readonly Tag[];
  haunt: Readonly<{ level: number; max: number }>;
  ended: boolean;
}>;

export type ModelInput = Readonly<{
  data: TableData;
  roomCode: string;
  theory: Theory;
  tMs: number;
  reducedMotion: boolean;
}>;

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

export function buildModel(i: ModelInput): TableModel {
  const { data } = i;
  const slotOf = new Map<string, Slot>(data.rooms.map((r: TableRoom) => [r.zone, slotCoord(Math.min(SLOT_COUNT - 1, Math.max(0, r.slot)))] as const));
  const sol = data.ended;

  const rooms: RoomPiece[] = data.rooms.map((r) => {
    const slot = slotOf.get(r.zone) ?? slotCoord(0);
    return {
      id: `room:${r.zone}`, kind: "room", zone: r.zone, name: r.name, slot, center: roomCenter(slot), w: BOARD.W, d: BOARD.D,
      coldSpot: r.coldSpot, inspected: r.inspected, ...(r.mark ? { mark: r.mark } : {}), solution: sol?.zone === r.zone,
    };
  });
  const roomCenterOf = new Map(rooms.map((r) => [r.zone, r.center] as const));

  // Pawns: in the room of their seat's newest public suggest/inspect, in a free place along its front edge; else beside the front door.
  const used = new Map<string, number>();
  const doorSeats = data.pawns.filter((p) => !roomCenterOf.has(p.zone));
  const pawns: PawnPiece[] = data.pawns.map((p) => {
    const c = roomCenterOf.get(p.zone);
    const key = c ? p.zone : "door";
    const k = used.get(key) ?? 0;
    used.set(key, k + 1);
    const pos: Pt = c
      ? { x: c.x + ((k % 3) - 1) * BOARD.W * 0.28, z: c.z + BOARD.D * 0.32 - Math.floor(k / 3) * BOARD.D * 0.2 }
      : { x: (k - (doorSeats.length - 1) / 2) * 0.07, z: DOOR_Z };
    return { id: `pawn:${p.seat}`, kind: "pawn", seat: p.seat, nickname: p.nickname, pos, zone: c ? p.zone : "door", active: p.active, mono: p.mono };
  });

  // Suspects: in the Line-up in pool order; one stands in a room only by the Player's own Theory mark (2.3, 9.2).
  const standing = placeSuspects(i.theory, data.suspects.map((s) => s.card), slotOf);
  const suspects: SuspectPiece[] = data.suspects.map((s, idx) => {
    const st = standing.get(s.card) ?? { ...lineupPos(idx, data.suspects.length), zone: null };
    return { id: `suspect:${s.card}`, kind: "suspect", card: s.card, name: s.name, pos: { x: st.x, z: st.z }, zone: st.zone, ...(s.mark ? { mark: s.mark } : {}), solution: sol?.suspect === s.card };
  });

  // Relics: on the Shelf at the side in pool order, never in a room (2.3).
  const n = data.relics.length;
  const relics: RelicPiece[] = data.relics.map((r, idx) => ({
    id: `relic:${r.card}`, kind: "relic", card: r.card, name: r.name,
    pos: { x: SHELF_X, z: (idx - (n - 1) / 2) * 0.09 }, ...(r.mark ? { mark: r.mark } : {}), solution: sol?.relic === r.card,
  }));

  const w: WhisperState = whisperAt(i.roomCode, data.rooms.map((r) => r.zone), data.rooms.find((r) => r.coldSpot)?.zone ?? null, data.haunt, i.tMs, i.reducedMotion);
  const whisper: WhisperPiece = { id: "whisper", kind: "whisper", name: "The Whisper", pos: { x: finite(w.x), z: finite(w.z) }, height: finite(w.height) || WHISPER_HEIGHT, glow: finite(w.glow) };

  const tags: Tag[] = [];
  for (const r of rooms) if (r.mark) tags.push({ piece: r.id, kind: r.mark, glyph: r.mark === "ruled_out" ? "✕" : "?", at: r.center, height: 0.16 });
  for (const s of suspects) {
    if (s.mark) tags.push({ piece: s.id, kind: s.mark, glyph: s.mark === "ruled_out" ? "✕" : "?", at: s.pos, height: STANDEE_HEIGHT + 0.05 });
    if (s.zone !== null) tags.push({ piece: s.id, kind: "maybe_here", glyph: "maybe here", at: s.pos, height: STANDEE_HEIGHT + 0.11 });
  }
  for (const r of relics) if (r.mark) tags.push({ piece: r.id, kind: r.mark, glyph: r.mark === "ruled_out" ? "✕" : "?", at: r.pos, height: RELIC_SIZE + 0.07 });

  return { rooms, pawns, suspects, relics, whisper, tags, haunt: data.haunt, ended: sol !== undefined };
}

export const piecesOf = (m: TableModel): Piece[] => [...m.rooms, ...m.pawns, ...m.suspects, ...m.relics, m.whisper];

export function findPiece(m: TableModel, id: PieceId): Piece | undefined {
  return piecesOf(m).find((p) => p.id === id);
}

const MARK_WORDS: Readonly<Record<TableMark, string>> = { ruled_out: "ruled out (cross)", maybe: "maybe (question mark)" };

/** What the Player may know of a piece, as words: the text label for a screen reader and the body of the piece card (2.6, 6.3). */
export function describePiece(m: TableModel, p: Piece): string {
  switch (p.kind) {
    case "room": {
      const here = m.pawns.filter((x) => x.zone === p.zone).map((x) => x.nickname);
      const there = m.suspects.filter((x) => x.zone === p.zone).map((x) => x.name);
      const parts = [p.name + ".", here.length ? `Pawns here: ${here.join(", ")}.` : "No pawns here."];
      if (p.mark) parts.push(`Your mark: ${MARK_WORDS[p.mark]}.`);
      if (p.inspected) parts.push("You inspected this room.");
      if (p.coldSpot) parts.push("Cold spot.");
      if (there.length) parts.push(`Your theory puts here: ${there.join(", ")}.`);
      if (p.solution) parts.push("The solution's room.");
      return parts.join(" ");
    }
    case "pawn":
      return `${p.nickname}. ${p.mono ? "Has joined the haunting." : "Still living."}${p.active ? " Their turn." : ""}`;
    case "suspect":
      return `${p.name}. ${p.mark ? `Your mark: ${MARK_WORDS[p.mark]}.` : "No mark."}${p.zone !== null ? " Your theory: maybe here." : ""}${p.solution ? " The solution's suspect." : ""}`;
    case "relic":
      return `${p.name}. ${p.mark ? `Your mark: ${MARK_WORDS[p.mark]}.` : "No mark."}${p.solution ? " The solution's relic." : ""}`;
    case "whisper":
      return `The Whisper. Haunt ${m.haunt.level} of ${m.haunt.max}.`;
  }
}
