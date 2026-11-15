// The play-through page. Everything that decides WHAT is said, by whom, with which clip, and what the HUD shows lives in lib.mjs (tested);
// this file is the screen and the sound: the stage, the transport (pause, back, next, stop), the scene strip, the HUD, the keyboard.
import {
  CHARACTERS, DEFAULTS, DEMO_ONLY, HAUNT_EVENTS, HAUNT_MAX, MEMORIES, NICKS, SUSPECT_IDS, ZONES,
  avatarOf, bandLevel, clipKey, compassAngle, hudAfter, hudAnnouncement, hudDelta, hudReduce, initialHud, lineById, partySteps, pickLine, readingMs, resolve,
  revealFraction, sceneLabel, splitWords, suspectCtx, upNextLabel, wanderSteps, wordsShown,
} from '/lib.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const svgNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** The title card says what is happening while the Library loads, and what went wrong if it cannot. */
const introButtons = ['introWander', 'introParty', 'introSolved', 'introExplore'].map($);
let seq;
try {
  const res = await fetch('/sequence.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  seq = await res.json();
} catch (e) {
  $('introStatus').classList.add('is-bad');
  $('introStatus').textContent = `The Library could not be loaded (${e.message}). Is \`pnpm voice-demo\` still running? Reload to try again.`;
  throw e;
}
const ctx = { ...DEFAULTS, ...suspectCtx('thorne') };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const audio = new Audio();
audio.preload = 'auto';
const video = $('clip');

let recent = [];
let run = 0; // bumped by Stop, or by starting something new: everything older ends
let skips = 0; // bumped by Next: the current wait ends and the story goes on
let paused = false;
let muted = false;
let busy = false; // a line is on stage
let presentSeq = 0;
let session = null; // { steps, index, goto }
let mode = 'wander';
let hud = initialHud();
let shownHud = initialHud(); // what the HUD on screen shows, to see what changed
let pendingAnnounce = ''; // the HUD changes in words, for the screen reader, said with the next line
let lastSay = null; // the last line, to say it again
let forceNext = null; // a line id the story must use next (Again)
let currentAvatar = null;
let activeMedia = null;
let mediaSeq = 0;

// ---- the selects of the Director ---------------------------------------------------------------------------------------------------
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
const syncSelects = () => { for (const id of ['weather', 'time', 'moon', 'bearing', 'band', 'nick', 'zone', 'suspect']) if ($(id).value !== String(ctx[id])) $(id).value = ctx[id]; };

// ---- the HUD: built once, updated in place (so the needle turns instead of jumping) ---------------------------------------------------
const hudParts = (() => {
  // Wander: three memory lamps, and a compass with the distance bars.
  const lampRow = el('div', 'ui-lamps'); lampRow.setAttribute('role', 'img');
  const lamps = Array.from({ length: MEMORIES }, () => lampRow.appendChild(el('span', 'ui-lamp')));
  const wanderLeft = el('div'); wanderLeft.id = 'wanderLeft'; wanderLeft.append(el('span', null, 'Memories'), lampRow);

  const compassRow = el('div', 'ui-compass-row'); compassRow.setAttribute('role', 'img');
  const compass = el('div', 'ui-compass');
  const ring = svg('svg', { viewBox: '0 0 60 60', 'aria-hidden': 'true' });
  ring.append(svg('circle', { cx: 30, cy: 30, r: 27, class: 'ui-compass-ring' }));
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4; const r1 = i % 2 === 0 ? 21 : 23.5;
    ring.append(svg('line', { x1: 30 + r1 * Math.sin(a), y1: 30 - r1 * Math.cos(a), x2: 30 + 27 * Math.sin(a), y2: 30 - 27 * Math.cos(a), class: 'ui-compass-tick' }));
  }
  const needle = svg('svg', { viewBox: '0 0 60 60', class: 'ui-needle is-none', 'aria-hidden': 'true' });
  needle.append(svg('polygon', { points: '30,5 36,32 30,27 24,32' }));
  compass.append(ring, needle);
  const bars = el('div', 'ui-bars'); const barEls = [1, 2, 3].map(() => bars.appendChild(el('span', 'ui-bar')));
  const compassText = el('span');
  const compassCol = el('div', 'ui-compass-text'); compassCol.append(bars, compassText);
  compassRow.append(compass, compassCol);
  const wanderRight = el('div'); wanderRight.id = 'wanderRight'; wanderRight.append(el('span', null, 'Hint'), compassRow);

  // Party: the Haunt (rises to a maximum; a Haunt Event fires the first time it reaches 3, 6 and 9) and the players.
  const hauntRow = el('div', 'ui-meter'); hauntRow.setAttribute('role', 'img');
  const segs = Array.from({ length: HAUNT_MAX }, (_, i) => hauntRow.appendChild(el('span', `ui-seg${HAUNT_EVENTS.includes(i + 1) ? ' ui-seg--event' : ''}${i + 1 === HAUNT_MAX ? ' ui-seg--max' : ''}`)));
  const hauntLabel = el('span');
  const partyLeft = el('div'); partyLeft.id = 'partyLeft'; partyLeft.append(hauntLabel, hauntRow);
  const chipRow = el('div', 'ui-chips'); chipRow.setAttribute('role', 'list');
  const chips = NICKS.slice(0, 3).map((n) => { const c = el('span', 'ui-chip', n); c.dataset.nick = n; c.setAttribute('role', 'listitem'); return chipRow.appendChild(c); });
  const partyRight = el('div'); partyRight.id = 'partyRight'; partyRight.append(el('span', null, 'At the table'), chipRow);

  $('hudLeft').append(wanderLeft, partyLeft);
  $('hudRight').append(wanderRight, partyRight);
  return { wanderLeft, wanderRight, partyLeft, partyRight, lampRow, lamps, compassRow, needle, barEls, compassText, hauntRow, segs, hauntLabel, chips };
})();
let needleAngle = 0;

