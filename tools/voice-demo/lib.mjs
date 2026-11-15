// The pure logic of the play-through demo (tools/voice-demo): no DOM, no network, no files. The page, the server and the tests all
// use it. It turns the story banks plus the voice Library manifest into "lines with audio", fills placeholders the way the game will,
// and lays out scripted sessions (a Wander and two party rounds) that run the real lines in the order a game would say them.
// Who speaks: the Whisper (Pippa, id suffix soft), the Keeper Mr. Ashby (Ronald, suffix dry) and the Lodger, a Suspect in the Suspect's
// own voice (suffix lodger). Each has a portrait; a few lines also have a lip-synced video clip (docs/story/CHARACTERS.md).

export const normalise = (t) => t.normalize('NFC').replace(/\s+/gu, ' ').trim();
export const placeholdersOf = (text) => [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]))];

/** Replace {name} with ctx[name]; a placeholder with no value in ctx is left as it is. */
export const fillPlaceholders = (text, ctx) => text.replace(/\{([a-z]+)\}/g, (m, n) => (ctx[n] !== undefined ? String(ctx[n]) : m));

/** Every combination of values of the finite placeholders a text holds (one empty combination when it holds none). */
export function finiteCombos(text, finite) {
  const names = placeholdersOf(text).filter((n) => Array.isArray(finite[n]));
  return names.reduce((acc, n) => acc.flatMap((c) => finite[n].map((v) => ({ ...c, [n]: v }))), [{}]);
}

/** The hash part of a Library key. */
export const hashOf = (key) => {
  const m = /^speech\/lib\/v1\/([0-9a-f]{64})$/.exec(key);
  if (!m) throw new Error(`not a Library key: ${key}`);
  return m[1];
};

/**
 * Lines with audio. `rows` are the parsed lines of ghost-lines.md and party-lines.md (suffix soft or dry) and lodger-lines.md (suffix
 * lodger). Every spoken line gets audio in its Speaker's voice: Pippa, Ronald, or each of the six Lodger voices. Text-only lines are kept
 * so the demo can show them, silent. A variant is one concrete text of a line (one value of each finite placeholder it holds, and for the
 * Lodger one voice) and the file that speaks it. A combination for which no Library entry speaks the start of the text is a HOLE: the
 * Library is missing audio the game would need.
 * @returns {{ finite: object, lines: object[], holes: object[] }}
 */
export function buildSequence({ manifest, rows, hasFile = () => true }) {
  const finite = manifest.finite ?? {};
  const entriesOf = new Map(); // `${voice}\0${line id}` -> manifest entries
  for (const e of manifest.entries) for (const id of e.sources) entriesOf.set(`${e.voice}\u0000${id}`, [...(entriesOf.get(`${e.voice}\u0000${id}`) ?? []), e]);
  const holes = [];
  const lines = rows.map((row) => {
    const line = { id: row.id, kind: row.kind, suffix: row.suffix, speaker: row.speaker, text: row.text, spoken: row.spoken, variants: [] };
    if (!row.spoken) return line;
    const lodger = row.suffix === 'lodger';
    for (const voice of lodger ? manifest.lodgerVoices : [VOICE_OF_SUFFIX[row.suffix]]) {
      const entries = entriesOf.get(`${voice}\u0000${row.id}`) ?? [];
      for (const combo of finiteCombos(row.text, finite)) {
        const filled = normalise(fillPlaceholders(row.text, combo));
        const entry = entries.filter((e) => filled.startsWith(e.spoken)).sort((x, y) => y.spoken.length - x.spoken.length)[0];
        const values = lodger ? { ...combo, voice } : combo;
        if (!entry) { holes.push({ id: row.id, values }); continue; }
        const file = hashOf(entry.key);
        line.variants.push({ values, spoken: entry.spoken, file, present: hasFile(file) });
      }
    }
    return line;
  });
  return { finite, lines, holes };
}

/**
 * What to show and play for a line in a given context: the full subtitle, the part that is spoken, the unspoken tail (a sentence that
 * holds a name, shown but never spoken), and the audio file (null when the line is silent or its audio is missing).
 */
export function resolve(line, ctx) {
  const text = normalise(fillPlaceholders(line.text, ctx));
  const base = { id: line.id, kind: line.kind, speaker: line.speaker, text, spoken: '', tail: text, file: null, voiced: false, missing: false };
  if (!line.spoken) return base;
  const v = line.variants.find((x) => Object.entries(x.values).every(([k, val]) => ctx[k] === val));
  if (!v || !v.present) return { ...base, missing: true };
  const tail = text.startsWith(v.spoken) ? text.slice(v.spoken.length).trim() : '';
  return { ...base, spoken: v.spoken, tail, file: v.file, voiced: true };
}

/** One line by id, or null. */
export const lineById = (seq, id) => seq.lines.find((l) => l.id === id) ?? null;

/** A line of this kind for this voice, not one of the `recent` ids when there is a choice. `rng` returns [0, 1). */
export function pickLine(seq, kind, suffix, { rng = Math.random, recent = [] } = {}) {
  const all = seq.lines.filter((l) => l.kind === kind && l.suffix === suffix);
  if (all.length === 0) return null;
  const fresh = all.filter((l) => !recent.includes(l.id));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
}

