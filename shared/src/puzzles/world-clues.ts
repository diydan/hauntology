import { knockPlayTimes } from "./knock";
import { makePicture } from "./make";
import { hash, mulberry32, randInt, shuffle, type Rng } from "./rng";
import { isMemoryKind, type Kind, type Lock, type SightPayload, type Transcript } from "./types";

/**
 * Clues hidden in the TV world (`.kiro/specs/world-clues`): some Memory Kind clues are drawn in the shared world instead
 * of on one phone. Each has a Sign; the Lock names the Sign it needs; a Decoy of the same Kind, with another Sign and
 * another answer, means seeing is not enough. Pure logic only: it reads the seed, the Zones and the Locks, never the
 * Solution, a Hand or a Residue position (1.3).
 */

export const SIGNS = ["moon", "key", "eye", "hand", "star", "bell"] as const;
export type Sign = (typeof SIGNS)[number];
/** Human-readable Sign label in words so a Sign is never shown by mark or colour alone (4.3). */
export const SIGN_LABELS: Readonly<Record<Sign, string>> = {
  moon: "Moon",
  key: "Key",
  eye: "Eye",
  hand: "Hand",
  star: "Star",
  bell: "Bell",
};
/** Where Memory Kind clues live for a Room: on each Player's phone (default) or drawn in the TV world. */
export type CluePlace = "phone" | "world";
/** At most this many Locks use world clues in one game: one real clue and one Decoy each, six Signs in all. */
export const MAX_WORLD_LOCKS = 3;
/** The answer of a World Clue shows only while the shared camera is this close and facing it (2.1). */
export const CLUE_READ_METRES = 3;

/** One clue drawn in the world. `lockZone` is the Zone of the Lock it belongs to, or null for a Decoy. */
export type WorldClue = Readonly<{ lockZone: string | null; zone: string; sign: Sign; sight: SightPayload }>;
/** Public View representation of a placed World Clue or Decoy: holds Zone, Sign, and Sight (no `lockZone` or non-world answer). */
export type PublicWorldClue = Readonly<{ zone: string; sign: Sign; sight: SightPayload }>;
export type PlacedLock = Readonly<{ zone: string; lock: Lock }>;

export function toPublicWorldClues(clues: readonly WorldClue[]): PublicWorldClue[] {
  return clues.map(({ zone, sign, sight }) => ({ zone, sign, sight }));
}

/** The plain answer a clue gives for a Lock, as the Transcript a Player would send, or null for the photo (its answer is the turns). */
export function answerFromSight(lock: Lock, sight: SightPayload): Transcript | null {
  const elapsedMs = 60_000;
  if (lock.kind === "wires" && sight.kind === "wires") return { kind: "wires", pairs: lock.view.leftOrder.map((w) => [w, sight.order.indexOf(w)] as [number, number]), elapsedMs };
  if (lock.kind === "clock" && sight.kind === "clock") return { kind: "clock", h: sight.h, m: sight.m, elapsedMs };
  if (lock.kind === "safe" && sight.kind === "safe") return { kind: "safe", code: [...sight.code], elapsedMs };
  if (lock.kind === "moved" && sight.kind === "moved") return { kind: "moved", changed: sight.shelf.flatMap((v, i) => (v !== lock.view.after[i] ? [i] : [])), elapsedMs };
  if (lock.kind === "knock" && sight.kind === "knock") return { kind: "knock", times: knockPlayTimes(sight), elapsedMs };
  return null;
}

const sameAnswer = (lock: Lock, a: SightPayload, b: SightPayload): boolean => {
  if (a.kind === "photo" && b.kind === "photo") return JSON.stringify(a.picture) === JSON.stringify(b.picture);
  return JSON.stringify(answerFromSight(lock, a)) === JSON.stringify(answerFromSight(lock, b));
};

/** A clue of the same Kind as the Lock's own, with a different answer (1.2). Null for a Kind with no Sight. */
export function decoyFor(r: Rng, lock: Lock): SightPayload | null {
  const real = lock.sight;
  if (real === null) return null;
  for (let tries = 0; tries < 50; tries++) {
    const d = tryDecoy(r, lock);
    if (d !== null && !sameAnswer(lock, d, real)) return d;
  }
  return null; // not reached for any Lock makeLock can build; the property test checks this
}

function tryDecoy(r: Rng, lock: Lock): SightPayload | null {
  switch (lock.kind) {
    case "wires": return { kind: "wires", order: shuffle(r, lock.sight.order) };
    case "clock": {
      const step = lock.view.stepMin;
      const h = 1 + randInt(r, 12);
      const m = step * randInt(r, 60 / step);
      return h === 12 && m === 0 ? null : { kind: "clock", h, m };
    }
    case "safe": {
      const code = lock.sight.code.map(() => randInt(r, 10));
      return code.every((d) => d === code[0]) ? null : { kind: "safe", code };
    }
    case "moved": {
      const shelf = lock.sight.shelf.slice();
      const a = randInt(r, shelf.length);
      const b = randInt(r, shelf.length);
      if (a === b) return null;
      [shelf[a], shelf[b]] = [shelf[b] as number, shelf[a] as number];
      return { kind: "moved", shelf };
    }
    case "photo": return { kind: "photo", picture: makePicture(r), cols: lock.sight.cols, rows: lock.sight.rows };
    case "knock": {
      // the same number of groups and the same long pause, other counts: it looks like the knock, and does not open the door
      const groups = lock.sight.groups.map(() => 1 + randInt(r, 4));
      return groups.some((g, i) => i > 0 && g === groups[i - 1]) ? null : { kind: "knock", groups, long: lock.sight.long };
    }
    default: return null;
  }
}

/**
 * Place the world clues for a game (1.1 to 1.3): up to three Memory Kind Locks, chosen by seed, each get one real
 * World Clue and one Decoy, in two different Zones that are not the Lock's own; every clue has its own Sign.
 * Locks not chosen keep their phone Sights.
 */
export function placeWorldClues(seed: number, zones: readonly string[], locks: readonly PlacedLock[]): WorldClue[] {
  const r = mulberry32(hash("world-clues", seed, zones.join("|")));
  const signs = shuffle(r, SIGNS);
  const chosen = shuffle(r, locks.filter((p) => isMemoryKind(p.lock.kind))).slice(0, MAX_WORLD_LOCKS);
  const out: WorldClue[] = [];
  let s = 0;
  for (const p of chosen) {
    const places = shuffle(r, zones.filter((z) => z !== p.zone));
    const decoy = decoyFor(r, p.lock);
    if (places.length < 2 || p.lock.sight === null || decoy === null) continue;
    out.push({ lockZone: p.zone, zone: places[0] as string, sign: signs[s++] as Sign, sight: p.lock.sight });
    out.push({ lockZone: null, zone: places[1] as string, sign: signs[s++] as Sign, sight: decoy });
  }
  return out;
}

/** The Sign a Lock needs, or null when its clue stays on the phone (3.1). */
export const signForLock = (clues: readonly WorldClue[], lockZone: string): Sign | null => clues.find((c) => c.lockZone === lockZone)?.sign ?? null;

/** The Lock prompt with the Sign named and no answer (3.1). */
export function worldCluePrompt(kind: Kind, sign: Sign): string {
  const thing: Partial<Record<Kind, string>> = {
    clock: "Set the clock to the time on the clock", safe: "Dial the code on the plaque", wires: "Join the wires as in the fuse box",
    moved: "Find what changed since the shelf", photo: "Put back the photo", knock: "Knock the knock",
  };
  return `${thing[kind] ?? "Use the clue"} marked with the ${sign}.`;
}

