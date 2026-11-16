import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hash, mulberry32, randInt, shuffle, type Rng } from "../puzzles/rng";
import { cardsOf, dealCase, type Card, type Deal } from "./deal";
import type { CueName, GameState, PlayerState, SecretEvent } from "./game";
import { buildPool } from "./pool";
import { buildPartyPrompt } from "./prompt";
import type { Seat } from "./room";
import { privateView, publicView } from "./views";
import { MIN_WALK_RADIUS, placePoints, placeZones, ringZones, validateZones, zoneProblems, type Point, type ZoneWorld } from "./zones";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const CUES: CueName[] = ["creak", "whisper", "bell", "laugh"];
const token = (r: Rng): string => `TOK${Math.floor(r() * 2 ** 32).toString(16)}${Math.floor(r() * 2 ** 32).toString(16)}`;

/** A game in play: a real deal, Residue hidden, and a log of every kind of event with its secrets filled in. */
function game(seed: number, n: number, events: number): GameState {
  const r = mulberry32(hash("game", seed));
  const pool = buildPool([], PRESETS, seed);
  const seats = Array.from({ length: n }, (_, i) => (i + 1) as Seat);
  const deal = dealCase(pool, seats, seed);
  const zoneIds = shuffle(r, pool.zones.map((z) => z.id));
  const residueAt = Object.fromEntries(deal.residue.map((c, i) => [zoneIds[i] as string, c.id]));
  const players: PlayerState[] = seats.map((seat) => ({ seat, nickname: `P${seat}`, bot: false, poltergeist: false, resolve: randInt(r, 4), soundConsent: r() < 0.5, shownToMe: [], found: [] }));
  return withSecrets({ phase: "playing", pool, deal, residueAt, players, log: publicSkeleton(r, seats, pool.zones.map((z) => z.id), events) }, r);
}

/** The public half of each event, the same for twins; `withSecrets` fills in the secret half. */
function publicSkeleton(r: Rng, seats: readonly Seat[], zones: readonly string[], n: number): SecretEvent[] {
  const seat = (): Seat => seats[randInt(r, seats.length)] as Seat;
  return Array.from({ length: n }, (_, id) => {
    const k = randInt(r, 7);
    const zone = zones[randInt(r, zones.length)] as string;
    if (k === 0) return { id, kind: "suggest", seat: seat(), zone, suspect: `s${1 + randInt(r, 6)}`, relic: `r${1 + randInt(r, 6)}`, refuter: r() < 0.5 ? seat() : null, shown: null };
    if (k === 1) return { id, kind: "inspect", seat: seat(), zone, found: null };
    if (k === 2) return { id, kind: "house-cue", target: seat(), cue: CUES[randInt(r, 4)] as CueName };
    if (k === 3) return { id, kind: "frame", from: seat(), target: seat(), cue: CUES[randInt(r, 4)] as CueName };
    if (k === 4) return { id, kind: "rattle", from: seat(), target: seat() };
    if (k === 5) return { id, kind: "stitch", from: seat(), clip: "" };
    return { id, kind: "accuse", seat: seat(), right: null };
  });
}

/**
 * Give a state fresh secrets and nothing else: a new Solution, new Hands of the same sizes, new Residue and hiding
 * places, new shown and found cards, new senders, and new clip contents. A House Cue may become a Frame and back.
 */
function withSecrets(s: GameState, r: Rng): GameState {
  const all = cardsOf(s.pool);
  const pick = (kind: Card["kind"]): Card => shuffle(r, all.filter((c) => c.kind === kind))[0] as Card;
  const solution = { suspect: pick("suspect").id, zone: pick("zone").id, relic: pick("relic").id };
  const rest = shuffle(r, all.filter((c) => ![solution.suspect, solution.zone, solution.relic].includes(c.id)));
  const residue = rest.slice(0, 3);
  let i = 3;
  const hands: Record<number, Card[]> = {};
  for (const p of s.players) { const size = s.deal.hands[p.seat]?.length ?? 0; hands[p.seat] = rest.slice(i, i + size); i += size; }
  const deal: Deal = { solution, residue, hands };
  const zoneIds = shuffle(r, s.pool.zones.map((z) => z.id));
  const residueAt = Object.fromEntries(residue.map((c, k) => [zoneIds[k] as string, c.id]));
  const seats = s.players.map((p) => p.seat);
  const anySeat = (): Seat => seats[randInt(r, seats.length)] as Seat;
  const log = s.log.map((e): SecretEvent => {
    switch (e.kind) {
      case "suggest": return { ...e, shown: e.refuter === null ? null : (all[randInt(r, all.length)] as Card).id };
      case "inspect": return { ...e, found: r() < 0.5 ? null : (residue[randInt(r, 3)] as Card).id };
      case "house-cue": case "frame": return r() < 0.5 ? { id: e.id, kind: "house-cue", target: e.target, cue: e.cue } : { id: e.id, kind: "frame", from: anySeat(), target: e.target, cue: e.cue };
      case "rattle": return { ...e, from: anySeat() };
      case "stitch": return { ...e, from: anySeat(), clip: token(r) };
      case "accuse": return e;
    }
  });
  const players = s.players.map((p) => ({ ...p, shownToMe: r() < 0.5 ? [] : [(all[randInt(r, all.length)] as Card).id], found: r() < 0.5 ? [] : [(residue[0] as Card).id], resolve: randInt(r, 4), soundConsent: r() < 0.5 }));
  return { ...s, deal, residueAt, log, players };
}

