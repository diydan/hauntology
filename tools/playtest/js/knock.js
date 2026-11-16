// "Knock test": does a phone lying on a table feel and hear a knock on that table, and only a knock?
// For the knocking idea in the party-mode spec (spike 1.10). The motion sensor gives a jolt size, the microphone a
// loudness number; nothing is recorded or sent. Three detectors run side by side (motion only, mic only, both), so
// one run tells which works best on this phone. A Knock button always works too.
import { h, $, copyText } from './dom.js';
import { makeDetector, jolt, KNOCK_DEFAULTS } from './knock-core.js';

const app = $('#app');
const report = { when: new Date().toISOString(), ua: navigator.userAgent, settings: {}, steps: {}, answers: {} };
const opts = { motion: KNOCK_DEFAULTS.motion, mic: KNOCK_DEFAULTS.mic };
let detectors = mk();
function mk() { return { motion: makeDetector({ ...opts, mode: 'motion' }), mic: makeDetector({ ...opts, mode: 'mic' }), both: makeDetector({ ...opts, mode: 'both' }) }; }

// ------------------------------------------------------------ sensors
let prev = null, motionOn = false, micOn = false, analyser = null, buf = null, avg = 0.02;
let liveJolt = 0, livePeak = 0;
function onMotion(e) {
  const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : e.accelerationIncludingGravity;
  if (!a) return;
  const cur = { x: a.x, y: a.y, z: a.z };
  const j = jolt(prev, cur);
  prev = cur;
  liveJolt = Math.max(liveJolt * 0.9, j);
  const t = performance.now();
  for (const d of Object.values(detectors)) if (d.motion(t, j)) seen(d);
}
async function startSensors() {
  status.textContent = 'Asking for motion and microphone…';
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') throw new Error('motion ' + r);
    }
    addEventListener('devicemotion', onMotion);
    motionOn = true;
  } catch (e) { report.motionError = String(e); }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    ctx.createMediaStreamSource(stream).connect(analyser);
    micOn = true;
  } catch (e) { report.micError = String(e); }
  status.textContent = `Motion: ${motionOn ? 'on' : 'off'} · Microphone: ${micOn ? 'on (loudness only, nothing recorded)' : 'off'}`;
  report.motionOn = motionOn; report.micOn = micOn;
}
function frame() {
  if (analyser) {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    livePeak = Math.max(livePeak * 0.9, peak);
    const t = performance.now();
    for (const d of Object.values(detectors)) if (d.mic(t, peak, avg)) seen(d);
    avg = avg * 0.95 + peak * 0.05;
  }
  const t = performance.now();
  for (const d of Object.values(detectors)) d.flush(t);
  meterJ.value = Math.min(10, liveJolt); meterM.value = Math.min(1, livePeak);
  counts.textContent = `motion ${detectors.motion.knocks.length} · mic ${detectors.mic.knocks.length} · both ${detectors.both.knocks.length}`;
  groupsEl.textContent = `groups (both): ${detectors.both.groups.join(' / ') || '–'}`;
  requestAnimationFrame(frame);
}
function seen(d) {
  if (d !== detectors.both) return;
  dot.classList.remove('knock-on'); void dot.offsetWidth; dot.classList.add('knock-on'); // a soft fade, never a flash
  if (navigator.vibrate) navigator.vibrate(15);
}

// ------------------------------------------------------------ steps
const STEPS = [
  ['five', 'Lay the phone flat on the table. Knock 5 times near it, about one second apart.', '5 knocks'],
  ['pattern', 'Knock twice quickly, wait two seconds, then knock once.', 'groups 2 / 1'],
  ['talk', 'Talk, laugh or clap near the phone. Do not knock.', '0 knocks'],
  ['bump', 'Put a cup down, lean on the table, slide the phone a little. Do not knock.', '0 knocks'],
  ['far', 'Knock 3 times at the far end of the table.', '3 knocks'],
  ['hand', 'Hold the phone and tap its back 3 times with a finger.', '3 knocks'],
];
let running = null;
function stepRow([key, text, want]) {
  const out = h('small', { class: 'muted' }, `want: ${want}`);
  const btn = h('button', { onClick: () => {
    if (running) return;
    detectors = mk(); running = key; btn.textContent = 'Listening… 10 s';
    setTimeout(() => {
      const t = performance.now() + 1000;
      for (const d of Object.values(detectors)) d.flush(t);
      const r = { motion: detectors.motion.knocks.length, mic: detectors.mic.knocks.length, both: detectors.both.knocks.length, groups: [...detectors.both.groups], want, settings: { ...opts } };
      report.steps[key] = r;
      out.textContent = `want ${want} → motion ${r.motion}, mic ${r.mic}, both ${r.both}${r.groups.length ? ` (groups ${r.groups.join('/')})` : ''}`;
      btn.textContent = 'Run again'; running = null;
    }, 10_000);
  } }, 'Start (10 s)');
  return h('div', { class: 'step' }, h('p', {}, text), h('div', { class: 'row' }, btn), out);
}

