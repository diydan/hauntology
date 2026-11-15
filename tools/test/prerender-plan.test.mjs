// Tests for tools/lib/prerender-plan.mjs and the dry-run CLI tools/prerender-voice.mjs (ghost-voice task 3.11).
// Run: node --test tools/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileNameFor, hasMp3Header, looksLikeMp3, planPrerender, resolveVoice, settingsForVoice, tagForVoice, usdFor } from '../lib/prerender-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
const cli = join(root, 'tools/prerender-voice.mjs');
const nothingDone = () => 'missing';

test('the real manifest, nothing rendered: 66 files, 6,954 characters, about $0.17 (the numbers in docs/VOICE-LIBRARY-PLAN.md)', () => {
  const p = planPrerender({ manifest, lookup: nothingDone });
  assert.equal(p.jobs.length, 66);
  assert.equal(p.totals.chars, 6954);
  assert.equal(p.totals.usd, 0.1739);
  assert.equal(p.rows.length, 6);
  for (const r of p.rows) assert.deepEqual([r.lines, r.missing, r.chars], [11, 11, 1159]);
});

test('the character count is computed here, not copied: the spoken text plus the 18-character Lodger tag', () => {
  const expected = manifest.entries.reduce((n, e) => n + e.spoken.length + '[speak nervously] '.length, 0);
  assert.equal(planPrerender({ manifest, lookup: nothingDone }).totals.chars, expected);
});

test('two takes cost twice as much and list a file per take', () => {
  const one = planPrerender({ manifest, lookup: nothingDone });
  const two = planPrerender({ manifest, lookup: nothingDone, takes: 2 });
  assert.equal(two.jobs.length, 132);
  assert.equal(two.totals.chars, one.totals.chars * 2);
  assert.equal(new Set(two.jobs.map((j) => j.file)).size, 132);
});

test('files that are done are skipped and cost nothing; bad files are reported and never planned', () => {
  const a = fileNameFor(manifest.entries[0].key, 1);
  const b = fileNameFor(manifest.entries[1].key, 1);
  const p = planPrerender({ manifest, lookup: (f) => (f === a ? 'ok' : f === b ? 'bad' : 'missing') });
  assert.equal(p.totals.done, 1);
  assert.equal(p.totals.bad, 1);
  assert.equal(p.jobs.length, 64);
  assert.ok(!p.jobs.some((j) => j.file === a || j.file === b));
  assert.deepEqual(p.bad.map((x) => x.file), [b]);
});

test('--voice limits the plan to one voice, however it is spelled', () => {
  assert.equal(resolveVoice('Chloe', manifest), 'inworld:Chloe');
  assert.equal(resolveVoice('chloe', manifest), 'inworld:Chloe');
  assert.equal(resolveVoice('inworld:Chloe', manifest), 'inworld:Chloe');
  assert.equal(resolveVoice('Loretta', manifest), null);
  const p = planPrerender({ manifest, lookup: nothingDone, voice: 'inworld:Chloe' });
  assert.equal(p.jobs.length, 11);
  assert.ok(p.jobs.every((j) => j.voice === 'inworld:Chloe'));
});

test('a budget stops the run before the next file would pass it, in manifest order', () => {
  const costOf = (n) => manifest.entries.slice(0, n).reduce((s, e) => s + e.spoken.length + 18, 0);
  // exactly enough for the first 3 files: allow it, then one micro-dollar less
  const exact = costOf(3) * 25 / 1_000_000;
  assert.equal(planPrerender({ manifest, lookup: nothingDone, budgetUsd: exact }).budget.affordable, 3);
  assert.equal(planPrerender({ manifest, lookup: nothingDone, budgetUsd: exact - 0.000001 }).budget.affordable, 2);
  const all = planPrerender({ manifest, lookup: nothingDone, budgetUsd: 1 }).budget;
  assert.equal(all.fitsAll, true);
  const none = planPrerender({ manifest, lookup: nothingDone, budgetUsd: 0 }).budget;
  assert.equal(none.affordable, 0);
});

test('bad input is refused', () => {
  assert.throws(() => planPrerender({ manifest, lookup: nothingDone, takes: 0 }), /takes/);
  assert.throws(() => planPrerender({ manifest, lookup: nothingDone, takes: 5 }), /takes/);
  assert.throws(() => planPrerender({ manifest, lookup: nothingDone, takes: 1.5 }), /takes/);
  assert.throws(() => planPrerender({ manifest, lookup: nothingDone, budgetUsd: -1 }), /budget/);
  assert.throws(() => planPrerender({ manifest, lookup: nothingDone, budgetUsd: Number.NaN }), /budget/);
});

test('a voice with no known Steering Tag is refused, so it cannot be priced without one', () => {
  assert.equal(tagForVoice('inworld:Pippa', manifest), '[whisper] ');
  assert.equal(tagForVoice('inworld:Ronald', manifest), '');
  assert.equal(tagForVoice('inworld:Mark', manifest), '[speak nervously] ');
  assert.throws(() => tagForVoice('inworld:Nobody', manifest), /no settings are known/);
});