describe("Property 8: Views never leak secrets", () => {
  it("gives the same Public View and the same narrator prompt for any two games that differ only in their secrets", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.nat(30), fc.integer(), (seed, n, events, twinSeed) => {
      const a = game(seed, n, events);
      const b = withSecrets(a, mulberry32(twinSeed));
      expect(publicView(b)).toEqual(publicView(a));
      expect(buildPartyPrompt(publicView(b), "Narrate the last turn.")).toBe(buildPartyPrompt(publicView(a), "Narrate the last turn."));
    }), { numRuns: 300 });
  });

  it("never shows a Stitch clip or a card shown or found in any public text, and makes a House Cue and a Frame look the same", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.nat(30), (seed, n, events) => {
      const s = game(seed, n, events);
      const text = JSON.stringify(publicView(s)) + buildPartyPrompt(publicView(s), "x");
      for (const e of s.log) if (e.kind === "stitch") expect(text).not.toContain(e.clip);
      expect(text).not.toMatch(/"(shown|found|from|clip|hand|solution|residue|residueAt)"/);
      const cues = publicView(s).events.filter((e) => e.kind === "phone-cue");
      for (const c of cues) expect(Object.keys(c).sort()).toEqual(["cue", "id", "kind", "target"]);
    }), { numRuns: 200 });
  });

  it("gives a phone only its own Hand, the cards shown to it and the Residue it found", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.integer(), (seed, n, twinSeed) => {
      const a = game(seed, n, 10);
      for (const p of a.players) {
        const v = privateView(a, p.seat);
        expect(v?.hand).toEqual(a.deal.hands[p.seat]);
        expect(v?.shownToMe).toEqual(p.shownToMe);
        expect(v?.found).toEqual(p.found);
        // change every secret but this seat's own: its view does not move
        const b0 = withSecrets(a, mulberry32(twinSeed));
        const b: GameState = { ...b0, deal: { ...b0.deal, hands: { ...b0.deal.hands, [p.seat]: a.deal.hands[p.seat] ?? [] } }, players: b0.players.map((q) => (q.seat === p.seat ? p : q)) };
        expect(privateView(b, p.seat)).toEqual(v);
      }
      expect(privateView(a, 9 as Seat)).toBeNull();
    }), { numRuns: 150 });
  });

  it("shows the Solution, the Residue places and every sender only once the game has ended", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.nat(30), (seed, n, events) => {
      const s = game(seed, n, events);
      expect(publicView(s).ending).toBeNull();
      const end = publicView({ ...s, phase: "ended" });
      expect(end.ending?.solution).toEqual(s.deal.solution);
      expect(end.ending?.residueAt).toEqual(s.residueAt);
      const senders = s.log.filter((e) => e.kind === "house-cue" || e.kind === "frame" || e.kind === "rattle" || e.kind === "stitch");
      expect(end.ending?.sources.map((x) => x.eventId)).toEqual(senders.map((e) => e.id));
      for (const x of end.ending?.sources ?? []) {
        const e = s.log.find((y) => y.id === x.eventId);
        expect(x.from).toBe(e && "from" in e ? e.from : null);
      }
    }), { numRuns: 200 });
  });
});

