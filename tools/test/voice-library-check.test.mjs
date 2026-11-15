// Run: node --test tools/test/*.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { checkVoiceLibrary } from '../lib/voice-library-check.mjs';
import { parseLodgerLines, renderLodgerBankTs } from '../lib/story-banks.mjs';

const MARKDOWN = [
  '| Id | Line |', '|---|---|',
  '| `lodger.aside.1` | Me? Well... I mean... named, am I. Do carry on. |',
  '| `lodger.stall.1` | Me? Well... I mean... would I say that? Go on. |',
  '| `lodger.confession.1` | Oh, very well... it was me. I was... provoked. |',
].join('\n');

const VOICES = ['inworld:Mark', 'inworld:Chloe'];
const key = (voice, text) => 'speech/lib/v1/' + createHash('sha256').update(JSON.stringify([voice, text])).digest('hex');

function goodInput(markdown = MARKDOWN) {
  const lines = parseLodgerLines(markdown).filter((l) => l.spoken);
  const entries = [];
  for (const l of lines) for (const voice of VOICES) entries.push({ key: key(voice, l.text), voice, spoken: l.text, sources: [l.id] });
  return {
    markdown,
    manifest: { version: 1, prefix: 'speech/lib/v1/', lodgerVoices: VOICES, count: entries.length, entries },
    bankTs: renderLodgerBankTs(parseLodgerLines(markdown)),
  };
}
const clone = (x) => structuredClone(x);
const problemsOf = (input) => checkVoiceLibrary(input).problems.join('\n');

test('a consistent manifest passes, and the aside is not rendered', () => {
  const r = checkVoiceLibrary(goodInput());
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.summary, { spokenLines: 2, voices: 2, entries: 4 });
});

test('a spoken text with no entry fails', () => {
  const input = goodInput();
  input.manifest.entries.pop();
  input.manifest.count = input.manifest.entries.length;
  assert.match(problemsOf(input), /lodger\.confession\.1: no entry in inworld:Chloe/);
});

test('an entry whose line is gone fails (an entry has no line)', () => {
  const input = goodInput();
  const e = input.manifest.entries[0];
  input.manifest.entries.push({ ...e, spoken: 'Words nobody wrote.', key: key(e.voice, 'Words nobody wrote.'), sources: ['lodger.stall.9'] });
  input.manifest.count = input.manifest.entries.length;
  assert.match(problemsOf(input), /source lodger\.stall\.9 is not a line/);
});

test('an entry for a text-only line fails', () => {
  const input = goodInput();
  const aside = { voice: 'inworld:Mark', spoken: 'Me? Well... I mean... named, am I. Do carry on.', sources: ['lodger.aside.1'] };
  input.manifest.entries.push({ ...aside, key: key(aside.voice, aside.spoken) });
  input.manifest.count = input.manifest.entries.length;
  assert.match(problemsOf(input), /text only and must never be rendered/);
});

test('a Steering Tag or markup in a spoken text fails', () => {
  const tagged = clone(goodInput());
  tagged.manifest.entries[0].spoken = '[speak nervously] ' + tagged.manifest.entries[0].spoken;
  assert.match(problemsOf(tagged), /Steering Tag/);
  const marked = clone(goodInput());
  marked.manifest.entries[0].spoken = 'Hello <b>there</b>.';
  assert.match(problemsOf(marked), /markup, a bracket or a placeholder/);
});

test('a wrong key fails', () => {
  const input = goodInput();
  input.manifest.entries[0].key = 'speech/lib/v1/' + 'a'.repeat(64);
  assert.match(problemsOf(input), /the key does not match the voice and the text/);
});

test('a duplicate key or a wrong count fails', () => {
  const dup = goodInput();
  dup.manifest.entries[1] = { ...dup.manifest.entries[0] };
  assert.match(problemsOf(dup), /duplicate key/);
  const count = goodInput();
  count.manifest.count = 99;
  assert.match(problemsOf(count), /count is 99/);
});

test('a stale generated bank fails', () => {
  const input = goodInput();
  input.bankTs = input.bankTs.replace('provoked', 'annoyed');
  assert.match(problemsOf(input), /out of date/);
});

test('markup or a placeholder in a spoken story line fails, and in an aside does not', () => {
  const bad = MARKDOWN.replace('it was me.', 'it was {nick}.');
  assert.match(problemsOf(goodInput(bad)), /lodger\.confession\.1: the spoken line holds markup/);
  const asideOnly = MARKDOWN.replace('named, am I.', 'named, {nick}.');
  assert.equal(problemsOf(goodInput(asideOnly)), '');
});

test('a REVIEW note is a note, not a failure, and is never part of the line', () => {
  const md = MARKDOWN.replace('Do carry on. |', 'Do carry on. REVIEW: sounds like an alibi. |');
  const input = goodInput(md);
  const r = checkVoiceLibrary(input);
  assert.deepEqual(r.problems, []);
  assert.ok(r.notes.some((n) => /lodger\.aside\.1: open REVIEW note/.test(n)));
  assert.ok(!input.bankTs.includes('REVIEW'));
});
