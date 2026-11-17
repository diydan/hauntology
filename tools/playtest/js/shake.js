// "Shake together" demo: shared actions that need more than one Player, and what each phone feels by where it is.
// On its own, you are one phone on a small floor plan and three more phones (Mara, Ned, Ivy) are pretend, so one phone can try the rules.
// Join a room (the same code on two or more phones) and the pretend phones go: the Worker counts the real phones and tells each what it feels.
// Tap the plan to move yourself, Turn to face another way. A shared action fires only when enough different Players act inside two seconds.
import { h, $ } from './dom.js';
import { jolt } from './knock-core.js';
import { ACTIONS, INITIAL_STATE, SPOTS, WINDOW_MS, applyAction, feel, makeShakeDetector, makeTogether } from './shake-core.js';
import { LabClient, labUrl } from './net.js';
import { ROOM_RE, newRoomCode, platformOf } from './protocol.js';

const app = $('#app');
const SIZE = 10; // the room is 10 m by 10 m
const phones = [
  { id: 'you', name: 'You', x: 3, y: 7, facing: 315, you: true },
  { id: 'mara', name: 'Mara', x: 4, y: 3, facing: 0 },
  { id: 'ned', name: 'Ned', x: 8, y: 8, facing: 270 },
  { id: 'ivy', name: 'Ivy', x: 1.5, y: 2, facing: 90 },
];
const together = Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, makeTogether(a)]));
let action = 'chair';
let localState = INITIAL_STATE;

// ------------------------------------------------------------ sound and buzz (our own files, as on the Secret knock page)
const sounds = {};
function play(name, volume) {
  try {
    const a = (sounds[name] ||= new Audio(`media/${name}.m4a`));
    a.currentTime = 0; a.volume = Math.max(0, Math.min(1, volume)); a.play().catch(() => {});
  } catch { /* no sound: the words carry it */ }
}
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* no buzz */ } };
const SOUND_OF = { knock: 'knock', chair: 'scrape', wind: 'creak', bigDoor: 'creak' };
const BUZZ_OF = { knock: 25, chair: [40, 40, 40, 40, 40], wind: [20, 30, 20, 30, 20], bigDoor: [80, 60, 80] };

/** The room's memory on the plan: the big door open or shut, the chair one step further each time it moves. */
function showState(st) {
  spots.bigDoor.textContent = `big door: ${st.bigDoor}`;
  spots.bigDoor.classList.toggle('sh-open', st.bigDoor === 'open');
  spots.chair.textContent = st.chair ? `chair (moved ${st.chair})` : 'chair';
  spots.chair.style.marginLeft = `${st.chair * 10}px`;
}
const words = (f) => (f.level === 'none' ? 'feels nothing' : f.level === 'faint' ? 'hears it faintly (facing away)' : f.level === 'strong' ? 'feels it, buzz and sound' : 'sees and hears it, no buzz');
/** What this phone does with what it feels: sound, buzz, and the picture shake (not with reduced motion). */
function feelIt(act, f) {
  if (f.sound) play(SOUND_OF[act], f.sound);
  if (f.buzz) buzz(BUZZ_OF[act]);
  if (f.picture) { plan.classList.remove('sh-wobble'); void plan.offsetWidth; plan.classList.add('sh-wobble'); }
}

// ------------------------------------------------------------ one act by one Player
function act(id) {
  if (client) { client.send({ t: 'act', action }); return; }
  const r = together[action].add(id, performance.now());
  const who = phones.find((p) => p.id === id).name;
  if (!r.fired) {
    status.textContent = `${who}: ${ACTIONS[action].label}. ${r.count} of ${r.need}. Nothing yet, the others must act within ${WINDOW_MS / 1000} s.`;
    draw();
    return;
  }
  const src = SPOTS[action];
  localState = applyAction(localState, action);
  showState(localState);
  const lines = phones.map((p) => {
    const f = feel(src, p);
    if (p.you) feelIt(action, f);
    return `${p.name}: ${words(f)} (${f.meters.toFixed(1)} m)`;
  });
  status.textContent = `${ACTIONS[action].label}: ${r.who.map((i) => phones.find((p) => p.id === i).name).join(' and ')} together, at the ${src.name}.`;
  log.replaceChildren(...lines.map((l) => h('li', {}, l)));
  say(status.textContent);
  draw();
}

