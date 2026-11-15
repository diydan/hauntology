import { hash, mulberry32, randInt } from "../puzzles/rng";

/**
 * Turn order (party-mode 5.1, 5.7). Turns go clockwise (by seat number) from the Round's first player, one Detective
 * at a time. A Poltergeist, or a seat skipped for missed Turns, takes no Turn. Round 1's first player comes from the
 * seed; each later Round's first player is the next Detective clockwise from the last one.
 */
export type Order = Readonly<{ seats: readonly number[]; out: readonly number[] }>;

const clockwise = (o: Order): number[] => [...o.seats].sort((a, b) => a - b);
const plays = (o: Order, seat: number): boolean => o.seats.includes(seat) && !o.out.includes(seat);

/** The first Detective strictly after `seat`, clockwise, wrapping round; null when nobody can play. */
export function nextClockwise(o: Order, seat: number): number | null {
  const ring = clockwise(o).filter((s) => plays(o, s));
  if (ring.length === 0) return null;
  return ring.find((s) => s > seat) ?? (ring[0] as number);
}

/** The first player of a Round: from the seed for Round 1 (`prevFirst` null), else the next Detective after the last first player. */
export function firstPlayer(o: Order, prevFirst: number | null, seed: number): number | null {
  const ring = clockwise(o).filter((s) => plays(o, s));
  if (ring.length === 0) return null;
  if (prevFirst === null) return ring[randInt(mulberry32(hash("first", seed)), ring.length)] as number;
  return nextClockwise(o, prevFirst);
}

/** The Detectives of one Round, in order, starting with its first player. */
export function roundOrder(o: Order, first: number): number[] {
  const ring = clockwise(o).filter((s) => plays(o, s));
  const i = ring.indexOf(first);
  return i < 0 ? [] : [...ring.slice(i), ...ring.slice(0, i)];
}

/**
 * Who plays after `current` in the Round that began with `first`, or null when the Round is over. Seats that went out
 * during the Round (a wrong Accusation, missed Turns) are passed over; if the first player went out, the Round still
 * ends once the order comes round to where they sat.
 */
export function nextPlayer(o: Order, first: number, current: number): number | null {
  const ring = clockwise(o);
  const n = ring.length;
  const fi = ring.indexOf(first);
  const ci = ring.indexOf(current);
  if (fi < 0 || ci < 0) return null;
  for (let step = 1; step < n; step++) {
    const idx = (ci + step) % n;
    if (idx === fi) return null; // back to the first player's seat: the Round is over
    const s = ring[idx] as number;
    if (plays(o, s)) return s;
  }
  return null;
}
