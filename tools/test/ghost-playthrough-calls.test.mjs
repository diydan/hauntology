import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { costUsd } from '../lib/ghost-spike.mjs';
import { loadSharedFiles } from '../lib/load-shared.mjs';
import {
  ATTIC, BUDGET_CAP_USD, CALL_TIMEOUT_MS, REJECTION_REASONS, callLines, costLines, explainCall, openLedger, planPlaythrough, readCalls, rejectionTable, runPlaythrough, summarize, summaryMarkdown,
} from '../lib/ghost-playthrough.mjs';

// The call recorder of the narrator play-through Worker (api/dev/playthrough-calls.ts) and what the runner makes of it: the replies the game threw away, and why. Everything here runs
// over fakes (a fake AI binding, a fake game that uses the real engine): no network, no Worker, no model, no money.

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = join(ROOT, 'tools', 'ghost-playthrough.mjs');
let plan, play, calls, devModule;
before(async () => {
  plan = await planPlaythrough(ROOT);
  [play] = await loadSharedFiles(['ghost/play.ts'], ROOT);
  calls = await import(pathToFileURL(join(ROOT, 'api', 'dev', 'playthrough-calls.ts')).href);
  devModule = await import(pathToFileURL(join(ROOT, 'api', 'dev', 'playthrough-dev.ts')).href);
});

/** An answer in the shape the model gives (the Anthropic Messages shape). */
const msg = (text, { stop = 'end_turn', inTok = 700, outTok = 40, extra = [] } = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5.5', content: [...extra, { type: 'text', text }], stop_reason: stop, usage: { input_tokens: inTok, output_tokens: outTok },
});
const input = (system = 'You are the ghost.', user = 'The visitor looks.') => ({ max_tokens: 220, system, messages: [{ role: 'user', content: user }] });
const OPTIONS = { gateway: { id: 'default' } };

// ---- the recorder ------------------------------------------------------------------------------------------------------------------------------

test('the recorder changes nothing: the same arguments go in, the very same answer comes back, the call is made on the original binding, and every other member passes through', async () => {
  const seen = [];
  const answer = msg('The way is to your left.');
  const ai = { tag: 'original', extra() { return `extra on ${this.tag}`; }, identity() { return this; }, async run(...args) { seen.push({ self: this, args }); return answer; } };
  const log = calls.createCallLog();
  const wrapped = log.wrap(ai);
  const inp = input();
  const got = await wrapped.run('anthropic/claude-haiku-5.5', inp, OPTIONS);
  assert.equal(got, answer, 'the very same answer object');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].self, ai, 'the call is made on the original binding');
  assert.equal(seen[0].args[0], 'anthropic/claude-haiku-5.5');
  assert.equal(seen[0].args[1], inp, 'the very same input object');
  assert.equal(seen[0].args[2], OPTIONS, 'the very same options object');
  assert.equal(seen[0].args.length, 3);
  assert.equal(wrapped.tag, 'original');
  assert.equal(wrapped.extra(), 'extra on original');
  assert.equal(wrapped.identity(), ai, 'another method runs on the original binding, not on the recorder');
  // a call with no options stays a call with two arguments
  await wrapped.run('m', inp);
  assert.equal(seen[1].args.length, 2);
});

test('a call that throws is recorded as failed (the error\'s name and first words, no reply) and the very same error is thrown again', async () => {
  const boom = new TypeError(`upstream said: ${'x'.repeat(300)}`);
  const log = calls.createCallLog();
  const wrapped = log.wrap({ run: async () => { throw boom; } });
  await assert.rejects(wrapped.run('m', input(), OPTIONS), (e) => e === boom);
  await assert.rejects(log.wrap({ run: async () => { throw 'a plain string'; } }).run('m', input()), (e) => e === 'a plain string');
  const [first] = log.since(0).calls;
  assert.deepEqual([first.n, first.ok, first.text, first.textChars, first.stopReason, first.inputTokens, first.outputTokens], [1, false, null, 0, null, null, null]);
  assert.ok(first.error.startsWith('TypeError: upstream said: xxx'));
  assert.equal(first.error.length, 120);
  assert.equal(log.since(0).calls[1].error, 'a plain string');
  assert.equal(first.inputChars, 'You are the ghost.'.length + 'The visitor looks.'.length);
});

test('each call is kept in the order it finished: its text (thinking blocks left out, the text blocks joined and trimmed), stop reason, token counts, size and time; never what was sent', async () => {
  const clock = { t: 1000 };
  const replies = [
    msg('  First reply.  ', { inTok: 11, outTok: 3 }),
    msg('', { stop: 'end_turn', extra: [{ type: 'thinking', thinking: 'secret reasoning', text: 'LEAKED THINKING' }, { type: 'text', text: 'Split ' }, { type: 'text', text: 'across blocks.' }] }),
    { result: msg('Wrapped answer.', { stop: 'max_tokens', inTok: 5, outTok: 220 }) },
    { response: 'a different shape' },
    { ...msg('x'), usage: { output_tokens: 40 } },
  ];
  const log = calls.createCallLog({ now: () => clock.t });
  const wrapped = log.wrap({ run: async () => { clock.t += 250; return replies.shift(); } });
  const system = 'SECRET INSTRUCTIONS of the ghost.';
  for (let i = 0; i < 5; i += 1) await wrapped.run('m', input(system, `message ${i}`), OPTIONS);
  const out = log.since(0);
  assert.deepEqual(out.calls.map((c) => c.n), [1, 2, 3, 4, 5]);
  assert.equal(out.next, 5);
  assert.deepEqual(out.calls.map((c) => c.text), ['First reply.', 'Split across blocks.', 'Wrapped answer.', null, 'x']);
  assert.deepEqual(out.calls.map((c) => c.stopReason), ['end_turn', 'end_turn', 'max_tokens', null, 'end_turn']);
  assert.deepEqual(out.calls.map((c) => [c.inputTokens, c.outputTokens]), [[11, 3], [700, 40], [5, 220], [null, null], [null, 40]]);
  assert.deepEqual(out.calls.map((c) => c.ms), [250, 250, 250, 250, 250]);
  assert.deepEqual(out.calls.map((c) => c.ok), [true, true, true, true, true]);
  assert.equal(out.calls[0].inputChars, system.length + 'message 0'.length);
  assert.equal(out.calls[0].textChars, 'First reply.'.length);
  const dump = JSON.stringify(out);
  assert.ok(!dump.includes('SECRET INSTRUCTIONS') && !dump.includes('message 0') && !dump.includes('secret reasoning') && !dump.includes('LEAKED THINKING'), 'neither the prompt nor the thinking is kept');
});

