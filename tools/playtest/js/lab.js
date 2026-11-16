// The device lab: open one link on several devices, see who is on it, fire sound, light and buzz on this device,
// or push them to one device, some, or all, timed together from the server clock.
import { h, svg, $, copyText } from './dom.js';
import { Feel, loadSettings, saveSettings } from './feel.js';
import { FxPlayer } from './fx.js';
import { LabClient, labUrl } from './net.js';
import { qrMatrix, qrPath } from './qr.js';
import { SOUND_NAMES, BUZZ_NAMES, LIGHT_NAMES, COMBO_NAMES, ROOM_RE, newRoomCode, platformOf } from './protocol.js';

const settings = loadSettings();
settings.touchOnly = false; // the lab is only useful with every channel on

// ------------------------------------------------------------ room and name
const hashRoom = new URLSearchParams(location.hash.slice(1)).get('room')?.toUpperCase();
const room = hashRoom && ROOM_RE.test(hashRoom) ? hashRoom : newRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
if (room !== hashRoom) history.replaceState(null, '', `${location.pathname}#room=${room}`);
const NAME_KEY = 'hw-lab-name';
let myName = localStorage.getItem(NAME_KEY) || `${platformOf(navigator.userAgent)}-${String(crypto.getRandomValues(new Uint8Array(1))[0] % 100).padStart(2, '0')}`;
const link = `${location.origin}${location.pathname}#room=${room}`;

