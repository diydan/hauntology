// Scenes made from footage (Requirements 19 to 21 of .kiro/specs/puzzles): where the clock shadow stands, which shot the Reel plays
// for a Haunt level, and the title cards of the two endings. Pure functions: no page, no clock, nothing private.
// Every input is public state (the Turn Clock, the Haunt level, who joined the haunting), never a hidden card or a private result.

/**
 * The shots, by the name the Reel uses. Each is `media/<file>.webm`, `.mp4` and `.jpg`, with an entry in media/PROVENANCE.md.
 * The ship, the crate and the street are cut from Nosferatu (5 seconds or less), the mirror from Frankenstein (1910, 10 seconds). The hand, the bed, the dawn and the house are AI scenes of 15 seconds
 * (the AI clips of Requirement 18.9), made for the game and written lines for (SHOT_LINE): the real film has no picture of ours to narrate.
 */
export const SHOTS = {
  ship: 'reel-ship',
  coffin: 'reel-coffin',
  streets: 'reel-streets',
  mirror: 'reel-mirror',
  hand: 'ai-hand-door-take2',
  bed: 'ai-empty-bed-take1',
  dawn: 'ai-dawn-door-take3',
  house: 'ai-lights-out-take1',
};

/** What each shot shows, in words. The picture is decoration, so this line is its twin for the live region and the log. */
export const SHOT_TEXT = {
  ship: 'A tall ship at the quay, its sails loose.',
  coffin: 'Something rises in the ship\'s hold.',
  streets: 'An empty street, and no one at the windows.',
  mirror: 'A man rests in his chair. In the mirror behind him, a figure stands that is not in the room.',
  hand: 'A shadow hand creeps along the wall to the door, and knocks.',
  bed: 'A shadow leans over an empty bed.',
  dawn: 'Morning comes to the quiet house. The door opens on the light.',
  house: 'The windows go dark, one by one, and the front door swings open on the dark.',
};

/**
 * The narration line written for a shot's own picture (puzzles Requirement 20.7), by shot. Each is a row of the story banks, word for word
 * (`docs/story/party-lines.md`, the `scene.*` sections; a test compares them), so the Voice Library speaks it. The ship, the crate, the street and the stairs
 * Every shot has one: the short film shots get a short line that fits inside them. A line is the speaker's own, never an Event line and never a clue.
 */
export const SHOT_LINE = {
  ship: { id: 'scene.ship.soft.1', speaker: 'whisper', text: 'A ship comes in, and I know that ship.' },
  coffin: { id: 'scene.crate.soft.1', speaker: 'whisper', text: 'Something below is waking. It is not me.' },
  streets: { id: 'scene.street.soft.1', speaker: 'whisper', text: 'The street is empty. I emptied it myself.' },
  mirror: { id: 'scene.mirror.soft.1', speaker: 'whisper', text: 'Look in the glass. There is someone in it who is not in the room. Do not be cross. It is only me.' },
  hand: { id: 'scene.hand-door.soft.1', speaker: 'whisper', text: 'That is me, at the door. I knock three times. Two seems timid, and four seems desperate. I shall wait.' },
  bed: { id: 'scene.bed.soft.1', speaker: 'whisper', text: 'I sit on the edge of the bed, very lightly, so as not to wake anyone. Nobody is in it. I look anyway.' },
  house: { id: 'scene.lights-out.soft.1', speaker: 'whisper', text: 'One window, then the next, then the last. Three floors, and I put out each one myself. Do not mind the dark. I will keep you company.' },
  dawn: { id: 'scene.dawn-door.dry.1', speaker: 'keeper', text: 'Well done. The case is closed, and the night has gone quietly home. I shall open the door now. Mind the step, and come again.' },
};

/**
 * When each line starts, in seconds from the start of its shot, so that it falls on the picture it is about (puzzles Requirement 20.8). Found by laying
 * each rendered line over its clip, from the pauses in the audio (the shorter lines of 2026-11-16, not yet checked by ear): `hand` the shadow is already on the wall
 * and the knocks come at 9 seconds, just after "four seems desperate" (said at 8.3 s into the line) and before "I shall wait"; `bed` the mattress sinks at about
 * 6 seconds, as "Nobody is in it" begins (6.5 s into the line); `house` the lights go out from 3 seconds; `dawn` "open the door" is said at about 6.1 seconds
 * into the line and the door opens in the picture at 10.4 seconds, so the line starts at 4.3 and "Mind the step" (7.5 s into the line) is said as the mist comes out.
 */
// The four film shots (2026-11-16): `ship`, `coffin` and `streets` are under 5 seconds, so their line starts at once and the speech ends inside the shot
// (the scrape at 3.1 s comes under the end of the crate line); `mirror` the figure shows in the glass from about 3 seconds, as "someone in it" is said.
export const LINE_AT = { ship: 0.1, coffin: 0.3, streets: 0.4, mirror: 1.2, hand: 0.8, bed: 0.3, house: 1.2, dawn: 4.3 };

/** The line written for a shot, or null when it has none. Total: an unknown shot gives null. */
export function shotLine(shot) {
  return Object.hasOwn(SHOT_LINE, shot) ? SHOT_LINE[shot] : null;
}

/** The line for a Haunt level of the Reel, or null. Total, like reelShot. */
export function reelLine(level, max) {
  return shotLine(reelShot(level, max));
}

