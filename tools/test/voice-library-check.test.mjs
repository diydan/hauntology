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

// ---- the Whisper and the Keeper (ghost-lines.md and party-lines.md) ----
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAKER_BANK_TARGETS, parseSpeakerLines, renderSpeakerTarget } from '../lib/story-banks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
/** The real repo inputs, as the CLI passes them. A fresh copy each time, so a test may change it. */
const real = () => ({
  markdown: read('docs/story/lodger-lines.md'),
  manifest: JSON.parse(read('shared/fixtures/voice-library.json')),
  bankTs: read('shared/src/voice/banks/lodger.ts'),
  banks: SPEAKER_BANK_TARGETS.map((target) => ({ target, markdown: read(target.source), bankTs: read(target.out) })),
});
const ghost = (i) => i.banks.find((b) => b.target.prefix === 'GHOST');
const party = (i) => i.banks.find((b) => b.target.prefix === 'PARTY');
/** Change a bank's markdown and regenerate its TypeScript, so only the rule under test can fail. */
const edit = (b, from, to) => { assert.ok(b.markdown.includes(from), `test setup: "${from}" not found`); b.markdown = b.markdown.replace(from, to); b.bankTs = renderSpeakerTarget(b.target, b.markdown); };
const entryOf = (input, id, voice) => input.manifest.entries.find((e) => e.voice === voice && e.sources.includes(id));
const recount = (input) => { input.manifest.count = input.manifest.entries.length; };

test('the real repo passes: 503 entries, and 54 of the 211 Whisper and Keeper lines are text only', () => {
  const r = checkVoiceLibrary(real());
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.summary.extra, { lines: 211, textOnly: 54, spokenLines: 157, expectedEntries: 437 });
  assert.equal(r.summary.entries, 503);
  assert.equal(r.summary.spokenLines, 11);
});

test('the parser reads ids, speakers and whether a line is spoken from the heading above it', () => {
  const rows = parseSpeakerLines(read('docs/story/party-lines.md'));
  const by = (id) => rows.find((r) => r.id === id);
  assert.equal(by('turn-start.dry.1').speaker, 'keeper');
  assert.equal(by('turn-start.dry.1').spoken, true);
  assert.equal(by('cue.creak.dry.1').spoken, false);
  assert.equal(by('nudge.help.dry.1').spoken, false);
  assert.equal(by('haunt.choose.soft.1').spoken, false);
  assert.equal(by('haunt.cold-spot.soft.1').speaker, 'whisper');
  assert.equal(by('haunt.cold-spot.soft.1').kind, 'haunt.cold-spot');
  assert.equal(by('end.haunting.dry.1').review?.startsWith('fixed word for word'), true);
  assert.ok(!by('end.haunting.dry.1').text.includes('REVIEW'));
  // the summary tables of the file are not lines
  assert.equal(rows.length, 139);
});

test('a spoken line with no entry fails (the Whisper or the Keeper)', () => {
  const input = real();
  const e = entryOf(input, 'ambient.soft.2', 'inworld:Pippa');
  input.manifest.entries.splice(input.manifest.entries.indexOf(e), 1);
  recount(input);
  assert.match(problemsOf(input), /ambient\.soft\.2: no entry in inworld:Pippa/);
  const k = real();
  const kk = entryOf(k, 'echo.dry.3', 'inworld:Ronald');
  k.manifest.entries.splice(k.manifest.entries.indexOf(kk), 1);
  recount(k);
  assert.match(problemsOf(k), /echo\.dry\.3: no entry in inworld:Ronald/);
});

test('an entry whose line is gone fails (an entry has no line), and so does one from an unknown id', () => {
  const input = real();
  const e = entryOf(input, 'refuse.dry.1', 'inworld:Ronald');
  input.manifest.entries.push({ ...e, spoken: 'Words nobody wrote.', key: key(e.voice, 'Words nobody wrote.'), sources: ['refuse.dry.9'] });
  recount(input);
  const p = problemsOf(input);
  assert.match(p, /no story line gives this text in inworld:Ronald/);
  assert.match(p, /source refuse\.dry\.9 is not a line in the story markdown/);
});

test('a text-only line (a cue, a nudge, a choice prompt) must never be rendered', () => {
  const input = real();
  const cue = parseSpeakerLines(party(input).markdown).find((r) => r.id === 'cue.bell.dry.1');
  const spoken = cue.text.split('. ').slice(0, 2).join('. ') + '.';
  input.manifest.entries.push({ key: key('inworld:Ronald', spoken), voice: 'inworld:Ronald', spoken, sources: ['cue.bell.dry.1'] });
  recount(input);
  assert.match(problemsOf(input), /source cue\.bell\.dry\.1 is text only and must never be rendered/);
});