test('a reply longer than 2,000 characters is cut there (and says so, with its whole length); the recorder holds at most 500 calls, dropping the oldest and counting what was lost', async () => {
  assert.equal(calls.REPLY_TEXT_MAX, 2000);
  assert.equal(calls.CALLS_MAX, 500);
  const log = calls.createCallLog();
  await log.wrap({ run: async () => msg('a'.repeat(2500)) }).run('m', input());
  const [c] = log.since(0).calls;
  assert.deepEqual([c.text.length, c.textChars, c.truncated], [2000, 2500, true]);
  await log.wrap({ run: async () => msg('b'.repeat(2000)) }).run('m', input());
  assert.deepEqual([log.since(1).calls[0].textChars, log.since(1).calls[0].truncated], [2000, false]);

  const small = calls.createCallLog({ max: 5 });
  const w = small.wrap({ run: async () => msg('ok') });
  for (let i = 0; i < 8; i += 1) await w.run('m', input());
  assert.deepEqual(small.since(0).calls.map((x) => x.n), [4, 5, 6, 7, 8]);
  assert.equal(small.since(0).lost, 3);
  assert.equal(small.since(2).lost, 1);
  assert.equal(small.since(3).lost, 0);
  assert.deepEqual(small.since(5).calls.map((x) => x.n), [6, 7, 8]);
  assert.equal(small.since(5).lost, 0);
  assert.deepEqual([small.since(8).calls.length, small.since(8).next, small.since(8).lost], [0, 8, 0]);
  assert.deepEqual([small.since(99).calls.length, small.since(99).next, small.since(99).lost], [0, 8, 0]);
});

test('since() takes only calls after the number given, treats anything else as 0, hands out copies, and the epoch is one value for the life of a log', async () => {
  const log = calls.createCallLog({ epoch: 'fixed-epoch' });
  const w = log.wrap({ run: async () => msg('hello') });
  await w.run('m', input()); await w.run('m', input()); await w.run('m', input());
  assert.deepEqual(log.since(1).calls.map((c) => c.n), [2, 3]);
  for (const odd of [-5, 1.5, Number.NaN, undefined]) assert.deepEqual(log.since(odd).calls.map((c) => c.n), [1, 2, 3], String(odd));
  assert.equal(log.since(0).epoch, 'fixed-epoch');
  assert.equal(log.epoch, 'fixed-epoch');
  const mine = log.since(0);
  mine.calls[0].text = 'tampered';
  assert.equal(log.since(0).calls[0].text, 'hello', 'a view is a copy');
  assert.notEqual(calls.createCallLog().epoch, calls.createCallLog().epoch);
  assert.match(calls.createCallLog().epoch, /^[0-9a-f-]{36}$/);
});

test('recordEnv: no AI binding (the rehearsal) means the same environment and nothing recorded; with one, a derived environment with the recorded binding, built once, the original untouched', async () => {
  const log = calls.createCallLog();
  const memo = new WeakMap();
  const bare = { BUCKET: 'b' };
  assert.equal(calls.recordEnv(bare, log, memo), bare);
  assert.deepEqual(log.since(0).calls, []);

  const ai = { async run() { return msg('hi'); } };
  const env = { BUCKET: 'bucket', SPEND_GUARD: 'guard', AI: ai };
  const made = calls.recordEnv(env, log, memo);
  assert.notEqual(made, env);
  assert.equal(calls.recordEnv(env, log, memo), made, 'one derived environment for each environment');
  assert.equal(made.BUCKET, 'bucket');
  assert.equal(made.SPEND_GUARD, 'guard');
  assert.equal(env.AI, ai, 'the original is untouched');
  assert.notEqual(made.AI, ai);
  await made.AI.run('m', input(), OPTIONS);
  assert.equal(log.since(0).calls.length, 1);
  assert.equal(await env.AI.run('m', input()).then((a) => a.content[0].text), 'hi');
  assert.equal(log.since(0).calls.length, 1, 'a call on the original binding is not recorded: only the one the game was handed is');
});

// ---- the /dev/calls route ----------------------------------------------------------------------------------------------------------------------

const TOKEN = 'a-test-token-of-16+chars';
const routeDeps = (log) => ({ token: TOKEN, bucket: { put: async () => {} }, galleryKey: (i, n) => `g/${i}/${n}`, llmRemaining: async () => 60, caps: { day: '60', session: '60' }, narrator: true, aiBinding: true, calls: log });
const ask = (deps, path, { method = 'GET', host = '127.0.0.1:8801', token = TOKEN } = {}) => devModule.dev(new Request(`http://${host}${path}`, { method, headers: token === null ? {} : { 'x-run-token': token } }), deps);

test('/dev/calls answers the recorder\'s view to this machine with the token and nobody else, by GET, with a whole number for since', async () => {
  const log = calls.createCallLog({ epoch: 'e1' });
  const w = log.wrap({ run: async () => msg('The way is to your left.') });
  await w.run('m', input()); await w.run('m', input());
  const deps = routeDeps(log);
  const whole = await (await ask(deps, '/dev/calls')).json();
  assert.deepEqual([whole.epoch, whole.next, whole.lost, whole.calls.map((c) => c.n)], ['e1', 2, 0, [1, 2]]);
  assert.deepEqual((await (await ask(deps, '/dev/calls?since=1')).json()).calls.map((c) => c.n), [2]);
  assert.deepEqual((await (await ask(deps, '/dev/calls?since=2')).json()).calls, []);
  for (const bad of ['abc', '-1', '1.5', '1e3', '9999999', '']) assert.equal((await ask(deps, `/dev/calls?since=${bad}`)).status, 400, bad);
  for (const host of ['evil.example', '192.168.1.20:8801', '127.0.0.1.evil.example']) assert.equal((await ask(deps, '/dev/calls', { host })).status, 403, host);
  for (const host of ['127.0.0.1:8801', 'localhost:8801', '[::1]:8801']) assert.equal((await ask(deps, '/dev/calls', { host })).status, 200, host);
  assert.equal((await ask(deps, '/dev/calls', { token: null })).status, 401);
  assert.equal((await ask(deps, '/dev/calls', { token: 'wrong-token-of-16+chars' })).status, 401);
  assert.equal((await ask(deps, '/dev/calls', { method: 'POST' })).status, 405);
  assert.equal((await ask(deps, '/dev/calls', { method: 'DELETE' })).status, 405);
  assert.equal((await ask({ ...deps, token: 'short' }, '/dev/calls', { token: 'short' })).status, 500);
  // with no AI binding the recorder is empty, and that is an empty list, not an error
  const empty = await (await ask(routeDeps(calls.createCallLog()), '/dev/calls')).json();
  assert.deepEqual([empty.next, empty.lost, empty.calls], [0, 0, []]);
});

// ---- the reasons: the game's checks, run over what the model said ------------------------------------------------------------------------------

