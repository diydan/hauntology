// The play-through page. Everything that decides WHAT is said, by whom and with which clip lives in lib.mjs (tested); this file is only the
// screen and the sound.
import { CHARACTERS, DEFAULTS, DEMO_ONLY, NICKS, SUSPECT_IDS, ZONES, avatarOf, clipKey, lineById, partySteps, pickLine, readingMs, resolve, suspectCtx, wanderSteps } from '/lib.mjs';

const $ = (id) => document.getElementById(id);
const seq = await (await fetch('/sequence.json', { cache: 'no-store' })).json();
const ctx = { ...DEFAULTS, ...suspectCtx('thorne') };
const audio = new Audio();
audio.preload = 'auto';
const video = $('clip');
let recent = [];
let run = 0; // bumped by Stop; every wait and every line checks it

const fill = (select, values, current) => {
  select.replaceChildren(...values.map((v) => { const o = document.createElement('option'); o.value = v.value ?? v; o.textContent = v.label ?? v; return o; }));
  select.value = current;
};
for (const [id, key, values] of [['weather', 'weather', seq.finite.weather], ['time', 'time', seq.finite.time], ['moon', 'moon', seq.finite.moon], ['bearing', 'bearing', seq.finite.bearing], ['band', 'band', seq.finite.band], ['nick', 'nick', NICKS], ['zone', 'zone', ZONES]]) {
  fill($(id), values, ctx[key]);
  $(id).addEventListener('change', (e) => { ctx[key] = e.target.value; });
}
fill($('suspect'), SUSPECT_IDS.map((id) => ({ value: id, label: `${CHARACTERS[id].name} (${CHARACTERS[id].voice})` })), ctx.suspect);
$('suspect').addEventListener('change', (e) => Object.assign(ctx, suspectCtx(e.target.value)));

const sleep = (ms, token) => new Promise((res) => { const t = setTimeout(res, ms); const poll = setInterval(() => { if (token !== run) { clearTimeout(t); clearInterval(poll); res(); } }, 100); setTimeout(() => clearInterval(poll), ms + 200); });

/**
 * Play a media element (audio or video) to its end, or until Stop or another line starts. The element is shared, so a line that was
 * replaced must never pause the element again: only the newest play on it may (`mine === mediaSeq`).
 */
let mediaSeq = 0;
const playMedia = (el, token) => new Promise((res, rej) => {
  const mine = ++mediaSeq;
  el.onended = () => res();
  el.onerror = () => rej(new Error('the file could not be played'));
  el.volume = Number($('vol').value);
  el.play().catch(rej);
  const poll = setInterval(() => { if (token !== run) { if (mine === mediaSeq) el.pause(); clearInterval(poll); res(); } else if (el.ended) clearInterval(poll); }, 100);
  el.addEventListener('ended', () => clearInterval(poll), { once: true });
});

const speakerName = (r, id) => {
  if (r.speaker === 'whisper') return r.voiced ? 'The Whisper (Pippa)' : 'The Whisper (text only)';
  if (r.speaker === 'keeper') return r.voiced ? 'Mr. Ashby, the Keeper (Ronald)' : 'Mr. Ashby, the Keeper (text only)';
  const c = CHARACTERS[id];
  return c ? `${c.name} (${c.voice}${r.voiced ? '' : ', text only'})` : 'The Lodger';
};

/** Put a character on the stage: the still portrait if the file is there, else the orb. */
function showAvatar(id, kind) {
  const present = id && seq.characters[id]?.present;
  const img = $('avatar');
  video.hidden = true;
  $('clipnote').hidden = true;
  if (present) { img.src = `/avatar/${id}.webp`; img.alt = CHARACTERS[id].name; img.hidden = false; $('orb').hidden = true; } else { img.hidden = true; $('orb').hidden = false; }
  $('portrait').className = `portrait ${kind}`;
}
const speaking = (on) => { $('portrait').classList.toggle('speaking', on); $('orb').classList.toggle('speaking', on); };

function logLine(r, id) {
  const d = document.createElement('div');
  const idEl = document.createElement('span'); idEl.className = 'id'; idEl.textContent = `${r.id}  `;
  const who = document.createElement('span'); who.className = r.speaker === 'whisper' ? 'w' : 'k'; who.textContent = `${CHARACTERS[id]?.name ?? r.speaker}: `;
  d.append(idEl, who, document.createTextNode(r.text));
  $('log').prepend(d);
}