// ------------------------------------------------------------ your own shake (motion sensor); Tap works without it
const detector = makeShakeDetector();
let prev = null;
function onMotion(e) {
  const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : e.accelerationIncludingGravity;
  if (!a) return;
  const cur = { x: a.x, y: a.y, z: a.z };
  if (detector.motion(performance.now(), jolt(prev, cur))) act(client ? client.id : 'you');
  prev = cur;
}
async function startShake() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') throw new Error('refused');
    }
    addEventListener('devicemotion', onMotion);
    sensorText.textContent = 'Shake your phone to act as You. (Motion only; nothing is recorded.)';
  } catch { sensorText.textContent = 'No motion on this phone: use the You acts button.'; }
}

// ------------------------------------------------------------ the page
const px = (m) => `${(m / SIZE) * 100}%`;
function draw() {
  for (const p of phones) {
    const el = dots[p.id];
    el.style.left = px(p.x); el.style.top = px(p.y);
    el.style.setProperty('--face', `${p.facing}deg`);
  }
  for (const a of Object.keys(ACTIONS)) spots[a].classList.toggle('sh-on', a === action);
  for (const b of actionBtns) b.setAttribute('aria-checked', String(b.dataset.action === action));
  const need = ACTIONS[action].need;
  needText.textContent = `${ACTIONS[action].label} needs ${need} ${need === 1 ? 'Player' : 'Players'} at once.`;
}
function say(text) { live.textContent = text; }
function moveYou(ev) {
  const r = plan.getBoundingClientRect();
  const you = phones[0];
  you.x = Math.max(0, Math.min(SIZE, ((ev.clientX - r.left) / r.width) * SIZE));
  you.y = Math.max(0, Math.min(SIZE, ((ev.clientY - r.top) / r.height) * SIZE));
  sendPos();
  draw();
}
function sendPos() { if (client) client.send({ t: 'pos', x: phones[0].x, y: phones[0].y, facing: phones[0].facing }); }

// ------------------------------------------------------------ a room: the same code on two or more phones
let client = null;
const hashRoom = new URLSearchParams(location.hash.slice(1)).get('room')?.toUpperCase();
const NAME_KEY = 'hw-lab-name';
const myName = localStorage.getItem(NAME_KEY) || `${platformOf(navigator.userAgent)}-${String(crypto.getRandomValues(new Uint8Array(1))[0] % 100).padStart(2, '0')}`;
const pretend = phones.slice(1);
function joinRoom(code) {
  if (client) return;
  const room = ROOM_RE.test(code) ? code : newRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
  history.replaceState(null, '', `${location.pathname}#room=${room}`);
  roomText.textContent = `Room ${room}. Open ${location.origin}${location.pathname}#room=${room} on another phone.`;
  phones.splice(1); // the pretend phones go
  client = new LabClient({
    url: labUrl(location, room), name: myName,
    getCaps: () => ({ vibrate: typeof navigator.vibrate === 'function', platform: platformOf(navigator.userAgent) }),
    onEvent: (e) => {
      if (e.type === 'roster') { if (e.state) showState(e.state); syncRoster(e.devices); status.textContent = `${e.devices.length} ${e.devices.length === 1 ? 'phone' : 'phones'} in the room.`; }
      else if (e.type === 'pos') { const p = phones.find((x) => x.id === e.id); if (p) Object.assign(p, e.pos); draw(); }
      else if (e.type === 'acted') status.textContent = `${e.name}: ${ACTIONS[e.action].label}. ${e.count} of ${e.need}. The others must act within ${WINDOW_MS / 1000} s.`;
      else if (e.type === 'shared') {
        showState(e.state);
        feelIt(e.action, e);
        status.textContent = `${ACTIONS[e.action].label}: ${e.who.join(' and ')} together, at the ${e.src.name}. You ${words(e)} (${e.meters.toFixed(1)} m).`;
        log.replaceChildren(h('li', {}, `You: ${words(e)} (${e.meters.toFixed(1)} m)`));
        say(status.textContent);
      } else if (e.type === 'error') status.textContent = e.code === 'rate_limited' ? 'Too fast. Wait a second.' : `The room said: ${e.code}.`;
    },
  });
  client.connect();
  // say where we are once we are in, and again whenever we move or turn
  const t = setInterval(() => { if (client.status === 'online') { sendPos(); clearInterval(t); } }, 300);
  joinBtn.disabled = true;
  for (const b of pretendBtns) b.hidden = true;
  draw();
}
/** The roster is the real phones: keep ours, add the others at the place they last said (or a default), drop those that left. */
function syncRoster(devices) {
  const me = phones[0];
  me.id = client.id;
  const rest = devices.filter((d) => d.id !== client.id);
  phones.splice(1);
  rest.forEach((d, i) => {
    phones.push({ id: d.id, name: d.name, x: d.pos?.x ?? 2 + (i % 4) * 2, y: d.pos?.y ?? 9, facing: d.pos?.facing ?? 270 });
    if (!dots[d.id]) { dots[d.id] = makeDot(phones.at(-1)); plan.append(dots[d.id]); }
  });
  for (const id of Object.keys(dots)) if (id !== 'you' && id !== me.id && !phones.some((p) => p.id === id)) { dots[id].remove(); delete dots[id]; }
  if (dots.you && me.id !== 'you') { dots[me.id] = dots.you; delete dots.you; }
  draw();
}