/** A motion token read from the stylesheet, so the page never repeats a number that design/tokens.json owns. */
const tokenCss = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const tokenMs = (name) => Number.parseFloat(tokenCss(name)) || 0;

/** One gentle pulse on a thing that just changed (no pulse under prefers-reduced-motion). */
function pulse(node) {
  if (reduceMotion.matches || !node?.animate) return;
  node.animate([{ transform: 'scale(1.55)', filter: 'brightness(1.5)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: tokenMs('--fade-slow'), easing: tokenCss('--ease') });
}
function resetHud() { hud = initialHud(); shownHud = hud; pendingAnnounce = ''; updateHud(); }

function updateHud() {
  const p = hudParts;
  const delta = hudDelta(shownHud, hud);
  const said = hudAnnouncement(shownHud, hud);
  if (said) pendingAnnounce = `${pendingAnnounce} ${said}`.trim();
  const wander = mode === 'wander';
  p.wanderLeft.hidden = p.wanderRight.hidden = !wander;
  p.partyLeft.hidden = p.partyRight.hidden = wander;

  p.lamps.forEach((l, i) => l.classList.toggle('is-on', i < hud.memories));
  p.lampRow.setAttribute('aria-label', `Memories found: ${hud.memories} of ${MEMORIES}`);

  const angle = hud.hint ? compassAngle(hud.hint.bearing) : null;
  p.needle.classList.toggle('is-none', angle === null);
  if (angle !== null) { const delta = ((angle - needleAngle + 540) % 360) - 180; needleAngle += delta; p.needle.style.transform = `rotate(${needleAngle}deg)`; }
  const level = hud.hint ? bandLevel(hud.hint.band) : 0;
  p.barEls.forEach((b, i) => b.classList.toggle('is-on', i < level));
  const words = hud.hint ? [hud.hint.bearing ?? 'no bearing', hud.hint.band].filter(Boolean).join(', ') : 'no hint yet';
  p.compassText.textContent = words;
  p.compassRow.setAttribute('aria-label', hud.hint ? `Hint: ${words}` : 'No hint yet');

  p.segs.forEach((s, i) => s.classList.toggle('is-on', i < hud.haunt));
  p.hauntLabel.textContent = `Haunt ${hud.haunt} of ${HAUNT_MAX}`;
  p.hauntRow.setAttribute('aria-label', `Haunt ${hud.haunt} of ${HAUNT_MAX}; a Haunt Event fires at ${HAUNT_EVENTS.join(', ')}`);
  delta.newLamps.forEach((i) => pulse(p.lamps[i]));
  delta.newSegs.forEach((i) => pulse(p.segs[i]));
  p.chips.forEach((c) => {
    const nick = c.dataset.nick;
    const gone = hud.haunting.includes(nick);
    c.classList.toggle('is-active', hud.activeNick === nick && !gone);
    c.classList.toggle('is-haunting', gone);
    c.textContent = gone ? `${nick} · haunting` : nick;
    c.setAttribute('aria-label', gone ? `${nick}, joined the haunting` : hud.activeNick === nick ? `${nick}, their hour` : nick);
    if (delta.newActive === nick || delta.newlyHaunting.includes(nick)) pulse(c);
  });
  if (delta.newHint) pulse(p.needle.parentElement);
  shownHud = hud;
}
// ---- time: waits that end on Stop or Next and stand still while paused --------------------------------------------------------------
const gate = (token) => { const s0 = skips; return () => token !== run || skips !== s0; };
const sleep = (ms, token) => new Promise((res) => {
  const over = gate(token); let left = ms;
  const iv = setInterval(() => { if (over()) { clearInterval(iv); res(); return; } if (!paused) left -= 100; if (left <= 0) { clearInterval(iv); res(); } }, 100);
});

/** Play an audio or video element to its end, or until Stop or Next. `onFrame` runs every frame while it plays (the word reveal). */
const playMedia = (media, token, onFrame) => new Promise((res, rej) => {
  const over = gate(token); const mine = ++mediaSeq;
  let iv = 0; let raf = 0;
  const finish = () => { clearInterval(iv); cancelAnimationFrame(raf); if (mine === mediaSeq) activeMedia = null; };
  activeMedia = media;
  media.muted = muted;
  media.volume = Number($('vol').value);
  media.onended = () => { finish(); res(); };
  media.onerror = () => { finish(); rej(new Error('the file could not be played')); };
  media.play().catch((e) => { finish(); rej(e); });
  if (paused) media.pause();
  iv = setInterval(() => { if (over()) { if (mine === mediaSeq) media.pause(); finish(); res(); } }, 100);
  if (onFrame) { const frame = () => { onFrame(media); raf = requestAnimationFrame(frame); }; raf = requestAnimationFrame(frame); }
});

// ---- the stage ---------------------------------------------------------------------------------------------------------------------
const kindOf = (speaker) => (speaker === 'whisper' ? 'whisper' : speaker === 'keeper' ? 'keeper' : 'suspect');
const speakerName = (r, id) => {
  if (r.speaker === 'whisper') return r.voiced ? 'The Whisper (Pippa)' : 'The Whisper (text only)';
  if (r.speaker === 'keeper') return r.voiced ? 'Mr. Ashby, the Keeper (Ronald)' : 'Mr. Ashby, the Keeper (text only)';
  const c = CHARACTERS[id];
  return c ? `${c.name} (${c.voice}${r.voiced ? '' : ', text only'})` : 'The Lodger';
};

function showAvatar(id, kind) {
  const present = id && seq.characters[id]?.present;
  const img = $('avatar');
  video.hidden = true;
  $('clipnote').hidden = true;
  if (present) { img.src = `/avatar/${id}.webp`; img.alt = CHARACTERS[id].name; img.hidden = false; $('orb').hidden = true; } else { img.hidden = true; $('orb').hidden = false; }
  $('portrait').className = `ui-portrait ui-portrait--${kind}`;
  $('orb').className = kind === 'whisper' ? 'ui-orb ui-orb--whisper' : 'ui-orb';
  $('stage').classList.remove('ui-stage--whisper', 'ui-stage--keeper', 'ui-stage--suspect');
  $('stage').classList.add(`ui-stage--${kind}`);
  if (present && id !== currentAvatar && currentAvatar !== null && !reduceMotion.matches) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
  currentAvatar = id;
}
const speaking = (on) => { $('portrait').classList.toggle('is-speaking', on); $('orb').classList.toggle('is-speaking', on); };

/** Put a line on the dialogue: every word is there but hidden, so the box never changes size while the words appear. */
function setDialogue(text) {
  const words = splitWords(text);
  $('sub').replaceChildren(...words.flatMap((w) => { const s = el('span', 'ui-word', w); return [s, document.createTextNode(' ')]; }));
  return words.length;
}
let shownWords = -1;
function showWords(n) {
  if (n === shownWords) return;
  shownWords = n;
  $('sub').querySelectorAll('.ui-word').forEach((s, i) => s.classList.toggle('is-on', i < n));
}

function logLine(r, id) {
  const d = el('div', 'ui-log-row');
  d.append(el('span', 'ui-log-id', `${r.id}  `), el('span', 'ui-log-who', `${CHARACTERS[id]?.name ?? r.speaker}: `), document.createTextNode(r.text));
  $('log').prepend(d);
}

/** Show one resolved line and play it: the lip-synced clip if it has one and clips are on, else the portrait and the Library audio. */
async function present({ r, id, kind, scene, clipName, token, dark }) {
  const mine = ++presentSeq;
  busy = true; updateTransport();
  $('scene').textContent = scene ?? '';
  $('who').textContent = speakerName(r, id);
  $('who').className = `ui-nameplate ui-nameplate--${kind}`;
  $('note').className = r.missing ? 'ui-note is-warn' : 'ui-note';
  $('note').textContent = r.missing ? 'This line should have audio but the file is missing.' : '';
  $('stage').classList.toggle('is-blackout', Boolean(dark));
  showAvatar(id, kind);
  logLine(r, id);
  $('sr').textContent = `${speakerName(r, id)}: ${r.text}${pendingAnnounce ? ` ${pendingAnnounce}` : ''}`;
  pendingAnnounce = '';
  $('btnAgain').hidden = false;

  const animate = !reduceMotion.matches;
  const spoken = clipName ? r.text : r.voiced ? r.spoken : r.text;
  const total = setDialogue(spoken);
  shownWords = -1;
  const reveal = (media) => showWords(wordsShown(total, revealFraction(media.currentTime, media.duration)));
  if (!animate || (!clipName && !r.voiced)) showWords(total);
  const fail = (e) => { $('note').className = 'ui-note is-warn'; $('note').textContent = String(e.message ?? e); };

  if (clipName) {
    $('avatar').hidden = true; $('orb').hidden = true;
    video.src = `/clip/${clipName}.mp4`; video.hidden = false; $('clipnote').hidden = false;
    speaking(true);
    try { await playMedia(video, token, animate ? reveal : null); } catch (e) { fail(e); }
    if (token === run) { speaking(false); showWords(total); $('note').textContent = 'A lip-synced clip: a separate render of this line, so it sounds a little different from the Library audio.'; showAvatar(id, kind); }
  } else if (r.voiced) {
    audio.src = `/audio/${r.file}.mp3`;
    speaking(true);
    try { await playMedia(audio, token, animate ? reveal : null); } catch (e) { fail(e); }
    if (token === run) {
      speaking(false); showWords(total);
      if (r.tail) { $('sub').append(el('span', 'ui-speech-tail', ` ${r.tail}`)); $('note').textContent = 'The part in italics is shown, never spoken.'; }
    }
  } else {
    await sleep(readingMs(r.text), token);
  }
  if (dark) { await sleep(1200, token); if (token === run) $('stage').classList.remove('is-blackout'); }
  if (mine === presentSeq) { busy = false; updateTransport(); }
}

/** Say one line of `kind` in the voice `suffix` (soft the Whisper, dry the Keeper, lodger a Suspect), or the line `forceId`. */
async function say(kind, suffix, scene, token = run, over = {}, forceId = null) {
  const line = forceId ? lineById(seq, forceId) : pickLine(seq, kind, suffix, { recent });
  if (!line) { $('note').className = 'ui-note is-warn'; $('note').textContent = `No line of kind ${kind} for this voice.`; return; }
  recent = [...recent, line.id].slice(-6);
  const c = { ...ctx, ...over };
  lastSay = { kind, suffix, scene, over, forceId: line.id };
  const r = resolve(line, c);
  const clip = $('useClips').checked && r.voiced ? seq.clips[clipKey(line.id, c.suspect)] : null;
  await present({ r, id: avatarOf(r.speaker, c), kind: kindOf(r.speaker), scene, clipName: clip?.present ? clip.name : null, token, dark: kind === 'haunt.blackout' });
}

/** A clip made for the demo video: it is in no bank, so it only plays as a clip. */
async function sayDemoOnly(d, token = run) {
  lastSay = { demo: d };
  const speaker = d.suffix === 'soft' ? 'whisper' : 'keeper';
  const clip = seq.demoOnly.find((x) => x.id === d.id);
  const r = { id: d.id, kind: d.id, speaker, text: d.text, spoken: d.text, tail: '', file: null, voiced: true, missing: false };
  await present({ r, id: avatarOf(speaker, ctx), kind: kindOf(speaker), scene: d.label, clipName: clip?.present ? clip.clip : null, token });
}

// ---- the scene strip and the story -------------------------------------------------------------------------------------------------
function buildStrip(steps) {
  $('strip').replaceChildren(...steps.map((s, i) => { const li = el('li', 'ui-dot'); li.title = `${i + 1}. ${s.label}`; return li; }));
}
function markStrip(index) {
  [...$('strip').children].forEach((li, i) => { li.classList.toggle('is-done', i < index); li.classList.toggle('is-current', i === index); if (i === index) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
}

async function runSession(steps, startAt = 0, sessionMode = 'wander') {
  const token = ++run;
  paused = false; recent = []; mode = sessionMode;
  session = { steps, index: startAt, goto: null };
  buildStrip(steps);
  updateTransport();
  while (token === run && session && session.index < steps.length) {
    const i = session.index; const s = steps[i];
    Object.assign(ctx, s.ctx); syncSelects();
    hud = hudAfter(steps, i); updateHud();
    markStrip(i);
    $('sceneLabel').textContent = sceneLabel(steps, i);
    $('upNext').textContent = upNextLabel(steps, i);
    updateTransport();
    const s0 = skips;
    const force = forceNext ?? s.forceId ?? null;
    forceNext = null;
    await say(s.kind, s.suffix, `${i + 1} of ${steps.length} · ${s.label}`, token, {}, force);
    if (token !== run || !session) return;
    if (skips === s0) await sleep(Number($('pause').value) * 1000, token);
    if (token !== run || !session) return;
    session.index = session.goto ?? session.index + 1;
    session.goto = null;
  }
  if (token === run && session) {
    markStrip(steps.length);
    $('sceneLabel').textContent = 'The story is over. Play it again, or pick a moment in the Director.';
    $('upNext').textContent = '';
    $('scene').textContent = '';
    session = null; busy = false; speaking(false); updateTransport();
  }
}

// ---- the transport -----------------------------------------------------------------------------------------------------------------
function updateTransport() {
  const active = busy || Boolean(session);
  $('btnPause').disabled = !active; $('btnNext').disabled = !active; $('btnStop').disabled = !active;
  $('btnBack').disabled = !(session && session.index > 0);
  $('btnPause').setAttribute('aria-pressed', String(paused));
  $('btnPause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('pauseLabel').textContent = paused ? 'Resume' : 'Pause';
  $('btnPause').querySelector('.ui-tool-glyph').textContent = paused ? '▶' : '❚❚';
}
function togglePause() {
  if ($('btnPause').disabled) return;
  paused = !paused;
  if (activeMedia) { if (paused) activeMedia.pause(); else activeMedia.play().catch(() => {}); }
  updateTransport();
}
function next() { if (!$('btnNext').disabled) { paused = false; skips += 1; updateTransport(); } }
function back() { if (session && session.index > 0) { session.goto = session.index - 1; paused = false; skips += 1; updateTransport(); } }
function stop() {
  run += 1; skips += 1; paused = false; session = null; busy = false;
  audio.pause(); video.pause(); speaking(false); $('stage').classList.remove('is-blackout');
  $('scene').textContent = 'Stopped.'; $('sceneLabel').textContent = 'No story is playing.'; $('upNext').textContent = '';
  updateTransport();
}
/** Say the last line again: the same line, so a voice can be judged twice. */
function again() {
  if (!lastSay) return;
  if (session) { forceNext = lastSay.forceId ?? null; session.goto = session.index; paused = false; skips += 1; updateTransport(); return; }
  run += 1; paused = false;
  if (lastSay.demo) sayDemoOnly(lastSay.demo, run);
  else say(lastSay.kind, lastSay.suffix, lastSay.scene, run, lastSay.over, lastSay.forceId);
}
function toggleMute() {
  muted = !muted; audio.muted = muted; video.muted = muted;
  $('btnMute').setAttribute('aria-pressed', String(muted));
  $('btnMute').setAttribute('aria-label', muted ? 'Sound is off' : 'Sound');
  $('muteLabel').textContent = muted ? 'Muted' : 'Sound';
  $('muteGlyph').textContent = muted ? '✕' : '♪';
}
const directorOpen = () => $('director').classList.contains('is-open');
function toggleDirector(force) {
  const open = force ?? !directorOpen();
  $('director').classList.toggle('is-open', open);
  $('btnDirector').setAttribute('aria-expanded', String(open));
  $('btnDirector').setAttribute('aria-label', open ? 'Close the Director' : 'Open the Director');
  if (open) $('dirTitle').focus(); else $('btnDirector').focus();
}

// ---- moments: one line now ---------------------------------------------------------------------------------------------------------
function moment(m, fn, kind) {
  run += 1; paused = false; session = null; mode = m;
  $('sceneLabel').textContent = 'You are playing single moments.'; $('upNext').textContent = ''; $('strip').replaceChildren();
  if (kind) hud = hudReduce(hud, { kind, ctx: { ...ctx } });
  updateHud();
  fn(run);
}
const pad = (parent, label, m, kind, fn) => {
  const b = el('button', 'ui-button', label); b.type = 'button';
  b.addEventListener('click', () => { moment(m, fn, kind); if (window.matchMedia('(max-width: 899px)').matches) toggleDirector(false); });
  parent.append(b);
};
for (const [label, kind] of [['Meet', 'meet'], ['Ambient', 'ambient'], ['Tease', 'tease'], ['Hint', 'hint'], ['Memory found', 'reveal'], ['Go back (echo)', 'echo'], ['Odd question', 'refuse'], ['Ending', 'ending']]) pad($('wanderPads'), label, 'wander', kind, (t) => say(kind, $('persona').value, label, t));
for (const [label, kind] of [['Cold place', 'haunt.cold-spot'], ['Blackout', 'haunt.blackout'], ['Restless', 'haunt.restless'], ['Settles', 'haunt.lull'], ['Haunt rises (text)', 'haunt.rise'], ['Joins the haunting', 'poltergeist'], ['Midnight', 'midnight'], ['Haunting wins', 'end.haunting']]) pad($('whisperPads'), label, 'party', kind, (t) => say(kind, 'soft', label, t));
for (const [label, kind] of [['Hour begins', 'turn-start'], ['Time warning', 'time-warning'], ['Theory offered', 'suggest'], ['Card shown', 'shown'], ['Nobody answers', 'none-shown'], ['Accusation sealed', 'seal'], ['Opened', 'accuse.reveal'], ['Wrong accusation', 'accuse.wrong'], ['Right accusation', 'accuse.right'], ['Case closed', 'end.solved']]) pad($('keeperPads'), label, 'party', kind, (t) => say(kind, 'dry', label, t));
pad($('suspectPads'), 'Named (text only)', 'party', 'aside', (t) => say('aside', 'lodger', 'Named in a theory', t));
pad($('suspectPads'), 'Stalls', 'party', 'stall', (t) => say('stall', 'lodger', 'Accused', t));
pad($('suspectPads'), 'Confesses', 'party', 'confession', (t) => say('confession', 'lodger', 'Confesses', t));
pad($('suspectPads'), 'Confesses (their clip)', 'party', 'confession', (t) => say('confession', 'lodger', 'Confesses (their own clip)', t, {}, CHARACTERS[ctx.suspect].confession));
for (const d of DEMO_ONLY) pad($('demoPads'), d.label, d.suffix === 'soft' ? 'wander' : 'party', null, (t) => sayDemoOnly(d, t));

// ---- starting ----------------------------------------------------------------------------------------------------------------------
const startWander = () => runSession(wanderSteps({ ...ctx }, $('persona').value), 0, 'wander');
const startParty = (ending) => runSession(partySteps({ ...ctx }, ending), 0, 'party');
$('runWander').addEventListener('click', () => { resetHud(); startWander(); if (matchMedia('(max-width: 899px)').matches) toggleDirector(false); });
$('runParty').addEventListener('click', () => { resetHud(); startParty('haunted'); if (matchMedia('(max-width: 899px)').matches) toggleDirector(false); });
$('runSolved').addEventListener('click', () => { resetHud(); startParty('solved'); if (matchMedia('(max-width: 899px)').matches) toggleDirector(false); });
$('resetHud').addEventListener('click', resetHud);
$('btnBack').addEventListener('click', back);
$('btnNext').addEventListener('click', next);
$('btnPause').addEventListener('click', togglePause);
$('btnStop').addEventListener('click', stop);
$('btnMute').addEventListener('click', toggleMute);
$('btnAgain').addEventListener('click', again);
$('btnDirector').addEventListener('click', () => toggleDirector());
$('dirClose').addEventListener('click', () => toggleDirector(false));
$('pause').addEventListener('input', (e) => { $('pauseV').textContent = `${e.target.value} s between scenes`; });
$('vol').addEventListener('input', (e) => { audio.volume = video.volume = Number(e.target.value); });

// ---- the title card: the content notice, and the first click that unlocks the sound -------------------------------------------------------
const app = $('app');
$('stage').tabIndex = -1;
document.body.classList.add('is-locked');
app.inert = true;
function closeIntro() {
  $('intro').hidden = true; document.body.classList.remove('is-locked'); app.inert = false;
  $('stage').focus({ preventScroll: true });
}
$('introWander').addEventListener('click', () => { closeIntro(); resetHud(); startWander(); });
$('introParty').addEventListener('click', () => { closeIntro(); resetHud(); startParty('haunted'); });
$('introSolved').addEventListener('click', () => { closeIntro(); resetHud(); startParty('solved'); });
$('introExplore').addEventListener('click', () => {
  closeIntro();
  $('who').textContent = 'The Whisper (Pippa)';
  $('sub').textContent = 'Open the Director and pick any moment, or play a story.';
  $('sr').textContent = 'Open the Director and pick any moment, or play a story.';
  if (matchMedia('(max-width: 899px)').matches) toggleDirector(true);
});

// ---- the keyboard ------------------------------------------------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('intro').hidden) { if (e.key === 'Escape') $('introExplore').click(); return; }
  if (e.key === 'Escape') { if (directorOpen() && matchMedia('(max-width: 899px)').matches) toggleDirector(false); else stop(); return; }
  const t = e.target;
  if (t instanceof HTMLElement && (t.matches('input, select, textarea') || t.isContentEditable)) return;
  if (e.key === ' ' && !(t instanceof HTMLButtonElement) && !(t instanceof HTMLElement && t.matches('summary'))) { e.preventDefault(); togglePause(); }
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') back();
  else if (e.key.toLowerCase() === 'm') toggleMute();
  else if (e.key.toLowerCase() === 'r') again();
  else if (e.key.toLowerCase() === 'd' && matchMedia('(max-width: 899px)').matches) toggleDirector();
});

// ---- first paint ---------------------------------------------------------------------------------------------------------------------
showAvatar('whisper', 'whisper');
$('who').textContent = 'The Whisper (Pippa)';
updateHud();
updateTransport();
const voiced = seq.lines.filter((l) => l.spoken);
const variants = voiced.flatMap((l) => l.variants);
const portraits = Object.values(seq.characters).filter((c) => c.present).length;
const clips = [...Object.values(seq.clips), ...seq.demoOnly].filter((c) => c.present).length;
$('status').textContent = `${voiced.length} voiced lines · ${variants.filter((v) => v.present).length} of ${variants.length} line variants have audio · ${seq.holes.length} holes in the Library · ${portraits} of ${Object.keys(seq.characters).length} portraits · ${clips} of ${Object.keys(seq.clips).length + seq.demoOnly.length} clips`;
$('introStatus').textContent = `Ready: ${voiced.length} voiced lines, ${variants.filter((v) => v.present).length} voice files, ${portraits} portraits, ${clips} lip-synced clips.`;
for (const b of introButtons) b.disabled = false;
$('introWander').focus();
