import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cardsOf, dealCase } from "./deal";
import { INPUT_HZ, LOOK_MAX, acceptMovement, coalesceInput, maySend, releaseAll, sanitizeInput, type Input } from "./input";
import { CURATED_ZONE_NAMES, RELICS, buildPool, cleanZoneName, type Contribution } from "./pool";

const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, 1e308, -1e308), fc.integer(), fc.string(), fc.constant(null), fc.constant(undefined));
const rawInputArb = fc.record({ seq: wild, move: fc.oneof(fc.tuple(wild, wild), wild), look: fc.oneof(fc.tuple(wild, wild), wild), aim: fc.option(fc.tuple(wild, wild), { nil: undefined }) });
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

describe("Property 5: Controller input is bounded and never sticks", () => {
  it("keeps the stick in the unit disc and the look clamped, whatever arrives", () => {
    fc.assert(fc.property(fc.oneof(rawInputArb, wild), (raw) => {
      const i = sanitizeInput(raw);
      expect(Number.isFinite(i.seq) && i.seq >= 0).toBe(true);
      expect(Math.hypot(...i.move)).toBeLessThanOrEqual(1 + 1e-9);
      for (const v of [...i.look, ...(i.aim ?? [])]) { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v)).toBeLessThanOrEqual(LOOK_MAX); }
    }), { numRuns: 1000 });
  });

  it("keeps the stick's direction when it is too long", () => {
    const i = sanitizeInput({ seq: 1, move: [3, 4], look: [0, 0] });
    expect(i.move[0]).toBeCloseTo(0.6);
    expect(i.move[1]).toBeCloseTo(0.8);
  });

  it("sends at most 30 messages in any second, and loses no look movement by sending less often", () => {
    fc.assert(fc.property(fc.array(fc.nat(50), { minLength: 1, maxLength: 400 }), (gaps) => {
      let t = 0; let last: number | null = null; const sent: number[] = [];
      for (const g of gaps) { t += g; if (maySend(last, t)) { sent.push(t); last = t; } }
      for (let i = 0; i < sent.length; i++) {
        const inWindow = sent.filter((s) => s >= (sent[i] as number) && s < (sent[i] as number) + 1000).length;
        expect(inWindow).toBeLessThanOrEqual(INPUT_HZ);
      }
    }));
    let last: number | null = null; let count = 0; // a phone that tries every millisecond for one second
    for (let t = 0; t < 1000; t++) if (maySend(last, t)) { count++; last = t; }
    expect(count).toBe(INPUT_HZ);
    let p: Input | null = null;
    for (let k = 0; k < 5; k++) p = coalesceInput(p, { seq: k, move: [0, k / 10], look: [2, -1] });
    expect(p).toEqual({ seq: 4, move: [0, 0.4], look: [10, -5] });
  });

  it("moves only the active Detective, never another Player or someone who joined the haunting", () => {
    fc.assert(fc.property(rawInputArb, fc.integer({ min: 1, max: 6 }), fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }), fc.array(fc.integer({ min: 1, max: 6 })), (raw, seat, active, polts) => {
      const res = acceptMovement(sanitizeInput(raw), seat, active, polts);
      if (seat === active && !polts.includes(seat)) expect(res).not.toBeNull();
      else expect(res).toBeNull();
    }));
  });

  it("lets go of everything at once", () => {
    expect(releaseAll()).toEqual({ move: [0, 0], look: [0, 0], buttons: [] });
  });
});

const contribArb: fc.Arbitrary<Contribution[]> = fc.array(fc.record({
  seat: fc.integer({ min: 1, max: 6 }),
  ghost: fc.option(fc.record({ profileId: fc.constantFrom("g1", "g2", "g3", "g4", "g5", "g6", "g7", "preset-1"), status: fc.constantFrom("ok" as const, "failed" as const) }), { nil: undefined }),
  photo: fc.option(fc.record({ photoId: fc.uuid(), status: fc.constantFrom("accepted" as const, "rejected" as const) }), { nil: undefined }),
  zoneName: fc.option(fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom("The Hall", "the hall", "Den", "x")), { nil: undefined }),
}, { requiredKeys: ["seat"] }).map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as Contribution), { maxLength: 8 });

