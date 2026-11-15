// "Check my phone": the real-phone harness for Spike puzzles 1.1 to 1.4 (vibration, motion, audio, breath).
// Play with each section, answer the little questions, then copy the report and paste it back.
import { h, $, copyText } from './dom.js';
import { Feel, loadSettings, saveSettings } from './feel.js';
import { PATTERNS, RECIPES, BLOW_MIN_MS } from './core.js';

const settings = loadSettings();
settings.touchOnly = false; // this page is only useful with the channels on
const report = { when: new Date().toISOString(), answers: {} };
const feel = new Feel(settings, { onChange: () => refreshLive(), onVisual: () => {}, onSound: () => {} });

// ------------------------------------------------------------ helpers
const ask = (key, q, options) => {
  const row = h('div', { class: 'row' });
  const out = h('small', { class: 'muted' }, '');
  options.forEach((o) => row.append(h('button', { onClick: () => { report.answers[key] = o; out.textContent = `noted: ${o}`; } }, o)));
  return h('div', {}, h('p', { class: 'muted' }, q), row, out);
};
const section = (title, ...kids) => h('section', {}, h('h2', {}, title), ...kids);
const kv = (obj) => h('table', { class: 'kv' }, ...Object.entries(obj).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, String(v)))));

// ------------------------------------------------------------ device info
const info = {
  userAgent: navigator.userAgent,
  secureContext: window.isSecureContext,
  screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}`,
  standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  'navigator.vibrate': typeof navigator.vibrate === 'function',
  'DeviceOrientationEvent': typeof window.DeviceOrientationEvent !== 'undefined',
  'orientation permission needed': typeof window.DeviceOrientationEvent?.requestPermission === 'function',
  'DeviceMotionEvent': typeof window.DeviceMotionEvent !== 'undefined',
  'AudioContext': !!(window.AudioContext || window.webkitAudioContext),
  'audioSession API': !!navigator.audioSession,
  'getUserMedia': !!navigator.mediaDevices?.getUserMedia,
  'speechSynthesis': 'speechSynthesis' in window,
  'wakeLock': 'wakeLock' in navigator,
};
report.info = info;

// ------------------------------------------------------------ vibration
const buzzOut = h('p', { class: 'muted' }, '');
function raw(pattern, label) {
  if (typeof navigator.vibrate === 'function') { const ok = navigator.vibrate(pattern); buzzOut.textContent = `${label}: navigator.vibrate returned ${ok}`; }
  else buzzOut.textContent = `${label}: no navigator.vibrate on this phone (expected on iPhone)`;
}
let sw = null;
function iosTick(times, gap) {
  if (!sw) {
    sw = document.createElement('label');
    sw.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', '');
    sw.append(i); document.body.append(sw);
  }
  for (let n = 0; n < times; n++) setTimeout(() => sw.click(), n * gap);
  buzzOut.textContent = `iPhone tick trick: ${times} toggle(s), ${gap} ms apart. Did you feel it?`;
}
const vibration = section('1 · Buzz (vibration)',
  kv({ 'navigator.vibrate': info['navigator.vibrate'] ? 'yes' : 'no' }),
  h('div', { class: 'row' }, ...Object.entries(PATTERNS).map(([name, p]) => h('button', { onClick: () => raw(p, name) }, name))),
  h('div', { class: 'row' },
    h('button', { onClick: () => iosTick(1, 0) }, 'iPhone tick ×1'),
    h('button', { onClick: () => iosTick(3, 120) }, '×3 (120 ms)'),
    h('button', { onClick: () => iosTick(8, 60) }, '×8 (60 ms)')),
  buzzOut,
  ask('buzz_felt', 'Could you feel the patterns?', ['yes, all', 'some', 'none']),
  ask('buzz_distinct', 'Could you tell tick, click, thunk and snap apart?', ['yes', 'barely', 'no']),
  ask('ios_tick', 'iPhone only: did the tick trick buzz?', ['yes, ×1', 'only ×3/×8', 'no', 'not an iPhone']));

// ------------------------------------------------------------ motion
const live = h('div', {});
const tiltBtn = h('button', { class: 'primary', onClick: async () => { const r = await feel.enableTilt(); report.answers.motion_result = r; refreshLive(); } }, 'Enable motion (tap)');
function refreshLive() {
  const a = feel.angles, g = feel.grav;
  const f = (n) => (typeof n === 'number' ? n.toFixed(1) : '–');
  live.replaceChildren(kv({
    'tilt state': feel.tiltState,
    'report rate': `${feel.rateHz} Hz`,
    'screen angle': feel.screenAngle(),
    'alpha / beta / gamma': `${f(a.alpha)} / ${f(a.beta)} / ${f(a.gamma)}`,
    'tilt x / y (after zero, dead zone, smoothing)': `${f(feel.tilt.x)} / ${f(feel.tilt.y)}`,
    'gravity x / y / z': g ? `${f(g.x)} / ${f(g.y)} / ${f(g.z)}` : '–',
    'dial angle (twist)': feel.dial === null ? 'none (phone flat or no data)' : f(feel.dial),
    'mic': feel.micState,
    'sound': feel.soundState,
  }));
}
setInterval(refreshLive, 150);
const motion = section('2 · Tilt (gyroscope)',
  h('p', { class: 'muted' }, 'On iPhone the first tap shows a permission prompt. Then tilt the phone: the numbers should move.'),
  h('div', { class: 'row' }, tiltBtn, h('button', { onClick: () => feel.holdLevel() }, 'Hold level'), h('button', { onClick: () => { settings.dialInvert = !settings.dialInvert; saveSettings(settings); } }, 'Flip twist direction')),
  live,
  ask('motion_prompt', 'Did a permission prompt appear?', ['yes, I allowed', 'yes, I denied', 'no prompt']),
  ask('tilt_feel', 'Is tilt smooth enough to steer with?', ['smooth', 'jittery', 'laggy', 'dead']),
  ask('twist_dir', 'Hold the phone upright and turn it clockwise like a steering wheel. Does the dial angle go up?', ['up', 'down', 'no number']),
  ask('landscape', 'Turn the phone sideways. Does tilt x/y still follow the screen?', ['yes', 'no', 'rotation is locked']));

// ------------------------------------------------------------ sound
const soundBtn = h('button', { class: 'primary', onClick: async () => { const s = await feel.unlockSound(); report.answers.sound_state = s; refreshLive(); feel.sound('click'); } }, 'Unlock sound (tap)');
const chBtn = h('button', { onClick: async () => { settings.audioChannel = settings.audioChannel === 'media' ? 'normal' : 'media'; saveSettings(settings); chBtn.textContent = `Audio channel: ${settings.audioChannel}`; if (feel.ctx) await feel.unlockSound(); } }, `Audio channel: ${settings.audioChannel}`);
const sound = section('3 · Sound',
  h('p', { class: 'muted' }, 'Try with the side silent switch on, then off. If silent mode blocks it, try the media channel.'),
  h('div', { class: 'row' }, soundBtn, chBtn),
  h('div', { class: 'row' }, ...Object.keys(RECIPES).map((n) => h('button', { onClick: () => feel.sound(n) }, n))),
  ask('silent_switch', 'With the silent switch ON, could you hear it on the normal channel?', ['yes', 'no', 'no switch on this phone']),
  ask('media_channel', 'With the media channel, could you hear it on silent?', ['yes', 'no', 'did not try']),
  ask('speaker', 'Do the five notes and the thunk sound clear through the speaker?', ['clear', 'thin', 'harsh', 'too quiet']),
  ask('delay', 'Is the delay from tap to sound noticeable?', ['no', 'a little', 'yes']));

// ------------------------------------------------------------ breath
const meter = h('div', { class: 'meter' }, h('i'), h('u'));
const blowTxt = h('p', { class: 'big' }, '');
feel.onBreath((level, blowing) => {
  meter.firstChild.style.width = `${Math.min(100, level * 220)}%`;
  meter.lastChild.style.left = `${Math.min(100, feel.blowThreshold * 220)}%`;
  blowTxt.textContent = blowing ? 'BREATH' : '';
  blowTxt.className = `big ${blowing ? 'ok' : ''}`;
});
const breath = section('4 · Breath (microphone loudness only)',
  h('p', { class: 'muted' }, `Stay quiet for a second after you start (that sets the room level). Then blow on the phone for ${BLOW_MIN_MS} ms or more. Nothing is recorded.`),
  h('div', { class: 'row' }, h('button', { class: 'primary', onClick: async () => { const r = await feel.startBreath(); report.answers.mic_result = r; } }, 'Start mic (tap)'), h('button', { onClick: () => feel.stopBreath() }, 'Stop')),
  meter, blowTxt,
  ask('blow_detect', 'Does a real breath show BREATH?', ['every time', 'sometimes', 'never']),
  ask('blow_false', 'Does talking, a cough or a table knock show BREATH?', ['never', 'sometimes', 'often']));

// ------------------------------------------------------------ report
const out = h('textarea', { class: 'out', readonly: true });
const reportSec = section('5 · Report',
  h('p', { class: 'muted' }, 'Copy this and paste it back. It holds the device facts, your answers and the last log lines. No audio, no personal data.'),
  h('div', { class: 'row' }, h('button', { class: 'primary', onClick: async (e) => {
    report.log = feel.log.slice(-40);
    report.settings = { hapticMode: settings.hapticMode, audioChannel: settings.audioChannel, dialInvert: settings.dialInvert };
    report.live = { tiltState: feel.tiltState, rateHz: feel.rateHz, sound: feel.soundState, mic: feel.micState, screenAngle: feel.screenAngle() };
    out.value = JSON.stringify(report, null, 1);
    e.target.textContent = (await copyText(out.value)) ? 'Copied. Paste it back.' : 'Select the text below and copy it.';
  } }, 'Build and copy the report')),
  out);

$('#app').append(
  h('header', { class: 'bar' }, h('a', { class: 'back', href: './index.html' }, '‹'), h('h1', {}, 'Check my phone')),
  h('p', { class: 'muted' }, 'Four short tests. Each puzzle uses these four channels as extras; touch always works.'),
  section('0 · This phone', kv(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v])))),
  vibration, motion, sound, breath, reportSec);
refreshLive();
