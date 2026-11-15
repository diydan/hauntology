// Scenes made from footage (Requirements 19 to 21 of .kiro/specs/puzzles): where the clock shadow stands, which shot the Reel plays
// for a Haunt level, and the title cards of the two endings. Pure functions: no page, no clock, nothing private.
// Every input is public state (the Turn Clock, the Haunt level, who joined the haunting), never a hidden card or a private result.

/** The shots, by the name the Reel uses. Each is `media/<file>.webm`, `.mp4` and `.jpg`, with an entry in media/PROVENANCE.md. */
export const SHOTS = {
  ship: 'reel-ship',
  coffin: 'reel-coffin',
  streets: 'reel-streets',
  stairs: 'stair-shadow',
  hand: 'reel-hand',
  bed: 'reel-bed',
  dawn: 'end-dawn',
  house: 'end-house',
};

/** What each shot shows, in words. The picture is decoration, so this line is its twin for the live region and the log. */
export const SHOT_TEXT = {
  ship: 'A ship, far out at sea.',
  coffin: 'Something rises in the ship\'s hold.',
  streets: 'An empty street, and no one at the windows.',
  stairs: 'A shadow climbs the stairs.',
  hand: 'A shadow hand reaches the door.',
  bed: 'A shape leans over the bed.',
  dawn: 'The sun rises. The window is empty.',
  house: 'Something waits in the doorway.',
};

/** The Haunt levels at which a Haunt Event fires (party-mode 11.2), when the level is below the maximum. */
export const EVENT_LEVELS = [3, 6, 9];

const whole = (n, fallback) => (Number.isFinite(n) ? Math.trunc(n) : fallback);

/**
 * The Reel: the shot for a Haunt level. The film plays forward as the Haunt rises: the ship, the crate, the street, the stairs,
 * the hand at the door, the bed. The Events (3, 6 and 9) each get a shot of their own, and the maximum is the ending, not a shot.
 * Total: any input gives a shot, a level past either end is held at that end.
 * @returns {keyof typeof SHOTS}
 */
export function reelShot(level, max) {
  const m = Math.max(1, whole(max, 10));
  const l = Math.max(0, Math.min(whole(level, 0), m));
  if (l >= m) return 'house';
  if (l >= 9) return 'bed';
  if (l >= 7) return 'hand';
  if (l === 6) return 'stairs';
  if (l >= 4) return 'streets';
  if (l === 3) return 'coffin';
  return 'ship';
}

/** True when `level` is a Haunt Event level that is below the maximum, so the Reel marks it. */
export function isEventLevel(level, max) {
  return EVENT_LEVELS.includes(level) && level < max;
}

/**
 * The clock shadow: where the shadow stands on the stairs, from 0 (the foot) to 1 (the top), for a Turn of `baseMs` with `remainingMs`
 * left on the clock. It follows the clock only, so Help (more time left) steps it back and Spook (less) steps it forward.
 */
export function shadowPosition(baseMs, remainingMs) {
  if (!(baseMs > 0) || !Number.isFinite(remainingMs)) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs / baseMs));
}

/** The time inside a clip of `durationS` seconds for a position from 0 to 1, kept just inside the clip so the last frame can show. */
export function frameTime(position, durationS) {
  if (!(durationS > 0)) return 0;
  return Math.min(1, Math.max(0, position)) * Math.max(0, durationS - 0.06);
}

/** The same position, moved on only once a second (for a Player who prefers reduced motion). */
export function stepPosition(baseMs, remainingMs) {
  if (!(baseMs > 0) || !Number.isFinite(remainingMs)) return 0;
  const wholeSecondsLeft = Math.ceil(Math.max(0, remainingMs) / 1000);
  return shadowPosition(baseMs, wholeSecondsLeft * 1000);
}

const nameList = (names) => {
  const n = names.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/**
 * The title card of an ending: our own words on a silent-film card (never the film's). WHEN the house wins the card says that the
 * haunting continues, that no one won and who joined the haunting (party-mode 14.2), and never uses the word Poltergeist.
 * @param {'detectives'|'house'} outcome
 * @param {string[]} joined  the nicknames of those who joined the haunting
 * @returns {{ shot: keyof typeof SHOTS, title: string, lines: string[] }}
 */
export function endingCard(outcome, joined = []) {
  if (outcome === 'detectives') return { shot: 'dawn', title: 'The night is over.', lines: ['The house lets go.'] };
  const who = nameList(joined);
  return { shot: 'house', title: 'The haunting continues.', lines: ['No one won.', ...(who ? [`${who} joined the haunting.`] : [])] };
}