/** A world: a round open floor with a few seeded pillars that are not walkable. */
function worldArb(): fc.Arbitrary<ZoneWorld & { seed: number }> {
  return fc.record({ seed: fc.integer(), walkRadius: fc.double({ min: 7, max: 20, noNaN: true }), sx: fc.double({ min: -5, max: 5, noNaN: true }), sz: fc.double({ min: -5, max: 5, noNaN: true }), pillars: fc.array(fc.record({ x: fc.double({ min: -20, max: 20, noNaN: true }), z: fc.double({ min: -20, max: 20, noNaN: true }) }), { maxLength: 6 }) })
    .map(({ seed, walkRadius, sx, sz, pillars }) => {
      const spawn = { x: sx, z: sz };
      return {
        seed, spawn, walkRadius,
        bounds: { minX: sx - walkRadius - 1, maxX: sx + walkRadius + 1, minZ: sz - walkRadius - 1, maxZ: sz + walkRadius + 1 },
        sampler: { walkable: (p: Point) => pillars.every((q) => Math.hypot(p.x - q.x, p.z - q.z) > 1) },
      };
    });
}

describe("Property 9: Zones are valid and the world-size rule holds", () => {
  it("places six valid Zones, the same every time, or falls back to a ring that passes on geometry", () => {
    fc.assert(fc.property(worldArb(), (w) => {
      const a = placeZones(w, w.seed);
      expect(a).toEqual(placeZones(w, w.seed));
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      expect(validateZones(a.zones, w, a.source !== "ring")).toBe(true);
    }), { numRuns: 300 });
  });

  it("samples valid points by itself, and uses them (not the ring) on an open floor", () => {
    fc.assert(fc.property(worldArb(), (w) => {
      const pts = placePoints(w, w.seed, 6);
      if (pts !== null) expect(zoneProblems(pts, w)).toEqual([]);
    }), { numRuns: 300 });
    const open: ZoneWorld = { spawn: { x: 0, z: 0 }, walkRadius: 12, bounds: { minX: -13, maxX: 13, minZ: -13, maxZ: 13 }, sampler: { walkable: () => true } };
    for (let seed = 0; seed < 50; seed++) expect(placeZones(open, seed).ok && (placeZones(open, seed) as { source: string }).source).toBe("placed");
  });

  it("always accepts the ring when the walk radius is at least 7 m", () => {
    fc.assert(fc.property(worldArb(), (w) => { expect(zoneProblems(ringZones(w.spawn, w.walkRadius), w, false)).toEqual([]); }));
  });

  it("rejects every kind of bad Zone set", () => {
    const w: ZoneWorld = { spawn: { x: 0, z: 0 }, walkRadius: 10, bounds: { minX: -11, maxX: 11, minZ: -11, maxZ: 11 }, sampler: { walkable: (p) => p.x < 9 } };
    const ring = ringZones(w.spawn, w.walkRadius);
    expect(validateZones(ring, w)).toBe(true);
    const bad = (i: number, p: Point): Point[] => ring.map((q, j) => (j === i ? p : q));
    expect(validateZones(ring.slice(0, 5), w)).toBe(false);
    expect(zoneProblems(bad(0, { x: 1, z: 0 }), w)).toContain("0:near_spawn");
    expect(zoneProblems(bad(0, { x: 10.5, z: 0 }), w)).toContain("0:beyond_walk_radius");
    expect(zoneProblems(bad(0, { x: 9.5, z: 0 }), w)).toContain("0:not_walkable");
    expect(zoneProblems(bad(1, { x: ring[0]!.x - 1, z: ring[0]!.z }), w).some((p) => p.startsWith("1:near_"))).toBe(true);
    expect(zoneProblems(bad(0, { x: Number.NaN, z: 0 }), w)).toContain("0:not_finite");
    const narrow = { ...w, bounds: { minX: -3, maxX: 3, minZ: -11, maxZ: 11 } };
    expect(zoneProblems(ring, narrow).some((p) => p.endsWith("out_of_bounds"))).toBe(true);
  });

  it("refuses a world under 7 m with no authored Zones, and takes valid authored ones even in a small world", () => {
    const small: ZoneWorld = { spawn: { x: 0, z: 0 }, walkRadius: MIN_WALK_RADIUS - 0.5, bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, sampler: { walkable: () => true } };
    expect(placeZones(small, 1)).toEqual({ ok: false, code: "world_too_small" });
    const authored = ringZones({ x: 0, z: 0 }, 6.5).map((p) => ({ x: p.x * 1.05, z: p.z * 1.05 }));
    const res = placeZones(small, 1, authored);
    expect(res.ok && res.source).toBe("authored");
  });
});