describe("Property 6: The case pool is complete, deterministic and never blocked", () => {
  it("always has six distinct Suspects, six distinct Zones and the six Relics, made things first, the same every time", () => {
    fc.assert(fc.property(contribArb, fc.integer(), (contribs, seed) => {
      const pool = buildPool(contribs, PRESETS, seed);
      expect(pool).toEqual(buildPool(contribs, PRESETS, seed));
      expect(pool.suspects.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
      expect(new Set(pool.suspects.map((s) => s.profileId)).size).toBe(6);
      expect(pool.zones.map((z) => z.id)).toEqual(["z1", "z2", "z3", "z4", "z5", "z6"]);
      expect(new Set(pool.zones.map((z) => z.name.toLowerCase())).size).toBe(6);
      expect(pool.relics).toEqual(RELICS);
      const made = pool.suspects.map((s) => s.contributedBy !== null);
      expect(made).toEqual([...made].sort((a, b) => Number(b) - Number(a))); // contributed first
      const madeZ = pool.zones.map((z) => z.contributedBy !== null);
      expect(madeZ).toEqual([...madeZ].sort((a, b) => Number(b) - Number(a)));
      for (const s of pool.suspects.filter((x) => x.contributedBy !== null)) {
        expect(contribs.some((c) => c.seat === s.contributedBy && c.ghost?.profileId === s.profileId && c.ghost.status === "ok")).toBe(true);
      }
      for (const z of pool.zones.filter((x) => x.contributedBy === null)) expect(CURATED_ZONE_NAMES as readonly string[]).toContain(z.name);
      for (const p of pool.photos) expect(contribs.some((c) => c.photo?.photoId === p.photoId && c.photo.status === "accepted")).toBe(true);
      expect(pool.photos.length).toBe(contribs.filter((c) => c.photo?.status === "accepted").length);
    }), { numRuns: 400 });
  });

  it("starts with nothing contributed, and a failed portrait never makes a Suspect", () => {
    const empty = buildPool([], PRESETS, 1);
    expect(empty.suspects.every((s) => s.contributedBy === null)).toBe(true);
    const failed = buildPool([{ seat: 1, ghost: { profileId: "g1", status: "failed" } }], PRESETS, 1);
    expect(failed.suspects.some((s) => s.profileId === "g1")).toBe(false);
    expect(cleanZoneName("ab")).toBeNull();
    expect(cleanZoneName("  The   <b>Hall ")).toBe("The b Hall");
  });
});

describe("Property 7: The deal is a valid partition", () => {
  it("puts every card in exactly one place, keeps the Solution and Residue out of Hands, and evens out Hands", () => {
    fc.assert(fc.property(contribArb, fc.integer({ min: 2, max: 6 }), fc.integer(), (contribs, n, seed) => {
      const pool = buildPool(contribs, PRESETS, seed);
      const seats = Array.from({ length: n }, (_, i) => i + 1);
      const d = dealCase(pool, seats, seed);
      expect(d).toEqual(dealCase(pool, seats, seed));
      expect(d.solution.suspect).toMatch(/^s[1-6]$/);
      expect(d.solution.zone).toMatch(/^z[1-6]$/);
      expect(d.solution.relic).toMatch(/^r[1-6]$/);
      expect(d.residue).toHaveLength(3);
      const inHands = Object.values(d.hands).flat();
      expect(inHands).toHaveLength(12);
      const places = [d.solution.suspect, d.solution.zone, d.solution.relic, ...d.residue.map((c) => c.id), ...inHands.map((c) => c.id)];
      expect(places.sort()).toEqual(cardsOf(pool).map((c) => c.id).sort());
      const sizes = seats.map((s) => d.hands[s]?.length ?? -1);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(Object.keys(d.hands).map(Number).sort()).toEqual(seats);
    }), { numRuns: 400 });
  });

  it("refuses fewer than two or more than six seats", () => {
    const pool = buildPool([], PRESETS, 1);
    expect(() => dealCase(pool, [1], 1)).toThrow();
    expect(() => dealCase(pool, [1, 2, 3, 4, 5, 6, 7], 1)).toThrow();
  });
});