/** The voice of each Speaker's id suffix. The Lodger has six (the manifest's `lodgerVoices`), one per Suspect. */
export const VOICE_OF_SUFFIX = Object.freeze({ soft: 'inworld:Pippa', dry: 'inworld:Ronald' });

/** The eight characters: portrait ids are the file names in docs/story/art (`cutouts/color-<id>-head.webp`). */
export const CHARACTERS = Object.freeze({
  whisper: { name: 'The Whisper', voice: 'Pippa' },
  ashby: { name: 'Mr. Ashby, the Keeper', voice: 'Ronald' },
  percy: { name: 'Percy', voice: 'Mark', voiceId: 'inworld:Mark', confession: 'lodger.confession.3' },
  thorne: { name: 'Captain Thorne', voice: 'Conrad', voiceId: 'inworld:Conrad', confession: 'lodger.confession.5' },
  pike: { name: 'Dr. Pike', voice: 'Arjun', voiceId: 'inworld:Arjun', confession: 'lodger.confession.4' },
  cora: { name: 'Cora Bell', voice: 'Chloe', voiceId: 'inworld:Chloe', confession: 'lodger.confession.2' },
  vane: { name: 'Lady Vane', voice: 'Eleanor', voiceId: 'inworld:Eleanor', confession: 'lodger.confession.1' },
  dunmore: { name: 'Mrs. Dunmore', voice: 'Victoria', voiceId: 'inworld:Victoria', confession: 'lodger.confession.6' },
});
export const SUSPECT_IDS = Object.freeze(['percy', 'thorne', 'pike', 'cora', 'vane', 'dunmore']);
/** The portrait of a Speaker whose id suffix is soft or dry. */
export const AVATAR_OF_SUFFIX = Object.freeze({ soft: 'whisper', dry: 'ashby' });

/**
 * The lip-synced clips (docs/story/art/clips/<name>.mp4), by the line they speak. They were rendered separately from the Library audio, so
 * they sound slightly different from it. A confession clip belongs to one Suspect AND one line: key `<line id>|<suspect>`.
 */
export const CLIPS = Object.freeze({
  'meet.soft.1': 'hero-whisper-meet',
  'haunt.cold-spot.soft.1': 'hero-whisper-haunt-cold-spot',
  'haunt.blackout.soft.1': 'hero-whisper-haunt-blackout',
  'haunt.restless.soft.1': 'hero-whisper-haunt-restless',
  'end.haunting.soft.1': 'hero-whisper-end-haunting',
  'poltergeist.soft.1': 'demo-n4-whisper-welcome',
  'ending.soft.1': 'demo-n2-whisper-farewell',
  'meet.dry.1': 'hero-ashby-welcome',
  'end.haunting.dry.1': 'hero-ashby-closing',
  ...Object.fromEntries(SUSPECT_IDS.map((id) => [`${CHARACTERS[id].confession}|${id}`, `hero-suspect-${id}-confession`])),
});

/**
 * Two lines that were made for the demo video and are only true in it: they are in no bank and no Library, and play only as clips.
 */
export const DEMO_ONLY = Object.freeze([
  { id: 'demo-n1', suffix: 'soft', label: 'First memory (demo only)', clip: 'demo-n1-whisper-memory', text: 'Do you hear that? A kettle, just before it sings. I used to count the seconds. I am still counting.' },
  { id: 'demo-n3', suffix: 'dry', label: 'Three accusations (demo only)', clip: 'demo-n3-ashby-reveal', text: 'Three accusations, sealed and sworn. I do enjoy this part. Shall we see who was brave, and who was merely loud?' },
]);

export const clipKey = (lineId, suspect) => (lineId.startsWith('lodger.confession.') ? `${lineId}|${suspect}` : lineId);
/** The clip name for a line (and, for a confession, the Suspect speaking it), or null. */
export const clipFor = (lineId, suspect) => CLIPS[clipKey(lineId, suspect)] ?? null;
/** The portrait id of whoever says a line: the Whisper, Mr. Ashby, or the Suspect in the context. */
export const avatarOf = (speaker, ctx) => (speaker === 'whisper' ? 'whisper' : speaker === 'keeper' ? 'ashby' : ctx.suspect ?? null);
/** The context that makes a Suspect the Lodger: the portrait and the voice. */
export const suspectCtx = (id) => ({ suspect: id, voice: CHARACTERS[id].voiceId });

export const DEFAULTS = Object.freeze({ weather: 'cloudy', time: 'dusk', moon: 'waxing gibbous', bearing: 'ahead-right', band: 'nearer', nick: 'Alex', zone: 'cellar', memory: 'the kettle' });
export const NICKS = ['Alex', 'Sam', 'Robin', 'Jo'];
export const ZONES = ['cellar', 'kitchen', 'library', 'attic', 'conservatory'];

/**
 * A Wander session, in the order a game would say it. `suffix` is the ghost's voice: soft (the Whisper, Pippa) or dry (the Keeper, Ronald).
 * Each step: what happened, the kind of line the ghost says, and the context it is said in. A step may name one line (`forceId`).
 */
