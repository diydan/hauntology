// The Pippa play-through page. Everything that decides WHAT is said lives in lib.mjs (tested); this file is only the screen and the sound.
import { DEFAULTS, NICKS, ZONES, partySteps, pickLine, readingMs, resolve, wanderSteps } from '/lib.mjs';

const $ = (id) => document.getElementById(id);
const seq = await (await fetch('/sequence.json', { cache: 'no-store' })).json();
const ctx = { ...DEFAULTS };
const audio = new Audio();
audio.preload = 'auto';
let recent = [];
let run = 0; // bumped by Stop; every wait and every line checks it

const fill = (select, values, current) => {
  select.replaceChildren(...values.map((v) => { const o = document.createElement('option'); o.value = o.textContent = v; return o; }));
  select.value = current;
};
const bindCtx = (id, key) => $(id).addEventListener('change', (e) => { ctx[key] = e.target.value; });
for (const [id, key, values] of [['weather', 'weather', seq.finite.weather], ['time', 'time', seq.finite.time], ['moon', 'moon', seq.finite.moon], ['bearing', 'bearing', seq.finite.bearing], ['band', 'band', seq.finite.band], ['nick', 'nick', NICKS], ['zone', 'zone', ZONES]]) {
  fill($(id), values, ctx[key]);
  bindCtx(id, key);
}

const sleep = (ms, token) => new Promise((res) => { const t = setTimeout(res, ms); const poll = setInterval(() => { if (token !== run) { clearTimeout(t); clearInterval(poll); res(); } }, 100); setTimeout(() => clearInterval(poll), ms + 200); });
const playFile = (file, token) => new Promise((res, rej) => {
  audio.onended = () => res();
  audio.onerror = () => rej(new Error('the audio file could not be played'));
  audio.src = `/audio/${file}.mp3`;
  audio.volume = Number($('vol').value);
  audio.play().catch(rej);
  const poll = setInterval(() => { if (token !== run) { audio.pause(); clearInterval(poll); res(); } else if (audio.ended) clearInterval(poll); }, 100);
  audio.addEventListener('ended', () => clearInterval(poll), { once: true });
});

function show({ r, scene }) {
  const keeper = r.speaker === 'keeper';
  $('scene').textContent = scene ?? '';
  $('who').textContent = keeper ? 'The Keeper (text only: not voiced yet)' : r.voiced ? 'The Whisper (Pippa)' : 'The Whisper (text only)';
  $('who').className = `who${keeper ? ' keeper' : ''}`;
  $('orb').className = `orb${keeper ? ' keeper' : ''}`;
  $('sub').replaceChildren(document.createTextNode(r.voiced ? r.spoken : r.text));
  $('note').className = 'note';
  $('note').textContent = r.missing ? 'This line should have audio but the file is missing.' : '';
  if (r.missing) $('note').className = 'note warn';
}

function logLine(r) {
  const d = document.createElement('div');
  const id = document.createElement('span'); id.className = 'id'; id.textContent = `${r.id}  `;
  const who = document.createElement('span'); who.className = r.speaker === 'keeper' ? 'k' : 'w'; who.textContent = r.speaker === 'keeper' ? 'Keeper: ' : r.voiced ? 'Pippa: ' : 'Whisper (text): ';
  d.append(id, who, document.createTextNode(r.text));
  $('log').prepend(d);
}

/** Say one line of `kind` in the voice `suffix` (soft is the Whisper, dry the Keeper), in the current context. */
async function say(kind, suffix, scene, token = run, over = {}) {
  const line = pickLine(seq, kind, suffix, { recent });
  if (!line) { $('note').className = 'note warn'; $('note').textContent = `No line of kind ${kind} for this voice.`; return; }
  recent = [...recent, line.id].slice(-6);
  const r = resolve(line, { ...ctx, ...over });
  show({ r, scene });
  logLine(r);
  const dark = kind === 'haunt.blackout';
  if (dark) $('stage').classList.add('blackout');
  if (r.voiced) {
    $('orb').classList.add('speaking');
    try { await playFile(r.file, token); } catch (e) { $('note').className = 'note warn'; $('note').textContent = String(e.message ?? e); }
    $('orb').classList.remove('speaking');
    if (token === run && r.tail) { const t = document.createElement('span'); t.className = 'tail'; t.textContent = ` ${r.tail}`; $('sub').append(t); $('note').textContent = 'The part in italics is shown, never spoken.'; }
  } else {
    $('sub').textContent = r.text;
    await sleep(readingMs(r.text), token);
  }
  if (dark) { await sleep(1200, token); $('stage').classList.remove('blackout'); }
}

