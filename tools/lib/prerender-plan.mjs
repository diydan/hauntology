// The planning half of tools/prerender-voice.mjs (ghost-voice task 3.11), as pure functions so it can be tested.
// It decides WHAT would be rendered and WHAT IT WOULD COST. It reads no file, calls no network and spends nothing.
//
// Cost: $25 per million characters, counting the Steering Tag as sent (docs/VOICE-LIBRARY-PLAN.md). The tag is a fixed
// function of the voice, never part of a key. A voice with no row below is refused, so a new voice cannot be priced
// or rendered without its tag and settings by accident.

export const PRICE_USD_PER_MILLION_CHARS = 25;
export const MAX_TAKES = 4;
/** `speech/lib/v1/` and 64 lowercase hex. Strict, because the hex becomes a file name. */
export const KEY_PATTERN = /^speech\/lib\/v1\/([0-9a-f]{64})$/;
/** 0.8 s (the shortest accepted clip) at 8 kbps is 800 bytes: anything smaller is not a real clip. */
export const MIN_MP3_BYTES = 800;

// One row per Speaker, the settings approved on 2026-11-15 (the same numbers as SPEAKERS in shared/src/voice/voices.ts; a test
// compares them). The Lodger Voices share one row and are listed in the manifest itself.
const LODGER = { tag: '[speak nervously] ', rate: 1.1, temperature: 1.2 };
const FIXED = {
  'inworld:Pippa': { tag: '[whisper] ', rate: 0.9, temperature: 1.0 },
  'inworld:Ronald': { tag: '', rate: 0.9, temperature: 0.7 },
};

/** The Inworld settings of a voice: Steering Tag, speaking rate, temperature. A voice with no row is refused. */
export function settingsForVoice(voice, manifest) {
  if (Object.hasOwn(FIXED, voice)) return FIXED[voice];
  if (manifest.lodgerVoices.includes(voice)) return LODGER;
  throw new Error(`no settings are known for voice "${voice}"; add them to tools/lib/prerender-plan.mjs before pricing or rendering it`);
}

/** The Steering Tag sent with a voice. */
export const tagForVoice = (voice, manifest) => settingsForVoice(voice, manifest).tag;

export const usdFor = (chars) => Math.round((chars / 1_000_000) * PRICE_USD_PER_MILLION_CHARS * 10_000) / 10_000;

/** The hash part of a Library key, or an error. */
export function hashOf(key) {
  const m = KEY_PATTERN.exec(key);
  if (!m) throw new Error(`not a Library key: ${JSON.stringify(key)}`);
  return m[1];
}

/** The local file for one take of one key. Mirrors the R2 key; the extension is only for the folder on disk. */
export const fileNameFor = (key, take) => `${hashOf(key)}.take${take}.mp3`;

/** Starts with an ID3 tag or an MPEG frame sync (looks at the first 2 or 3 bytes only). */
export function hasMp3Header(bytes) {
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || sync;
}

/** A cheap "is this an MP3" test: big enough, and a valid header. Length and silence are checked when files are rendered. */
export const looksLikeMp3 = (bytes) => bytes.length >= MIN_MP3_BYTES && hasMp3Header(bytes);

/** Match `--voice Chloe`, `--voice chloe` or `--voice inworld:Chloe` to a manifest voice id; null when none matches. */
export function resolveVoice(wanted, manifest) {
  const all = [...new Set(manifest.entries.map((e) => e.voice))];
  const w = wanted.toLowerCase();
  return all.find((v) => v.toLowerCase() === w || v.toLowerCase() === `inworld:${w}`) ?? null;
}

/**
 * @param {object} input
 * @param {{ lodgerVoices: string[], entries: { key: string, voice: string, spoken: string }[] }} input.manifest
 * @param {(file: string) => 'ok' | 'bad' | 'missing'} input.lookup  state of a local file by name; the caller reads the disk
 * @param {number} [input.takes]      takes per line (1 to MAX_TAKES)
 * @param {string | null} [input.voice]  only this voice (an id from the manifest)
 * @param {number | null} [input.budgetUsd]
 */
export function planPrerender({ manifest, lookup, takes = 1, voice = null, budgetUsd = null }) {
  if (!Number.isInteger(takes) || takes < 1 || takes > MAX_TAKES) throw new Error(`takes must be a whole number from 1 to ${MAX_TAKES}`);
  if (budgetUsd !== null && !(Number.isFinite(budgetUsd) && budgetUsd >= 0)) throw new Error('the budget must be a number of dollars, 0 or more');

  const rows = new Map();
  const jobs = [];
  const bad = [];
  const seenKeys = new Set();

  for (const entry of manifest.entries) {
    if (voice !== null && entry.voice !== voice) continue;
    hashOf(entry.key);
    if (seenKeys.has(entry.key)) throw new Error(`the manifest lists a key twice: ${entry.key}`);
    seenKeys.add(entry.key);
    if (typeof entry.spoken !== 'string' || entry.spoken.length === 0) throw new Error(`${entry.key}: the spoken text is empty`);

    const chars = tagForVoice(entry.voice, manifest).length + entry.spoken.length;
    const row = rows.get(entry.voice) ?? { voice: entry.voice, lines: 0, done: 0, missing: 0, bad: 0, chars: 0, usd: 0 };
    rows.set(entry.voice, row);
    row.lines += 1;

    for (let take = 1; take <= takes; take += 1) {
      const file = fileNameFor(entry.key, take);
      const state = lookup(file);
      if (state === 'ok') row.done += 1;
      else if (state === 'bad') { row.bad += 1; bad.push({ key: entry.key, voice: entry.voice, take, file }); }
      else { row.missing += 1; row.chars += chars; jobs.push({ key: entry.key, voice: entry.voice, take, file, spoken: entry.spoken, chars, sources: entry.sources ?? [] }); }
    }
  }

  const rowList = [...rows.values()].map((r) => ({ ...r, usd: usdFor(r.chars) }));
  const totalChars = jobs.reduce((sum, j) => sum + j.chars, 0);
  const totals = {
    lines: rowList.reduce((s, r) => s + r.lines, 0),
    done: rowList.reduce((s, r) => s + r.done, 0),
    missing: jobs.length,
    bad: bad.length,
    chars: totalChars,
    usd: usdFor(totalChars),
  };

  // What a render would do with this budget: go in order and stop before the next file would pass it.
  let budget = null;
  if (budgetUsd !== null) {
    // Whole micro-dollars on both sides, so the comparison has no rounding in it ($25 per million characters is 25 per character).
    const budgetMicro = Math.round(budgetUsd * 1_000_000);
    let spentChars = 0;
    let affordable = 0;
    for (const j of jobs) {
      if ((spentChars + j.chars) * PRICE_USD_PER_MILLION_CHARS > budgetMicro) break;
      spentChars += j.chars;
      affordable += 1;
    }
    budget = { usd: budgetUsd, affordable, of: jobs.length, fitsAll: affordable === jobs.length, estimateUsd: usdFor(spentChars) };
  }

  return { rows: rowList, totals, jobs, bad, budget, takes };
}
