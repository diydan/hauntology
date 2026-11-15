/* Prop mockup harness. Inlined into every mockup by build.mjs. No network, no dependencies.
 *
 * A scene calls Mock({...}). Fields:
 *   num, title, group, summary, rank, leak ('None'|'Low'|'High'), effort ('Easy'|'Medium'|'Hard')
 *   servos: { id: { label, rest, hand } }       hand:true = moved by a person, not a servo
 *   svg: markup for a 640x420 stage        state: () => ({...})
 *   render(ang, state, X)  frame(dt, ang, state, X)  init(state, X)  reset(state, X)  resync(X)
 *   events: [{ id, group, label, sub, run: async X => {}, queue }]
 *   toggles: [{ id, label, on, change(v, state, X) }]
 *   listens, never, parts, spec, ask (arrays of strings), shot: { event, wait }
 */
(function () {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const EASE = {
    linear: t => t,
    in: t => t * t,
    out: t => 1 - (1 - t) * (1 - t),
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  class Cancel extends Error {}
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BADGE = { pub: 'PUBLIC', prop: 'PROP', priv: 'PRIVATE', note: 'NOTE', warn: 'REFUSED' };

  const DEFS = '<defs>' +
    '<linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d182b"/><stop offset="1" stop-color="#110e19"/></linearGradient>' +
    '<linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d583b"/><stop offset="1" stop-color="#4b3022"/></linearGradient>' +
    '<linearGradient id="gWoodD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3b2b"/><stop offset="1" stop-color="#32201a"/></linearGradient>' +
    '<linearGradient id="gMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bcc2d4"/><stop offset="1" stop-color="#5d6479"/></linearGradient>' +
    '<linearGradient id="gBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d58a"/><stop offset="1" stop-color="#9a7a2e"/></linearGradient>' +
    '<linearGradient id="gGhost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcfaff"/><stop offset="1" stop-color="#b9a7ff"/></linearGradient>' +
    '<linearGradient id="gPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2e9d1"/><stop offset="1" stop-color="#d4c59d"/></linearGradient>' +
    '<linearGradient id="gVelvet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a1220"/><stop offset=".3" stop-color="#8a2236"/><stop offset=".5" stop-color="#5a1220"/><stop offset=".75" stop-color="#8a2236"/><stop offset="1" stop-color="#4a0f1b"/></linearGradient>' +
    '<radialGradient id="gGlow"><stop offset="0" stop-color="#fff3c4" stop-opacity=".95"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gGlowP"><stop offset="0" stop-color="#b9a7ff" stop-opacity=".85"/><stop offset="1" stop-color="#b9a7ff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gVig" cx=".5" cy=".5" r=".78"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>' +
    '<filter id="blur6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>' +
    '<filter id="blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>' +
    '</defs>';

  function boot(def) {
    const servoDefs = def.servos || {};
    const sids = Object.keys(servoDefs);
    const realServos = sids.filter(i => !servoDefs[i].hand).length;
    document.title = '#' + def.num + ' ' + def.title + ' · prop mockup';

    const chip = (cls, html) => '<span class="chip ' + (cls || '') + '">' + html + '</span>';
    const chips = [chip('', '<b>#' + def.num + '</b> ' + esc(def.group || ''))];
    if (def.rank) chips.push(chip('', 'My rank <b>' + def.rank + '</b> of ' + (window.__RANKED__ || def.rank)));
    chips.push(chip('', '<b>' + realServos + '</b> servo' + (realServos === 1 ? '' : 's')));
    if (def.effort) chips.push(chip('', 'Build <b>' + esc(def.effort) + '</b>'));
    if (def.leak) chips.push(chip({ None: 'ok', Low: 'low', High: 'high' }[def.leak] || '', 'Leak risk <b>' + esc(def.leak) + '</b>'));
    if (def.trigger) chips.push(chip('', 'Trigger <b>' + esc(def.trigger) + '</b>'));

    // events html
    let evHtml = '', lastGroup = null;
    (def.events || []).forEach(ev => {
      if (lastGroup === null || (ev.group !== undefined && ev.group !== lastGroup)) {
        if (lastGroup !== null) evHtml += '</div>';
        evHtml += (ev.group ? '<div class="grp">' + esc(ev.group) + '</div>' : '') + '<div class="evs' + (ev.cols === 2 ? ' c2' : '') + '">';
        lastGroup = ev.group === undefined ? '' : ev.group;
      }
      evHtml += '<button type="button" data-ev="' + esc(ev.id) + '"><span>' + esc(ev.label) + '</span>' + (ev.sub ? '<small>' + esc(ev.sub) + '</small>' : '') + '</button>';
    });
    if ((def.events || []).length) evHtml += '</div>';

    const toggleHtml = (def.toggles || []).map(t =>
      '<label><input type="checkbox" data-tg="' + esc(t.id) + '"' + (t.on ? ' checked' : '') + '> ' + esc(t.label) + '</label>').join('');

    const selectHtml = (def.selects || []).map(s =>
      '<label>' + esc(s.label) + ' <select data-se="' + esc(s.id) + '">' +
      s.options.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === s.value ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>').join('');
    const sliderHtml = (def.sliders || []).map(s =>
      '<label class="sl"><span>' + esc(s.label) + '</span><input type="range" data-sl="' + esc(s.id) + '" min="' + s.min + '" max="' + s.max + '" step="' + (s.step || 1) + '" value="' + s.value + '"><output>' + s.value + (s.unit || '') + '</output></label>').join('');

    const servoHtml = sids.length ? sids.map(id =>
      '<div class="servo" data-sv="' + id + '">' +
      '<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M4 22 A16 16 0 0 1 36 22" fill="none" stroke="#3d3557" stroke-width="3"/><line x1="20" y1="22" x2="20" y2="8" stroke="#e8c36a" stroke-width="2.6" stroke-linecap="round" transform="rotate(-90 20 22)"/></svg>' +
      '<span class="sl">' + esc(servoDefs[id].label || id) + '</span><span class="sv">0°</span>' +
      '<span class="sp"><span>0 µs</span><span></span></span><div class="bar"><i></i></div></div>').join('')
      : '<p class="noservo">' + esc(def.noServoNote || 'No servo in this one.') + '</p>';

    const li = (arr, cls) => (arr || []).map(t => '<li class="' + cls + '">' + esc(t) + '</li>').join('');
    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="wrap">' +
      '<a class="back" href="../index.html">← all mockups</a>' +
      '<h1><span class="num">#' + def.num + '</span> ' + esc(def.title) + '</h1>' +
      '<p class="sum">' + esc(def.summary) + '</p>' +
      '<div class="chips">' + chips.join('') + '</div>' +
      '<main><section class="left">' +
      '<div class="stagebox"><svg id="stage" viewBox="0 0 640 420" role="img" aria-label="' + esc(def.title) + ' mockup">' + DEFS +
      '<rect width="640" height="420" fill="url(#gWall)"/>' + def.svg +
      '<rect width="640" height="420" fill="url(#gVig)" pointer-events="none"/></svg>' +
      '<div id="dim"></div><div class="cap" id="cap"></div>' +
      '<div class="phone hide" id="phone"><h4 id="phoneT">Player’s phone · private</h4><p id="phoneP"></p></div></div>' +
      '<div class="stagenote">' + esc(def.stageNote || 'Drawn mockup, not to scale. Buttons on the right play what the ESP32 would do.') + '</div>' +
      '</section><aside class="panel">' +
      '<h2>Trigger it</h2>' + evHtml +
      '<h2>Settings</h2>' +
      '<div class="row"><label><input type="checkbox" id="tProps" checked> Props on <small style="color:var(--mute)">(Master’s switch)</small></label>' +
      '<label><input type="checkbox" id="tSound"> Sound</label>' +
      '<label>Speed <select id="sSpeed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>' +
      toggleHtml + selectHtml + '</div>' +
      (sliderHtml ? '<div class="sliders">' + sliderHtml + '</div>' : '') +
      '<div class="row"><button type="button" id="bReset">Reset</button>' + (def.resync ? '<button type="button" id="bResync">Wi-Fi drop, then reconnect</button>' : '') + '<span id="qn" style="color:var(--mute);font-size:12.5px"></span></div>' +
      '<h2>Servos</h2>' + servoHtml +
      '<h2>What the ESP32 hears and does</h2><ol class="log" id="log"></ol>' +
      '</aside></main>' +
      '<section class="notes">' +
      '<div class="card about wide"><h3>About this drawing</h3><p>' + esc(def.stageNote || '') + '</p></div>' +
      '<div class="card"><h3>The prop may see</h3><ul>' + li(def.listens, 'ok') + '</ul></div>' +
      '<div class="card"><h3>It must never see</h3><ul>' + li(def.never, 'no') + '</ul></div>' +
      '<div class="card"><h3>Parts and build</h3><p>' + esc(def.parts || '') + '</p></div>' +
      '<div class="card"><h3>Spec links</h3><ul>' + li(def.spec, 'dot') + '</ul></div>' +
      '<div class="card wide"><h3>Questions for you</h3><ol>' + (def.ask || []).map(q => '<li>' + esc(q) + '</li>').join('') + '</ol></div>' +
      '</section></div>';

    // ---- runtime ----
    const state = {};
    const resetState = () => { Object.keys(state).forEach(k => delete state[k]); Object.assign(state, def.state ? def.state() : {}); };
    resetState();
    const applyControls = () => {
      app.querySelectorAll('[data-tg]').forEach(c => { state['tg_' + c.getAttribute('data-tg')] = c.checked; });
      app.querySelectorAll('[data-sl]').forEach(c => { state['sl_' + c.getAttribute('data-sl')] = +c.value; });
      app.querySelectorAll('[data-se]').forEach(c => { state['se_' + c.getAttribute('data-se')] = c.value; });
    };
    applyControls();
    const ang = {};
    sids.forEach(id => { ang[id] = servoDefs[id].rest || 0; });
    let speed = def.speed || 1, props = true, sound = false;
    const $ = id => document.getElementById(id);
    const logEl = $('log'), capEl = $('cap'), phoneEl = $('phone');
    const rows = {};
    sids.forEach(id => {
      const r = app.querySelector('[data-sv="' + id + '"]');
      rows[id] = { last: null, v: r.querySelector('.sv'), p: r.querySelector('.sp span'), n: r.querySelector('line'), b: r.querySelector('.bar i') };
    });
    $('sSpeed').value = String(speed);

    const pending = new Set(), tweens = new Map();
    let gen = 0, chain = Promise.resolve(), queued = 0;
    const t0 = performance.now();

    const wait = ms => new Promise((res, rej) => {
      const h = {};
      const t = setTimeout(() => { pending.delete(h); res(); }, ms / speed);
      h.cancel = () => { clearTimeout(t); pending.delete(h); rej(new Cancel()); };
      pending.add(h);
    });
    const anim = (id, fn, ms) => new Promise((res, rej) => {
      const prev = tweens.get(id);
      if (prev) { tweens.delete(id); pending.delete(prev.h); prev.res(); }
      const h = { cancel: () => { if (tweens.get(id) === tw) tweens.delete(id); pending.delete(h); rej(new Cancel()); } };
      const tw = { fn, t0: performance.now(), dur: Math.max(1, ms / speed), res: () => { pending.delete(h); res(); }, h };
      tweens.set(id, tw); pending.add(h);
    });
    const move = (id, to, ms, ease) => { const from = ang[id]; const e = EASE[ease || 'inOut'] || EASE.inOut; return anim(id, p => lerp(from, to, e(p)), ms); };
    const shake = (id, amp, hz, ms, decay) => { const base = ang[id]; return anim(id, p => base + amp * Math.sin(p * ms / 1000 * hz * 2 * Math.PI) * (decay === false ? 1 : 1 - p), ms); };

    function log(text, tag) {
      const s = (performance.now() - t0) / 1000;
      const li = document.createElement('li');
      li.className = tag || 'note';
      li.innerHTML = '<time>' + Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0') + '</time><b>' + BADGE[tag || 'note'] + '</b>' + esc(text);
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 70) logEl.lastChild.remove();
    }

    // sound (off by default; the checkbox click is the user gesture)
    let ac = null;
    const audio = () => {
      if (!sound) return null;
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    };
    const tone = (f0, f1, ms, type, vol) => {
      const c = audio(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + ms / 1000);
      g.gain.setValueAtTime(vol == null ? 0.12 : vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    };
    const noise = (ms, vol, freq) => {
      const c = audio(); if (!c) return;
      const n = Math.floor(c.sampleRate * ms / 1000), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 800; g.gain.value = vol == null ? 0.2 : vol;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    };

    const cache = {};
    const el = id => cache[id] || (cache[id] = document.getElementById(id));
    const X = {
      el, state, ang, wait, anim, move, shake, tone, noise,
      speed: () => speed,
      jump: (id, a) => { const tw = tweens.get(id); if (tw) { tweens.delete(id); pending.delete(tw.h); tw.res(); } ang[id] = a; },
      moveAll: (map, ms, ease) => Promise.all(Object.keys(map).map(id => move(id, map[id], ms, ease))),
      xf: (id, t) => el(id).setAttribute('transform', t),
      rot: (id, d, cx, cy) => el(id).setAttribute('transform', 'rotate(' + d + ' ' + (cx || 0) + ' ' + (cy || 0) + ')'),
      tr: (id, x, y) => el(id).setAttribute('transform', 'translate(' + x + ' ' + (y || 0) + ')'),
      set: (id, o) => { const e = el(id); for (const k in o) e.setAttribute(k, o[k]); },
      txt: (id, t) => { const e = el(id); if (e.textContent !== String(t)) e.textContent = t; },
      html: (id, h) => { el(id).innerHTML = h; },
      show: (id, on) => { el(id).style.display = on ? '' : 'none'; },
      op: (id, v) => el(id).setAttribute('opacity', v),
      fill: (id, c) => el(id).setAttribute('fill', c),
      caption: t => { capEl.textContent = t || ''; },
      dim: v => { $('dim').style.opacity = v; },
      phone: (text, title) => { phoneEl.classList.remove('hide'); $('phoneP').textContent = text; $('phoneT').textContent = title || 'Player’s phone · private'; },
      phoneHide: () => phoneEl.classList.add('hide'),
      log, pub: t => log(t, 'pub'), prop: t => log(t, 'prop'), priv: t => log(t, 'priv'), note: t => log(t, 'note'), warn: t => log(t, 'warn'),
      fire: id => fire(id),
      run: (fn, opts) => enqueue(fn, !(opts && opts.queue === false)),
      clamp, lerp, EASE,
      pt: e => { const svg = $('stage'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, y: q.y }; }
    };

    function qn() { $('qn').textContent = queued > 1 ? (queued - 1) + ' waiting (one prop moves at a time)' : ''; }
    function enqueue(fn, queue) {
      const myGen = gen;
      const job = async () => {
        if (myGen !== gen) return;
        try { await fn(X); } catch (e) { if (!(e instanceof Cancel)) { console.error(e); log('Error: ' + e.message, 'warn'); } }
      };
      if (queue === false) { job(); return; }
      queued++; qn();
      chain = chain.then(job).then(() => { queued--; qn(); });
    }
    function fire(id) {
      const ev = (def.events || []).find(e => e.id === id);
      if (!ev) return;
      if (!props) { log('Props switch is off. Nothing moves. The text log still says: ' + ev.label, 'note'); return; }
      enqueue(ev.run, ev.queue !== false);
    }
    function reset() {
      gen++; pending.forEach(h => h.cancel()); pending.clear(); tweens.clear();
      chain = Promise.resolve(); queued = 0; qn();
      resetState();
      applyControls();
      sids.forEach(id => { ang[id] = servoDefs[id].rest || 0; });
      X.dim(0); X.caption(''); X.phoneHide();
      if (def.reset) def.reset(state, X);
      log('Reset.', 'note');
    }

    app.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => fire(b.getAttribute('data-ev'))));
    app.querySelectorAll('[data-tg]').forEach(c => c.addEventListener('change', () => {
      const t = (def.toggles || []).find(x => x.id === c.getAttribute('data-tg'));
      state['tg_' + t.id] = c.checked;
      if (t.change) t.change(c.checked, state, X);
    }));
    app.querySelectorAll('[data-sl]').forEach(c => c.addEventListener('input', () => {
      const t = def.sliders.find(x => x.id === c.getAttribute('data-sl'));
      state['sl_' + t.id] = +c.value; c.parentNode.querySelector('output').textContent = c.value + (t.unit || '');
      if (t.change) t.change(+c.value, state, X);
    }));
    app.querySelectorAll('[data-se]').forEach(c => c.addEventListener('change', () => {
      const t = def.selects.find(x => x.id === c.getAttribute('data-se'));
      state['se_' + t.id] = c.value;
      if (t.change) t.change(c.value, state, X);
    }));
    $('bReset').addEventListener('click', reset);
    $('sSpeed').addEventListener('change', e => { speed = +e.target.value; });
    $('tSound').addEventListener('change', e => { sound = e.target.checked; if (sound) { audio(); tone(440, 440, 80, 'sine', 0.05); } });
    $('tProps').addEventListener('change', e => {
      props = e.target.checked;
      if (props) { log('Props switched on again.', 'note'); if (def.resync) { def.resync(X); } }
      else { log('Props switched off by the Master. Every prop stops. The text log keeps saying everything.', 'note'); }
    });
    if (def.resync) {
      $('bResync').addEventListener('click', () => enqueue(async x => { x.note('Wi-Fi dropped. The ESP32 reconnects and asks for the current public view.'); await x.wait(700); def.resync(x); }));
    }

    let last = performance.now(), errOnce = false;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      tweens.forEach((tw, id) => {
        const p = clamp((now - tw.t0) / tw.dur, 0, 1);
        ang[id] = servoDefs[id] && servoDefs[id].hand ? tw.fn(p) : clamp(tw.fn(p), 0, 180);
        if (p >= 1) { tweens.delete(id); tw.res(); }
      });
      try {
        if (def.frame) def.frame(dt, ang, state, X);
        if (def.render) def.render(ang, state, X);
      } catch (e) { if (!errOnce) { errOnce = true; console.error(e); } }
      sids.forEach(id => {
        const a = ang[id], r = Math.round(a), row = rows[id];
        if (row.last === r) return;
        row.last = r;
        row.v.textContent = r + '°';
        row.p.textContent = servoDefs[id].hand ? 'moved by a hand' : Math.round(500 + clamp(a, 0, 180) / 180 * 2000) + ' µs';
        row.n.setAttribute('transform', 'rotate(' + (clamp(a, 0, 180) - 90) + ' 20 22)');
        row.b.style.width = clamp(a / (servoDefs[id].max || 180) * 100, 0, 100) + '%';
      });
      requestAnimationFrame(frame);
    }

    if (def.init) def.init(state, X);
    requestAnimationFrame(frame);
    window.__mock = { shot: def.shot || null, fire, title: def.title, num: def.num };
    const q = new URLSearchParams(location.search);
    if (q.get('speed')) { speed = +q.get('speed') || 1; $('sSpeed').value = String(speed); }
    if (q.get('auto')) setTimeout(() => fire(q.get('auto')), 300);
  }

  window.Mock = function (def) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(def));
    else boot(def);
  };
})();