// ------------------------------------------------------------ the page
const status = h('p', { class: 'muted' }, 'Tap Start. The phone asks for motion and the microphone. The microphone measures loudness only.');
const meterJ = h('meter', { min: '0', max: '10', value: '0' });
const meterM = h('meter', { min: '0', max: '1', value: '0' });
const counts = h('p', {}, '');
const groupsEl = h('p', { class: 'muted' }, '');
const dot = h('span', { class: 'knock-dot', 'aria-hidden': 'true' });
const slider = (label, key, min, max, stepv) => {
  const val = h('small', { class: 'muted' }, String(opts[key]));
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(stepv), value: String(opts[key]), 'aria-label': label,
    onInput: (e) => { opts[key] = Number(e.target.value); val.textContent = String(opts[key]); detectors = mk(); report.settings = { ...opts }; } });
  return h('label', { class: 'row' }, h('span', {}, label), input, val);
};
const ask = (key, q, options) => {
  const out = h('small', { class: 'muted' }, '');
  return h('div', {}, h('p', { class: 'muted' }, q), h('div', { class: 'row' }, ...options.map((o) => h('button', { onClick: () => { report.answers[key] = o; out.textContent = `noted: ${o}`; } }, o))), out);
};
const style = h('style', {}, '.knock-dot{display:inline-block;width:28px;height:28px;border-radius:50%;background:#2a2c35;vertical-align:middle;margin-left:8px}.knock-on{animation:knockfade .6s ease-out}@keyframes knockfade{from{background:#e0a43a}to{background:#2a2c35}}@media (prefers-reduced-motion:reduce){.knock-on{animation:none;background:#e0a43a}}.step{border-top:1px solid #2a2c35;padding:8px 0}meter{width:60%}');

app.append(style,
  h('header', { class: 'bar' }, h('a', { href: 'index.html' }, '← Playtest'), h('h1', {}, 'Knock test')),
  h('p', { class: 'muted' }, 'Can a phone on the table tell a knock from talk and bumps? Three detectors run at once: motion only, microphone only, and both together. Nothing is recorded.'),
  h('div', { class: 'row' }, h('button', { onClick: (e) => { e.target.disabled = true; startSensors(); } }, 'Start'), h('button', { onClick: () => { const t = performance.now(); for (const d of Object.values(detectors)) { d.knocks.push({ t, source: 'button' }); } seen(detectors.both); } }, 'Knock (button)')),
  status,
  h('p', {}, 'Jolt ', meterJ), h('p', {}, 'Click ', meterM),
  h('p', {}, 'Knock seen (both)', dot), counts, groupsEl,
  h('h2', {}, 'Sensitivity'),
  slider('Jolt needed (m/s²)', 'motion', 0.5, 8, 0.1),
  slider('Click needed (0 to 1)', 'mic', 0.05, 0.8, 0.01),
  h('h2', {}, 'Six short tests'),
  ...STEPS.map(stepRow),
  h('h2', {}, 'A few questions'),
  ask('missed', 'Did it miss knocks you made?', ['never', 'sometimes', 'often']),
  ask('false', 'Did it count knocks you did not make?', ['never', 'sometimes', 'often']),
  ask('feel', 'Would knocking be fun in the game?', ['yes', 'maybe', 'no']),
  h('div', { class: 'row' }, h('button', { onClick: async (e) => { report.settings = { ...opts }; e.target.textContent = (await copyText(JSON.stringify(report, null, 1))) ? 'Copied' : 'Could not copy'; } }, 'Copy the report')),
  h('p', { class: 'muted' }, 'Paste the report to the developer. Try it on a wooden table and a glass or stone one if you can.'));

requestAnimationFrame(frame); // the counters run from the start, so the Knock button works before Start
