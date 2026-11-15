// Tests for the render step: tools/lib/prerender-run.mjs and `tools/prerender-voice.mjs --render`.
// The render Worker is faked (an injected fetch, or a small local HTTP server), so nothing here spends anything.
// These tests are the proof of the money rules: one at a time, no retries, a hard budget, nothing overwritten, bad clips never kept as done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { toolsAvailable, probeClip } from '../lib/audio-check.mjs';
import { planPrerender, fileNameFor, resolveVoice, usdFor } from '../lib/prerender-plan.mjs';
import { renderJobs } from '../lib/prerender-run.mjs';
import { makeMp3 } from './mp3-helper.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
const cli = join(root, 'tools/prerender-voice.mjs');
const skip = !toolsAvailable() && 'ffmpeg or ffprobe is missing';
const TOKEN = 'a-test-token-of-16+chars';
const MARK = resolveVoice('Mark', manifest);

const GOOD_MP3 = skip ? Buffer.alloc(0) : makeMp3({ seconds: 2 });
const tmp = () => mkdtempSync(join(tmpdir(), 'render-'));
const mp3Response = (bytes = GOOD_MP3) => new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } });
const markJobs = (lookup = () => 'missing') => planPrerender({ manifest, lookup, voice: MARK }).jobs;

/** A fake fetch: records every call and answers by the script (a function of the call number, from 1). */
function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return answer(calls.length); };
  fn.calls = calls;
  return fn;
}
const base = (dir, over) => ({ manifest, outDir: dir, workerUrl: 'http://127.0.0.1:8798/', token: TOKEN, budgetUsd: 0.05, ...over });

