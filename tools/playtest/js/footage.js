// Footage test page: clips on phone screens and on the TV, in three looks. Picture only and muted, except the lip-synced clips of section 8 (their own voice, played only when tapped). No recording.
// The clip files (and two sound files) are the only thing this page loads. Rules: .kiro/specs/puzzles (Requirements 18 to 21).
import { initScenes } from './scenes-page.js';
import { initLipsync } from './lipsync-page.js';
import { WANDER } from './scenes.js';

const REVEAL_ID = WANDER.revealId;

const $ = (sel, root = document) => root.querySelector(sel);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const looping = [...document.querySelectorAll('video.ft-video[loop]')];
const once = $('#ft-once');
const playBtn = $('#ft-play');
const status = $('#ft-status');

// What the Player asked for. Reduced motion, or a browser set to save data, starts with the footage off (a still frame);
// a tap on Play is the Player's own choice.
const saver = navigator.connection?.saveData === true;
let wanted = !reduce.matches && !saver;

const say = (text) => { status.textContent = text; };

// The clock shadow, the Reel and the endings (js/scenes-page.js). They move only while footage is on and the page is visible.
// Our own two sounds (the claw on the crate, the knock) go with a Reel shot. One Audio element each, made on the first tap, which is the
// Haunt +1 tap itself, so the browser lets it play. A sound that is blocked or missing is dropped: the words of the shot say it too.
const sounds = {};
function playSound(name) {
  try {
    const a = (sounds[name] ||= new Audio(`media/${name}.m4a`));
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch { /* no sound on this browser: the words carry it */ }
}
// The narration of a scene line (the Library audio of the Whisper or the Keeper) is one Audio at a time: a new line cuts the old one. Missing or blocked: the words carry it.
let voice = null;
let voiceId = null;
let waiting = null; // a scene line that waits for the Whisper's reveal to end, so the two never talk over each other
function stopVoice() {
  try { voice?.pause(); } catch { /* nothing to stop */ }
  voice = null;
  voiceId = null;
  waiting = null;
}
function start(id) {
  try {
    const a = new Audio(`media/voice-${id}.mp3`);
    voice = a;
    voiceId = id;
    a.addEventListener?.('ended', () => { if (voice !== a) return; voice = null; voiceId = null; const next = waiting; waiting = null; if (next) start(next); });
    a.play().catch(() => {});
  } catch { /* no sound on this browser: the words carry it */ }
}
function playVoice(id) {
  if (voice && voiceId === REVEAL_ID && id !== REVEAL_ID) { waiting = id; return; } // the reveal is being said: queue this line behind it
  stopVoice();
  start(id);
}
const scenes = initScenes({ isOn: () => wanted && !document.hidden, say, playSound, playVoice, stopVoice });

initLipsync({ say });

function paint() {
  playBtn.textContent = wanted ? 'Pause footage' : 'Play footage';
}

/** Run or stop the looping clips. A hidden page always stops them. */
function sync() {
  const run = wanted && !document.hidden;
  for (const v of looping) {
    if (run) v.play().catch(() => say('The browser blocked the clip. Tap Play footage.'));
    else v.pause();
  }
  if (!wanted) once.pause();
  scenes.sync();
  paint();
}

playBtn.addEventListener('click', () => {
  wanted = !wanted;
  say(wanted ? '' : 'Footage paused: still frame.');
  sync();
});

for (const b of document.querySelectorAll('[role="radio"][data-look]')) {
  b.addEventListener('click', () => {
    document.body.dataset.look = b.dataset.look;
    for (const o of document.querySelectorAll('[role="radio"][data-look]')) o.setAttribute('aria-checked', String(o === b));
  });
}

$('#ft-replay').addEventListener('click', () => {
  if (!wanted) { say('Footage is paused: tap Play footage first.'); return; }
  once.currentTime = 0;
  once.play().catch(() => say('The browser blocked the clip. Tap Replay again.'));
});

document.addEventListener('visibilitychange', sync);
reduce.addEventListener?.('change', (e) => { wanted = !e.matches; sync(); });

// A clip that cannot load leaves its still frame; say so once.
for (const v of [...looping, once]) {
  const last = v.querySelector('source:last-of-type');
  last?.addEventListener('error', () => say('A clip did not load: the still frame is shown.'));
}

if (reduce.matches) say('Reduced motion is on: still frames. Tap Play footage to run the clip.');
else if (saver) say('Data saver is on: still frames. Tap Play footage to run the clip.');
sync();