test('the weather is rendered as an adjective: a manifest still holding the bare noun fails, and so does a wrong value list', () => {
  const input = real();
  const e = entryOf(input, 'ambient.soft.1', 'inworld:Pippa');
  assert.match(e.spoken, /Today it is clear\./);
  const cloudy = entryOf(input, 'ambient.soft.1', 'inworld:Pippa') && input.manifest.entries.find((x) => x.sources.includes('ambient.soft.1') && x.spoken.includes('cloudy'));
  assert.ok(cloudy, 'the cloudy text exists');
  const noun = real();
  const c2 = noun.manifest.entries.find((x) => x.sources.includes('ambient.soft.1') && x.spoken.includes('cloudy'));
  c2.spoken = c2.spoken.replace('cloudy', 'cloud');
  c2.key = key(c2.voice, c2.spoken);
  const p = problemsOf(noun);
  assert.match(p, /ambient\.soft\.1: no entry in inworld:Pippa for "I keep a little weather by me\. Today it is cloud/);
  assert.match(p, /no story line gives this text/);
  const values = real();
  values.manifest.finite.weather[1] = 'cloud';
  assert.match(problemsOf(values), /finite does not hold the values this checker expects/);
  const missing = real();
  delete missing.manifest.finite;
  assert.match(problemsOf(missing), /finite does not hold the values/);
});

test('a line is cut before the sentence that holds a name: an entry that keeps it fails', () => {
  const input = real();
  const e = entryOf(input, 'turn-start.dry.1', 'inworld:Ronald');
  assert.equal(e.spoken, 'It is your hour. I am the soul of patience, though the house is rather less so.');
  e.spoken += ' Go on, Alice.';
  e.key = key(e.voice, e.spoken);
  assert.match(problemsOf(input), /no story line gives this text in inworld:Ronald/);
});

test('an ellipsis is a pause and not the end of a sentence, in this checker as in the product', () => {
  const input = real();
  edit(party(input), '| `turn-start.dry.1` | It is your hour. I am the soul of patience, though the house is rather less so. Go on, {nick}. |', '| `turn-start.dry.1` | Well... I mean... it is your hour. Do go on, {nick}. |');
  const e = entryOf(input, 'turn-start.dry.1', 'inworld:Ronald');
  e.spoken = 'Well... I mean... it is your hour.';
  e.key = key(e.voice, e.spoken);
  assert.deepEqual(checkVoiceLibrary(input).problems, []);
});

test('a line marked spoken whose first sentence is a name would be silent: fails', () => {
  const input = real();
  edit(party(input), '| `turn-start.dry.1` | It is your hour. I am the soul of patience, though the house is rather less so. Go on, {nick}. |', '| `turn-start.dry.1` | {nick}. It is your hour. |');
  assert.match(problemsOf(input), /turn-start\.dry\.1: marked spoken, but nothing would be spoken/);
});

test('rules for every line, spoken or text only: markup, a stray brace, an unknown placeholder, a Steering Tag, length', () => {
  const cases = [
    ['| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |', '| `cue.bell.dry.1` | A bell <b>rings</b>. That would be {nick}. |', /cue\.bell\.dry\.1: the line holds markup/],
    ['| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |', '| `cue.bell.dry.1` | A bell rings {. That would be {nick}. |', /cue\.bell\.dry\.1: the line holds markup/],
    ['| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |', '| `cue.bell.dry.1` | A bell rings. That would be {who}. |', /unknown placeholder \{who\}/],
    ['| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |', '| `cue.bell.dry.1` | [whisper] A bell rings. That would be {nick}. |', /Steering Tag/],
    ['| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |', `| \`cue.bell.dry.1\` | ${'A bell rings. '.repeat(30)}That would be {nick}. |`, /longer than 240/],
  ];
  for (const [from, to, pattern] of cases) {
    const input = real();
    edit(party(input), from, to);
    assert.match(problemsOf(input), pattern);
  }
});

test('a line under the other voice\'s heading, a reused id, and a stale generated bank all fail', () => {
  const wrong = real();
  edit(party(wrong), '## Whisper: haunt.lull (spoken)', '## Keeper: haunt.lull (spoken)');
  assert.match(problemsOf(wrong), /haunt\.lull\.soft\.1: sits under a heading for the other voice/);

  const twice = real();
  edit(ghost(twice), '| `echo.dry.1` |', '| `reveal.dry.1` |');
  assert.match(problemsOf(twice), /reveal\.dry\.1: the id is used twice/);

  const stale = real();
  stale.banks[0].bankTs = stale.banks[0].bankTs.replace('I was waiting', 'I was late');
  assert.match(problemsOf(stale), /shared\/src\/voice\/banks\/ghost\.ts is out of date/);
});

test('an entry in the Whisper\'s or the Keeper\'s voice with no bank given is not allowed', () => {
  const input = real();
  delete input.banks;
  assert.match(problemsOf(input), /voice inworld:Pippa is not in lodgerVoices/);
});

test('a wrong sources list on an entry fails', () => {
  const input = real();
  const e = entryOf(input, 'seal.dry.1', 'inworld:Ronald');
  e.sources = ['seal.dry.2'];
  assert.match(problemsOf(input), /seal\.dry\.1: the entry in inworld:Ronald lists sources \[seal\.dry\.2\]/);
});

test('an ellipsis does not end a sentence: "Well... it is your hour, {nick}." is ONE sentence, so none of it is spoken', () => {
  const input = real();
  edit(party(input), '| `turn-start.dry.1` | It is your hour. I am the soul of patience, though the house is rather less so. Go on, {nick}. |', '| `turn-start.dry.1` | Well... it is your hour, {nick}. |');
  assert.match(problemsOf(input), /turn-start\.dry\.1: marked spoken, but nothing would be spoken/);
});