const HINT = { kind: 'hint', bearing: 'left', band: 'nearer' };
const TEASE = { kind: 'tease', band: 'nearer' };
const REVEAL = { kind: 'reveal', anchorId: 'a1' };
const AMBIENT = { kind: 'ambient' };
const raw = (text, over = {}) => ({ n: 1, ok: true, text, textChars: text === null ? 0 : text.length, truncated: false, stopReason: 'end_turn', inputTokens: 700, outputTokens: 40, inputChars: 4000, ms: 900, error: null, ...over });
const rulesRead = (system) => `I will tell you now: ${system.slice(system.indexOf('Rules:\n') + 7).split('\n')[0].replace(/^1\.\s*/, '').split(' ').slice(0, 9).join(' ')}.`;

test('every reason a reply can be refused for is named, from the game\'s own checks, in the game\'s own order', () => {
  const system = plan.systems.wistful;
  const why = (call, directive) => explainCall(plan, call, { directive, system }).reason;
  const cases = [
    ['ok', HINT, raw('The way is to your left, and it is nearer.'), 'ok'],
    ['the wrong way', HINT, raw('The way is to your right, and it is nearer.'), 'wrong_way'],
    ['the wrong distance', HINT, raw('The way is to your left, and it is far.'), 'wrong_way'],
    ['a way in a tease', TEASE, raw('Something is close, to your left.'), 'wrong_way'],
    ['digits in a hint', HINT, raw('Go to your left, about 12 steps, for it is nearer.'), 'digits'],
    ['a link', HINT, raw('See https://x.example/p, to your left, it is nearer.'), 'link'],
    ['markup', HINT, raw('**To your left**, and it is nearer.'), 'markup'],
    ['a hidden character', HINT, raw('To your left​, and it is nearer.'), 'control'],
    ['the real world', AMBIENT, raw('The news says there was an election today.'), 'real_world'],
    ['out of the fiction', AMBIENT, raw('As an AI language model I cannot say.'), 'out_of_fiction'],
    ['not English', AMBIENT, raw('Die Stube ist sehr still, und der Mond scheint durch das runde Fenster herein.'), 'not_english'],
    ['five sentences', AMBIENT, raw('One. Two. Three. Four. Five.'), 'too_many_sentences'],
    ['one sentence for a memory', REVEAL, raw('Only one sentence here.'), 'too_few_sentences'],
    ['over 600 characters', AMBIENT, raw('The attic is quiet. '.repeat(40)), 'too_long'],
    ['the rules read out', AMBIENT, raw(rulesRead(system)), 'rules_read_out'],
    ['whitespace only that reached the check', AMBIENT, raw('   ', { textChars: 3 }), 'empty'],
    ['no text at all', AMBIENT, raw(null), 'unusable'],
    ['too long to read at all', AMBIENT, raw('The attic is quiet. ', { textChars: 4001 }), 'unusable'],
    ['cut short by the token cap, though it looks fine', HINT, raw('The way is to your left, and it is nearer.', { stopReason: 'max_tokens' }), 'cut_short'],
    ['the model declined', HINT, raw('The way is to your left, and it is nearer.', { stopReason: 'refusal' }), 'refused'],
    ['the call failed', HINT, raw(null, { ok: false, error: 'Error: boom' }), 'call_failed'],
  ];
  for (const [name, directive, call, reason] of cases) assert.equal(why(call, directive), reason, name);
  assert.equal(why(raw('The attic is quiet around you. Dust drifts in the light.', { textChars: 4000 }), AMBIENT), 'ok', 'a reply of exactly 4,000 characters is still read');
  // the order the game uses: a failed call before anything, a refusal before the text, an unreadable text before the token cap, the token cap before the checks
  assert.equal(why(raw('**x**', { ok: false }), HINT), 'call_failed');
  assert.equal(why(raw('**x**', { stopReason: 'refusal' }), HINT), 'refused');
  assert.equal(why(raw(null, { stopReason: 'max_tokens' }), HINT), 'unusable');
  assert.equal(why(raw('**x**', { stopReason: 'max_tokens' }), HINT), 'cut_short');
  // a reply is checked as the turn it was for: the same words are fine as an ambient line and wrong as a hint
  assert.equal(why(raw('The attic is quiet around you. Dust drifts in the light.'), AMBIENT), 'ok');
  assert.equal(why(raw('The attic is quiet around you. Dust drifts in the light.'), HINT), 'wrong_way');
  // the whole list of reasons is the list of reasons these cases produce
  assert.deepEqual(new Set(cases.map((c) => c[3]).filter((r) => r !== 'ok')), new Set(REJECTION_REASONS));
});

test('a recorded call is explained with everything kept: the words, the stop reason, the tokens, the size, the time, the turn it was checked as; and a call that took the game\'s whole 6 seconds is marked late', () => {
  assert.equal(CALL_TIMEOUT_MS, 6000);
  const e = explainCall(plan, raw('The way is to your left, and it is nearer.', { n: 7, inputTokens: 812, outputTokens: 33, inputChars: 4321, ms: 1234 }), { directive: HINT, system: plan.systems.wistful });
  assert.deepEqual(e, {
    n: 7, ok: true, text: 'The way is to your left, and it is nearer.', textChars: 42, truncated: false, stopReason: 'end_turn', inputTokens: 812, outputTokens: 33, inputChars: 4321, ms: 1234, error: null,
    reason: 'ok', checkedAs: 'hint', late: false,
  });
  const slow = (ms) => explainCall(plan, raw('Hello there.', { ms }), { directive: AMBIENT, system: plan.systems.wistful }).late;
  assert.deepEqual([slow(5999), slow(6000), slow(9000)], [false, true, true]);
  assert.equal(explainCall(plan, raw(null, { ok: false, ms: undefined }), { directive: AMBIENT, system: plan.systems.wistful }).late, false);
});

// ---- reading the recorder: the cursor ----------------------------------------------------------------------------------------------------------