test('a key that is not a Library key is refused, so it can never become a path outside the folder', () => {
  const evil = (key) => ({ ...manifest, entries: [{ key, voice: 'inworld:Mark', spoken: 'Hello there.' }] });
  for (const key of ['speech/lib/v1/../../etc/passwd', 'speech/lib/v1/ABC', `speech/lib/v1/${'a'.repeat(63)}`, `speech/v1/${'a'.repeat(64)}`, `speech/lib/v1/${'A'.repeat(64)}`]) {
    assert.throws(() => planPrerender({ manifest: evil(key), lookup: nothingDone }), /not a Library key/, key);
  }
});

test('a repeated key or an empty text in the manifest is refused', () => {
  const e = manifest.entries[0];
  assert.throws(() => planPrerender({ manifest: { ...manifest, entries: [e, e] }, lookup: nothingDone }), /twice/);
  assert.throws(() => planPrerender({ manifest: { ...manifest, entries: [{ ...e, spoken: '' }] }, lookup: nothingDone }), /empty/);
});

test('the MP3 test wants a header and a real size', () => {
  const big = (b0, b1, b2) => Buffer.concat([Buffer.from([b0, b1, b2]), Buffer.alloc(2000)]);
  assert.equal(looksLikeMp3(big(0x49, 0x44, 0x33)), true); // ID3
  assert.equal(looksLikeMp3(big(0xff, 0xfb, 0x90)), true); // frame sync
  assert.equal(looksLikeMp3(big(0x7b, 0x22, 0x65)), false); // a JSON error body, which is what a failed call can return
  assert.equal(looksLikeMp3(Buffer.from([0x49, 0x44, 0x33])), false); // header only
  assert.equal(looksLikeMp3(Buffer.alloc(0)), false);
  assert.equal(hasMp3Header(Buffer.from([0xff, 0xe3, 0])), true);
  assert.equal(hasMp3Header(Buffer.from([0xff, 0x1f, 0])), false);
});

test('the price is $25 per million characters', () => {
  assert.equal(usdFor(1_000_000), 25);
  assert.equal(usdFor(40_000), 1);
  assert.equal(usdFor(0), 0);
});

// ---- the CLI ----
const run = (args, env = {}) => spawnSync('node', [cli, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('CLI: the default is a dry run; it prints the table, says nothing was spent, and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prerender-'));
  try {
    const r = run(['--out', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN\. Nothing is spent, nothing is written\./);
    assert.match(r.stdout, /Total\s+66\s+0\s+66\s+0\s+6,954\s+\$0\.1739/);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: --upload and --reel are refused with exit 2 until they are built, and nothing is written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prerender-'));
  try {
    for (const flag of ['--upload', '--reel']) {
      const r = run([flag, '--budget-usd', '1', '--out', dir]);
      assert.equal(r.status, 2, flag);
      assert.match(r.stderr, /not built yet/);
      assert.match(r.stderr, /Nothing was spent/);
    }
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: a good file in the folder counts as done; a bad one fails the run with exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prerender-'));
  try {
    writeFileSync(join(dir, fileNameFor(manifest.entries[0].key, 1)), Buffer.concat([Buffer.from([0x49, 0x44, 0x33]), Buffer.alloc(4000)]));
    let r = run(['--out', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Total\s+66\s+1\s+65/);
    writeFileSync(join(dir, fileNameFor(manifest.entries[1].key, 1)), '{"error":"quota"}'.repeat(100));
    r = run(['--out', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not an MP3/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: options are checked', () => {
  assert.equal(run(['--takes', '9']).status, 1);
  assert.equal(run(['--budget-usd', 'lots']).status, 1);
  assert.equal(run(['--voice', 'Loretta']).status, 1);
  assert.equal(run(['--nonsense']).status, 1);
  assert.equal(run(['--takes']).status, 1);
  const r = run(['--voice', 'Chloe', '--budget-usd', '0.01']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /a render would stop after \d+ of 11/);
});

test('the settings match SPEAKERS in shared/src/voice/voices.ts (the numbers Dan approved), so the tool and the product cannot drift', () => {
  const ts = readFileSync(join(root, 'shared/src/voice/voices.ts'), 'utf8');
  const row = (speaker) => {
    const m = new RegExp(`${speaker}:\\s*\\{\\s*inworld:\\s*"(\\w+)",\\s*tag:\\s*"([^"]*)",\\s*rate:\\s*([\\d.]+),\\s*temperature:\\s*([\\d.]+)`).exec(ts);
    assert.ok(m, `no SPEAKERS row for ${speaker}`);
    return { voice: `inworld:${m[1]}`, tag: m[2], rate: Number(m[3]), temperature: Number(m[4]) };
  };
  for (const speaker of ['whisper', 'keeper', 'lodger']) {
    const r = row(speaker);
    assert.deepEqual(settingsForVoice(r.voice, manifest), { tag: r.tag, rate: r.rate, temperature: r.temperature }, speaker);
  }
  // and every Lodger Voice gets the Lodger row
  for (const v of manifest.lodgerVoices) assert.deepEqual(settingsForVoice(v, manifest), settingsForVoice('inworld:Mark', manifest));
});