test('renders every missing line of one voice, in order, with the right request each time', { skip }, async () => {
  const dir = tmp();
  try {
    const f = fakeFetch(() => mp3Response());
    const jobs = markJobs();
    const r = await renderJobs(base(dir, { jobs, fetchFn: f }));
    assert.equal(r.stopped, null);
    assert.equal(r.rendered.length, 11);
    assert.equal(f.calls.length, 11);
    jobs.forEach((j, i) => {
      assert.deepEqual(f.calls[i].body, { voice_id: 'Mark', tag: '[speak nervously] ', text: j.spoken, temperature: 1.2, speaking_rate: 1.1 });
      assert.equal(f.calls[i].init.headers['x-render-token'], TOKEN);
      assert.equal(f.calls[i].url, 'http://127.0.0.1:8798/');
      assert.ok(existsSync(join(dir, j.file)), j.file);
    });
    assert.equal(r.spentChars, 1159);
    assert.equal(r.spentUsd, 0.029);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(report.length, 11);
    assert.deepEqual(Object.keys(report[0]).sort(), ['bytes', 'chars', 'durationMs', 'file', 'key', 'renderedAt', 'sources', 'take', 'tookMs', 'voice']);
    assert.ok(report[0].durationMs > 1900);
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.part') || n.endsWith('.rejected')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the budget is a hard stop: it makes exactly the calls that fit, then stops', { skip }, async () => {
  const dir = tmp();
  try {
    const jobs = markJobs();
    const three = jobs.slice(0, 3).reduce((s, j) => s + j.chars, 0);
    const f = fakeFetch(() => mp3Response());
    const r = await renderJobs(base(dir, { jobs, fetchFn: f, budgetUsd: (three * 25) / 1_000_000 }));
    assert.equal(f.calls.length, 3);
    assert.equal(r.rendered.length, 3);
    assert.equal(r.stopped.kind, 'budget');
    assert.equal(r.spentChars, three);
    // one micro-dollar less than the cost of three files: only two are made
    const dir2 = tmp();
    try {
      const f2 = fakeFetch(() => mp3Response());
      await renderJobs(base(dir2, { jobs, fetchFn: f2, budgetUsd: (three * 25) / 1_000_000 - 0.000001 }));
      assert.equal(f2.calls.length, 2);
    } finally { rmSync(dir2, { recursive: true, force: true }); }
    // a budget of zero makes no call at all
    const f0 = fakeFetch(() => mp3Response());
    const r0 = await renderJobs(base(dir, { jobs: markJobs((f) => (existsSync(join(dir, f)) ? 'ok' : 'missing')), fetchFn: f0, budgetUsd: 0 }));
    assert.equal(f0.calls.length, 0);
    assert.equal(r0.stopped.kind, 'budget');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('NO RETRIES: a failed call stops the run at once, names the file, and is counted as spent', { skip }, async () => {
  const dir = tmp();
  try {
    const f = fakeFetch((n) => (n === 3 ? new Response('{"error":"quota"}', { status: 429 }) : mp3Response()));
    const jobs = markJobs();
    const r = await renderJobs(base(dir, { jobs, fetchFn: f }));
    assert.equal(f.calls.length, 3, 'no fourth call, and the third was not repeated');
    assert.equal(r.rendered.length, 2);
    assert.equal(r.stopped.kind, 'error');
    assert.equal(r.stopped.job.file, jobs[2].file);
    assert.match(r.stopped.message, /429/);
    assert.equal(r.spentChars, jobs[0].chars + jobs[1].chars + jobs[2].chars, 'the failed call counts as spent');
    assert.ok(!existsSync(join(dir, jobs[2].file)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a network error or a timeout also stops the run, with no retry', { skip }, async () => {
  const dir = tmp();
  try {
    let n = 0;
    const fn = async () => { n += 1; if (n === 2) throw new Error('socket hang up'); return mp3Response(); };
    const r = await renderJobs(base(dir, { jobs: markJobs(), fetchFn: fn }));
    assert.equal(n, 2);
    assert.equal(r.stopped.kind, 'error');
    assert.match(r.stopped.message, /socket hang up/);
    assert.match(r.stopped.message, /may still have been billed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a clip that fails a check is kept as .rejected, never as done, and stops the run', { skip }, async () => {
  const cases = [
    ['not an MP3 (a JSON error body with status 200)', () => mp3Response(Buffer.from('{"error":"x"}'.repeat(200))), /not an MP3/],
    ['too short', () => mp3Response(makeMp3({ seconds: 0.3 })), /too short/],
    ['silent', () => mp3Response(makeMp3({ kind: 'silence', seconds: 2 })), /silent/],
    ['too long', () => mp3Response(makeMp3({ seconds: 16 })), /too long/],
  ];
  for (const [what, answer, pattern] of cases) {
    const dir = tmp();
    try {
      const jobs = markJobs();
      const f = fakeFetch((n) => (n === 2 ? answer() : mp3Response()));
      const r = await renderJobs(base(dir, { jobs, fetchFn: f }));
      assert.equal(f.calls.length, 2, what);
      assert.equal(r.stopped.kind, 'rejected', what);
      assert.match(r.stopped.message, pattern, what);
      assert.ok(existsSync(join(dir, `${jobs[1].file}.rejected`)), what);
      assert.ok(!existsSync(join(dir, jobs[1].file)), `${what}: must not be a final file`);
      assert.equal(r.rendered.length, 1, what);
      // the next plan treats it as still missing
      const next = markJobs((file) => (existsSync(join(dir, file)) ? 'ok' : 'missing'));
      assert.equal(next.length, 10, what);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('an existing file is never overwritten', { skip }, async () => {
  const dir = tmp();
  try {
    const job = markJobs()[0];
    writeFileSync(join(dir, job.file), 'DO NOT TOUCH');
    const f = fakeFetch(() => mp3Response());
    const r = await renderJobs(base(dir, { jobs: [job], fetchFn: f }));
    assert.equal(r.stopped.kind, 'error');
    assert.match(r.stopped.message, /already exists/);
    assert.equal(readFileSync(join(dir, job.file), 'utf8'), 'DO NOT TOUCH');
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.part')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('starting again skips what is done and finishes the rest', { skip }, async () => {
  const dir = tmp();
  try {
    const first = await renderJobs(base(dir, { jobs: markJobs(), fetchFn: fakeFetch((n) => (n === 5 ? new Response('boom', { status: 500 }) : mp3Response())) }));
    assert.equal(first.rendered.length, 4);
    const lookup = (file) => (existsSync(join(dir, file)) ? 'ok' : 'missing');
    const rest = markJobs(lookup);
    assert.equal(rest.length, 7);
    const f = fakeFetch(() => mp3Response());
    const second = await renderJobs(base(dir, { jobs: rest, fetchFn: f }));
    assert.equal(second.stopped, null);
    assert.equal(f.calls.length, 7);
    assert.equal(markJobs(lookup).length, 0);
    assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).length, 11, 'the report keeps both runs');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the CLI, against a small real HTTP server ----
async function withServer(handler, run) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    seen.push({ token: req.headers['x-render-token'], body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') });
    handler(seen.length, req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`, seen); } finally { await new Promise((r) => server.close(r)); }
}
const runCli = async (args, env = {}) => {
  try {
    const { stdout, stderr } = await exec('node', [cli, ...args], { env: { ...process.env, VOICE_RENDER_TOKEN: TOKEN, ...env } });
    return { status: 0, stdout, stderr };
  } catch (e) { return { status: e.code, stdout: e.stdout, stderr: e.stderr }; }
};

test('CLI --render: renders one voice for about 3 cents, within a 5 cent budget', { skip }, async () => {
  const dir = tmp();
  try {
    await withServer((n, req, res) => { res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end(GOOD_MP3); }, async (url, seen) => {
      const r = await runCli(['--render', '--voice', 'Mark', '--budget-usd', '0.05', '--out', dir, '--worker', url]);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(seen.length, 11);
      assert.ok(seen.every((s) => s.token === TOKEN && s.body.voice_id === 'Mark'));
      assert.match(r.stdout, /RENDER\. This spends real money/);
      assert.match(r.stdout, /Rendered 11 of 11 files\. Counted as spent: 1,159 characters, about \$0\.0290 of the \$0\.0500 budget\./);
      assert.equal(readdirSync(dir).filter((n) => n.endsWith('.mp3')).length, 11);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI --render: a failing Worker stops the run at once with exit 1 and no retry', { skip }, async () => {
  const dir = tmp();
  try {
    await withServer((n, req, res) => { if (n === 2) { res.writeHead(502); res.end('{"error":"7003"}'); } else { res.writeHead(200); res.end(GOOD_MP3); } }, async (url, seen) => {
      const r = await runCli(['--render', '--voice', 'Mark', '--budget-usd', '0.05', '--out', dir, '--worker', url]);
      assert.equal(r.status, 1);
      assert.equal(seen.length, 2, 'exactly two requests: one good, one failed, no retry');
      assert.match(r.stderr, /502/);
      assert.match(r.stderr, /Starting again skips the files that are done/);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI --render: it refuses to start without a budget, one voice, a token or a local Worker, and calls nothing', { skip }, async () => {
  const dir = tmp();
  try {
    await withServer((n, req, res) => { res.writeHead(200); res.end(GOOD_MP3); }, async (url, seen) => {
      const ok = ['--render', '--voice', 'Mark', '--budget-usd', '0.05', '--out', dir, '--worker', url];
      const without = (flag) => { const i = ok.indexOf(flag); return ok.filter((_, j) => j !== i && j !== i + 1); };
      assert.equal((await runCli(without('--budget-usd'))).status, 1);
      assert.equal((await runCli(without('--voice'))).status, 1);
      assert.equal((await runCli(ok, { VOICE_RENDER_TOKEN: '' })).status, 1);
      assert.equal((await runCli(ok, { VOICE_RENDER_TOKEN: 'short' })).status, 1);
      const remote = await runCli([...without('--worker'), '--worker', 'https://example.com/']);
      assert.equal(remote.status, 1);
      assert.match(remote.stderr, /on this machine/);
      assert.equal((await runCli([...ok, '--dry-run'])).status, 1);
      assert.equal((await runCli([...ok, '--budget-usd', '-1'])).status, 1);
      assert.equal(seen.length, 0, 'not one request was made');
      assert.deepEqual(readdirSync(dir), []);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI --render: a bad file in the folder stops it before any call', { skip }, async () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, fileNameFor(manifest.entries[0].key, 1)), 'junk');
    await withServer((n, req, res) => { res.writeHead(200); res.end(GOOD_MP3); }, async (url, seen) => {
      const r = await runCli(['--render', '--voice', 'Mark', '--budget-usd', '0.05', '--out', dir, '--worker', url]);
      assert.equal(r.status, 1);
      assert.equal(seen.length, 0);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('probeClip and the file the render keeps agree about length', { skip }, async () => {
  const dir = tmp();
  try {
    const job = markJobs()[0];
    const r = await renderJobs(base(dir, { jobs: [job], fetchFn: fakeFetch(() => mp3Response()) }));
    assert.equal(r.rendered[0].durationMs, probeClip(join(dir, job.file)).durationMs);
    assert.equal(usdFor(r.spentChars), r.spentUsd);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