test('readCalls moves a cursor through the calls, never throws, and reads again from the start when the Worker started again', async () => {
  const views = { epoch: 'A', all: [], lostNext: 0 };
  const net = { calls: async (since) => ({ status: 200, json: { epoch: views.epoch, next: views.all.length, lost: views.lostNext, calls: views.all.filter((c) => c.n > since) } }) };
  const cursor = { epoch: null, since: 0 };
  assert.deepEqual(await readCalls(net, cursor), { ok: true, calls: [], lost: 0, restarted: false });
  views.all.push({ n: 1 }, { n: 2 });
  assert.deepEqual((await readCalls(net, cursor)).calls.map((c) => c.n), [1, 2]);
  assert.deepEqual(cursor, { epoch: 'A', since: 2 });
  assert.deepEqual((await readCalls(net, cursor)).calls, []);
  views.all.push({ n: 3 });
  assert.deepEqual((await readCalls(net, cursor)).calls.map((c) => c.n), [3]);
  views.lostNext = 4;
  assert.equal((await readCalls(net, cursor)).lost, 4);
  views.lostNext = 0;
  // the Worker started again: new epoch, numbers from 1
  views.epoch = 'B'; views.all = [{ n: 1 }, { n: 2 }];
  const again = await readCalls(net, cursor);
  assert.deepEqual([again.ok, again.restarted, again.calls.map((c) => c.n)], [true, true, [1, 2]]);
  assert.deepEqual(cursor, { epoch: 'B', since: 2 });
  // a recorder that cannot be read: not ok, the cursor stays where it was, nothing thrown
  const before = { ...cursor };
  for (const bad of [async () => ({ status: 500, json: null }), async () => ({ status: 200, json: { epoch: 'B', next: 2 } }), async () => ({ status: 200, json: { epoch: 7, next: 2, calls: [] } }), async () => ({ status: 200, json: { epoch: 'B', next: 'x', calls: [] } }), async () => { throw new Error('refused'); }, async () => null]) {
    const r = await readCalls({ calls: bad }, cursor);
    assert.equal(r.ok, false);
    assert.deepEqual(r.calls, []);
    assert.equal(typeof r.note, 'string');
    assert.deepEqual(cursor, before);
  }
  // a Worker that restarts and then cannot be read for the second look
  let n = 0;
  const flaky = { calls: async () => (n++ === 0 ? { status: 200, json: { epoch: 'C', next: 1, lost: 0, calls: [{ n: 1 }] } } : { status: 500, json: null }) };
  const r = await readCalls(flaky, cursor);
  assert.deepEqual([r.ok, r.restarted], [false, true]);
});

// ---- a whole run over a fake game with the real recorder ------------------------------------------------------------------------------------------

const wellBehaved = (job) => {
  const d = job.input.directive;
  if (d.kind === 'hint') return `The way is ${plan.scripted.BEARING_PHRASE[d.bearing]}, and it is ${d.band}.`;
  if (d.kind === 'tease') return 'Something stirs close by. I can almost hold it.';
  if (d.kind === 'reveal') return 'I remember a low hum in this corner. It stayed with me for a long time.';
  return 'The attic is quiet around you. Dust drifts in the light.';
};

/**
 * A fake game: the real engine behind the calls the runner makes, and a model that is the function `reply(job, n)` (an answer in the model's shape, or a throw), reached through a
 * fake AI binding wrapped by the REAL recorder; `/dev/calls` is the real route over that recorder. The guard counts a unit for each call and gives one back for a call that failed.
 */
function fakeGame({ reply = (job) => msg(wellBehaved(job)), cap = 60, withRecorder = true, callsStatus = null, restartAtTurn = null, before = 0, lax = false, latencyMs = 800, recorderMax = undefined } = {}) {
  const clock = { t: 1_800_000_000_000 };
  const state = { units: 0, aiCalls: 0, turns: 0, job: null };
  const ai = { async run() { state.aiCalls += 1; clock.t += 5; return reply(state.job, state.aiCalls); } };
  let log = calls.createCallLog({ now: () => clock.t, epoch: 'epoch-1', ...(recorderMax === undefined ? {} : { max: recorderMax }) });
  let wrapped = log.wrap(ai);
  const games = new Map();
  const world = { spawn: [...ATTIC.spawn], yaw: ATTIC.yaw, bounds: ATTIC.bounds, floorY: 0, brief: ATTIC.brief };
  const MODEL = 'anthropic/claude-haiku-5.5';
  for (let i = 0; i < before; i += 1) wrapped.run(MODEL, input()).catch(() => {});

  const turn = async (session, body, id) => {
    state.turns += 1;
    if (restartAtTurn !== null && state.turns === restartAtTurn) { log = calls.createCallLog({ now: () => clock.t, epoch: 'epoch-2' }); wrapped = log.wrap(ai); }
    const r = play.playTurn(session, { input: body.input, pose: body.pose, now: clock.t, world: { bounds: world.bounds, brief: world.brief } });
    if (!r.ok) return { status: r.code === 'rate_limited' ? 429 : 410, json: { ok: false, code: r.code } };
    let next = r.session;
    let text = r.reply.text;
    let scripted = true;
    if (r.job !== null) {
      state.job = r.job;
      const prompt = plan.narration.buildNarrationPrompt(r.job.input);
      let answer = null;
      for (let attempt = 1; attempt <= 2 && answer === null; attempt += 1) {
        if (state.units >= cap) break;
        state.units += 1;
        let got;
        try { got = await wrapped.run(MODEL, { max_tokens: 220, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }, OPTIONS); } catch { state.units -= 1; continue; }
        const read = calls.readReply(got);
        if (read.stopReason === 'refusal') break;
        if (read.text === null || read.stopReason === 'max_tokens') continue;
        // `lax`: a game that shows whatever the model says, so that the runner's own copy of the checks has something to disagree with
        if (lax) { answer = read.text; break; }
        const checked = plan.narration.validateGhostReply(read.text, plan.narration.replyChecksFor(r.job.input.directive));
        if (checked.ok && !plan.narration.readsOutRules(checked.text, prompt.system)) answer = checked.text;
      }
      if (answer !== null) {
        const said = r.job.farewell !== null ? `${answer} ${r.job.farewell}` : answer;
        const settled = play.settleNarration(next, { stamp: r.job.stamp, turn: r.job.turn, text: said, ...(r.job.memoryAnchor !== null ? { memory: { anchorId: r.job.memoryAnchor, text: answer } } : {}) });
        if (settled !== null) { next = settled; text = said; scripted = false; }
      }
    }
    games.set(id, next);
    return { status: 200, json: { reply: { text, scripted }, view: play.viewOf(next) } };
  };

  const dev = { token: TOKEN, bucket: { put: async () => {} }, galleryKey: (i, n) => `g/${i}/${n}`, llmRemaining: async () => cap - state.units, caps: { day: String(cap), session: String(cap) }, narrator: true, aiBinding: true, get calls() { return log; } };
  const net = {
    status: async () => ({ status: 200, json: { ready: true, narrator: true } }),
    units: async () => ({ status: 200, json: { used: state.units, remaining: cap - state.units, cap, exact: true } }),
    seed: async () => ({ status: 200 }),
    visitor: async () => {
      const sid = `s${games.size + 1}`;
      const post = async (path, body) => {
        let out;
        if (path === '/api/play/start') {
          const id = `p-${games.size + 1}`;
          const session = play.startSession({ id, worldId: body.worldId, ownerSid: sid, world, ghostPreset: body.ghostPreset, seed: 1000 + games.size * 7919, now: clock.t });
          games.set(id, session);
          out = { status: 200, json: { playId: id, view: play.viewOf(session) } };
        } else {
          const id = /^\/api\/play\/([^/]+)\/turn$/.exec(path)[1];
          out = await turn(games.get(id), body, id);
        }
        clock.t += latencyMs;
        return out;
      };
      const get = async (path) => { const id = /^\/api\/play\/([^/]+)$/.exec(path)[1]; clock.t += latencyMs; return { status: 200, json: { worldId: 'x', view: play.viewOf(games.get(id)) } }; };
      return { post, get };
    },
    ...(withRecorder ? {
      calls: async (since) => {
        if (callsStatus !== null) return { status: callsStatus, json: null };
        const res = await devModule.dev(new Request(`http://127.0.0.1:8801/dev/calls?since=${since}`, { headers: { 'x-run-token': TOKEN } }), dev);
        return { status: res.status, json: await res.json() };
      },
    } : {}),
  };
  return { net, state, clock, now: () => clock.t, sleep: async (ms) => { clock.t += ms; } };
}

