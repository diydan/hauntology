import { describe, expect, it } from "vitest";
import type { TableData } from "@hauntology/shared/table/data";
import { buildModel, STANDEE_HEIGHT, WHISPER_PICTURE_HEIGHT, WHISPER_TAP_WIDTH, STANDEE_WIDTH } from "./model";
import { pickPiece, planePoint, rayToBoard, worldRay, type Ray } from "./picking";
import { boardToWorld, dragQuat, DEFAULT_ANCHOR, DEFAULT_FOV } from "./view";

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data: TableData = {
  rooms: zones.map((z, i) => ({ zone: z, name: z, slot: i, coldSpot: false, inspected: false })),
  pawns: [{ seat: 0, nickname: "Ada", zone: "hall", active: true, mono: false }],
  suspects: ["cora", "vane", "pike", "thorne", "percy", "dunmore"].map((c) => ({ card: c, name: c })),
  relics: ["a", "b", "c", "d", "e", "f"].map((c) => ({ card: c, name: c })),
  haunt: { level: 0, max: 6 },
};
const model = buildModel({ data, roomCode: "ABCD", theory: {}, tMs: 0, reducedMotion: true });
// a ray from above-front looking down at a board point
const toward = (x: number, y: number, z: number): Ray => {
  const o = { x, y: 0.9, z: z + 1.2 }, d = { x: 0, y: y - o.y, z: z - o.z }; // from straight in front and above, so nothing else is in the way
  return { o, d };
};

const noSuspects = buildModel({ data: { ...data, suspects: [] }, roomCode: "ABCD", theory: {}, tMs: 0, reducedMotion: true });
const fromSide = (x: number, y: number, z: number): Ray => ({ o: { x: x + 1.2, y: 0.5, z }, d: { x: -1.2, y: y - 0.5, z: 0 } });

describe("pickPiece", () => {
  it("picks the Suspect in the Line-up, not the room under or behind it", () => {
    const s = model.suspects[2]!;
    expect(pickPiece(model, toward(s.pos.x, STANDEE_HEIGHT / 2, s.pos.z))).toBe("suspect:pike");
  });

  it("picks a Pawn before the room beneath it", () => {
    const p = noSuspects.pawns[0]!;
    expect(pickPiece(noSuspects, toward(p.pos.x, STANDEE_HEIGHT * 0.4, p.pos.z))).toBe("pawn:0");
    // the floor just beside the Pawn is the room
    expect(pickPiece(noSuspects, toward(p.pos.x + STANDEE_WIDTH, 0, p.pos.z - 0.1))?.startsWith("room:")).toBe(true);
  });

  it("picks a Relic on the Shelf and nothing from empty table", () => {
    const r = model.relics[1]!;
    expect(pickPiece(model, fromSide(r.pos.x, 0.04, r.pos.z))).toBe("relic:b");
    expect(pickPiece(model, toward(-1.2, 0, 0.9))).toBeNull();
  });

  it("finds each of the six rooms from a point on its floor", () => {
    const got = new Set(model.rooms.map((r) => pickPiece(model, toward(r.center.x, 0, r.center.z - 0.05), ["room"])));
    expect(got).toEqual(new Set(model.rooms.map((r) => r.id)));
  });

  it("makes the Whisper's tap area narrower than her picture, so the room behind her can be tapped", () => {
    const w = model.whisper;
    const mid = w.height + WHISPER_PICTURE_HEIGHT / 2;
    const eye = { x: w.pos.x, y: mid, z: w.pos.z + 2 };
    const aim = (dx: number): Ray => ({ o: { ...eye, x: eye.x + dx }, d: { x: 0, y: 0, z: -1 } });
    expect(pickPiece(model, aim(0))).toBe("whisper");
    const pictureHalf = (0.6 * WHISPER_PICTURE_HEIGHT) / 2;
    const justOutsideTap = WHISPER_TAP_WIDTH / 2 + 0.01;
    expect(justOutsideTap).toBeLessThan(pictureHalf);
    expect(pickPiece(model, aim(justOutsideTap))).not.toBe("whisper");
  });

  it("can be limited to some kinds: a drag starts only on a Suspect", () => {
    const p = noSuspects.pawns[0]!;
    expect(pickPiece(noSuspects, toward(p.pos.x, 0.1, p.pos.z), ["suspect"])).toBeNull();
  });

  it("is null for a ray that is not a number", () => {
    expect(pickPiece(model, { o: { x: Number.NaN, y: 1, z: 1 }, d: { x: 0, y: -1, z: 0 } })).toBeNull();
  });
});

describe("rays", () => {
  it("looks through the middle of the screen at the Table when turned towards it", () => {
    const a = DEFAULT_ANCHOR;
    const pitch = Math.atan2(a.y, Math.hypot(a.x, a.z));
    const ray = worldRay(dragQuat({ yaw: 0, pitch }), DEFAULT_FOV, 0, 0)!;
    const b = rayToBoard(a, ray);
    const hit = planePoint(b, 0)!;
    expect(Math.hypot(hit.x, hit.z)).toBeLessThan(0.1);
  });
  it("finds the same board point whatever the heading of the Table", () => {
    const a = { ...DEFAULT_ANCHOR, facing: 1.1 };
    const w = boardToWorld(a, { x: 0.12, y: 0, z: -0.05 });
    const ray = rayToBoard(a, { o: { x: 0, y: 0, z: 0 }, d: w });
    const p = planePoint(ray, 0)!;
    expect(p.x).toBeCloseTo(0.12, 6);
    expect(p.z).toBeCloseTo(-0.05, 6);
  });
  it("gives no ray for a bad point and no plane point behind the eye", () => {
    expect(worldRay({ x: 0, y: 0, z: 0, w: 1 }, DEFAULT_FOV, Number.NaN, 0)).toBeNull();
    expect(planePoint({ o: { x: 0, y: 1, z: 0 }, d: { x: 0, y: 1, z: 0 } }, 0)).toBeNull();
  });
});
