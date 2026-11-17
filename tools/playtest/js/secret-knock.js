// "Secret knock" demo: a locked door that opens to the ghost's knock. Hear the knock once (the clue), then knock it back on the table.
// Knocks come from knock-core.js (the phone feels and/or hears them; the microphone gives a loudness number only, nothing is recorded),
// or from the Tap button, which always works. Three tries, like every Lock. The door creaks open on the right knock.
import { h, $ } from './dom.js';
import { makeDetector, jolt } from './knock-core.js';
import { LEVELS, describe, isDone, judge, makePattern, playTimes } from './secret-knock-core.js';

const app = $('#app');
const q = new URLSearchParams(location.search);
let level = LEVELS.includes(q.get('level')) ? q.get('level') : 'easy';
let seed = Number.parseInt(q.get('seed') ?? '', 10) || 1 + Math.floor(Math.random() * 9999);
let pattern = makePattern(level, seed);
let tries = 3;
let times = [];
let listening = false;
let open = false;
let heardClue = false;

// ------------------------------------------------------------ sound: our own knock and creak (web/public/sounds), one element each
const sounds = {};
function play(name) {
  try {
    const a = (sounds[name] ||= new Audio(`media/${name}.m4a`));
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch { /* no sound: the dots and the words carry it */ }
}
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* no buzz */ } };