export function wanderSteps(ctx = DEFAULTS, suffix = 'soft') {
  const at = (patch) => ({ ...ctx, ...patch });
  return [
    { label: 'You step into the place', kind: 'meet', suffix, ctx: at({}) },
    { label: 'A quiet moment (the weather)', kind: 'ambient', suffix, ctx: at({}) },
    { label: 'Nothing within reach: the ghost teases', kind: 'tease', suffix, ctx: at({ band: 'far' }) },
    { label: 'You press Hint (far)', kind: 'hint', suffix, ctx: at({ bearing: 'behind-left', band: 'far' }) },
    { label: 'You find the first memory', kind: 'reveal', suffix, ctx: at({}) },
    { label: 'You go back to it', kind: 'echo', suffix, ctx: at({}) },
    { label: 'You press Hint (nearer)', kind: 'hint', suffix, ctx: at({ bearing: 'right', band: 'nearer' }) },
    { label: 'You find the second memory', kind: 'reveal', suffix, ctx: at({}) },
    { label: 'You type something that is not about the place', kind: 'refuse', suffix, ctx: at({}) },
    { label: 'You press Hint (very close)', kind: 'hint', suffix, ctx: at({ bearing: 'ahead', band: 'very close' }) },
    { label: 'You find the third memory: the ending', kind: 'ending', suffix, ctx: at({}) },
    { label: 'You visit the ghost once more', kind: 'ending', suffix, ctx: at({}) },
  ];
}

/**
 * A party round. The Keeper (Mr. Ashby, Ronald) runs the table; the Whisper (Pippa) speaks at Haunt Events; a Suspect (the Lodger, in the
 * Suspect's own voice) answers an Accusation. `ending` is 'haunted' (a wrong Accusation, then the haunting wins) or 'solved' (a right
 * Accusation: the Suspect confesses and the Keeper closes). Lines that are text only (a Haunt level rising, an aside) are shown, silent.
 */
export function partySteps(ctx = DEFAULTS, ending = 'haunted') {
  const [a, b, c] = NICKS;
  const at = (patch) => ({ ...ctx, ...patch });
  const keeper = (label, kind, patch = {}) => ({ label, kind, suffix: 'dry', ctx: at(patch) });
  const whisper = (label, kind, patch = {}) => ({ label, kind, suffix: 'soft', ctx: at(patch) });
  const suspect = (label, kind, id, extra = {}) => ({ label, kind, suffix: 'lodger', ctx: at(suspectCtx(id)), ...extra });
  if (ending === 'solved') {
    return [
      keeper(`${a}'s hour begins`, 'turn-start', { nick: a }),
      keeper(`${a} offers a theory`, 'suggest', { nick: a, zone: 'library' }),
      suspect('Lady Vane is named (text only)', 'aside', 'vane'),
      keeper('A card is shown to one player', 'shown'),
      whisper('The Haunt rises: a cold place (Haunt Event)', 'haunt.cold-spot', { zone: 'cellar' }),
      keeper(`${b}'s hour begins`, 'turn-start', { nick: b }),
      keeper(`${b} seals an Accusation`, 'seal', { nick: b }),
      keeper('The accusations are opened', 'accuse.reveal'),
      suspect('Lady Vane confesses', 'confession', 'vane', { forceId: CHARACTERS.vane.confession }),
      keeper(`${b} had it right`, 'accuse.right', { nick: b }),
      keeper('The case is closed', 'end.solved'),
    ];
  }
  return [
    keeper(`${a}'s hour begins`, 'turn-start', { nick: a }),
    keeper(`${a} offers a theory`, 'suggest', { nick: a, zone: 'kitchen' }),
    keeper('A card is shown to one player', 'shown'),
    whisper('The Haunt rises: a cold place (Haunt Event)', 'haunt.cold-spot', { zone: 'cellar' }),
    keeper('The hour is nearly spent', 'time-warning', { nick: a }),
    whisper('The Haunt level rises (text only)', 'haunt.rise'),
    keeper(`${b}'s hour begins`, 'turn-start', { nick: b }),
    keeper('Nobody can answer', 'none-shown'),
    whisper('The Haunt rises again: the lights go out (Haunt Event)', 'haunt.blackout'),
    keeper(`${c} seals an Accusation`, 'seal', { nick: c }),
    whisper('Restless (Haunt Event)', 'haunt.restless', { zone: 'attic' }),
    keeper('The accusations are opened', 'accuse.reveal'),
    suspect('Captain Thorne answers it', 'stall', 'thorne'),
    keeper(`${c}'s accusation does not stand`, 'accuse.wrong', { nick: c }),
    whisper(`${c} joins the haunting`, 'poltergeist', { nick: c }),
    whisper('The house settles (Haunt falls)', 'haunt.lull'),
    whisper('Midnight', 'midnight'),
    whisper('Nobody found the ghost in time', 'end.haunting'),
  ];
}

/** How long a silent line stays on screen: a slow reader's pace, never under two seconds. */
export const readingMs = (text) => Math.max(2000, Math.round(text.length * 55));
