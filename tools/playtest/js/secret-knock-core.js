// The Secret knock lock, pure logic (no DOM, no sensors), so it can be tested with node.
// A pattern is a few groups of knocks with pauses between them: [3, 2] is "knock knock knock, pause, knock knock".
// On the hard level one pause is long, and the player must keep it long.
// The knocks come from knock-core.js (motion and/or microphone, or the Tap button); this file only says whether their times match.

export const LEVELS = ['easy', 'medium', 'hard'];

/** Timing of the ghost's own knock when it is played, in ms. */
export const PLAY = Object.freeze({ inGroup: 260, pause: 900, longPause: 1900 });

/** How the player's knocks are read: knocks closer than `groupGapMs` are one group; a pause of `longMs` or more is long. */
export const READ = Object.freeze({ groupGapMs: 700, longMs: 1400, quietMs: 2200 });

/** A small seeded random (mulberry32), so a seed always gives the same pattern. */
function rng(seed) {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The secret knock for a level and seed. `groups` are the knock counts (1 to 4, never two equal groups side by side, so the pauses are
 * easy to hear); `long` is the index of the long pause (the pause after group `long`), or null below hard.
 * @returns {{ level: string, groups: number[], long: number | null }}
 */
export function makePattern(level = 'easy', seed = 1) {
  const lv = LEVELS.includes(level) ? level : 'easy';
  const r = rng(seed);
  const n = lv === 'easy' ? 2 : 3;
  const groups = [];
  while (groups.length < n) {
    const g = 1 + Math.floor(r() * 4);
    if (groups.length && groups[groups.length - 1] === g) continue;
    groups.push(g);
  }
  if (lv === 'easy' && groups[0] + groups[1] < 4) groups[0] = groups[1] === 3 ? 2 : 3; // at least four knocks, so it is not over too soon
  const long = lv === 'hard' ? Math.floor(r() * (n - 1)) : null;
  return { level: lv, groups, long };
}

/** The times (ms from the start) at which the ghost's knock is played. */
export function playTimes(p) {
  const out = [];
  let t = 0;
  p.groups.forEach((g, i) => {
    for (let k = 0; k < g; k++) { out.push(t); t += PLAY.inGroup; }
    t += (p.long === i ? PLAY.longPause : PLAY.pause) - PLAY.inGroup;
  });
  return out;
}

/** The pattern in words and marks, for the clue and for a screen reader: "3, pause, 2" and "● ● ●  ● ●". */
export function describe(p) {
  const words = p.groups.map((g, i) => (i < p.groups.length - 1 ? `${g}, ${p.long === i ? 'long pause' : 'pause'}` : `${g}`)).join(', ');
  const marks = p.groups.map((g, i) => '●'.repeat(g).split('').join(' ') + (i < p.groups.length - 1 ? (p.long === i ? '      ' : '   ') : '')).join('');
  return { words, marks };
}

/**
 * Read a run of knock times into groups and pauses.
 * @param {number[]} times  knock times in ms, in order
 * @returns {{ groups: number[], pauses: number[] }}
 */
export function readKnocks(times) {
  const ts = [...times].filter(Number.isFinite).sort((a, b) => a - b);
  const groups = [];
  const pauses = [];
  for (let i = 0; i < ts.length; i++) {
    if (i === 0 || ts[i] - ts[i - 1] > READ.groupGapMs) {
      if (i > 0) pauses.push(ts[i] - ts[i - 1]);
      groups.push(1);
    } else groups[groups.length - 1] += 1;
  }
  return { groups, pauses };
}

/**
 * Whether the knocks open the door. The group counts must match exactly; on hard, the long pause must be long and the others not.
 * @returns {{ ok: boolean, reason: 'ok' | 'none' | 'groups' | 'pause', heard: { groups: number[], pauses: number[] } }}
 */
export function judge(p, times) {
  const heard = readKnocks(times);
  if (heard.groups.length === 0) return { ok: false, reason: 'none', heard };
  const same = heard.groups.length === p.groups.length && heard.groups.every((g, i) => g === p.groups[i]);
  if (!same) return { ok: false, reason: 'groups', heard };
  if (p.long !== null) {
    const right = heard.pauses.every((ms, i) => (i === p.long ? ms >= READ.longMs : ms < READ.longMs));
    if (!right) return { ok: false, reason: 'pause', heard };
  }
  return { ok: true, reason: 'ok', heard };
}

/** True once the player has gone quiet for long enough after their last knock, so the attempt can be judged. */
export const isDone = (times, now) => times.length > 0 && now - times[times.length - 1] >= READ.quietMs;
