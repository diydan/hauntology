// The page frame shared by every puzzle: header, status chips, timer, attempts, Sight and Faded flow,
// result card and a saved log. A Kind module supplies the screen itself.
import { h, $, fmtS, copyText } from './dom.js';
import { makeLock, verify, sightFor, fadedFor, lockCharge, ATTEMPTS, LEVELS, minSolveMs } from './core.js';
import { Feel, loadSettings, saveSettings, saveResult } from './feel.js';

const newSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0] % 90000) + 10000;

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const seed = Number(p.get('seed'));
  return { seed: Number.isFinite(seed) && p.get('seed') ? seed : null, level: LEVELS.includes(p.get('level')) ? p.get('level') : null };
}

/**
 * kind: { id, title, blurb, memory, renderSight?(el, payload), mount(ctx) -> cleanup? }
 * ctx:  { lock, level, feel, settings, stage, elapsed(), submit(t), toast(msg, tone), onTick(fn), onWrong(fn), onCleanup(fn) }
 */
export function start(kind) {
  const settings = loadSettings();
  const params = readHash();
  let level = params.level || settings.level || 'easy';
  let seed = params.seed ?? newSeed();
  let lock = null, phase = 'idle', session = 0, startedAt = 0, submissions = 0, wrong = 0, raf = 0, activeOverlay = null;
  const ticks = new Set(), wrongs = new Set(), cleans = new Set();

  // ---------------------------------------------------------- shell
  const fx = h('div', { id: 'fx' });
  const fxLabel = h('div', { id: 'fxlabel' });
  document.body.append(fx, fxLabel);
  let fxTimer = 0;
  const label = (txt) => { fxLabel.textContent = txt; clearTimeout(fxTimer); fxTimer = setTimeout(() => { fxLabel.textContent = ''; }, 700); };
  const feel = new Feel(settings, {
    onVisual: (name) => { fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on'); label(`buzz ${name}`); },
    onSound: (name) => { if (!settings.touchOnly) label(`♪ ${name}`); },
    onChange: () => refresh(),
  });

  const chip = (key, text, onClick) => h('button', { class: 'chip', 'data-k': key, onClick }, h('b', {}, text), h('span', { class: 'v' }, ''));
  const chipTilt = chip('tilt', 'Tilt', async () => {
    if (settings.touchOnly) return toast('Touch only is on', 'bad');
    if (feel.tiltState === 'on') { feel.disableTilt(); return toast('Tilt off'); }
    const r = await feel.enableTilt();
    toast(r === 'on' ? 'Tilt on. Hold the phone how you like and tap Hold level.' : r === 'denied' ? 'Motion was denied. On iPhone: Settings > Safari > Motion & Orientation Access.' : 'No motion sensor found. Touch works.', r === 'on' ? 'ok' : 'bad');
  });
  const MODES = ['auto', 'vibrate', 'ios-tick', 'visual'];
  const chipBuzz = chip('buzz', 'Buzz', () => {
    settings.hapticMode = MODES[(MODES.indexOf(settings.hapticMode) + 1) % MODES.length];
    saveSettings(settings);
    feel.newAttempt(); feel.buzz('thunk');
    toast(`Buzz mode: ${settings.hapticMode} (using ${feel.hapticsResolved})`);
    refresh();
  });
  const chipSound = chip('sound', 'Sound', async () => {
    if (settings.touchOnly) return toast('Touch only is on', 'bad');
    const s = await feel.unlockSound();
    feel.sound('click'); setTimeout(() => feel.playNote(2), 150);
    toast(s === 'on' || s === 'media' ? 'Sound on. If you heard nothing, check the silent switch.' : `Sound: ${s}`, s === 'on' || s === 'media' ? 'ok' : 'bad');
  });
  const chipMic = chip('mic', 'Mic', () => { if (feel.micState === 'on') feel.stopBreath(); else toast('The mic is only used by Candle order'); });
  const chipTouch = h('button', { class: 'chip', onClick: () => {
    settings.touchOnly = !settings.touchOnly;
    saveSettings(settings);
    if (settings.touchOnly) { feel.disableTilt(); feel.stopBreath(); }
    toast(settings.touchOnly ? 'Touch only: no tilt, buzz, sound or mic' : 'Touch only off');
    refresh();
  } }, h('b', {}, 'Touch only'), h('span', { class: 'v' }, ''));

  const levelSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Level' },
    ...LEVELS.map((l) => h('button', { 'data-l': l, onClick: () => { level = l; settings.level = l; saveSettings(settings); newLock(false); } }, l)));
  const pipsEl = h('span', { class: 'pips', 'aria-label': 'Attempts left' });
  const timerEl = h('span', { class: 'timer' });
  const seedBtn = h('button', { class: 'ghost', style: { minHeight: '36px', padding: '0 10px', fontSize: '13px' }, onClick: async () => {
    const url = `${location.origin}${location.pathname}#seed=${seed}&level=${level}`;
    toast((await copyText(url)) ? 'Link to this exact lock copied' : url);
  } }, '#');
  const stage = h('main', { class: 'stage' });
  const holdBtn = h('button', { onClick: () => { feel.holdLevel(); toast('Level set'); } }, 'Hold level');
  const giveUp = h('button', { class: 'danger', onClick: () => phase === 'play' && finish('failed', 'gave_up') }, 'Give up');
  const gear = h('button', { 'aria-label': 'Settings', onClick: () => dlg.showModal() }, '⚙');
  const toastEl = h('div', { class: 'toast', hidden: true });
  let toastTimer = 0;
  function toast(msg, tone = '') {
    toastEl.textContent = msg; toastEl.className = `toast ${tone}`; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // settings dialog
  const sel = (key, opts, parse = (v) => v) => h('select', { onChange: (e) => { settings[key] = parse(e.target.value); saveSettings(settings); refresh(); } },
    ...opts.map(([v, t]) => h('option', { value: v, selected: String(settings[key]) === String(v) }, t)));
  const chk = (key) => h('input', { type: 'checkbox', checked: !!settings[key], onChange: (e) => { settings[key] = e.target.checked; saveSettings(settings); refresh(); } });
  const dlg = h('dialog', {},
    h('h2', { style: { marginTop: 0 } }, 'Playtest settings'),
    h('label', { class: 'set' }, 'Cap (Turn time a Lock may use)', sel('cap', [[0, 'off'], [20000, '20 s'], [25000, '25 s'], [40000, '40 s']], Number)),
    h('label', { class: 'set' }, 'Walk delay after a Sight', sel('delay', [[0, 'none'], [10, '10 s'], [30, '30 s']], Number)),
    h('label', { class: 'set' }, 'Skip the Sight (test Faded)', chk('skipSight')),
    h('label', { class: 'set' }, 'Assist (longer clues, text for sounds)', chk('assist')),
    h('label', { class: 'set' }, 'Tilt sensitivity', h('input', { type: 'range', min: 0.4, max: 2.5, step: 0.1, value: settings.sensitivity, onInput: (e) => { settings.sensitivity = Number(e.target.value); saveSettings(settings); } })),
    h('label', { class: 'set' }, 'Twist direction (dial)', chk('dialInvert')),
    h('label', { class: 'set' }, 'Buzz mode', sel('hapticMode', [['auto', 'auto'], ['vibrate', 'vibrate'], ['ios-tick', 'iPhone tick trick'], ['visual', 'visual only']])),
    h('label', { class: 'set' }, 'Audio channel', sel('audioChannel', [['normal', 'normal'], ['media', 'media (ignore silent switch)']])),
    h('div', { class: 'row' }, h('button', { onClick: () => { localStorage.removeItem('hw-playtest-results-v1'); toast('Saved results cleared'); } }, 'Clear saved results'), h('button', { class: 'primary', onClick: () => dlg.close() }, 'Done')));

  $('#app').append(
    h('header', { class: 'bar' }, h('a', { class: 'back', href: './index.html', 'aria-label': 'All puzzles' }, '‹'), h('h1', {}, kind.title), levelSeg),
    h('section', { class: 'chips' }, chipTilt, chipBuzz, chipSound, chipMic, chipTouch),
    h('section', { class: 'meta' }, seedBtn, pipsEl, h('span', { class: 'grow' }), timerEl),
    stage,
    h('div', { class: 'foot' }, holdBtn, giveUp, gear),
    toastEl, dlg);

  function refresh() {
    const s = feel.summary();
    for (const [key, el] of [['tilt', chipTilt], ['buzz', chipBuzz], ['sound', chipSound], ['mic', chipMic]]) {
      el.dataset.s = s[key];
      el.querySelector('.v').textContent = s[key] === 'ios-tick' ? 'iPhone tick' : s[key];
    }
    chipTouch.querySelector('.v').textContent = settings.touchOnly ? 'on' : 'off';
    chipTouch.dataset.s = settings.touchOnly ? 'on' : '';
    holdBtn.hidden = !feel.tiltOn;
    for (const b of levelSeg.children) b.setAttribute('aria-pressed', String(b.dataset.l === level));
    seedBtn.textContent = `#${seed}`;
  }
  function renderPips() {
    pipsEl.replaceChildren(...Array.from({ length: ATTEMPTS }, (_, i) => h('span', { class: `pip${i < wrong ? ' used' : ''}` })));
  }
  function setHash() { history.replaceState(null, '', `#seed=${seed}&level=${level}`); }

  // ---------------------------------------------------------- overlays
  function card(build) {
    return new Promise((resolve) => {
      activeOverlay?.remove();
      const ov = h('div', { class: 'overlay', role: 'dialog' });
      const done = (v) => { if (activeOverlay === ov) activeOverlay = null; ov.remove(); resolve(v); };
      ov.append(h('div', { class: 'card' }, ...build(done)));
      document.body.append(ov);
      activeOverlay = ov;
    });
  }
  function countdown(ms, done) {
    const bar = h('i');
    const wrap = h('div', { class: 'bar-time' }, bar);
    bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, fill: 'forwards', easing: 'linear' });
    const t = setTimeout(done, ms);
    return { wrap, stop: () => clearTimeout(t) };
  }
  function ready() {
    return card((done) => [
      h('h2', {}, kind.title),
      h('p', {}, kind.blurb),
      kind.memory ? h('p', { class: 'muted' }, settings.skipSight ? 'Memory puzzle: you will get the faded clue at the lock.' : 'Memory puzzle: you will see a clue first. Remember it.') : null,
      h('div', { class: 'row' }, h('button', { class: 'primary', onClick: async () => { if (!settings.touchOnly) await feel.unlockSound(); done(); } }, 'Start')),
    ]);
  }
  function showClue(title, data, ms) {
    return card((done) => {
      const box = h('div', { style: { minHeight: '120px' } });
      kind.renderSight(box, data.payload);
      const c = countdown(ms, done);
      feel.newAttempt(); feel.buzz('heartbeat');
      return [h('h2', {}, title), box, c.wrap, h('button', { onClick: () => { c.stop(); done(); } }, 'Got it')];
    });
  }
  function walking(ms) {
    return card((done) => {
      const c = countdown(ms, done);
      return [h('h2', {}, 'Walking to the next room…'), h('p', { class: 'muted' }, 'Keep the clue in your head.'), c.wrap, h('button', { class: 'ghost', onClick: () => { c.stop(); done(); } }, 'Skip the wait')];
    });
  }

  // ---------------------------------------------------------- the lock
  async function begin() {
    const my = ++session;
    activeOverlay?.remove(); activeOverlay = null;
    teardown();
    lock = makeLock(kind.id, level, seed);
    wrong = 0; submissions = 0; phase = 'intro';
    renderPips(); refresh(); setHash();
    timerEl.textContent = ''; timerEl.className = 'timer';
    stage.replaceChildren(h('p', { class: 'hint' }, 'Tap Start when ready.'));
    await ready();
    if (my !== session) return;
    if (kind.memory) {
      if (!settings.skipSight) {
        await showClue('You notice something…', sightFor(lock, settings.assist), sightFor(lock, settings.assist).showMs);
        if (my !== session) return;
        if (settings.delay > 0) { await walking(settings.delay * 1000); if (my !== session) return; }
      } else {
        const f = fadedFor(lock, settings.assist);
        await showClue('A faded memory…', f, f.showMs);
        if (my !== session) return;
      }
    }
    play();
  }
  function play() {
    phase = 'play'; startedAt = performance.now();
    feel.newAttempt();
    stage.replaceChildren();
    const ctx = {
      lock, level, feel, settings, stage, toast,
      elapsed: () => performance.now() - startedAt,
      submit, onTick: (fn) => ticks.add(fn), onWrong: (fn) => wrongs.add(fn), onCleanup: (fn) => cleans.add(fn),
    };
    window.__hw = { lock, ctx, feel, submit, kind };
    const cleanup = kind.mount(ctx);
    if (typeof cleanup === 'function') cleans.add(cleanup);
    let last = performance.now();
    const loop = (t) => {
      if (phase !== 'play') return;
      const dt = Math.min(50, t - last); last = t;
      for (const fn of ticks) fn(t, dt);
      const el = t - startedAt, cap = settings.cap;
      timerEl.textContent = cap ? `${fmtS(el)} / ${cap / 1000} s` : fmtS(el);
      timerEl.classList.toggle('late', !!cap && el > cap * 0.8);
      if (cap && el >= cap) { finish('failed', 'cap'); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function teardown() {
    cancelAnimationFrame(raf);
    for (const fn of cleans) { try { fn(); } catch { /* ignore */ } }
    cleans.clear(); ticks.clear(); wrongs.clear();
    feel.closeLock();
  }
  function submit(t) {
    if (phase !== 'play') return { ok: false, code: 'closed' };
    submissions++;
    const full = { kind: kind.id, elapsedMs: Math.round(performance.now() - startedAt), ...t };
    const v = verify(lock, full);
    window.__hwVerdict = { v, full }; // for debugging on a phone (remote inspector) and in tests
    if (v.ok) { feel.buzz('thunk'); feel.sound('thunk'); finish('solved', 'solved'); return v; }
    wrong++; renderPips();
    feel.buzz('buzz'); feel.sound('zap');
    if (wrong >= ATTEMPTS) { finish('failed', 'attempts'); return v; }
    toast(v.code === 'too_fast' ? 'Too fast to be real' : `Not right. ${ATTEMPTS - wrong} left.`, 'bad');
    feel.newAttempt();
    for (const fn of wrongs) { try { fn(); } catch { /* ignore */ } }
    return v;
  }
  function finish(outcome, reason) {
    if (phase !== 'play') return;
    const elapsed = Math.round(performance.now() - startedAt);
    phase = 'result';
    teardown();
    const cap = settings.cap || 25000;
    const charge = lockCharge(elapsed, cap);
    const s = feel.summary();
    const rec = {
      t: new Date().toISOString(), kind: kind.id, level, seed, outcome, reason, elapsedMs: elapsed, chargeMs: charge,
      wrong, submissions, tilt: s.tilt, buzz: s.buzz, sound: s.sound, touchOnly: settings.touchOnly, assist: settings.assist,
      faded: !!kind.memory && settings.skipSight, delay: settings.delay, minSolveMs: minSolveMs(lock), ua: navigator.userAgent.slice(0, 90),
    };
    saveResult(rec);
    const ok = outcome === 'solved';
    card((done) => [
      h('div', { class: `big ${ok ? 'ok' : 'bad'}` }, ok ? 'Opened' : 'Nothing came loose'),
      h('p', { class: 'muted' }, ok ? 'In a game, you would now see what is in the Zone.' : `Reason: ${reason.replace('_', ' ')}. The Zone stays un-inspected.`),
      h('table', { class: 'kv' },
        ...[['Time', fmtS(elapsed)], ['Turn time charged', fmtS(charge)], ['Wrong attempts', String(wrong)], ['Tilt', s.tilt], ['Buzz', s.buzz], ['Sound', s.sound], ['Touch only', settings.touchOnly ? 'yes' : 'no'], ['Faded', rec.faded ? 'yes' : 'no']]
          .map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onClick: () => { done(); begin(); } }, 'Same lock again'),
        h('button', { onClick: () => { done(); newLock(true); } }, 'New lock')),
      h('div', { class: 'row' },
        h('button', { onClick: async () => toast((await copyText(JSON.stringify(rec, null, 1))) ? 'Result copied' : 'Could not copy', '') }, 'Copy result'),
        h('a', { class: 'btn', href: './index.html', style: { display: 'inline-grid', placeItems: 'center' } }, 'All puzzles')),
    ]);
  }
  function newLock(freshSeed) {
    if (freshSeed) seed = newSeed();
    begin();
  }

  refresh();
  renderPips();
  begin();
}