async function session(steps) {
  const token = ++run;
  recent = [];
  for (const [i, s] of steps.entries()) {
    if (token !== run) return;
    Object.assign(ctx, s.ctx);
    for (const id of ['weather', 'time', 'moon', 'bearing', 'band', 'nick', 'zone']) if ($(id).value !== String(ctx[id])) $(id).value = ctx[id];
    await say(s.kind, s.suffix, `${i + 1} of ${steps.length}: ${s.label}`, token);
    await sleep(Number($('pause').value) * 1000, token);
  }
  if (token === run) { $('scene').textContent = 'The session is over.'; $('orb').className = 'orb'; }
}

const pad = (parent, label, kind, suffix, keeper = false) => {
  const b = document.createElement('button');
  b.textContent = label;
  if (keeper) b.className = 'keeper';
  b.addEventListener('click', () => { run += 1; say(kind, suffix, label, run); });
  parent.append(b);
};
for (const [label, kind] of [['Meet', 'meet'], ['Ambient', 'ambient'], ['Tease', 'tease'], ['Hint', 'hint'], ['Memory found', 'reveal'], ['Go back (echo)', 'echo'], ['Odd question', 'refuse'], ['Ending', 'ending']]) pad($('wanderPads'), label, kind, 'soft');
for (const [label, kind] of [['Cold place', 'haunt.cold-spot'], ['Blackout', 'haunt.blackout'], ['Restless', 'haunt.restless'], ['Settles', 'haunt.lull'], ['Haunt rises (text)', 'haunt.rise'], ['Joins the haunting', 'poltergeist'], ['Midnight', 'midnight'], ['Haunting wins', 'end.haunting']]) pad($('whisperPads'), label, kind, 'soft');
for (const [label, kind] of [['Hour begins', 'turn-start'], ['Time warning', 'time-warning'], ['Theory offered', 'suggest'], ['Card shown', 'shown'], ['Nobody answers', 'none-shown'], ['Accusation sealed', 'seal'], ['Opened', 'accuse.reveal'], ['Wrong accusation', 'accuse.wrong']]) pad($('keeperPads'), label, kind, 'dry', true);

$('runWander').addEventListener('click', () => session(wanderSteps({ ...ctx })));
$('runParty').addEventListener('click', () => session(partySteps({ ...ctx })));
$('stop').addEventListener('click', () => { run += 1; audio.pause(); $('orb').className = 'orb'; $('stage').classList.remove('blackout'); $('scene').textContent = 'Stopped.'; });
$('pause').addEventListener('input', (e) => { $('pauseV').textContent = `${e.target.value} s`; });
$('vol').addEventListener('input', (e) => { audio.volume = Number(e.target.value); });
const tab = (on) => { $('wander').hidden = on !== 'wander'; $('party').hidden = on !== 'party'; $('tabWander').className = on === 'wander' ? 'on' : ''; $('tabParty').className = on === 'party' ? 'on' : ''; };
$('tabWander').addEventListener('click', () => tab('wander'));
$('tabParty').addEventListener('click', () => tab('party'));

const voiced = seq.lines.filter((l) => l.spoken);
const variants = voiced.flatMap((l) => l.variants);
$('status').replaceChildren(document.createTextNode(`${voiced.length} voiced lines · ${variants.filter((v) => v.present).length} of ${variants.length} line variants have audio · ${seq.holes.length} holes in the Library`));