/** Show one resolved line and play it: the lip-synced clip if it has one and clips are on, else the portrait and the Library audio. */
async function present({ r, id, kind, scene, clipName, token, dark }) {
  $('scene').textContent = scene ?? '';
  $('who').textContent = speakerName(r, id);
  $('who').className = `who${kind === 'keeper' ? ' keeper' : ''}`;
  $('note').className = r.missing ? 'note warn' : 'note';
  $('note').textContent = r.missing ? 'This line should have audio but the file is missing.' : '';
  $('stage').classList.toggle('blackout', Boolean(dark));
  showAvatar(id, kind);
  logLine(r, id);

  if (clipName) {
    $('sub').textContent = r.text;
    $('avatar').hidden = true; $('orb').hidden = true;
    video.src = `/clip/${clipName}.mp4`; video.hidden = false; $('clipnote').hidden = false;
    speaking(true);
    try { await playMedia(video, token); } catch (e) { $('note').className = 'note warn'; $('note').textContent = String(e.message ?? e); }
    if (token === run) speaking(false);
    if (token === run) { $('note').textContent = 'A lip-synced clip: a separate render of this line, so it sounds a little different from the Library audio.'; showAvatar(id, kind); }
  } else if (r.voiced) {
    $('sub').replaceChildren(document.createTextNode(r.spoken));
    audio.src = `/audio/${r.file}.mp3`;
    speaking(true);
    try { await playMedia(audio, token); } catch (e) { $('note').className = 'note warn'; $('note').textContent = String(e.message ?? e); }
    if (token === run) speaking(false);
    if (token === run && r.tail) { const t = document.createElement('span'); t.className = 'tail'; t.textContent = ` ${r.tail}`; $('sub').append(t); $('note').textContent = 'The part in italics is shown, never spoken.'; }
  } else {
    $('sub').textContent = r.text;
    await sleep(readingMs(r.text), token);
  }
  if (dark) { await sleep(1200, token); if (token === run) $('stage').classList.remove('blackout'); }
}

const kindOf = (speaker) => (speaker === 'whisper' ? 'whisper' : speaker === 'keeper' ? 'keeper' : 'suspect');

/** Say one line of `kind` in the voice `suffix` (soft the Whisper, dry the Keeper, lodger a Suspect), or the line `forceId`. */
async function say(kind, suffix, scene, token = run, over = {}, forceId = null) {
  const line = forceId ? lineById(seq, forceId) : pickLine(seq, kind, suffix, { recent });
  if (!line) { $('note').className = 'note warn'; $('note').textContent = `No line of kind ${kind} for this voice.`; return; }
  recent = [...recent, line.id].slice(-6);
  const c = { ...ctx, ...over };
  const r = resolve(line, c);
  const clip = $('useClips').checked && r.voiced ? seq.clips[clipKey(line.id, c.suspect)] : null;
  await present({ r, id: avatarOf(r.speaker, c), kind: kindOf(r.speaker), scene, clipName: clip?.present ? clip.name : null, token, dark: kind === 'haunt.blackout' });
}

/** A clip made for the demo video: it is in no bank, so it only plays as a clip. */
async function sayDemoOnly(d, token = run) {
  const speaker = d.suffix === 'soft' ? 'whisper' : 'keeper';
  const clip = seq.demoOnly.find((x) => x.id === d.id);
  const r = { id: d.id, kind: d.id, speaker, text: d.text, spoken: d.text, tail: '', file: null, voiced: true, missing: false };
  await present({ r, id: avatarOf(speaker, ctx), kind: kindOf(speaker), scene: d.label, clipName: clip?.present ? clip.clip : null, token });
}

async function session(steps) {
  const token = ++run;
  recent = [];
  for (const [i, s] of steps.entries()) {
    if (token !== run) return;
    Object.assign(ctx, s.ctx);
    for (const id of ['weather', 'time', 'moon', 'bearing', 'band', 'nick', 'zone', 'suspect']) if ($(id).value !== String(ctx[id])) $(id).value = ctx[id];
    await say(s.kind, s.suffix, `${i + 1} of ${steps.length}: ${s.label}`, token, {}, s.forceId ?? null);
    await sleep(Number($('pause').value) * 1000, token);
  }
  if (token === run) { $('scene').textContent = 'The session is over.'; speaking(false); }
}