// ------------------------------------------------------------ the feel layer and the player
const fx = h('div', { id: 'fx' });
const fxLabel = h('div', { id: 'fxlabel' });
document.body.append(fx, fxLabel);
let fxTimer = 0;
const label = (t) => { fxLabel.textContent = t; clearTimeout(fxTimer); fxTimer = setTimeout(() => { fxLabel.textContent = ''; }, 900); };
let capsTimer = 0;
const feel = new Feel(settings, {
  onVisual: (name) => { fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on'); label(`buzz ${name}`); },
  onSound: (name) => label(`♪ ${name}${feel.soundState === 'on' || feel.soundState === 'media' ? '' : ' (muted)'}`),
  onChange: () => { renderChips(); clearTimeout(capsTimer); capsTimer = setTimeout(() => client.updateCaps(), 300); },
});
const reducedNow = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = new FxPlayer({ feel, reduced: reducedNow, getName: () => myName });
const caps = () => ({
  vibrate: typeof navigator.vibrate === 'function', haptic: feel.hapticsResolved, sound: feel.soundState, tilt: feel.tiltState,
  reducedMotion: reducedNow(), standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  screen: `${screen.width}x${screen.height}`, platform: platformOf(navigator.userAgent),
});

// ------------------------------------------------------------ the connection
const state = { mode: 'local', tab: 'sound', target: 'all', selected: new Set(), lead: 500, spread: 0, last: {}, log: [] };
const logEl = h('div', { class: 'log', role: 'log', 'aria-live': 'polite' });
function addLog(text, tone = '') {
  const t = new Date().toLocaleTimeString([], { hour12: false });
  state.log.unshift({ t, text, tone });
  state.log.length = Math.min(state.log.length, 80);
  logEl.replaceChildren(...state.log.map((l) => h('div', { class: l.tone }, `${l.t}  ${l.text}`)));
}
const fxName = (f) => (f.kind === 'identify' ? 'identify' : `${f.kind} ${f.name}`);
const sign = (n) => `${n >= 0 ? '+' : ''}${n}`;

const makeSocket = window.__makeLabSocket || ((u) => new WebSocket(u));
const client = new LabClient({
  url: labUrl(location, room), name: myName, getCaps: caps, makeSocket,
  onFx: async (m) => player.play(m.fx),
  onEvent: (e) => {
    switch (e.type) {
      case 'status': renderChips(); if (e.status === 'offline') addLog('connection lost, retrying…', 'bad'); break;
      case 'roster': if (e.welcome) addLog(`connected as ${myName}. ${e.devices.length} device${e.devices.length === 1 ? '' : 's'} on this link.`, 'ok'); renderDevices(); break;
      case 'joined': addLog(`+ ${e.device.name} joined (${e.device.platform})`, 'ok'); break;
      case 'left': addLog(`− ${e.device.name} left`, 'bad'); break;
      case 'sync': renderChips(); break;
      case 'pushed': addLog(`pushed ${fxName(e.fx)} to ${e.targets.length} device${e.targets.length === 1 ? '' : 's'}, start in ${e.lead} ms${e.spread ? `, wave ${e.spread} ms apart` : ''}`); break;
      case 'ack': {
        const late = Number.isFinite(e.lateMs) ? ` ${sign(e.lateMs)} ms` : '';
        state.last[e.id] = `${e.status}${e.reason ? ` (${e.reason})` : ''}${late}`;
        addLog(`${e.name}: ${state.last[e.id]}`, e.status === 'played' ? 'ok' : e.status === 'dropped' ? 'bad' : 'warn');
        renderDevices();
        break;
      }
      case 'played': addLog(`got ${fxName(e.fx.fx)} from ${e.fx.fromName}: ${e.result.status}${e.result.reason ? ` (${e.result.reason})` : ''}, ${sign(e.lateMs)} ms vs plan`, e.result.status === 'played' ? 'ok' : 'warn'); break;
      case 'dropped': addLog(`dropped ${fxName(e.fx.fx)} from ${e.fx.fromName}: would start ${e.lateMs} ms late`, 'bad'); break;
      case 'error': addLog(`error: ${e.code}`, 'bad'); break;
      default: break;
    }
  },
});
window.__lab = { client, player, feel, state, room };

// ------------------------------------------------------------ firing
function fire(f) {
  if (state.mode === 'local') {
    player.play(f).then((r) => addLog(`local ${fxName(f)}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`, r.status === 'played' ? 'ok' : 'warn'));
    return;
  }
  const to = state.target === 'selected' ? [...state.selected] : state.target;
  if (state.target === 'selected' && to.length === 0) return addLog('pick at least one device first', 'warn');
  client.push(f, { to, lead: state.lead, spread: state.spread });
}
function identify(id) {
  if (id === client.id) return player.identify(3000);
  client.push({ kind: 'identify', ms: 3000 }, { to: [id], lead: 300 });
}

// ------------------------------------------------------------ the page
/** The link as a QR code, drawn here (no outside service): dark modules on a white tile with a quiet zone. */
function qrEl(text) {
  const { size, d } = qrPath(qrMatrix(text, 'M'), 4);
  return svg('svg', { class: 'qr', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `QR code for ${text}`, 'shape-rendering': 'crispEdges' },
    svg('rect', { width: size, height: size, fill: '#fff' }), svg('path', { d, fill: '#000' }));
}
const dot = h('span', { class: 'dot' });
const chips = h('div', { class: 'chips' });
function chip(k, v, state_) { return h('span', { class: 'chip', 'data-s': state_ || '' }, h('b', {}, k), v); }
function renderChips() {
  const s = feel.summary();
  dot.className = `dot ${client.status === 'online' ? 'on' : client.status === 'connecting' ? 'connecting' : 'off'}`;
  chips.replaceChildren(
    chip('Link', client.status, client.status === 'online' ? 'on' : 'denied'),
    chip('Buzz', s.buzz, s.buzz),
    chip('Sound', s.sound === 'locked' ? 'muted, tap Allow' : s.sound, s.sound),
    chip('Light', reducedNow() ? 'off (reduced motion)' : 'ok', reducedNow() ? 'denied' : 'on'),
    chip('Clock', client.err === null ? 'syncing…' : `±${Math.round(client.err)} ms`, client.err === null ? 'locked' : client.err <= 75 ? 'on' : 'visual'));
}
const devicesEl = h('div', {});
function renderDevices() {
  const me = client.id;
  devicesEl.replaceChildren(...client.roster.map((d) => {
    const c = d.caps || {};
    const isMe = d.id === me;
    const box = h('input', { type: 'checkbox', 'aria-label': `Select ${d.name}`, checked: state.selected.has(d.id), onChange: (e) => { e.target.checked ? state.selected.add(d.id) : state.selected.delete(d.id); } });
    return h('div', { class: `dev${isMe ? ' me' : ''}` },
      h('div', { class: 'top' }, box, h('b', {}, `${d.name}${isMe ? ' (this device)' : ''}`), h('span', { class: 'badge' }, d.platform), h('button', { style: { minHeight: '40px' }, onClick: () => identify(d.id) }, 'Identify')),
      h('div', { class: 'badges' },
        h('span', { class: `badge ${c.haptic === 'vibrate' ? 'ok' : 'warn'}` }, `buzz ${c.haptic || '?'}`),
        h('span', { class: `badge ${c.sound === 'on' || c.sound === 'media' ? 'ok' : 'warn'}` }, `sound ${c.sound || '?'}`),
        c.reducedMotion ? h('span', { class: 'badge bad' }, 'reduced motion') : h('span', { class: 'badge ok' }, 'light ok'),
        Number.isFinite(c.rtt) ? h('span', { class: 'badge' }, `rtt ${c.rtt} ms`) : null,
        Number.isFinite(c.err) ? h('span', { class: `badge ${c.err <= 75 ? 'ok' : 'warn'}` }, `clock ±${c.err} ms`) : null,
        c.screen ? h('span', { class: 'badge' }, c.screen) : null),
      state.last[d.id] ? h('div', { class: 'muted', style: { fontSize: '13px' } }, `last: ${state.last[d.id]}`) : null);
  }));
  $('#count').textContent = String(client.roster.length);
}

const TABS = { sound: SOUND_NAMES, light: LIGHT_NAMES, buzz: BUZZ_NAMES, combo: COMBO_NAMES };
const grid = h('div', { class: 'fxgrid' });
function renderGrid() {
  grid.replaceChildren(...TABS[state.tab].map((name) => h('button', { onClick: () => fire({ kind: state.tab, name }) }, name.replace(/_/g, ' '))));
  for (const b of tabSeg.children) b.setAttribute('aria-pressed', String(b.dataset.k === state.tab));
}
const tabSeg = h('div', { class: 'seg wide' }, ...[['sound', 'Sound'], ['light', 'Light'], ['buzz', 'Buzz'], ['combo', 'Combos']].map(([k, t]) => h('button', { 'data-k': k, onClick: () => { state.tab = k; renderGrid(); } }, t)));
const modeSeg = h('div', { class: 'seg wide' }, ...[['local', 'This device'], ['push', 'Push to others']].map(([k, t]) => h('button', { 'data-m': k, onClick: () => { state.mode = k; renderMode(); } }, t)));
const pushOpts = h('div', {});
function select(label, opts, get, set) {
  return h('label', { class: 'set' }, label, h('select', { onChange: (e) => set(Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) }, ...opts.map(([v, t]) => h('option', { value: v, selected: String(get()) === String(v) }, t))));
}
function renderMode() {
  for (const b of modeSeg.children) b.setAttribute('aria-pressed', String(b.dataset.m === state.mode));
  pushOpts.replaceChildren(...(state.mode === 'push' ? [
    select('Send to', [['all', 'All devices (incl. this one)'], ['others', 'All other devices'], ['selected', 'Ticked devices']], () => state.target, (v) => { state.target = v; }),
    select('Start in', [[300, '300 ms'], [500, '500 ms'], [800, '800 ms'], [1500, '1.5 s']], () => state.lead, (v) => { state.lead = v; }),
    select('Spread (one after another)', [[0, 'all at once'], [250, '250 ms'], [400, '400 ms (restless)'], [800, '800 ms']], () => state.spread, (v) => { state.spread = v; }),
    h('p', { class: 'hint' }, 'Every device gets the same start time from the server clock. Devices that cannot start in time drop the effect.'),
  ] : [h('p', { class: 'hint' }, 'Fires here and now, so you can compare it with a pushed one.')]));
}

const nameInput = h('input', { class: 'text', value: myName, maxlength: 16, 'aria-label': 'This device name', onChange: (e) => {
  myName = e.target.value.trim().slice(0, 16) || myName; localStorage.setItem(NAME_KEY, myName); client.rename(myName);
} });
const allowBtn = h('button', { class: 'primary', style: { width: '100%' }, onClick: async () => {
  await feel.unlockSound(); feel.newAttempt(); feel.buzz('tick'); feel.sound('click');
  allowBtn.textContent = feel.soundState === 'locked' ? 'Allow sound again' : 'Sound, light and buzz allowed on this device';
  client.updateCaps();
} }, 'Allow sound, light & buzz (tap once)');
const modes = ['auto', 'vibrate', 'ios-tick', 'visual'];

$('#app').append(
  h('header', { class: 'bar' }, h('a', { class: 'back', href: './index.html', 'aria-label': 'All tests' }, '‹'), h('h1', {}, 'Device lab'), dot),
  h('h2', {}, 'This link'),
  h('div', { class: 'room', 'aria-label': 'Room code' }, room),
  qrEl(link),
  h('p', { class: 'hint' }, 'Scan with the other device\'s camera to join this room.'),
  h('div', { class: 'row' },
    h('button', { onClick: async (e) => { e.target.textContent = (await copyText(link)) ? 'Link copied' : link; } }, 'Copy link'),
    navigator.share ? h('button', { onClick: () => navigator.share({ title: 'Hauntology device lab', url: link }).catch(() => {}) }, 'Share') : null),
  h('p', { class: 'hint' }, 'Open this link on the other devices. Anyone with the link can push sounds, light and buzz to the devices on it.'),
  h('h2', {}, 'This device'),
  nameInput, chips, allowBtn,
  h('div', { class: 'row' },
    h('button', { onClick: () => { settings.hapticMode = modes[(modes.indexOf(settings.hapticMode) + 1) % modes.length]; saveSettings(settings); feel.newAttempt(); feel.buzz('thunk'); addLog(`buzz mode ${settings.hapticMode} (using ${feel.hapticsResolved})`); renderChips(); client.updateCaps(); } }, 'Buzz mode'),
    h('button', { onClick: async () => { const r = await feel.enableTilt(); addLog(`tilt: ${r}`, r === 'on' ? 'ok' : 'warn'); client.updateCaps(); } }, 'Enable tilt')),
  h('h2', {}, h('span', {}, 'Devices on this link ('), h('span', { id: 'count' }, '0'), h('span', {}, ')')),
  devicesEl,
  h('h2', {}, 'Fire'),
  modeSeg, pushOpts, tabSeg, grid,
  h('h2', {}, 'What happened'),
  logEl);

renderChips(); renderMode(); renderGrid(); renderDevices();
addLog(`room ${room}. connecting…`);
client.connect();
