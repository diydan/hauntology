import { describe, expect, it } from "vitest";
import { tableData, type TablePublicInput } from "./data";
import { tableLayout } from "./layout";
import { placeTable } from "./place";
import { WHISPER_MOVE_MS, WHISPER_REST_MS, whisperAt, whisperGlow } from "./whisper";
import { BOARD, roomCenter } from "./marks";
import { slotCoord } from "./layout";

// Edge tests found by the mutation pass of spirit-table task 4.4: each pins a line that the property tests left free.
const ZONES = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const pub = (over: Partial<TablePublicInput> = {}): TablePublicInput => ({
  phase: "playing", active: 1, seats: [{ seat: 1, nickname: "Ann", poltergeist: false }], haunt: { level: 3, max: 10, coldSpot: "kitchen" },
  zones: ZONES.map((id) => ({ id, name: id })), suspects: [{ id: "cora", name: "Cora" }], relics: [{ id: "box", name: "Box" }], events: [], ending: null, ...over,
});
const NOTEBOOK = { auto: new Map(), mine: new Map(), columns: [] };

describe("tableData edges (spirit-table 2.1, 2.3, 9.2)", () => {
  it("marks exactly the Cold Spot room cold, and no other", () => {
    const d = tableData(pub(), { seat: 1 }, NOTEBOOK, "K7M2");
    expect(d.rooms.filter((r) => r.coldSpot).map((r) => r.zone)).toEqual(["kitchen"]);
    expect(tableData(pub({ haunt: { level: 3, max: 10, coldSpot: null } }), { seat: 1 }, NOTEBOOK, "K7M2").rooms.some((r) => r.coldSpot)).toBe(false);
  });
  it("puts each room in the slot the shared layout gives it", () => {
    const d = tableData(pub(), { seat: 1 }, NOTEBOOK, "K7M2");
    const lay = new Map(tableLayout("K7M2", ZONES).map((r) => [r.zone, r.slot] as const));
    for (const r of d.rooms) expect(r.slot).toBe(lay.get(r.zone));
    expect(new Set(d.rooms.map((r) => r.slot)).size).toBe(6); // not all in slot 0
  });
  it("drops a Theory mark that names a room that is not on the table, and keeps one that is", () => {
    const d = tableData(pub(), { seat: 1 }, { ...NOTEBOOK, theory: { cora: "attic" } }, "K7M2");
    expect(d.suspects[0]!.placedIn).toBeUndefined();
    const e = tableData(pub(), { seat: 1 }, { ...NOTEBOOK, theory: { cora: "hall" } }, "K7M2");
    expect(e.suspects[0]!.placedIn).toBe("hall");
  });
});

describe("whisperAt edges (spirit-table 2.4)", () => {
  const haunt = { level: 3, max: 10 };
  const at = (t: number, code = "K7M2") => whisperAt(code, ZONES, null, haunt, t, false);
  it("rests for 4.5 s on a room, then glides for 3 s with an ease, and is half way at the middle of the glide", () => {
    const a = at(0), rest = at(WHISPER_REST_MS - 1), mid = at(WHISPER_REST_MS + WHISPER_MOVE_MS / 2), next = at(WHISPER_REST_MS + WHISPER_MOVE_MS);
    expect(rest.x).toBeCloseTo(a.x, 9);
    expect(rest.z).toBeCloseTo(a.z, 9);
    expect(mid.x).toBeCloseTo((a.x + next.x) / 2, 6);
    expect(mid.z).toBeCloseTo((a.z + next.z) / 2, 6);
    const quarter = at(WHISPER_REST_MS + WHISPER_MOVE_MS / 4);
    expect(Math.hypot(quarter.x - a.x, quarter.z - a.z)).toBeLessThan(Math.hypot(mid.x - a.x, mid.z - a.z) / 2 + 1e-9); // eased: slower at the start than a straight line
  });
  it("visits every room on its tour, and a different Room Code tours the rooms in a different order", () => {
    const order = (code: string): string[] => {
      const centre = new Map(tableLayout(code, ZONES).map((r) => { const c = roomCenter(slotCoord(r.slot), BOARD); return [`${c.x.toFixed(3)},${c.z.toFixed(3)}`, r.zone] as const; }));
      return ZONES.map((_, i) => { const s = at(i * (WHISPER_REST_MS + WHISPER_MOVE_MS), code); return centre.get(`${s.x.toFixed(3)},${s.z.toFixed(3)}`) ?? "?"; });
    };
    expect(new Set(order("K7M2")).size).toBe(6); // every room, once
    expect(new Set(["K7M2", "AAAA", "ZZZZ", "Q1W2", "M9N8", "H3J4"].map((c) => order(c).join(">"))).size).toBeGreaterThan(1);
  });
  it("glows by the share of the Haunt, 0 at level 0 and 1 at the maximum", () => {
    expect(whisperGlow({ level: 3, max: 10 })).toBeCloseTo(0.3, 9);
    expect(whisperGlow({ level: 10, max: 10 })).toBe(1);
    expect(whisperGlow({ level: 0, max: 10 })).toBe(0);
  });
  it("floats over the Cold Spot room exactly when there is one", () => {
    const lay = new Map(tableLayout("K7M2", ZONES).map((r) => [r.zone, r.slot] as const));
    const c = roomCenter(slotCoord(lay.get("hall")!), BOARD);
    const w = whisperAt("K7M2", ZONES, "hall", haunt, 123456, true);
    expect(w.x).toBeCloseTo(c.x, 9);
    expect(w.z).toBeCloseTo(c.z, 9);
  });
});

describe("placeTable edges (spirit-table 4.1)", () => {
  it("looking nearly straight up or down keeps the last heading, and a level look takes its own heading", () => {
    const last = { x: 1, z: 0 };
    expect(placeTable({ x: 0.05, y: -0.99, z: 0.05 }, last).heading).toEqual({ x: 1, z: 0 });
    expect(placeTable({ x: 0.05, y: 0.99, z: 0.05 }, last).heading).toEqual({ x: 1, z: 0 });
    const level = placeTable({ x: 0, y: -0.1, z: -1 }, last).heading;
    expect(level.x).toBeCloseTo(0, 9);
    expect(level.z).toBeCloseTo(-1, 9);
  });
});