const pad = (parent, label, run_) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => { run += 1; run_(run); });
  parent.append(b);
  return b;
};
for (const [label, kind] of [['Meet', 'meet'], ['Ambient', 'ambient'], ['Tease', 'tease'], ['Hint', 'hint'], ['Memory found', 'reveal'], ['Go back (echo)', 'echo'], ['Odd question', 'refuse'], ['Ending', 'ending']]) pad($('wanderPads'), label, (t) => say(kind, $('persona').value, label, t));
for (const [label, kind] of [['Cold place', 'haunt.cold-spot'], ['Blackout', 'haunt.blackout'], ['Restless', 'haunt.restless'], ['Settles', 'haunt.lull'], ['Haunt rises (text)', 'haunt.rise'], ['Joins the haunting', 'poltergeist'], ['Midnight', 'midnight'], ['Haunting wins', 'end.haunting']]) pad($('whisperPads'), label, (t) => say(kind, 'soft', label, t));
for (const [label, kind] of [['Hour begins', 'turn-start'], ['Time warning', 'time-warning'], ['Theory offered', 'suggest'], ['Card shown', 'shown'], ['Nobody answers', 'none-shown'], ['Accusation sealed', 'seal'], ['Opened', 'accuse.reveal'], ['Wrong accusation', 'accuse.wrong'], ['Right accusation', 'accuse.right'], ['Case closed', 'end.solved']]) pad($('keeperPads'), label, (t) => say(kind, 'dry', label, t));
pad($('suspectPads'), 'Named (text only)', (t) => say('aside', 'lodger', 'Named in a theory', t));
pad($('suspectPads'), 'Stalls', (t) => say('stall', 'lodger', 'Accused', t));
pad($('suspectPads'), 'Confesses', (t) => say('confession', 'lodger', 'Confesses', t));
pad($('suspectPads'), 'Confesses (their clip)', (t) => say('confession', 'lodger', 'Confesses (their own clip)', t, {}, CHARACTERS[ctx.suspect].confession));
for (const d of DEMO_ONLY) pad($('demoPads'), d.label, (t) => sayDemoOnly(d, t));

$('runWander').addEventListener('click', () => session(wanderSteps({ ...ctx }, $('persona').value)));
$('runParty').addEventListener('click', () => session(partySteps({ ...ctx }, 'haunted')));
$('runSolved').addEventListener('click', () => session(partySteps({ ...ctx }, 'solved')));
$('stop').addEventListener('click', () => { run += 1; audio.pause(); video.pause(); speaking(false); $('stage').classList.remove('blackout'); $('scene').textContent = 'Stopped.'; });
$('pause').addEventListener('input', (e) => { $('pauseV').textContent = `${e.target.value} s`; });
$('vol').addEventListener('input', (e) => { audio.volume = video.volume = Number(e.target.value); });
const tab = (on) => { $('wander').hidden = on !== 'wander'; $('party').hidden = on !== 'party'; $('tabWander').className = on === 'wander' ? 'on' : ''; $('tabParty').className = on === 'party' ? 'on' : ''; };
$('tabWander').addEventListener('click', () => tab('wander'));
$('tabParty').addEventListener('click', () => tab('party'));

showAvatar('whisper', 'whisper');
const voiced = seq.lines.filter((l) => l.spoken);
const variants = voiced.flatMap((l) => l.variants);
const portraits = Object.values(seq.characters).filter((c) => c.present).length;
const clips = [...Object.values(seq.clips), ...seq.demoOnly].filter((c) => c.present).length;
$('status').replaceChildren(document.createTextNode(`${voiced.length} voiced lines · ${variants.filter((v) => v.present).length} of ${variants.length} line variants have audio · ${seq.holes.length} holes in the Library · ${portraits} of ${Object.keys(seq.characters).length} portraits · ${clips} of ${Object.keys(seq.clips).length + seq.demoOnly.length} clips`));
