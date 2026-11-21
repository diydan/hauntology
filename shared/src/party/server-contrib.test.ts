import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { mulberry32 } from "../puzzles/rng";
import { applyPatch, dropSeat, emptyContrib, toContributions, type ContribPatch } from "./lobby-contrib";
import { buildPool } from "./pool";
import { PRESET_GHOST_IDS } from "./preset-ghosts";
import { RoomCore, type Ports } from "./server";

function fakes(seed = 1) {
  const disk: { text: string | undefined } = { text: undefined };
  const clock = { t: 1_000_000 };
  const deleted: string[] = [];
  const r = mulberry32(seed);
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; },
    setAlarm: async () => undefined, send: () => undefined, close: () => undefined, now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
    deleteContributions: async (code) => { deleted.push(code); },
  };
  return { ports, disk, clock, deleted };
}
async function lobby() {
  const f = fakes();
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const a = await core.join("Ana"); const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  return { f, core, a, b, hostToken, displayToken };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

describe("lobby contributions in the Room (party-mode 4.2, 5, 7)", () => {
  it("identifies each token's role and seat, the Master, and nothing for a stranger", async () => {
    const { core, a, b, hostToken, displayToken } = await lobby();
    expect(await core.identify(a.token)).toEqual({ role: "controller", seat: 1, master: true, started: false });
    expect(await core.identify(b.token)).toEqual({ role: "controller", seat: 2, master: false, started: false });
    expect(await core.identify(hostToken)).toEqual({ role: "host", seat: null, master: false, started: false });
    expect(await core.identify(displayToken)).toMatchObject({ role: "display" });
    for (const t of ["", "0".repeat(32), "nonsense"]) expect(await core.identify(t)).toBeNull();
  });
  it("gives a seat its own three prompts, the same each time, a different stream for another seat, and the selfie state", async () => {
    const { core, a, b } = await lobby();
    const ca = await core.lobbyContext(a.token), ca2 = await core.lobbyContext(a.token), cb = await core.lobbyContext(b.token);
    if (!ca.ok || !ca2.ok || !cb.ok) throw new Error("context");
    expect(ca.offer.prompts).toHaveLength(3);
    expect(ca.offer).toEqual(ca2.offer);
    expect(ca).toMatchObject({ seat: 1, selfies: false, selfieYes: false, selfieMade: false });
    expect(cb.seat).toBe(2);
  });
  it("lets only a Player's own token contribute, only in the lobby, and keeps only ids and verdicts", async () => {
    const { core, a, hostToken } = await lobby();
    expect(await core.recordContribution(hostToken, { kind: "zone", name: "The Mill" })).toEqual({ ok: false, code: "bad_token" });
    expect(await core.recordContribution("nonsense", { kind: "zone", name: "The Mill" })).toEqual({ ok: false, code: "bad_token" });
    expect(await core.lobbyContext(hostToken)).toEqual({ ok: false, code: "bad_token" });
    expect(await core.recordContribution(a.token, { kind: "promptRound", round: 9 })).toEqual({ ok: false, code: "bad_request" });
    expect(await core.recordContribution(a.token, { kind: "zone", name: "The Mill" })).toEqual({ ok: true });
    expect(await core.recordContribution(a.token, { kind: "photo", photoId: "p1", status: "accepted" })).toEqual({ ok: true });
  });
  it("allows exactly three prompt skips, with no repeat across them, and says prompt_skips_used after", async () => {
    const { core, a } = await lobby();
    const first = await core.lobbyContext(a.token);
    if (!first.ok) throw new Error("context");
    const seen = new Set(first.offer.prompts.map((p) => p.id));
    for (let i = 1; i <= 3; i++) {
      const r = await core.skipPrompt(a.token);
      if (!r.ok) throw new Error(`skip ${i} refused: ${r.code}`);
      expect(r.offer.round).toBe(i);
      for (const p of r.offer.prompts) { expect(seen.has(p.id)).toBe(false); seen.add(p.id); }
    }
    expect(await core.skipPrompt(a.token)).toEqual({ ok: false, code: "prompt_skips_used" });
    expect(seen.size).toBe(12);
    const again = await core.lobbyContext(a.token);
    expect(again.ok && again.offer.round).toBe(3); // the round survives a new RoomCore over the same storage
  });
  it("survives a restart: a new RoomCore over the same storage has the contributions", async () => {
    const { f, core, a } = await lobby();
    await core.recordContribution(a.token, { kind: "zone", name: "The Mill" });
    await core.recordContribution(a.token, { kind: "selfieYes", yes: true });
    const again = new RoomCore(f.ports);
    expect(await again.lobbyContext(a.token)).toMatchObject({ ok: true, selfieYes: true });
  });
  it("builds the pool from the contributions when the game starts: contributed Zone names and ghosts first, Presets filling the rest", async () => {
    const { core, a, b, hostToken } = await lobby();
    await say(core, "ana", { t: "hello", token: a.token }); await say(core, "ben", { t: "hello", token: b.token }); await say(core, "host", { t: "hello", token: hostToken });
    await core.recordContribution(a.token, { kind: "zone", name: "The Mill" });
    await core.recordContribution(b.token, { kind: "ghost", profileId: "ben-made-ghost", status: "ok" });
    await say(core, "ana", { t: "start" });
    const state = (core as unknown as { state: { engine: { pool: { zones: { name: string; contributedBy: number | null }[]; suspects: { profileId: string; contributedBy: number | null }[] } } } }).state;
    expect(state.engine.pool.zones[0]).toMatchObject({ name: "The Mill", contributedBy: 1 });
    expect(state.engine.pool.suspects[0]).toMatchObject({ profileId: "ben-made-ghost", contributedBy: 2 });
    expect(state.engine.pool.suspects).toHaveLength(6);
  });
  it("refuses to contribute once the game has started", async () => {
    const { core, a, b, hostToken } = await lobby();
    await say(core, "ana", { t: "hello", token: a.token }); await say(core, "ben", { t: "hello", token: b.token }); await say(core, "host", { t: "hello", token: hostToken });
    await say(core, "ana", { t: "start" });
    expect(await core.recordContribution(a.token, { kind: "zone", name: "Late" })).toEqual({ ok: false, code: "game_started" });
    expect(await core.lobbyContext(a.token)).toEqual({ ok: false, code: "game_started" });
    expect(await core.identify(a.token)).toMatchObject({ started: true });
  });
  it("deletes the contributions when the Room ends", async () => {
    const { f, core, a } = await lobby();
    await say(core, "ana", { t: "hello", token: a.token });
    await core.endRoom();
    expect(f.deleted).toEqual(["ABCD"]);
    expect(await core.identify(a.token)).toBeNull();
  });
});

const patchArb: fc.Arbitrary<ContribPatch> = fc.oneof(
  fc.record({ kind: fc.constant("ghost" as const), profileId: fc.constantFrom("g1", "g2", "g3"), status: fc.constantFrom("ok" as const, "failed" as const) }),
  fc.record({ kind: fc.constant("photo" as const), photoId: fc.constantFrom("p1", "p2"), status: fc.constantFrom("accepted" as const, "rejected" as const) }),
  fc.record({ kind: fc.constant("zone" as const), name: fc.constantFrom("The Mill", "The Pier", "Attic Nook", "x") }),
  fc.record({ kind: fc.constant("promptRound" as const), round: fc.integer({ min: 0, max: 3 }) }),
  fc.record({ kind: fc.constant("selfieYes" as const), yes: fc.boolean() }),
  fc.record({ kind: fc.constant("selfieMade" as const) }),
);

describe("lobby contribution record (pure)", () => {
  it("any set of contributions (none, duplicates, failures) still builds a full pool, and never changes its input", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), patchArb), { maxLength: 30 }), fc.integer(), (patches, seed) => {
      let c = emptyContrib();
      for (const [seat, p] of patches) { const frozen = JSON.stringify(c); const n = applyPatch(c, seat, p); if (JSON.stringify(c) !== frozen) return false; c = n; }
      const pool = buildPool(toContributions(c), PRESET_GHOST_IDS, seed);
      return pool.suspects.length === 6 && pool.zones.length === 6 && new Set(pool.suspects.map((s) => s.profileId)).size === 6 && new Set(pool.zones.map((z) => z.name.toLowerCase())).size === 6;
    }), propParams());
  });
  it("keeps one of each per seat, the latest winning, and drops a seat's contributions together", () => {
    let c = applyPatch(emptyContrib(), 2, { kind: "zone", name: "A Mill" });
    c = applyPatch(c, 2, { kind: "zone", name: "B Mill" });
    c = applyPatch(applyPatch(c, 3, { kind: "ghost", profileId: "g1", status: "ok" }), 2, { kind: "selfieMade" });
    expect(c.zoneNames[2]).toBe("B Mill");
    const d = dropSeat(c, 2);
    expect(d.zoneNames[2]).toBeUndefined();
    expect(d.selfieMade[2]).toBeUndefined();
    expect(d.ghosts[3]).toEqual({ profileId: "g1", status: "ok" });
    expect(toContributions(c).map((x) => x.seat)).toEqual([2, 3]);
  });
});

describe("the Room's own spend (party-mode 10.1)", () => {
  it("starts at nothing, keeps what is saved across a restart, and ignores values that are not whole non-negative numbers", async () => {
    const { f, core } = await lobby();
    expect(await core.loadSpend()).toEqual({ images: 0, models: 0 });
    expect(await core.saveSpend({ images: 3, models: 7 })).toBe(true);
    expect(await new RoomCore(f.ports).loadSpend()).toEqual({ images: 3, models: 7 });
    for (const bad of [{ images: -1, models: 0 }, { images: 1.5, models: 0 }, { images: 0, models: Number.NaN }, { images: "1", models: 0 }, null, {}]) expect(await core.saveSpend(bad as never)).toBe(false);
    expect(await core.loadSpend()).toEqual({ images: 3, models: 7 });
  });
  it("is gone with the Room", async () => {
    const { core } = await lobby();
    await core.saveSpend({ images: 1, models: 1 });
    await core.endRoom();
    expect(await core.loadSpend()).toEqual({ images: 0, models: 0 });
  });
});
