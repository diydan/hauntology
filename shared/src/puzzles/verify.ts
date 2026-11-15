import { minSolveMs } from "./kinds";
import { MAX_BYTES, MAX_EVENTS, TranscriptSchema, type Lock, type Transcript, type Verdict } from "./types";

const EVENT_KEYS = ["sets", "pairs", "code", "notes", "order", "changed", "placed", "letters"] as const;

/** How many events a raw Transcript claims, however malformed it is. */
function eventCount(input: unknown): number {
  if (typeof input !== "object" || input === null) return 0;
  const rec = input as Record<string, unknown>;
  let n = 0;
  for (const key of EVENT_KEYS) {
    const v = rec[key];
    if (Array.isArray(v)) n += v.length;
    else if (typeof v === "string") n += v.length;
  }
  return n;
}

const bad = (code: "wrong" | "malformed" | "too_big" | "too_fast"): Verdict => ({ ok: false, code });
const good: Verdict = { ok: true };
const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Check a Player's Transcript against a Lock: accept only the answer, never throw, give no partial score.
 * Lock pick and the maze are checked for plausibility only (the phone must know their layout to give feel).
 */
export function verify(lock: Lock, input: unknown): Verdict {
  try {
    let size = 0;
    try { size = JSON.stringify(input)?.length ?? 0; } catch { return bad("malformed"); } // a cycle, a BigInt
    if (size > MAX_BYTES || eventCount(input) > MAX_EVENTS) return bad("too_big");
    const parsed = TranscriptSchema.safeParse(input);
    if (!parsed.success) return bad("malformed");
    const t = parsed.data;
    if (t.kind !== lock.kind) return bad("malformed");
    if (t.elapsedMs < minSolveMs(lock)) return bad("too_fast");
    return check(lock, t);
  } catch {
    return bad("malformed");
  }
}

function check(lock: Lock, t: Transcript): Verdict {
  switch (lock.kind) {
    case "lockpick": {
      if (t.kind !== "lockpick") return bad("malformed");
      if (t.sets.length !== lock.view.pins) return bad("wrong");
      let prev = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < t.sets.length; i++) {
        const e = t.sets[i];
        const center = lock.secret.centers[i];
        if (e === undefined || center === undefined || e.pin !== i) return bad("malformed");
        if (Math.abs(e.atDeg - center) > lock.secret.width / 2 + 1e-9) return bad("wrong");
        if (e.atMs - prev < lock.view.dwellMs) return bad("wrong");
        prev = e.atMs;
      }
      return t.elapsedMs < prev ? bad("wrong") : good;
    }
    case "wires": {
      if (t.kind !== "wires") return bad("malformed");
      if (t.pairs.length !== lock.view.n) return bad("wrong");
      const seenWires = new Set<number>();
      const seenTerminals = new Set<number>();
      for (const [wire, terminal] of t.pairs) {
        const want = lock.secret.terminalOf[wire];
        if (want === undefined || seenWires.has(wire) || seenTerminals.has(terminal)) return bad("wrong");
        seenWires.add(wire);
        seenTerminals.add(terminal);
        if (want !== terminal) return bad("wrong");
      }
      return good;
    }
    case "clock": return t.kind === "clock" && t.h === lock.secret.h && t.m === lock.secret.m ? good : bad("wrong");
    case "safe": return t.kind === "safe" && same(t.code, lock.secret.code) ? good : bad("wrong");
    case "musicbox": return t.kind === "musicbox" && same(t.notes, lock.secret.tune) ? good : bad("wrong");
    case "candles": return t.kind === "candles" && same(t.order, lock.secret.order) ? good : bad("wrong");
    case "moved": return t.kind === "moved" && same([...t.changed].sort((a, b) => a - b), lock.secret.changed) ? good : bad("wrong");
    case "photo": {
      if (t.kind !== "photo") return bad("malformed");
      const n = lock.view.cols * lock.view.rows;
      if (t.placed.length !== n) return bad("wrong");
      const seenPieces = new Set<number>();
      const seenSlots = new Set<number>();
      for (const e of t.placed) {
        if (e.piece >= n || e.slot >= n || seenPieces.has(e.piece) || seenSlots.has(e.slot)) return bad("wrong");
        seenPieces.add(e.piece);
        seenSlots.add(e.slot);
        const start = lock.secret.turns0[e.piece];
        if (start === undefined || e.slot !== e.piece || (start + e.turns) % 4 !== 0) return bad("wrong");
      }
      return good;
    }
    case "words": return t.kind === "words" && same(t.letters, lock.secret.order) ? good : bad("wrong");
    case "board": return t.kind === "board" && t.letters === lock.secret.word ? good : bad("wrong");
    case "maze": {
      if (t.kind !== "maze") return bad("malformed");
      if (t.hits < 0 || t.hits > 500) return bad("malformed");
      return t.reachedAtMs < minSolveMs(lock) || t.reachedAtMs > t.elapsedMs + 1 ? bad("wrong") : good;
    }
  }
}

/** The Transcript a careful Player using only touch would send: the oracle for "every Lock can be solved". */
export function referenceSolve(lock: Lock): Transcript {
  const base = minSolveMs(lock) + 1000;
  switch (lock.kind) {
    case "lockpick": {
      const sets = lock.secret.centers.map((c, i) => ({ pin: i, atDeg: c, atMs: 800 * (i + 1) + 400 }));
      const last = sets[sets.length - 1]?.atMs ?? 0;
      return { kind: "lockpick", sets, elapsedMs: Math.max(base, last + 100) };
    }
    case "wires": return { kind: "wires", pairs: lock.view.leftOrder.map((w) => [w, lock.secret.terminalOf[w] ?? -1] as [number, number]), elapsedMs: base };
    case "clock": return { kind: "clock", h: lock.secret.h, m: lock.secret.m, elapsedMs: base };
    case "safe": return { kind: "safe", code: [...lock.secret.code], elapsedMs: base };
    case "musicbox": return { kind: "musicbox", notes: [...lock.secret.tune], elapsedMs: base };
    case "candles": return { kind: "candles", order: [...lock.secret.order], elapsedMs: base };
    case "moved": return { kind: "moved", changed: [...lock.secret.changed], elapsedMs: base };
    case "photo": return { kind: "photo", placed: lock.secret.turns0.map((t0, piece) => ({ piece, slot: piece, turns: (4 - t0) % 4 })), elapsedMs: base };
    case "words": return { kind: "words", letters: [...lock.secret.order], elapsedMs: base };
    case "board": return { kind: "board", letters: lock.secret.word, elapsedMs: base };
    case "maze": return { kind: "maze", reachedAtMs: minSolveMs(lock) + 500, hits: 0, elapsedMs: base };
  }
}
