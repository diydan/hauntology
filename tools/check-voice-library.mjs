#!/usr/bin/env node
// Offline check of the voice Library manifest (ghost-voice task 3.11). Run in the build; needs no network and no TypeScript.
// Checks the Lodger, the Whisper and the Keeper banks. Fails (exit 1) when a spoken text has no entry, an entry has no line, a text holds a Steering Tag or markup, a key does not
// match its voice and text, a text-only line is listed, or the generated Lodger bank is out of date.
// Usage: node tools/check-voice-library.mjs
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkVoiceLibrary } from './lib/voice-library-check.mjs';
import { SPEAKER_BANK_TARGETS } from './lib/story-banks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let result;
try {
  result = checkVoiceLibrary({
    markdown: read('docs/story/lodger-lines.md'),
    manifest: JSON.parse(read('shared/fixtures/voice-library.json')),
    bankTs: read('shared/src/voice/banks/lodger.ts'),
    banks: SPEAKER_BANK_TARGETS.map((target) => ({ target, markdown: read(target.source), bankTs: read(target.out) })),
  });
} catch (e) {
  console.error(`check-voice-library: could not read the inputs: ${e.message}`);
  process.exit(1);
}

for (const n of result.notes) console.log(`note: ${n}`);
if (result.problems.length > 0) {
  for (const p of result.problems) console.error(`ERROR: ${p}`);
  console.error(`\nFAILED: ${result.problems.length} problem(s)`);
  process.exit(1);
}
const s = result.summary;
console.log(`OK: voice library manifest is consistent (${s.spokenLines} spoken Lodger lines x ${s.voices} voices, plus ${s.extra.spokenLines} spoken Whisper and Keeper lines out of ${s.extra.lines} (${s.extra.textOnly} text only) = ${s.entries} entries).`);
