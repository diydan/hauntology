// The device lab protocol: what can be pushed, how a push is validated and timed, and how names and
// capabilities are cleaned. Pure. Shared by the Worker (src/) and the browser pages (js/).
import { PATTERNS, RECIPES } from './core.js';
import { LIGHT_NAMES, LIGHT_MAX_MS } from './light.js';

export const MAX_DEVICES = 16;
export const MAX_MESSAGE_CHARS = 2048;
export const NAME_MAX = 16;
export const LEAD_DEFAULT_MS = 500;
export const LEAD_MIN_MS = 200;
export const LEAD_MAX_MS = 3000;
export const SPREAD_MAX_MS = 2000;
export const DROP_LATE_MS = 150; // a device that would start this late drops the effect instead of playing it late
export const ROOM_RE = /^[A-HJ-NP-Z2-9]{4,8}$/; // no 0, O, 1, I

export const SOUND_NAMES = Object.keys(RECIPES);
export const BUZZ_NAMES = Object.keys(PATTERNS);
export { LIGHT_NAMES };

/** Combos: each part is played together on the device, at its own delay from the start. */
export const COMBOS = {
  house_cue: [{ kind: 'sound', name: 'creak' }, { kind: 'buzz', name: 'buzz' }, { kind: 'light', name: 'glow' }],
  rattle_1: [{ kind: 'sound', name: 'creak' }, { kind: 'light', name: 'glow' }],
  rattle_2: [{ kind: 'sound', name: 'wind' }, { kind: 'buzz', name: 'snap' }, { kind: 'light', name: 'wave' }],
  rattle_3: [{ kind: 'sound', name: 'rumble' }, { kind: 'buzz', name: 'rumble' }, { kind: 'light', name: 'creeping_dark' }],
  becoming: [{ kind: 'sound', name: 'becoming' }, { kind: 'buzz', name: 'heartbeat' }, { kind: 'light', name: 'creeping_dark' }],
  // three beats 600 ms apart on every device at the same instant: for hearing and seeing whether phones are in step
  sync_probe: [0, 600, 1200].flatMap((d) => [{ kind: 'sound', name: 'tick', delayMs: d }, { kind: 'buzz', name: 'tick', delayMs: d }, { kind: 'light', name: 'wave', delayMs: d }]),
};
export const COMBO_NAMES = Object.keys(COMBOS);
export const KINDS = ['sound', 'buzz', 'light', 'combo', 'identify'];

const clampInt = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const NAMES = { sound: SOUND_NAMES, buzz: BUZZ_NAMES, light: LIGHT_NAMES, combo: COMBO_NAMES };

/** Whitelist and clamp an effect. Anything not in the catalogue is rejected; numbers are clamped, never trusted. */
export function validateFx(fx) {
  if (!fx || typeof fx !== 'object' || !KINDS.includes(fx.kind)) return { ok: false, code: 'bad_fx' };
  if (fx.kind === 'identify') return { ok: true, fx: { kind: 'identify', ms: clampInt(fx.ms, 1000, 6000, 3000) } };
  if (typeof fx.name !== 'string' || !NAMES[fx.kind].includes(fx.name)) return { ok: false, code: 'bad_fx' };
  const out = { kind: fx.kind, name: fx.name };
  if (fx.kind === 'light' && fx.name === 'steady') out.ms = clampInt(fx.ms, 1500, LIGHT_MAX_MS, 3000);
  return { ok: true, fx: out };
}

/** A pushed effect to the list of parts a device plays: [{ delayMs, kind, name, ms? }]. */
export function expandFx(fx) {
  if (fx.kind === 'combo') return COMBOS[fx.name].map((p) => ({ delayMs: 0, ...p }));
  return [{ delayMs: 0, ...fx }];
}

export const cleanName = (s, fallback = 'Device') => {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return t || fallback;
};
const CAP_KEYS = { vibrate: 'bool', haptic: 'str', sound: 'str', tilt: 'str', reducedMotion: 'bool', standalone: 'bool', screen: 'str', platform: 'str', rtt: 'num', err: 'num' };
/** Keep only known capability keys with small values. */
export function cleanCaps(c) {
  const out = {};
  if (!c || typeof c !== 'object') return out;
  for (const [k, kind] of Object.entries(CAP_KEYS)) {
    const v = c[k];
    if (kind === 'bool' && typeof v === 'boolean') out[k] = v;
    else if (kind === 'str' && typeof v === 'string') out[k] = v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24);
    else if (kind === 'num' && Number.isFinite(v)) out[k] = Math.round(Math.min(99999, Math.max(0, v)));
  }
  return out;
}
export const platformOf = (ua) => (/iPhone|iPad|iPod/.test(ua || '') ? 'iOS' : /Android/.test(ua || '') ? 'Android' : /Mac OS X|Windows|Linux|CrOS/.test(ua || '') ? 'Desktop' : 'Other');

export const newRoomCode = (rand) => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rand() * 32)]).join('');

/**
 * Who gets a push and when. `devices` is the roster in join order; `to` is 'all', 'others' or a list of ids.
 * Every target gets `at = now + lead + index * spread` (index in join order), so spread > 0 makes a wave from the
 * first device to the last. Returns { targets: [{ id, at, index }], at0 }.
 */
export function planPush(devices, senderId, to, now, lead = LEAD_DEFAULT_MS, spread = 0) {
  const L = clampInt(lead, LEAD_MIN_MS, LEAD_MAX_MS, LEAD_DEFAULT_MS);
  const S = clampInt(spread, 0, SPREAD_MAX_MS, 0);
  let chosen;
  if (to === 'others') chosen = devices.filter((d) => d.id !== senderId);
  else if (Array.isArray(to)) { const set = new Set(to.map(String)); chosen = devices.filter((d) => set.has(d.id)); }
  else chosen = devices.slice();
  const at0 = now + L;
  return { at0, lead: L, spread: S, targets: chosen.map((d, index) => ({ id: d.id, index, at: at0 + index * S })) };
}

/** Parse one client message: JSON object with a string `t`, within the size cap. Never throws. */
export function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) return null;
  try { const m = JSON.parse(raw); return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null; } catch { return null; }
}

/** What a device does with a pushed effect that arrives with its start time `at` (server clock). */
export function decideStart(serverNowMs, at) {
  const wait = at - serverNowMs;
  if (wait < -DROP_LATE_MS) return { action: 'drop', reason: 'late', lateMs: -wait };
  return { action: 'schedule', waitMs: Math.max(0, wait) };
}