const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }, '');
const status = h('p', { role: 'status' }, 'Pick an action, then act as You and as the others.');
const needText = h('p', { class: 'muted' }, '');
const sensorText = h('p', { class: 'muted' }, 'Tap Start to shake your phone as You. Or use the You acts button.');
const log = h('ul', { class: 'sh-log' });
const makeDot = (p) => h('span', { class: `sh-phone${p.you ? ' sh-you' : ''}`, 'aria-hidden': 'true' }, h('i', {}), h('b', {}, p.name));
const dots = Object.fromEntries(phones.map((p) => [p.id, makeDot(p)]));
const spots = Object.fromEntries(Object.entries(SPOTS).map(([a, s]) => [a, h('span', { class: 'sh-spot', style: `left:${px(s.x)};top:${px(s.y)}`, 'aria-hidden': 'true' }, s.name)]));
const plan = h('div', { class: 'sh-plan', role: 'img', 'aria-label': 'Floor plan of the room with four phones and four places', onClick: moveYou }, ...Object.values(spots), ...Object.values(dots));
const actionBtns = Object.entries(ACTIONS).map(([a, v]) => h('button', { role: 'radio', 'aria-checked': 'false', 'data-action': a, onClick: () => { action = a; together[a].reset(); status.textContent = 'Pick who acts.'; draw(); } }, `${v.label} (${v.need})`));
const pretendBtns = pretend.map((p) => h('button', { onClick: () => act(p.id) }, `${p.name} acts`));
const youBtn = h('button', { class: 'primary', onClick: () => act(client ? client.id : 'you') }, 'You act');
const joinBtn = h('button', { onClick: () => joinRoom(hashRoom ?? '') }, hashRoom ? `Join room ${hashRoom}` : 'Start a room');
const roomText = h('p', { class: 'muted' }, 'On your own, the other three phones are pretend. Start a room to use real phones.');
const turnBtn = h('button', { onClick: () => { phones[0].facing = (phones[0].facing + 90) % 360; sendPos(); draw(); } }, 'Turn right');
const style = h('style', {}, `
.sh-plan{position:relative;width:min(92vw,360px);aspect-ratio:1;margin:10px auto;background:#14100c;border:4px solid #3b2a1c;border-radius:6px;touch-action:manipulation}
.sh-spot{position:absolute;transform:translate(-50%,-50%);font-size:.7rem;padding:2px 6px;border:1px solid #6b5a3a;border-radius:10px;background:#241b12;color:#d9c9a0;white-space:nowrap}
.sh-spot.sh-open{border-style:dashed;color:#6a8f7a}
.sh-spot.sh-on{border-color:#e0a43a;color:#e0a43a;background:#33260f}
.sh-phone{position:absolute;width:0;height:0}
.sh-phone i{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;background:#6a8f7a;border:2px solid #0e0f14}
.sh-phone i::after{content:"";position:absolute;left:50%;top:50%;width:18px;height:2px;margin-top:-1px;background:#f0e4c0;transform-origin:0 50%;transform:rotate(var(--face))}
.sh-phone b{position:absolute;left:-20px;top:12px;font-size:.7rem;font-weight:400;color:#d9c9a0;white-space:nowrap}
.sh-you i{background:#e0a43a}
.sh-wobble{animation:sh-wobble .5s ease-in-out}
@keyframes sh-wobble{0%,100%{transform:none}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.sh-log{list-style:none;padding:0;margin:6px 0;font-size:.9rem}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.sh-wobble{animation:none}}`);

app.append(style,
  h('header', { class: 'bar' }, h('a', { href: 'index.html' }, '← Playtest'), h('h1', {}, 'Shake together')),
  h('p', { class: 'muted' }, 'One room, four phones. Some things need more than one Player at once. What a phone feels depends on where it is and which way it faces.'),
  h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Action' }, ...actionBtns),
  needText,
  plan,
  h('p', { class: 'muted' }, 'Tap the plan to move You. The line on each dot is the way it faces.'),
  h('div', { class: 'row' }, youBtn, ...pretendBtns, turnBtn),
  h('div', { class: 'row' }, joinBtn), roomText,
  h('div', { class: 'row' }, h('button', { onClick: (e) => { e.target.disabled = true; startShake(); } }, 'Start')),
  sensorText, status, log, live);

draw();
