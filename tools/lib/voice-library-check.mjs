// The checks of tools/check-voice-library.mjs, as a pure function so they can be tested.
// Independent on purpose: it re-parses the story markdown and re-derives the keys with its own short code, without any
// TypeScript, so a bug in shared/src/voice/ cannot hide itself. (ghost-voice task 3.11.)
import { createHash } from 'node:crypto';
import { parseLodgerLines, renderLodgerBankTs } from './story-banks.mjs';

const LIBRARY_PREFIX = 'speech/lib/v1/';
const MAX_SPOKEN_CHARS = 240;
const MARKUP = /[[\]<>`*#{}]/;
const TAGS = ['[whisper]', '[speak nervously]'];

const normalise = (t) => t.normalize('NFC').replace(/\s+/gu, ' ').trim();
const canonical = (voice, text) => JSON.stringify([voice, normalise(text)]);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * @param {{ markdown: string, manifest: any, bankTs: string }} input
 *   markdown: docs/story/lodger-lines.md; manifest: shared/fixtures/voice-library.json (parsed); bankTs: shared/src/voice/banks/lodger.ts
 * @returns {{ problems: string[], notes: string[], summary: { spokenLines: number, voices: number, entries: number } }}
 */
export function checkVoiceLibrary({ markdown, manifest, bankTs }) {
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
    for (const id of Array.isArray(e.sources) ? e.sources : []) {
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
  // Entries only in the listed voices.
  for (const [i, e] of entries.entries()) {
    if (e && typeof e.voice === 'string' && !voices.includes(e.voice)) problems.push(`manifest entry ${i}: voice ${e.voice} is not in lodgerVoices`);
  }

  return { problems, notes, summary: { spokenLines: spokenLines.length, voices: voices.length, entries: entries.length } };
}
