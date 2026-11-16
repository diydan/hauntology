// The narration files and the talking clips of the footage page: which Library files the build copies, under which names, and that every clip has its words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryFile, planVoiceFiles, voiceFile } from '../voice-files.mjs';
import { LIPSYNC, lipsyncFile } from '../js/lipsync-data.js';
import { SHOT_LINE, WANDER_SCENES } from '../js/scenes.js';
import { root } from './helpers.js';

const H = (c) => c.repeat(64);
const manifest = { entries: [
  { key: `speech/lib/v1/${H('a')}`, voice: 'inworld:Pippa', sources: ['scene.bed.soft.1'] },
  { key: `speech/lib/v1/${H('b')}`, voice: 'inworld:Ronald', sources: ['scene.dawn-door.dry.1'] },
] };

test('the Library file of a key is its hash with .take1.mp3, and nothing else is accepted', () => {
  assert.equal(libraryFile(`speech/lib/v1/${H('a')}`), `${H('a')}.take1.mp3`);
  for (const bad of ['', 'speech/lib/v1/xyz', `speech/lib/v1/${H('a')}/../x`, `../speech/lib/v1/${H('a')}`]) assert.throws(() => libraryFile(bad), /not a Library key/);
});

test('a line is copied when its file is in the folder, and listed as missing when it is not or has no entry', () => {
  const has = (f) => f === `${H('a')}.take1.mp3`;
  const p = planVoiceFiles(['scene.bed.soft.1', 'scene.dawn-door.dry.1', 'no.such.line', 'scene.bed.soft.1'], manifest, has);
  assert.deepEqual(p.copy, [{ id: 'scene.bed.soft.1', from: `${H('a')}.take1.mp3`, to: 'voice-scene.bed.soft.1.mp3' }], 'once, with the name the page asks for');
  assert.deepEqual(p.missing, ['scene.dawn-door.dry.1', 'no.such.line']);
  assert.equal(voiceFile('scene.bed.soft.1'), 'voice-scene.bed.soft.1.mp3');
});

test('every scene line of the page has an entry in the real manifest, so the build can find its audio', () => {
  const real = JSON.parse(readFileSync(resolve(root, '..', '..', 'shared', 'fixtures', 'voice-library.json'), 'utf8'));
  const ids = [...Object.values(SHOT_LINE), ...Object.values(WANDER_SCENES).map((w) => w.line)].filter(Boolean).map((l) => l.id);
  assert.ok(ids.length >= 6);
  const p = planVoiceFiles(ids, real, () => true);
  assert.deepEqual(p.missing, [], 'each id is in the manifest');
  for (const id of ids) assert.match(libraryFile(real.entries.find((e) => e.sources.includes(id)).key), /^[0-9a-f]{64}\.take1\.mp3$/);
});

test('the talking clips: 13 of them, each with a name, a speaker, a label and its words, and a file name the Worker serves', () => {
  assert.equal(LIPSYNC.length, 13);
  assert.equal(new Set(LIPSYNC.map((c) => c.name)).size, 13, 'no clip twice');
  for (const c of LIPSYNC) {
    assert.match(c.name, /^hero-[a-z-]+$/);
    assert.ok(c.who.length > 2 && c.label.length > 2 && c.text.length > 20, c.name);
    assert.match(lipsyncFile(c.name), /^media\/lip-hero-[a-z-]+\.mp4$/);
    assert.doesNotMatch(c.text, /\d/, 'no digits in a spoken line');
  }
});

test('when the owner folder of the clips is there, every clip of the list is in it', { skip: !existsSync(resolve(root, '..', '..', 'docs', 'story', 'art', 'clips')) && 'the clips folder is not on this machine' }, () => {
  for (const c of LIPSYNC) assert.ok(existsSync(resolve(root, '..', '..', 'docs', 'story', 'art', 'clips', `${c.name}.mp4`)), c.name);
});