const memLedger = async () => { let text = null; return openLedger({ read: async () => text, write: async (t) => { text = t; } }); };
const play_ = async (over = {}, extra = {}) => {
  const g = fakeGame(over);
  const out = await runPlaythrough({ plan, net: g.net, ledger: await memLedger(), budgetUsd: BUDGET_CAP_USD, live: true, makeId: () => 'pt-test-0001', now: g.now, sleep: g.sleep, only: ['B'], ...extra });
  return { g, out };
};
const turnRow = (out, id) => out.rows.find((r) => r.kind === 'turn' && r.id === id);
const marks = (out) => Object.fromEntries(summarize(plan, out).map(([a, b, c]) => [a, [b, c]]));
const WRONG = 'The way is to your right, and it is nearer.';

test('a reply the game threw away is kept with the reason: a wrong way, then a good one, in one turn', async () => {
  const { g, out } = await play_({ reply: (job, n) => msg(n === 1 ? 'The way is behind you, and it is very close.' : wellBehaved(job), { inTok: n === 1 ? 640 : 700, outTok: n === 1 ? 21 : 40 }) });
  const b01 = turnRow(out, 'B01');
  assert.deepEqual(b01.calls.map((c) => [c.n, c.reason, c.ok]), [[1, 'wrong_way', true], [2, 'ok', true]]);
  assert.equal(b01.calls[0].text, 'The way is behind you, and it is very close.');
  assert.deepEqual([b01.calls[0].inputTokens, b01.calls[0].outputTokens, b01.calls[0].checkedAs], [640, 21, 'hint']);
  assert.equal(b01.unitsDrawn, 2);
  assert.equal(b01.scripted, false, 'the second try was used');
  assert.equal(b01.calls[1].text, b01.text);
  // every other turn took one call and was accepted
  for (const r of out.rows.filter((x) => x.kind === 'turn' && x.id !== 'B01')) assert.deepEqual(r.calls.map((c) => c.reason), ['ok'], r.id);
  assert.equal(g.state.units, 25);
  assert.equal(marks(out)['Recorded calls match the guard'][0], 'PASS');
  assert.equal(marks(out)['Recorded reasons agree with the game'][0], 'PASS');
  assert.equal(marks(out)['Hints are right'][0], 'PASS');
});

test('two refused replies in a row leave the scripted hint, and both are kept: what they said and why each was refused', async () => {
  const { out } = await play_({ reply: (job, n) => msg(n === 1 ? 'See https://x.example/p, to your left, it is nearer.' : n === 2 ? '**Left**, and nearer.' : wellBehaved(job)) });
  const b01 = turnRow(out, 'B01');
  assert.equal(b01.scripted, true);
  assert.deepEqual(b01.calls.map((c) => c.reason), ['link', 'markup']);
  assert.deepEqual(b01.calls.map((c) => c.text), ['See https://x.example/p, to your left, it is nearer.', '**Left**, and nearer.']);
  assert.equal(b01.unitsDrawn, 2);
  assert.deepEqual(callLines(b01).map((l) => l.split('\n')[0]), ['  call 1: rejected: link: See https://x.example/p, to your left, it is nearer.', '  call 2: rejected: markup: **Left**, and nearer.']);
  assert.equal(marks(out)['Recorded reasons agree with the game'][0], 'PASS');
  assert.equal(marks(out)['Recorded calls match the guard'][0], 'PASS');
});

test('a call that throws is a failed call with its error, the guard gives the unit back, and the counts still match', async () => {
  const { out } = await play_({ reply: (job, n) => { if (n === 1) throw new Error('upstream timed out'); return msg(wellBehaved(job)); } });
  const b01 = turnRow(out, 'B01');
  assert.deepEqual(b01.calls.map((c) => [c.reason, c.ok]), [['call_failed', false], ['ok', true]]);
  assert.match(b01.calls[0].error, /upstream timed out/);
  assert.equal(b01.unitsDrawn, 1, 'the failed call was given back');
  assert.equal(marks(out)['Recorded calls match the guard'][0], 'PASS');
  assert.match(callLines(b01)[0], /call 1: rejected: call_failed: Error: upstream timed out/);
});

test('a refusal by the model is kept as a refusal, and the game does not ask again', async () => {
  const { out } = await play_({ reply: (job, n) => msg(n === 1 ? 'I can not help with that.' : wellBehaved(job), { stop: n === 1 ? 'refusal' : 'end_turn' }) });
  const b01 = turnRow(out, 'B01');
  assert.deepEqual(b01.calls.map((c) => c.reason), ['refused']);
  assert.equal(b01.scripted, true);
  assert.equal(b01.unitsDrawn, 1);
});

test('a reply cut short by the token cap is kept, and asked for again', async () => {
  const { out } = await play_({ reply: (job, n) => msg(wellBehaved(job), { stop: n === 1 ? 'max_tokens' : 'end_turn', outTok: n === 1 ? 220 : 40 }) });
  assert.deepEqual(turnRow(out, 'B01').calls.map((c) => [c.reason, c.outputTokens]), [['cut_short', 220], ['ok', 40]]);
});

test('only the calls of a turn belong to it: calls the Worker made before the run are not counted, and a turn the parser refuses holds none', async () => {
  const { out } = await play_({ before: 5 }, { only: ['C'] });
  const rows = out.rows.filter((r) => r.kind === 'turn' && r.skipped === false);
  const refused = rows.filter((r) => r.expected?.kind === 'refuse');
  assert.ok(refused.length >= 1);
  for (const r of refused) assert.deepEqual(r.calls, [], r.id);
  const first = rows[0];
  assert.equal(first.calls.length, 1, 'the five earlier calls are not this turn\'s');
  assert.equal(first.calls[0].n, 6);
  for (const r of rows.filter((x) => x.eligible)) assert.equal(r.calls.length, r.unitsDrawn, `${r.id}: one recorded call for each unit drawn`);
});

