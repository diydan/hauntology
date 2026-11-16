// The checks of tools/check-voice-library.mjs, as a pure function so they can be tested.
// Independent on purpose: it re-parses the story markdown and re-derives the keys with its own short code, without any
// TypeScript, so a bug in shared/src/voice/ cannot hide itself. (ghost-voice task 3.11.)
import { createHash } from 'node:crypto';
import { parseLodgerLines, parseSpeakerLines, renderLodgerBankTs, renderSpeakerTarget } from './story-banks.mjs';

const LIBRARY_PREFIX = 'speech/lib/v1/';
const MAX_SPOKEN_CHARS = 240;
const MARKUP = /[[\]<>`*#{}]/;
const TAGS = ['[whisper]', '[speak nervously]'];

// The Whisper and the Keeper are one voice each (the Lodger's six are listed in the manifest itself).
const VOICE_OF_SUFFIX = { soft: 'inworld:Pippa', dry: 'inworld:Ronald' };
// What each finite placeholder is expanded over: this checker's OWN copy of shared/src/voice/placeholders.ts. The manifest records the
// values it was built with (`finite`), and a difference between the two fails the check.
const FINITE = {
  weather: ['clear', 'cloudy', 'foggy', 'rainy', 'stormy', 'snowy'],
  time: ['dawn', 'day', 'dusk', 'night'],
  moon: ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'],
  bearing: ['ahead', 'ahead-right', 'right', 'behind-right', 'behind', 'behind-left', 'left', 'ahead-left'],
  band: ['far', 'nearer', 'very close'],
};
const PLAYER = ['nick', 'zone', 'memory'];
const KNOWN_PLACEHOLDERS = new Set([...Object.keys(FINITE), ...PLAYER]);

/** Sentences: a break after . ! or ? and a space, except after a run of three or more dots alone (an ellipsis is a pause). */
function sentencesOf(text) {
  const out = [];
  for (const piece of text.split(/(?<=[.!?])\s+/)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^\.{3,}$/.test(/[.!?]+$/.exec(prev)?.[0] ?? '')) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}
/** The spoken part: the leading whole sentences, up to the limit, stopping before the first that holds player text. */
function spokenPartOf(text) {
  const out = [];
  let length = 0;
  for (const sentence of sentencesOf(text)) {
    if (PLAYER.some((p) => sentence.includes(`{${p}}`))) break;
    const next = length + (out.length > 0 ? 1 : 0) + sentence.length;
    if (next > MAX_SPOKEN_CHARS) break;
    out.push(sentence);
    length = next;
  }
  return out.join(' ');
}
/** Every concrete text of a line: each finite placeholder it holds, over each of its values. */
function expandFinite(text) {
  const names = [];
  for (const m of text.matchAll(/\{([a-z]+)\}/g)) if (FINITE[m[1]] && !names.includes(m[1])) names.push(m[1]);
  return names.reduce((texts, name) => texts.flatMap((t) => FINITE[name].map((v) => t.split(`{${name}}`).join(v))), [text]);
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const normalise = (t) => t.normalize('NFC').replace(/\s+/gu, ' ').trim();
const canonical = (voice, text) => JSON.stringify([voice, normalise(text)]);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * @param {{ markdown: string, manifest: any, bankTs: string, banks?: { markdown: string, bankTs: string, target: { source: string, out: string, prefix: string, what: string } }[] }} input
 *   markdown: docs/story/lodger-lines.md; manifest: shared/fixtures/voice-library.json (parsed); bankTs: shared/src/voice/banks/lodger.ts
 *   banks: the Whisper and Keeper banks (see SPEAKER_BANK_TARGETS in story-banks.mjs), each with its markdown and generated TypeScript
 * @returns {{ problems: string[], notes: string[], summary: { spokenLines: number, voices: number, entries: number } }}
 */
export function checkVoiceLibrary({ markdown, manifest, bankTs, banks = [] }) {
  const problems = [];
  const notes = [];
  const lines = parseLodgerLines(markdown);
  const spokenLines = lines.filter((l) => l.spoken);

  // 1. The generated bank is the markdown, today.
  if (bankTs !== renderLodgerBankTs(lines)) problems.push('shared/src/voice/banks/lodger.ts is out of date (run: node tools/build-banks.mjs)');

  // 2. The story lines themselves.
  const ids = new Set();
  for (const l of lines) {
    if (ids.has(l.id)) problems.push(`${l.id}: the id is used twice`);
    ids.add(l.id);
    if (l.review) notes.push(`${l.id}: open REVIEW note (${l.review.slice(0, 80)}${l.review.length > 80 ? '...' : ''})`);
  }
  for (const l of spokenLines) {
    if (MARKUP.test(l.text)) problems.push(`${l.id}: the spoken line holds markup, a bracket or a placeholder`);
    for (const tag of TAGS) if (l.text.includes(tag)) problems.push(`${l.id}: the line holds a Steering Tag (${tag}); the speech code adds tags`);
    if (normalise(l.text).length > MAX_SPOKEN_CHARS) problems.push(`${l.id}: longer than ${MAX_SPOKEN_CHARS} characters`);
    if (!/\.\.\./.test(l.text)) notes.push(`${l.id}: no stumble ("...")`);
  }

  // 3. The manifest.
  if (manifest?.version !== 1) problems.push('manifest: version must be 1');
  if (manifest?.prefix !== LIBRARY_PREFIX) problems.push(`manifest: prefix must be ${LIBRARY_PREFIX}`);
  const voices = Array.isArray(manifest?.lodgerVoices) ? manifest.lodgerVoices : [];
  if (voices.length === 0) problems.push('manifest: lodgerVoices is empty');
  if (new Set(voices).size !== voices.length) problems.push('manifest: lodgerVoices has a duplicate');
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  if (manifest?.count !== entries.length) problems.push(`manifest: count is ${manifest?.count} but there are ${entries.length} entries`);

  // 4. Every entry is well formed.
  const keys = new Set();
  const pairs = new Set();
  for (const [i, e] of entries.entries()) {
    const at = `manifest entry ${i}${e?.sources?.[0] ? ` (${e.sources[0]})` : ''}`;
    if (typeof e?.spoken !== 'string' || typeof e?.voice !== 'string' || typeof e?.key !== 'string') {
      problems.push(`${at}: needs a key, a voice and a spoken text`);
      continue;
    }
    if (!/^speech\/lib\/v1\/[0-9a-f]{64}$/.test(e.key)) problems.push(`${at}: the key is not speech/lib/v1/ plus 64 hex characters`);
    else if (e.key !== LIBRARY_PREFIX + sha256(canonical(e.voice, e.spoken))) problems.push(`${at}: the key does not match the voice and the text`);
    if (MARKUP.test(e.spoken)) problems.push(`${at}: the spoken text holds markup, a bracket or a placeholder`);
    for (const tag of TAGS) if (e.spoken.includes(tag)) problems.push(`${at}: the spoken text holds a Steering Tag`);
    if (e.spoken !== normalise(e.spoken)) problems.push(`${at}: the spoken text is not normalised`);
    if (e.spoken.length === 0 || e.spoken.length > MAX_SPOKEN_CHARS) problems.push(`${at}: the spoken text must be 1 to ${MAX_SPOKEN_CHARS} characters`);
    if (keys.has(e.key)) problems.push(`${at}: duplicate key`);
    keys.add(e.key);
    const pair = `${e.voice}\u0000${e.spoken}`;
    if (pairs.has(pair)) problems.push(`${at}: duplicate voice and text`);
    pairs.add(pair);
    for (const id of voices.includes(e.voice) && Array.isArray(e.sources) ? e.sources : []) {
      const src = lines.find((l) => l.id === id);
      if (!src) problems.push(`${at}: source ${id} is not a line in the story markdown (an entry has no line)`);
      else if (!src.spoken) problems.push(`${at}: source ${id} is text only and must never be rendered`);
      else if (normalise(src.text) !== e.spoken) problems.push(`${at}: the text differs from the line ${id}`);
    }
    if (!Array.isArray(e.sources) || e.sources.length === 0) problems.push(`${at}: no source line`);
  }

  // 5. Every spoken line has an entry in every Lodger Voice (a spoken text has no entry).
  for (const l of spokenLines) {
    for (const voice of voices) {
      const found = entries.find((e) => e?.voice === voice && e?.spoken === normalise(l.text));
      if (!found) problems.push(`${l.id}: no entry in ${voice} (a spoken text has no entry)`);
      else if (!found.sources?.includes(l.id)) problems.push(`${l.id}: the entry in ${voice} does not list it as a source`);
    }
  }
  // Entries only in the listed voices, and in the Whisper's and the Keeper's only when their banks are checked.
  const extraRows = banks.flatMap((b) => parseSpeakerLines(b.markdown));
  const allowedVoices = new Set([...voices, ...extraRows.map((r) => VOICE_OF_SUFFIX[r.suffix])]);
  for (const [i, e] of entries.entries()) {
    if (e && typeof e.voice === 'string' && !allowedVoices.has(e.voice)) problems.push(`manifest entry ${i}: voice ${e.voice} is not in lodgerVoices`);
  }

  // 6. The Whisper and the Keeper: every spoken line, with its placeholders expanded and cut at player text, has an entry in its
  //    one voice, and every entry in those voices comes from a line. Done here from the markdown alone, in this file's own code.
  const summary = { spokenLines: spokenLines.length, voices: voices.length, entries: entries.length };
  if (banks.length > 0) {
    const expected = new Map(); // "voice\0spoken" -> ids of the lines that give it
    const textOnlyIds = new Set();
    const rowIds = new Set();
    for (const b of banks) {
      const rows = parseSpeakerLines(b.markdown);
      if (rows.length === 0) problems.push(`${b.target.source}: no lines found`);
      if (b.bankTs !== renderSpeakerTarget(b.target, b.markdown)) problems.push(`${b.target.out} is out of date (run: node tools/build-banks.mjs)`);
      for (const r of rows) {
        if (ids.has(r.id)) problems.push(`${r.id}: the id is used twice (${b.target.source})`);
        ids.add(r.id);
        rowIds.add(r.id);
        if (!r.spoken) textOnlyIds.add(r.id);
        if (r.review) notes.push(`${r.id}: open REVIEW note (${r.review.slice(0, 80)}${r.review.length > 80 ? '...' : ''})`);
        if (r.headingSuffix !== null && r.headingSuffix !== r.suffix) problems.push(`${r.id}: sits under a heading for the other voice`);
        // Rules for every line, spoken or text only.
        for (const ph of r.text.matchAll(/\{([a-z]+)\}/g)) if (!KNOWN_PLACEHOLDERS.has(ph[1])) problems.push(`${r.id}: unknown placeholder {${ph[1]}}`);
        const bare = r.text.replace(/\{[a-z]+\}/g, '');
        if (/[[\]<>`*#{}]/.test(bare)) problems.push(`${r.id}: the line holds markup, a bracket or a stray brace`);
        for (const tag of TAGS) if (r.text.includes(tag)) problems.push(`${r.id}: the line holds a Steering Tag (${tag}); the speech code adds tags`);
        if (normalise(r.text).length > MAX_SPOKEN_CHARS) problems.push(`${r.id}: longer than ${MAX_SPOKEN_CHARS} characters`);
        if (!r.spoken) continue;
        // A spoken line: expand, cut, and expect an entry for each text.
        const voice = VOICE_OF_SUFFIX[r.suffix];
        let any = false;
        for (const text of expandFinite(r.text)) {
          const spoken = normalise(spokenPartOf(text));
          if (spoken === '') continue;
          any = true;
          if (MARKUP.test(spoken)) problems.push(`${r.id}: the spoken part holds markup, a bracket or a placeholder`);
          const k = `${voice}\u0000${spoken}`;
          expected.set(k, [...(expected.get(k) ?? []), r.id]);
        }
        if (!any) problems.push(`${r.id}: marked spoken, but nothing would be spoken (its first sentence holds player text)`);
      }
    }

    if (JSON.stringify(manifest?.finite) !== JSON.stringify(FINITE)) problems.push('manifest: finite does not hold the values this checker expects for weather, time, moon, bearing and band');

    const entryByPair = new Map();
    for (const e of entries) if (e && typeof e.voice === 'string' && typeof e.spoken === 'string') entryByPair.set(`${e.voice}\u0000${e.spoken}`, e);
    for (const [k, srcs] of expected) {
      const [voice, spoken] = k.split('\u0000');
      const found = entryByPair.get(k);
      const want = new Set(srcs);
      if (!found) problems.push(`${srcs[0]}: no entry in ${voice} for "${spoken.slice(0, 48)}" (a spoken text has no entry)`);
      else if (!sameSet(new Set(found.sources ?? []), want)) problems.push(`${srcs[0]}: the entry in ${voice} lists sources [${(found.sources ?? []).join(', ')}], expected [${[...want].join(', ')}]`);
    }
    for (const [i, e] of entries.entries()) {
      if (!e || voices.includes(e.voice) || typeof e.spoken !== 'string') continue;
      const at = `manifest entry ${i}${e.sources?.[0] ? ` (${e.sources[0]})` : ''}`;
      if (!expected.has(`${e.voice}\u0000${e.spoken}`)) problems.push(`${at}: no story line gives this text in ${e.voice} (an entry has no line)`);
      for (const id of Array.isArray(e.sources) ? e.sources : []) {
        if (textOnlyIds.has(id)) problems.push(`${at}: source ${id} is text only and must never be rendered`);
        else if (!rowIds.has(id)) problems.push(`${at}: source ${id} is not a line in the story markdown (an entry has no line)`);
      }
    }
    summary.extra = { lines: rowIds.size, textOnly: textOnlyIds.size, spokenLines: rowIds.size - textOnlyIds.size, expectedEntries: expected.size };
  }

  return { problems, notes, summary };
}
