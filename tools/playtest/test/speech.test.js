// Choosing a clear voice for the spoken Spirit board word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, scoreVoice, sayings, speakWord } from '../js/speech.js';

const V = (name, lang, extra = {}) => ({ name, lang, voiceURI: name, localService: true, default: false, ...extra });

test('speech: prefers a clear English voice and skips novelty and foreign voices', () => {
  const voices = [V('Whisper', 'en-US'), V('Bad News', 'en-US'), V('Amelie', 'fr-CA'), V('Samantha (Enhanced)', 'en-US'), V('Daniel', 'en-GB'), V('Compact Voice', 'en-US')];
  assert.equal(pickVoice(voices).name, 'Samantha (Enhanced)');
  assert.equal(pickVoice([V('Whisper', 'en-US'), V('Amelie', 'fr-CA')]), null, 'only a novelty voice and a French voice: none is fit');
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice(undefined), null);
  assert.equal(pickVoice([V('Google US English', 'en_US', { localService: false })]).name, 'Google US English');
});

test('speech: a plain English voice beats a compact one, and en-GB is fine', () => {
  assert.equal(pickVoice([V('Compact', 'en-US'), V('Voice B', 'en-GB')]).name, 'Voice B');
  assert.ok(scoreVoice(V('x', 'de-DE')) === -Infinity);
  assert.ok(scoreVoice(null) === -Infinity);
});

test('speech: the word is said, then its clue, then the word again', () => {
  assert.deepEqual(sayings('ELM', 'a tall tree'), ['elm', 'a tall tree', 'elm']);
  assert.deepEqual(sayings('ELM', ''), ['elm', 'elm']);
});

test('speech: speakWord uses a clear voice at a normal pitch and speed, and reports a phone with no voice', () => {
  const spoken = [];
  class U { constructor(t) { this.text = t; } }
  const synth = { getVoices: () => [V('Whisper', 'en-US'), V('Karen', 'en-AU')], cancel() { spoken.length = 0; }, speak(u) { spoken.push(u); } };
  assert.equal(speakWord('OAK', 'a strong tree', synth, U), true);
  assert.deepEqual(spoken.map((u) => u.text), ['oak', 'a strong tree', 'oak']);
  for (const u of spoken) { assert.equal(u.voice.name, 'Karen'); assert.equal(u.pitch, 1); assert.ok(u.rate >= 0.8 && u.rate <= 1); }
  assert.equal(speakWord('OAK', 'x', null, U), false);
  assert.equal(speakWord('OAK', 'x', synth, undefined), false);
});
