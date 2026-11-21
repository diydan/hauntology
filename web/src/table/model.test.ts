import { describe, expect, it } from "vitest";
import type { TableData } from "@hauntology/shared/table/data";
import { SLOT_COUNT } from "@hauntology/shared/table/layout";
import { buildModel, describePiece, findPiece, piecesOf, STANDEE_HEIGHT, TABLE_SCALE, WHISPER_TAP_WIDTH, WHISPER_PICTURE_HEIGHT } from "./model";

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data = (over: Partial<TableData> = {}): TableData => ({
  rooms: zones.map((z, i) => ({ zone: z, name: z.toUpperCase(), slot: i, coldSpot: z === "nursery", inspected: z === "hall" })),
  pawns: [
    { seat: 0, nickname: "Ada", zone: "hall", active: true, mono: false },
    { seat: 1, nickname: "Miles", zone: "door", active: false, mono: false },
    { seat: 2, nickname: "Pat", zone: "hall", active: false, mono: true },
  ],
  suspects: ["cora", "vane", "pike", "thorne", "percy", "dunmore"].map((c) => ({ card: c, name: c })),
  relics: ["a", "b", "c", "d", "e", "f"].map((c) => ({ card: c, name: `Relic ${c}` })),
  haunt: { level: 2, max: 6 },
  ...over,
} as TableData);
const base = { roomCode: "ABCD", theory: {}, tMs: 0, reducedMotion: false } as const;

describe("buildModel", () => {
  it("makes six rooms in six different slots and the Whisper over the Cold Spot room", () => {
    const m = buildModel({ ...base, data: data() });
    expect(m.rooms).toHaveLength(6);
    expect(new Set(m.rooms.map((r) => `${r.slot.c},${r.slot.r}`)).size).toBe(SLOT_COUNT);
    const cold = m.rooms.find((r) => r.coldSpot)!;
    expect(m.whisper.pos.x).toBeCloseTo(cold.center.x, 6);
    expect(m.whisper.pos.z).toBeCloseTo(cold.center.z, 6);
  });

  it("stands no Suspect in a room and no Relic in a room unless a Theory mark says so (only Suspects)", () => {
    const m = buildModel({ ...base, data: data() });
    expect(m.suspects.every((s) => s.zone === null)).toBe(true);
    // the Line-up is in pool order, left to right, in front of the board
    const xs = m.suspects.map((s) => s.pos.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(m.relics.every((r) => r.pos.x > 0.45)).toBe(true);
    expect(m.tags.filter((t) => t.kind === "maybe_here")).toHaveLength(0);
  });

  it("puts a Suspect in a room, with a 'maybe here' tag, only through the Theory mark; an unknown zone is ignored", () => {
    const m = buildModel({ ...base, data: data(), theory: { cora: "study", vane: "no-such-room" } });
    const cora = m.suspects.find((s) => s.card === "cora")!;
    const room = m.rooms.find((r) => r.zone === "study")!;
    expect(cora.zone).toBe("study");
    expect(Math.abs(cora.pos.x - room.center.x)).toBeLessThan(room.w / 2);
    expect(Math.abs(cora.pos.z - room.center.z)).toBeLessThan(room.d / 2);
    expect(m.suspects.find((s) => s.card === "vane")!.zone).toBeNull();
    expect(m.tags.filter((t) => t.kind === "maybe_here").map((t) => t.piece)).toEqual(["suspect:cora"]);
  });

  it("stands Pawns in their room or at the door, and tells black-and-white from living", () => {
    const m = buildModel({ ...base, data: data() });
    const hall = m.rooms.find((r) => r.zone === "hall")!;
    for (const p of m.pawns.filter((x) => x.zone === "hall")) expect(Math.abs(p.pos.x - hall.center.x)).toBeLessThan(hall.w / 2);
    const miles = m.pawns.find((p) => p.nickname === "Miles")!;
    expect(miles.zone).toBe("door");
    expect(m.pawns.find((p) => p.nickname === "Pat")!.mono).toBe(true);
    expect(new Set(m.pawns.map((p) => `${p.pos.x},${p.pos.z}`)).size).toBe(3);
  });

  it("makes a tag for each Mark with a glyph that is not a colour, and lights the Solution only at the end", () => {
    const d = data({
      rooms: data().rooms.map((r) => (r.zone === "library" ? { ...r, mark: "ruled_out" as const } : r)),
      suspects: data().suspects.map((s) => (s.card === "pike" ? { ...s, mark: "maybe" as const } : s)),
    });
    const m = buildModel({ ...base, data: d });
    expect(m.tags.map((t) => [t.piece, t.glyph])).toEqual([["room:library", "✕"], ["suspect:pike", "?"]]);
    expect(m.ended).toBe(false);
    expect(piecesOf(m).some((p) => "solution" in p && p.solution)).toBe(false);
    const e = buildModel({ ...base, data: { ...d, ended: { zone: "cellar", suspect: "cora", relic: "d" } } });
    expect(e.ended).toBe(true);
    expect(piecesOf(e).filter((p) => "solution" in p && p.solution).map((p) => p.id).sort()).toEqual(["relic:d", "room:cellar", "suspect:cora"]);
  });

  it("is the real size: Suspects about 10 cm and the Whisper about 20 cm at the table's scale; her tap area is narrower than her picture", () => {
    expect(STANDEE_HEIGHT * TABLE_SCALE).toBeCloseTo(0.1, 6);
    expect(WHISPER_PICTURE_HEIGHT * TABLE_SCALE).toBeCloseTo(0.2, 6);
    expect(WHISPER_TAP_WIDTH).toBeLessThan(0.6 * WHISPER_PICTURE_HEIGHT);
    expect(0.9 * TABLE_SCALE).toBeCloseTo(0.4, 6);
  });

  it("describes each piece with words the Player may know", () => {
    const m = buildModel({ ...base, data: data({ rooms: data().rooms.map((r) => (r.zone === "hall" ? { ...r, mark: "maybe" as const } : r)) }) });
    const hall = findPiece(m, "room:hall")!;
    const text = describePiece(m, hall);
    expect(text).toContain("Ada");
    expect(text).toContain("Pat");
    expect(text).toContain("maybe (question mark)");
    expect(text).toContain("You inspected this room.");
    expect(describePiece(m, findPiece(m, "pawn:2")!)).toContain("joined the haunting");
    expect(describePiece(m, m.whisper)).toContain("Haunt 2 of 6");
  });

  it("holds still and finite under reduced motion and for a bad time", () => {
    const a = buildModel({ ...base, data: data({ rooms: data().rooms.map((r) => ({ ...r, coldSpot: false })) }), reducedMotion: true, tMs: 1 });
    const b = buildModel({ ...base, data: data({ rooms: data().rooms.map((r) => ({ ...r, coldSpot: false })) }), reducedMotion: true, tMs: 99999 });
    expect(a.whisper).toEqual(b.whisper);
    const c = buildModel({ ...base, data: data(), tMs: Number.NaN });
    expect(Number.isFinite(c.whisper.pos.x) && Number.isFinite(c.whisper.height)).toBe(true);
  });
});