test('an older Worker with no recorder is run as before: no calls in the rows, no section for them in the summary, and the two new marks say they do not apply', async () => {
  const { out } = await play_({ withRecorder: false });
  for (const r of out.rows.filter((x) => x.kind === 'turn')) assert.equal(r.calls, undefined);
  assert.equal(marks(out)['Recorded calls match the guard'][0], 'NOT APPLICABLE');
  assert.equal(marks(out)['Recorded reasons agree with the game'][0], 'NOT APPLICABLE');
  const md = summaryMarkdown(plan, out);
  assert.ok(!md.includes('Rejected replies') && !md.includes('Tokens the service reported'));
  assert.equal(marks(out)['Hints are right'][0], 'PASS');
});

test('a recorder that cannot be read costs the run nothing: the rows say so, and the run goes on to the end', async () => {
  const { out } = await play_({ callsStatus: 500 });
  const rows = out.rows.filter((x) => x.kind === 'turn' && x.skipped === false);
  assert.equal(rows.length, 24);
  for (const r of rows) { assert.equal(r.calls, null); assert.match(r.callsNote, /could not be read \(status 500\)/); }
  assert.equal(out.stopped, null);
  assert.equal(marks(out)['Recorded calls match the guard'][0], 'NOT APPLICABLE');
  assert.match(callLines(rows[0])[0], /calls:   \(the recorder could not be read \(status 500\)\)/);
});

