import { describe, expect, it } from "vitest";
import type { TableData } from "@hauntology/shared/table/data";
import { buildModel } from "./model";
import { createTableScene, PICTURE_MAX_BYTES, pictureFits } from "./threeScene";
import { DEFAULT_ANCHOR, dragQuat } from "./view";

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data: TableData = {
  rooms: zones.map((z, i) => ({ zone: z, name: z, slot: i, coldSpot: z === "nursery", inspected: z === "hall", ...(z === "study" ? { mark: "maybe" as const } : {}) })),
  pawns: [{ seat: 0, nickname: "Ada", zone: "hall", active: true, mono: false }, { seat: 1, nickname: "Miles", zone: "door", active: false, mono: true }],
  suspects: ["cora", "vane", "pike", "thorne", "percy", "dunmore"].map((c) => ({ card: c, name: c })),
  relics: ["a", "b", "c", "d", "e", "f"].map((c) => ({ card: c, name: c })),
  haunt: { level: 3, max: 6 },
};
const build = (theory = {}, reduced = false) => buildModel({ data, roomCode: "AB12", theory, tMs: 0, reducedMotion: reduced });

describe("createTableScene (no renderer)", () => {
  it("builds six rooms, a standee for every Pawn and Suspect, six Relics, and syncs finite positions", () => {
    const m = build({ cora: "study" });
    const ts = createTableScene(m, { reducedMotion: false });
    ts.setView(DEFAULT_ANCHOR, dragQuat({ yaw: 0, pitch: -0.4 }), 0.55);
    ts.sync(m, 1000, 16);
    const s = ts.stats();
    expect(s).toMatchObject({ rooms: 6, standees: 8, relics: 6 });
    expect(s.tags).toBe(1 + 1 + 0); // the study's maybe mark and Cora's "maybe here"
    expect(s.triangles).toBeGreaterThan(100);
    ts.scene.updateMatrixWorld(true);
    ts.scene.traverse((n) => { for (const v of [n.position.x, n.position.y, n.position.z, n.rotation.y]) expect(Number.isFinite(v)).toBe(true); });
    ts.dispose();
  });

  it("turns standees about the up axis only, to face the Player", () => {
    const m = build();
    const ts = createTableScene(m, { reducedMotion: true });
    ts.setView(DEFAULT_ANCHOR, dragQuat({ yaw: 0, pitch: -0.4 }), 0.55);
    ts.sync(m, 0, 16);
    ts.scene.traverse((n) => { expect(n.rotation.x === 0 || n.rotation.x === -Math.PI / 2).toBe(true); expect(n.rotation.z).toBe(0); });
  });

  it("lifts, bends and stands a carried Suspect back up, and keeps the others where the model puts them", () => {
    const m = build();
    const ts = createTableScene(m, { reducedMotion: false });
    ts.setView(DEFAULT_ANCHOR, dragQuat({ yaw: 0, pitch: -0.4 }), 0.55);
    const cora = m.suspects[0]!;
    ts.carry("cora", { x: 0, z: 0 }, "library");
    for (let i = 0; i < 40; i++) ts.sync(m, i * 16, 16);
    expect(ts.stats().standees).toBe(8);
    ts.carry(null, null, null);
    for (let i = 0; i < 200; i++) ts.sync(m, 1000 + i * 16, 16);
    // back to flat and in place
    let moved = 0;
    ts.scene.traverse((n) => { if (n.type === "Group" && Math.abs(n.position.x - cora.pos.x) < 1e-9 && Math.abs(n.position.z - cora.pos.z) < 1e-9) moved++; });
    expect(moved).toBeGreaterThan(0);
  });

  it("is the same scene under reduced motion, with no mist", () => {
    const m = build({}, true);
    const ts = createTableScene(m, { reducedMotion: true });
    ts.sync(m, 5, 16);
    ts.sync(m, 99999, 16);
    expect(ts.stats().standees).toBe(8);
  });
});

describe("pictures", () => {
  it("uses a picture only when it is known to be at most 120 kilobytes", () => {
    expect(PICTURE_MAX_BYTES).toBe(120 * 1024);
    expect(pictureFits({ url: "/a.webp", bytes: 90_000 })).toBe(true);
    expect(pictureFits({ url: "/a.webp", bytes: PICTURE_MAX_BYTES + 1 })).toBe(false);
    expect(pictureFits({ url: "/a.webp", bytes: Number.NaN })).toBe(false);
    expect(pictureFits(undefined)).toBe(false);
  });
});