// ------------------------------------------------------------ sensors (as on the Knock test page)
let detector = makeDetector({ mode: 'both' });
let prev = null, motionOn = false, micOn = false, analyser = null, buf = null, avg = 0.02;
function onMotion(e) {
  const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : e.accelerationIncludingGravity;
  if (!a) return;
  const cur = { x: a.x, y: a.y, z: a.z };
  const k = detector.motion(performance.now(), jolt(prev, cur));
  prev = cur;
  if (k) heard(k.t);
}
async function startSensors() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') throw new Error('motion refused');
    }
    addEventListener('devicemotion', onMotion);
    motionOn = true;
  } catch { /* the Tap button still works */ }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    ctx.createMediaStreamSource(stream).connect(analyser);
    micOn = true;
  } catch { /* the Tap button still works */ }
  // both sensors: a knock must be felt and heard; one sensor: that one alone
  detector = makeDetector({ mode: motionOn && micOn ? 'both' : motionOn ? 'motion' : 'mic' });
  sensorText.textContent = motionOn || micOn
    ? `Listening with ${motionOn && micOn ? 'motion and the microphone' : motionOn ? 'motion' : 'the microphone'} (loudness only, nothing recorded).`
    : 'No motion or microphone on this phone: use the Tap button.';
}
function frame() {
  if (analyser) {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    const k = detector.mic(performance.now(), peak, avg);
    avg = avg * 0.95 + peak * 0.05;
    if (k) heard(k.t);
  }
  if (listening && isDone(times, performance.now())) finish();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ the lock
function heard(t) {
  if (!listening || open) return;
  times.push(t);
  buzz(15);
  drawHeard();
}
function drawHeard() {
  const { groups } = readGroups();
  heardEl.textContent = times.length ? groups.map((g) => '●'.repeat(g).split('').join(' ')).join('   ') : 'Knock when you are ready.';
}
function readGroups() { return judge(pattern, times).heard; }
function finish() {
  listening = false;
  const r = judge(pattern, times);
  if (r.ok) {
    open = true;
    door.classList.add('sk-open');
    play('creak');
    buzz([30, 60, 30]);
    say('The door opens.');
    result.textContent = 'The door creaks open.';
  } else {
    tries -= 1;
    const why = r.reason === 'pause' ? 'The knocks were right, but a pause was not.' : `You knocked ${r.heard.groups.join(', ')}.`;
    if (tries <= 0) { result.textContent = `${why} The door stays shut. Nothing came loose.`; say('The door stays shut.'); }
    else { result.textContent = `${why} The door does not move. ${tries} ${tries === 1 ? 'try' : 'tries'} left.`; say('The door does not move.'); }
  }
  draw();
}
function startTry() {
  if (open || tries <= 0) return;
  times = [];
  listening = true;
  result.textContent = '';
  drawHeard();
  draw();
}
function hear() {
  // the clue: the ghost knocks the pattern once, with a buzz for each knock; then the button is spent until a new door
  if (heardClue) return;
  heardClue = true;
  hearBtn.disabled = true;
  hearBtn.textContent = 'Knocked once';
  const at = playTimes(pattern);
  at.forEach((ms) => setTimeout(() => { play('knock'); buzz(25); }, ms));
  clueText.textContent = describe(pattern).words;
  clueMarks.textContent = describe(pattern).marks;
  say(`The ghost knocks: ${describe(pattern).words}.`);
}
function newLock(lv) {
  level = lv;
  seed = 1 + Math.floor(Math.random() * 9999);
  pattern = makePattern(level, seed);
  tries = 3; times = []; listening = false; open = false; heardClue = false;
  hearBtn.disabled = false;
  hearBtn.textContent = 'Hear the knock';
  door.classList.remove('sk-open');
  clueText.textContent = 'Tap Hear the knock. It is played once.';
  clueMarks.textContent = '';
  result.textContent = '';
  drawHeard();
  draw();
}
function say(text) { live.textContent = text; }
function draw() {
  knockBtn.disabled = !listening;
  goBtn.disabled = listening || open || tries <= 0;
  goBtn.textContent = listening ? 'Listening…' : open ? 'Opened' : tries <= 0 ? 'Shut' : 'Knock now';
  triesEl.textContent = `Tries: ${'● '.repeat(tries)}${'○ '.repeat(3 - tries)}`.trim();
  for (const b of levelBtns) b.setAttribute('aria-checked', String(b.dataset.level === level));
}

// ------------------------------------------------------------ the page
const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }, '');
const sensorText = h('p', { class: 'muted' }, 'Tap Start so the phone can feel and hear your knocks. Or use the Tap button.');
const door = h('div', { class: 'sk-door', 'aria-hidden': 'true' }, h('div', { class: 'sk-leaf' }, h('span', { class: 'sk-knocker' }), h('span', { class: 'sk-handle' })));
const clueText = h('p', { class: 'sk-clue' }, 'Tap Hear the knock. It is played once.');
const clueMarks = h('p', { class: 'sk-marks', 'aria-hidden': 'true' }, '');
const heardEl = h('p', { class: 'sk-marks', 'aria-label': 'Your knocks' }, 'Knock when you are ready.');
const triesEl = h('p', { class: 'muted' }, '');
const result = h('p', { role: 'status' }, '');
const goBtn = h('button', { class: 'primary', onClick: startTry }, 'Knock now');
const hearBtn = h('button', { onClick: hear }, 'Hear the knock');
const knockBtn = h('button', { onClick: () => heard(performance.now()) }, 'Tap (a knock)');
const levelBtns = LEVELS.map((lv) => h('button', { role: 'radio', 'aria-checked': 'false', 'data-level': lv, onClick: () => newLock(lv) }, lv));
const style = h('style', {}, `
.sk-door{width:min(60vw,220px);aspect-ratio:1/2;margin:12px auto;perspective:700px;background:#050507;border:6px solid #3b2a1c;border-radius:6px 6px 0 0}
.sk-leaf{position:relative;width:100%;height:100%;background:linear-gradient(90deg,#4a3322,#5c4029 45%,#4a3322);transform-origin:left center;transition:transform 1.6s ease-in-out;box-shadow:inset 0 0 0 10px #3f2b1d}
.sk-open .sk-leaf{transform:rotateY(-72deg)}
.sk-knocker{position:absolute;left:50%;top:28%;width:34px;height:34px;margin-left:-17px;border:5px solid #b08a3e;border-radius:50%}
.sk-handle{position:absolute;right:12%;top:52%;width:14px;height:14px;border-radius:50%;background:#b08a3e}
.sk-clue{font-size:1.15rem;text-align:center}
.sk-marks{font-size:1.4rem;letter-spacing:.1em;text-align:center;min-height:1.6em;white-space:pre}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.sk-leaf{transition:none}}`);

app.append(style,
  h('header', { class: 'bar' }, h('a', { href: 'index.html' }, '← Playtest'), h('h1', {}, 'Secret knock')),
  h('p', { class: 'muted' }, 'A locked door. The ghost knocks once: knock it back on the table, with the same groups and pauses. Three tries.'),
  h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Level' }, ...levelBtns),
  h('div', { class: 'row' }, h('button', { onClick: (e) => { e.target.disabled = true; startSensors(); } }, 'Start'), hearBtn),
  sensorText,
  door,
  clueText, clueMarks,
  h('div', { class: 'row' }, goBtn, knockBtn),
  heardEl, triesEl, result, live);

newLock(level);
requestAnimationFrame(frame);