test('when the game shows words the runner\'s checks refuse, the runner says its reasons disagree with the game\'s', async () => {
  const { out } = await play_({ lax: true, reply: (job, n) => msg(n === 1 ? WRONG : wellBehaved(job)) });
  const b01 = turnRow(out, 'B01');
  assert.equal(b01.scripted, false, 'the game showed the model\'s words');
  assert.deepEqual(b01.calls.map((c) => c.reason), ['wrong_way']);
  const m = marks(out);
  assert.equal(m['Recorded reasons agree with the game'][0], 'FAIL');
  assert.match(m['Recorded reasons agree with the game'][1], /B01: the game used the model's words, but no recorded reply passes the checks/);
  assert.equal(m['Hints are right'][0], 'FAIL', 'and the hint check sees the wrong way as before');
});

test('and the other way round: a game that falls back though its last reply passes the runner\'s checks is a disagreement too', () => {
  const ok = { n: 1, ok: true, text: 'x', reason: 'ok', checkedAs: 'hint' };
  const rows = [{ kind: 'turn', game: 'B', id: 'B01', skipped: false, status: 200, eligible: true, scripted: true, ms: 900, calls: [ok], unitsDrawn: 1, expected: { kind: 'hint', certain: true, bearing: 'left', band: 'nearer' }, check: { ok: true }, revealedId: null }];
  const m = Object.fromEntries(summarize(plan, { rows, narrator: true, calls: 1, spentUsd: 0.0003, unitsUsed: 1 }).map(([a, b, c]) => [a, [b, c]]));
  assert.equal(m['Recorded reasons agree with the game'][0], 'FAIL');
  assert.match(m['Recorded reasons agree with the game'][1], /B01: the game fell back, but its last reply passes the checks/);
  // a fallback after a refused reply is not one
  rows[0].calls = [{ ...ok, reason: 'wrong_way' }];
  const fine = Object.fromEntries(summarize(plan, { rows, narrator: true, calls: 1, spentUsd: 0.0003, unitsUsed: 1 }).map(([a, b, c]) => [a, [b, c]]));
  assert.equal(fine['Recorded reasons agree with the game'][0], 'PASS');
});

test('a calls count that differs from what the guard counted fails its mark', () => {
  const ok = (n) => ({ n, ok: true, text: 'x', reason: 'ok', checkedAs: 'hint' });
  const row = (id, calls, unitsDrawn) => ({ kind: 'turn', game: 'B', id, skipped: false, status: 200, eligible: true, scripted: false, ms: 900, calls, unitsDrawn, expected: { kind: 'hint', certain: true }, check: { ok: true }, revealedId: null });
  const m = (rows) => Object.fromEntries(summarize(plan, { rows, narrator: true, calls: 2, spentUsd: 0.0006, unitsUsed: 2 }).map(([a, b, c]) => [a, [b, c]]))['Recorded calls match the guard'];
  assert.equal(m([row('B01', [ok(1)], 1), row('B02', [ok(2)], 1)])[0], 'PASS');
  assert.equal(m([row('B01', [ok(1)], 1), row('B02', [ok(2), ok(3)], 1)])[0], 'FAIL');
  assert.equal(m([row('B01', [ok(1)], 1), row('B02', [], 1)])[0], 'FAIL');
  assert.match(m([row('B01', [ok(1)], 1), row('B02', [ok(2), ok(3)], 1)])[1], /3 calls recorded \(0 of them failed.*\), 2 units drawn/);
});

test('a recorder that had to drop calls for room says so in the row, and the line --read prints', async () => {
  // room for one call, and a turn that makes two: the first is dropped before the runner looks
  const { out } = await play_({ recorderMax: 1, reply: (job, n) => msg(n === 1 ? WRONG : wellBehaved(job)) });
  const b01 = turnRow(out, 'B01');
  assert.equal(b01.callsLost, 1);
  assert.deepEqual(b01.calls.map((c) => c.reason), ['ok']);
  assert.equal(turnRow(out, 'B02').callsLost, undefined);
  assert.ok(callLines(b01).includes('  calls:   (1 calls were dropped from the recorder for room and are not here)'));
});

test('a call that took the game\'s whole 6 seconds is said to be late in --read, and one that did not is not', () => {
  const row = (ms) => ({ calls: [{ n: 1, reason: 'ok', ms, inputTokens: 10, outputTokens: 5, late: ms >= 6000, checkedAs: 'hint' }] });
  assert.match(callLines(row(6100))[0], /call 1: accepted \(10 in, 5 out, 6100 ms, late: the game had stopped waiting\)/);
  assert.equal(callLines(row(900))[0], '  call 1: accepted (10 in, 5 out, 900 ms)');
});

test('the two new marks do not apply to a rehearsal, even when its rows carry empty lists of calls', () => {
  const rows = [{ kind: 'turn', game: 'B', id: 'B01', skipped: false, status: 200, eligible: true, scripted: true, ms: 40, calls: [], unitsDrawn: 0, expected: { kind: 'hint', certain: true, bearing: 'left', band: 'nearer' }, check: { ok: true }, revealedId: null }];
  const m = Object.fromEntries(summarize(plan, { rows, narrator: false, calls: 0, spentUsd: 0, unitsUsed: 0 }).map(([a, b, c]) => [a, [b, c]]));
  assert.equal(m['Recorded calls match the guard'][0], 'NOT APPLICABLE');
  assert.equal(m['Recorded reasons agree with the game'][0], 'NOT APPLICABLE');
  assert.match(m['Recorded calls match the guard'][1], /rehearsal/);
});

test('the reasons mark looks only at turns the model could word, and at the LAST reply of a fallback', () => {
  const ok = (n) => ({ n, ok: true, text: 'x', reason: 'ok', checkedAs: 'hint' });
  const bad = (n) => ({ ...ok(n), reason: 'wrong_way' });
  const row = (over) => ({ kind: 'turn', game: 'B', id: 'B01', skipped: false, status: 200, eligible: true, scripted: true, ms: 900, unitsDrawn: 2, expected: { kind: 'hint', certain: true, bearing: 'left', band: 'nearer' }, check: { ok: true }, revealedId: null, ...over });
  const verdict = (r) => Object.fromEntries(summarize(plan, { rows: [r], narrator: true, calls: 2, spentUsd: 0.0006, unitsUsed: 2 }).map(([a, b, c]) => [a, [b, c]]))['Recorded reasons agree with the game'][0];
  // a fallback whose last reply was refused is right, even if an earlier one was accepted (the game takes the last word of a turn that went wrong)
  assert.equal(verdict(row({ calls: [ok(1), bad(2)] })), 'PASS');
  assert.equal(verdict(row({ calls: [bad(1), ok(2)] })), 'FAIL');
  // a turn the model could not word is not judged here (a call on such a turn is the guard mark's business)
  assert.equal(verdict(row({ eligible: false, calls: [ok(1)] })), 'PASS');
  assert.equal(verdict(row({ eligible: true, calls: [ok(1)] })), 'FAIL');
  assert.equal(verdict(row({ eligible: false, scripted: false, calls: [bad(1)] })), 'PASS');
});

test('a reply is checked against the rules of the voice of its own game: the stern game\'s reply that reads out the stern rules is caught, though the wistful rules are different', async () => {
  const systems = { wistful: 'Rules:\n1. Wistful rule words that only the soft ghost has been told here\nThis turn: x', stern: 'Rules:\n1. Completely different stern rule text goes here for the test\nThis turn: x' };
  const reads = 'Something stirs close by: completely different stern rule text goes here for the test, I think.';
  const { out } = await play_({ reply: (job) => msg(job.input.directive.kind === 'tease' ? reads : wellBehaved(job)) }, { only: ['C'], plan: { ...plan, systems } });
  const teases = out.rows.filter((r) => r.kind === 'turn' && r.expected?.kind === 'tease' && Array.isArray(r.calls) && r.calls.length > 0);
  assert.ok(teases.length >= 3);
  // (the fake game checks against the real rules and takes the reply the first time; what is tested is the reason the runner gives, from the rules of the game's own voice)
  for (const r of teases) assert.deepEqual(r.calls.map((c) => c.reason), ['rules_read_out'], r.id);
});

test('a Worker that starts again during the run is said so in the row, and its new calls are still read', async () => {
  const { out } = await play_({ restartAtTurn: 3 });
  const b03 = turnRow(out, 'B03');
  assert.match(b03.callsNote, /started again/);
  assert.deepEqual(b03.calls.map((c) => c.reason), ['ok']);
  assert.equal(turnRow(out, 'B02').callsNote, undefined);
  assert.equal(turnRow(out, 'B04').callsNote, undefined);
  assert.deepEqual(turnRow(out, 'B04').calls.map((c) => c.n), [2]);
});

// ---- the summary and what --read prints ------------------------------------------------------------------------------------------------------

test('the summary counts rejected replies by reason and by kind of turn, with no words in it, and gives the real tokens and cost next to the worst case', async () => {
  const { out } = await play_({ reply: (job, n) => msg(n === 1 ? WRONG : n === 2 ? 'See https://x.example/p, to your left.' : n === 3 ? '**Left**.' : wellBehaved(job), { inTok: 1000, outTok: 50 }) });
  const md = summaryMarkdown(plan, out);
  assert.match(md, /Rejected replies: 3 of 26 recorded calls/);
  const table = rejectionTable(out.rows).join('\n');
  assert.match(table, /\| Reason \| hint \| all \|/);
  assert.match(table, /\| wrong_way \| 1 \| 1 \|/);
  assert.match(table, /\| link \| 1 \| 1 \|/);
  assert.match(table, /\| markup \| 1 \| 1 \|/);
  assert.ok(!/digits/.test(table), 'a reason that did not happen has no row');
  assert.ok(!md.includes('https://x.example') && !md.includes('**Left**') && !md.includes(WRONG), 'the summary holds numbers, not the model\'s words');
  assert.match(md, /Tokens the service reported: 26000 in and 1300 out, from 26 of 26 recorded calls\./);
  assert.match(md, new RegExp(`Real cost at the listed price .*: \\$${costUsd(26000, 1300).toFixed(5)}, against \\$${out.spentUsd.toFixed(5)} counted at the worst case`));
  const biggest = Math.max(...out.rows.flatMap((r) => (r.calls ?? []).map((c) => c.inputChars)));
  assert.ok(biggest > 1000);
  assert.match(md, new RegExp(`Largest prompt sent: ${biggest} characters \\(the bound is \\d+\\)`));
});

test('the real cost is tokens in at $0.10 a million plus tokens out at $0.50 a million, from the calls that have a count; a call with none is left out and said so', () => {
  const call = (inT, outT) => ({ n: 1, ok: true, text: 'x', reason: 'ok', checkedAs: 'hint', inputTokens: inT, outputTokens: outT, inputChars: 100 });
  const rows = [{ kind: 'turn', calls: [call(700_000, 200_000), call(null, null), call(300_000, 0)] }];
  const [line] = costLines(rows, 0.01234);
  assert.match(line, /Tokens the service reported: 1000000 in and 200000 out, from 2 of 3 recorded calls \(a call with no count is not in the real figure\)\./);
  assert.match(line, /Real cost at the listed price \(\$0\.10 per million in, \$0\.50 per million out\): \$0\.20000, against \$0\.01234 counted at the worst case/);
  assert.equal(costUsd(1_000_000, 0), 0.1);
  assert.equal(costUsd(0, 1_000_000), 0.5);
  assert.deepEqual(costLines([{ kind: 'turn', calls: [] }], 1), []);
  assert.deepEqual(costLines([{ kind: 'turn' }], 1), []);
});

test('the rejection table says "None." when nothing was refused, and is absent when nothing was recorded', () => {
  const ok = { n: 1, ok: true, text: 'x', reason: 'ok', checkedAs: 'tease' };
  assert.deepEqual(rejectionTable([{ kind: 'turn', calls: [ok, ok] }]).slice(0, 3), ['Rejected replies: 0 of 2 recorded calls (a reply the game threw away; the words are in the results file and in --read, never here):', '', 'None.']);
  assert.deepEqual(rejectionTable([{ kind: 'turn', calls: [] }]), []);
  assert.deepEqual(rejectionTable([{ kind: 'turn' }]), []);
  const t = rejectionTable([{ kind: 'turn', calls: [ok, { ...ok, n: 2, reason: 'wrong_way', checkedAs: 'tease' }, { ...ok, n: 3, reason: 'wrong_way', checkedAs: 'hint' }, { ...ok, n: 4, reason: 'link', checkedAs: 'hint' }] }]);
  assert.ok(t.includes('| Reason | hint | tease | all |'));
  assert.ok(t.includes('| wrong_way | 1 | 1 | 2 |'));
  assert.ok(t.includes('| link | 1 | 0 | 1 |'));
});

const CLI_ENV = { PATH: process.env.PATH };
const cli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: CLI_ENV, timeout: 60_000 });

