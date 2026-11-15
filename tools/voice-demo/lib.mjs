// The pure logic of the Pippa play-through demo (tools/voice-demo): no DOM, no network, no files. The page, the server and the tests all
// use it. It turns the story banks plus the voice Library manifest into "lines with audio", fills placeholders the way the game will,
// and lays out two scripted sessions (a Wander and a party round) that run the real lines in the order a game would say them.

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
 * Lines with audio. `rows` are the parsed lines of ghost-lines.md and party-lines.md (parseSpeakerLines). Only the Whisper's spoken
 * lines get audio (`voice`, Pippa); the Keeper's lines and every text-only line are kept so the demo can show them, silent.
 * A variant is one concrete text of a line (one value of each finite placeholder it holds) and the file that speaks it. A
 * combination for which no Library entry speaks the start of the text is a HOLE: the Library is missing audio the game would need.
 * @returns {{ voice: string, finite: object, lines: object[], holes: object[] }}
 */
export function buildSequence({ manifest, rows, voice = 'inworld:Pippa', hasFile = () => true }) {
  const finite = manifest.finite ?? {};
  const byId = new Map();
  for (const e of manifest.entries) if (e.voice === voice) for (const id of e.sources) byId.set(id, [...(byId.get(id) ?? []), e]);
  const holes = [];
  const lines = rows.map((row) => {
    const line = { id: row.id, kind: row.kind, suffix: row.suffix, speaker: row.speaker, text: row.text, spoken: row.spoken && row.suffix === 'soft', variants: [] };
    if (!line.spoken) return line;
    const entries = byId.get(row.id) ?? [];
    for (const values of finiteCombos(row.text, finite)) {
      const filled = normalise(fillPlaceholders(row.text, values));
      const entry = entries.filter((e) => filled.startsWith(e.spoken)).sort((a, b) => b.spoken.length - a.spoken.length)[0];
      if (!entry) { holes.push({ id: row.id, values }); continue; }
      const file = hashOf(entry.key);
      line.variants.push({ values, spoken: entry.spoken, file, present: hasFile(file) });
    }
    return line;
  });
  return { voice, finite, lines, holes };
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

/** A line of this kind for this voice, not one of the `recent` ids when there is a choice. `rng` returns [0, 1). */
export function pickLine(seq, kind, suffix, { rng = Math.random, recent = [] } = {}) {
  const all = seq.lines.filter((l) => l.kind === kind && l.suffix === suffix);
  if (all.length === 0) return null;
  const fresh = all.filter((l) => !recent.includes(l.id));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
}

export const DEFAULTS = Object.freeze({ weather: 'cloudy', time: 'dusk', moon: 'waxing gibbous', bearing: 'ahead-right', band: 'nearer', nick: 'Alex', zone: 'cellar', memory: 'the kettle' });
export const NICKS = ['Alex', 'Sam', 'Robin', 'Jo'];
export const ZONES = ['cellar', 'kitchen', 'library', 'attic', 'conservatory'];

/**
 * A Wander session with the Whisper, in the order a game would say it. Each step: what happened, the kind of line the ghost says
 * (`suffix` soft is the Whisper) and the context it is said in.
 */
export function wanderSteps(ctx = DEFAULTS) {
  const at = (patch) => ({ ...ctx, ...patch });
  return [
    { label: 'You step into the place', kind: 'meet', suffix: 'soft', ctx: at({}) },
    { label: 'A quiet moment (the weather)', kind: 'ambient', suffix: 'soft', ctx: at({}) },
    { label: 'Nothing within reach: the ghost teases', kind: 'tease', suffix: 'soft', ctx: at({ band: 'far' }) },
    { label: 'You press Hint (far)', kind: 'hint', suffix: 'soft', ctx: at({ bearing: 'behind-left', band: 'far' }) },
    { label: 'You find the first memory', kind: 'reveal', suffix: 'soft', ctx: at({}) },
    { label: 'You go back to it', kind: 'echo', suffix: 'soft', ctx: at({}) },
    { label: 'You press Hint (nearer)', kind: 'hint', suffix: 'soft', ctx: at({ bearing: 'right', band: 'nearer' }) },
    { label: 'You find the second memory', kind: 'reveal', suffix: 'soft', ctx: at({}) },
    { label: 'You type something that is not about the place', kind: 'refuse', suffix: 'soft', ctx: at({}) },
    { label: 'You press Hint (very close)', kind: 'hint', suffix: 'soft', ctx: at({ bearing: 'ahead', band: 'very close' }) },
    { label: 'You find the third memory: the ending', kind: 'ending', suffix: 'soft', ctx: at({}) },
    { label: 'You visit the ghost once more', kind: 'ending', suffix: 'soft', ctx: at({}) },
  ];
}

/**
 * A party round. The Whisper's lines are voiced; the Keeper's (suffix dry) are shown as text, because only Pippa is rendered so far.
 */
export function partySteps(ctx = DEFAULTS) {
  const [a, b, c] = NICKS;
  const at = (patch) => ({ ...ctx, ...patch });
  return [
    { label: `${a}'s hour begins`, kind: 'turn-start', suffix: 'dry', ctx: at({ nick: a }) },
    { label: `${a} offers a theory`, kind: 'suggest', suffix: 'dry', ctx: at({ nick: a, zone: 'kitchen' }) },
    { label: 'A card is shown to one player', kind: 'shown', suffix: 'dry', ctx: at({}) },
    { label: 'The Haunt rises: a cold place (Haunt Event)', kind: 'haunt.cold-spot', suffix: 'soft', ctx: at({ zone: 'cellar' }) },
    { label: 'The hour is nearly spent', kind: 'time-warning', suffix: 'dry', ctx: at({ nick: a }) },
    { label: 'The Haunt level rises (text only)', kind: 'haunt.rise', suffix: 'soft', ctx: at({}) },
    { label: `${b}'s hour begins`, kind: 'turn-start', suffix: 'dry', ctx: at({ nick: b }) },
    { label: 'Nobody can answer', kind: 'none-shown', suffix: 'dry', ctx: at({}) },
    { label: 'The Haunt rises again: the lights go out (Haunt Event)', kind: 'haunt.blackout', suffix: 'soft', ctx: at({}) },
    { label: `${c} seals an Accusation`, kind: 'seal', suffix: 'dry', ctx: at({ nick: c }) },
    { label: 'Restless (Haunt Event)', kind: 'haunt.restless', suffix: 'soft', ctx: at({ zone: 'attic' }) },
    { label: 'The accusations are opened', kind: 'accuse.reveal', suffix: 'dry', ctx: at({}) },
    { label: `${c}'s accusation does not stand`, kind: 'accuse.wrong', suffix: 'dry', ctx: at({ nick: c }) },
    { label: `${c} joins the haunting`, kind: 'poltergeist', suffix: 'soft', ctx: at({ nick: c }) },
    { label: 'The house settles (Haunt falls)', kind: 'haunt.lull', suffix: 'soft', ctx: at({}) },
    { label: 'Midnight', kind: 'midnight', suffix: 'soft', ctx: at({}) },
    { label: 'Nobody found the ghost in time', kind: 'end.haunting', suffix: 'soft', ctx: at({}) },
  ];
}

/** How long a silent line stays on screen: a slow reader's pace, never under two seconds. */
export const readingMs = (text) => Math.max(2000, Math.round(text.length * 55));