/**
 * Wander's reveal: the Whisper's line when a memory is found (each kind of memory has its own scene, WANDER_SCENES).
 * `reveal` is the Whisper's scripted line (docs/story/ghost-lines.md, reveal.soft.1): it says a memory was found, never what it is.
 */
export const WANDER = {
  revealId: 'reveal.soft.1',
  reveal: 'Here. I have kept this a long time, and shown it to no one. Hold it gently. I have kept you a little while too, and I find I like it.',
};

/**
 * The three kinds of memory of Wander (a sound, a person, a promise) and the scene that plays when one is found (puzzles Requirement 23).
 * `clip` is `media/<clip>.webm`, `.mp4` and `.jpg`; `shape` is the frame the picture is shown in (the AI scenes are 3:4, the film is 4:3);
 * `text` is the scene in words for the live region; `line` is the Whisper's line written for the picture and `lineAt` its moment in seconds from the
 * start of the scene (a row of `docs/story/ghost-lines.md`, word for word; a test compares them), or null for the film, which has none.
 * A line sets a mood and never says what the memory is: the card after the scene does that. The promise scene is the AI envelope scene (the envelope lies
 * sealed and blank). Both earlier takes of `wander-letter` show faint writing on the letter (a clip never holds a text), so they are not used. The farewell
 * from Frankenstein (`wander-departure`, line `wander.departure.soft.1`) is kept as a spare promise scene.
 */
export const WANDER_KINDS = ['sound', 'person', 'promise'];
export const WANDER_SCENES = {
  sound: {
    clip: 'wander-chimes-take1',
    shape: 'portrait',
    text: 'A porch in the summer sun. The wind chimes hang still, then a breeze comes and they ring softly.',
    line: { id: 'wander.chimes.soft.1', speaker: 'whisper', text: 'Do you hear that? A row of small bells, and not one in tune. I would not change a single one.' },
    lineAt: 5.0,
  },
  person: {
    clip: 'wander-chair-take1',
    shape: 'portrait',
    text: 'A kitchen in the morning. A coat on a pulled-out chair, and a cup of tea still steaming.',
    line: { id: 'wander.chair.soft.1', speaker: 'whisper', text: 'The tea is still warm, and the coat is still on the chair. Somebody has only just stepped out. I shall wait.' },
    lineAt: 1.5,
  },
  promise: {
    clip: 'wander-envelope-take1',
    shape: 'landscape',
    text: 'A windowsill table in afternoon light: a sealed envelope, a pair of gloves, a small dish, and a net curtain moving in the breeze.',
    line: { id: 'wander.letter.soft.1', speaker: 'whisper', text: 'A sealed envelope, and a pair of gloves set down just so. It is not mine to open. I keep it safe all the same.' },
    lineAt: 2.0,
  },
};

/** The scene for a kind of memory. Total: an unknown kind gets the promise scene (the film), never a throw and never an inherited property. */
export function wanderScene(kind) {
  return Object.hasOwn(WANDER_SCENES, kind) ? WANDER_SCENES[kind] : WANDER_SCENES.promise;
}

/**
 * The title card after the film: our own words. In Wander the words are the memory the engine narrated (two to four sentences from the
 * ghost); the test page passes a stand-in. The scene never says what the memory is: the card does.
 * @param {string} memory
 */
export function wanderCard(memory) {
  const text = typeof memory === 'string' ? memory.trim() : '';
  return { title: 'A memory, found.', lines: text ? [text] : [] };
}

/** The Haunt levels at which a Haunt Event fires (party-mode 11.2), when the level is below the maximum. */
export const EVENT_LEVELS = [3, 6, 9];

const whole = (n, fallback) => (Number.isFinite(n) ? Math.trunc(n) : fallback);

/**
 * The Reel: the shot for a Haunt level. The film plays forward as the Haunt rises: the ship, the crate, the street, the mirror,
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
  if (l === 6) return 'mirror';
  if (l >= 4) return 'streets';
  if (l === 3) return 'coffin';
  return 'ship';
}

/**
 * The two sounds of our own that go with a Reel shot (puzzles Requirement 20.6): a claw scrapes the wooden rim of the crate in the coffin
 * shot (Haunt 3), and someone knocks as the shadow hand raps on the door (Haunt 7 and 8). The files are `web/public/sounds/<name>.m4a`.
 * The footage has no sound of its own, and a sound is never the only signal: SOUND_TEXT is its twin in words.
 */
export const SHOT_SOUND = { coffin: 'scrape', hand: 'knock' };
export const SOUND_TEXT = {
  scrape: 'A claw scrapes the wooden rim.',
  knock: 'Someone knocks, slowly, at a door.',
};

/**
 * When each sound starts, in seconds from the start of its shot: the moment of the picture it belongs to, found frame by frame on the clips.
 * `scrape`: in reel-coffin the claw comes down on the rim of the crate at 3.2 s, and the file has 0.1 s of lead-in before the grip, so it starts at 3.1.
 * `knock`: in ai-hand-door-take2 the shadow hand is on the door and the first rap is at 9.0 s (the clip's own sound, measured at 8.99 s), and the file's first knock is at once, so it starts at 9.0.
 */
export const SOUND_AT = { scrape: 3.1, knock: 9.0 };

/**
 * The sound for a Haunt level, or null when its shot has none. Total, like reelShot.
 * @returns {keyof typeof SOUND_TEXT | null}
 */
export function reelSound(level, max) {
  return SHOT_SOUND[reelShot(level, max)] ?? null;
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