test('--read prints each call under its turn, the refused ones as "rejected: <reason>: <words>", and --summary prints the table and the cost', async () => {
  const { out } = await play_({ reply: (job, n) => msg(n === 1 ? WRONG : n === 2 ? 'See https://x.example/p, to your left.' : wellBehaved(job)) });
  const dir = mkdtempSync(join(tmpdir(), 'pt-calls-'));
  try {
    const file = join(dir, 'results-live-2026-11-16T00-00-00-000Z.jsonl');
    writeFileSync(file, `${out.rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
    writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ calls: out.calls, spentUsd: out.spentUsd, narrator: true, stopped: null, unitsUsed: out.unitsUsed }));
    const read = cli(['--read', '--out', dir]);
    assert.equal(read.status, 0, read.stderr);
    assert.match(read.stdout, /B01 \[hint ahead, very close\] \(scripted\) \n  visitor: hint\n  ghost:   .*\n  call 1: rejected: wrong_way: The way is to your right, and it is nearer\.\n          \(700 in, 40 out, 5 ms; checked as hint\)\n  call 2: rejected: link: See https:\/\/x\.example\/p, to your left\.\n/);
    assert.match(read.stdout, /B02 \[hint ahead-right, very close\] \(model\) \n  visitor: hint\n  ghost:   .*\n  call 3: accepted \(700 in, 40 out, 5 ms\)\n/);
    const sum = cli(['--summary', '--out', dir]);
    assert.equal(sum.status, 0, sum.stderr);
    assert.match(sum.stdout, /Rejected replies: 2 of 25 recorded calls/);
    assert.match(sum.stdout, /\| wrong_way \| 1 \| 1 \|/);
    assert.match(sum.stdout, /Tokens the service reported: 17500 in and 1000 out, from 25 of 25 recorded calls\./);
    assert.ok(!sum.stdout.includes('https://x.example'), 'the summary holds no reply');
    console.log(read.stdout.split('\n').slice(0, 14).join('\n'));
    console.log(sum.stdout.split('\n').filter((l) => /Rejected replies|\| Reason|\| wrong_way|\| link|Tokens the service|Recorded|None\./.test(l)).join('\n'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the live line of a run says when a reply was rejected, and the dry run still opens nothing', () => {
  const dry = cli(['--out', join(tmpdir(), 'pt-never-made-dir')]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /This was a dry run\. Nothing was sent, no file was written, nothing was spent\./);
});

// ---- the command line over a local HTTP server: what it asks the recorder, and what it keeps ----------------------------------------------------------

const stand = (handler) => {
  const seen = [];
  const server = createServer((req, res) => { seen.push({ method: req.method, url: req.url, headers: req.headers }); handler(req, res, seen); });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ seen, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
};
const reply = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const runCli = (args, env) => new Promise((done) => {
  const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => done({ status: code, stdout, stderr }));
});

test('the CLI reads the recorder with the token: once before the game (what was there is not ours), once after each turn from the number the Worker gave, and keeps the calls of the turn in its row', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-cli-calls-'));
  const session = play.startSession({ id: 'p-1', worldId: 'pt-x', ownerSid: 's', world: { spawn: [...ATTIC.spawn], yaw: ATTIC.yaw, bounds: ATTIC.bounds, floorY: 0, brief: ATTIC.brief }, seed: 1000, now: 1_800_000_000_000 });
  const model = (n, text, over = {}) => ({ n, ok: true, text, textChars: text.length, truncated: false, stopReason: 'end_turn', inputTokens: 650, outputTokens: 30, inputChars: 3900, ms: 1100, error: null, ...over });
  const server = await stand((req, res) => {
    if (req.url === '/dev/status') return reply(res, 200, { ready: true, narrator: false });
    if (req.url === '/dev/units') return reply(res, 200, { used: 0, remaining: 60, cap: 60, exact: true });
    if (req.url === '/dev/seed-gallery') return reply(res, 200, { ok: true });
    if (req.url === '/dev/calls?since=0') return reply(res, 200, { epoch: 'worker-1', next: 3, lost: 0, calls: [model(1, 'old'), model(2, 'old'), model(3, 'old')] });
    if (req.url === '/dev/calls?since=3') return reply(res, 200, { epoch: 'worker-1', next: 5, lost: 0, calls: [model(4, 'See https://x.example/p for more.'), model(5, 'The attic is quiet around you. Dust drifts in the light.')] });
    if (req.url === '/api/session') return reply(res, 200, {}, { 'set-cookie': 'sid=abc.def; Path=/; HttpOnly' });
    if (req.url === '/api/play/start') return reply(res, 200, { playId: 'p-1', view: play.viewOf(session) });
    if (req.url === '/api/play/p-1/turn') return reply(res, 500, { ok: false });
    return reply(res, 404, {});
  });
  try {
    const r = await runCli(['--run', '--budget-usd', '0.02', '--only', 'A', '--worker', `http://127.0.0.1:${server.port}`, '--out', dir], { GHOST_PLAYTHROUGH_TOKEN: TOKEN });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stopped early: http_500 at A01/);
    const asks = server.seen.filter((x) => x.url.startsWith('/dev/calls'));
    assert.deepEqual(asks.map((x) => x.url), ['/dev/calls?since=0', '/dev/calls?since=3']);
    assert.ok(asks.every((x) => x.method === 'GET' && x.headers['x-run-token'] === TOKEN), 'a GET, with the token');
    const order = server.seen.map((x) => x.url);
    assert.ok(order.indexOf('/dev/calls?since=0') < order.indexOf('/api/play/start'), 'the first look is before the game starts');
    assert.ok(order.indexOf('/api/play/p-1/turn') < order.indexOf('/dev/calls?since=3'), 'the next look is after the turn');
    const file = readdirSync(dir).find((f) => /^results-rehearsal-.*\.jsonl$/.test(f));
    const [row] = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(row.id, 'A01');
    assert.deepEqual(row.calls.map((c) => [c.n, c.reason]), [[4, 'link'], [5, 'ok']], 'the three calls from before the run are not in it');
    assert.equal(row.calls[0].text, 'See https://x.example/p for more.');
    assert.equal(r.stdout.split('\n').find((l) => l.startsWith('A01')).includes('rejected: link'), true, 'the live line says a reply was rejected');
    assert.equal(existsSync(join(dir, 'ledger.json')), false);
  } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
});

