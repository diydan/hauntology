const lvAng = (lv) => 15 + lv / 12 * 150;
const dirPt = (a, r) => ({ x: 320 - r * Math.cos(a * Math.PI / 180), y: 322 - r * Math.sin(a * Math.PI / 180) });
const arc = (a0, a1, r) => { const p = dirPt(a0, r), q = dirPt(a1, r); return 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + q.x.toFixed(1) + ' ' + q.y.toFixed(1); };

async function rise(x, to) {
  const s = x.state; const from = s.level; s.level = to;
  x.tone(200 + to * 25, 200 + to * 25, 45, 'square', 0.03);
  await x.move('needle', lvAng(to), 600, to > from ? 'back' : 'inOut');
  if (to > from) {
    for (const th of [3, 6, 9]) {
      if (to >= th && from < th && !s.fired[th] && th < s.max) { s.fired[th] = true; x.pub('Haunt first reached ' + th + ': a Haunt Event fires.'); x.prop('Needle shakes. The notch lights.'); await x.shake('needle', 4, 9, 1000); }
    }
    if (to >= s.max) { x.pub('The Haunt is at its maximum. The house wins.'); await x.shake('needle', 5, 14, 3000, false); x.prop('Needle pinned at the maximum until Play again.'); }
  }
}
const up = (why) => async (x) => {
  const s = x.state;
  if (s.level >= s.max) { x.note('Already at the maximum.'); return; }
  x.pub(why + ' Haunt ' + (s.level + 1) + '.');
  await rise(x, s.level + 1);
};

Mock({
  num: 3, title: 'Haunt needle', group: 'Props', rank: 1, leak: 'None', effort: 'Easy',
  trigger: 'Haunt level',
  summary: 'A gauge needle shows the Haunt. It steps up with an overshoot, shakes at 3, 6 and 9, and pins at the maximum. State drives the needle, so it survives a Wi-Fi drop.',
  stageNote: 'Dial 0 to 12. The red tab is clipped by hand at the maximum your preset uses (8, 10 or 12). Gold notches mark 3, 6 and 9 and light up once that Haunt Event has fired.',
  servos: { needle: { label: 'Needle servo', rest: lvAng(0) } },
  svg: `
    <circle id="n3aura" cx="320" cy="322" r="236" fill="url(#gGlow)" opacity="0"/>
    <circle cx="320" cy="322" r="222" fill="#120e1b" stroke="#3b3354" stroke-width="4"/>
    <circle cx="320" cy="322" r="214" fill="none" stroke="#2a2340" stroke-width="1"/>
    <path d="${arc(15, 165, 184)}" fill="none" stroke="#2a2340" stroke-width="14" stroke-linecap="round"/>
    <path id="n3fill" d="${arc(15, 15.1, 184)}" fill="none" stroke="#6a5f86" stroke-width="14" stroke-linecap="round" opacity=".6"/>
    <path id="n3red" d="${arc(140, 165, 184)}" fill="none" stroke="#e0505c" stroke-width="14" opacity=".75"/>
    <text id="n3maxlbl" x="500" y="296" font-size="12" fill="#ff9aa6" font-weight="700" letter-spacing="1.5">MAX</text>
    <g id="n3ticks"></g>
    <g transform="translate(320 322)" opacity=".55"><path d="M-14 -88 V-100 a14 14 0 0 1 28 0 V-74 l-5 -5 l-5 5 l-4 -5 l-4 5 l-5 -5 l-5 5 Z" fill="#b9a7ff"/><circle cx="-4" cy="-98" r="2" fill="#120e1b"/><circle cx="4" cy="-98" r="2" fill="#120e1b"/></g>
    <text x="320" y="258" text-anchor="middle" font-size="11" fill="#9b92ae" letter-spacing="3">HAUNT</text>
    <g transform="translate(320 322)"><g id="n3needle">
      <polygon points="-5,10 0,-166 5,10" fill="#e8c36a" stroke="#7a6320" stroke-width="1"/>
      <rect x="-4" y="8" width="8" height="26" fill="#e8c36a"/>
      <circle r="14" fill="url(#gMetal)" stroke="#3b3354" stroke-width="2"/>
    </g></g>
    <path d="M118 322 A202 202 0 0 1 300 128 L320 322 Z" fill="#fff" opacity=".035"/>
    <text id="n3val" x="320" y="388" text-anchor="middle" font-size="22" fill="#ebe6f5" font-weight="600">Haunt 0 / 10</text>`,
  state: () => ({ level: 0, max: 10, fired: {} }),
  toggles: [{ id: 'trem', label: 'Tremble grows with the Haunt (adds servo noise)', on: false }],
  init(s, X) { s.ticksFor = -1; },
  render(a, s, X) {
    if (s.ticksFor !== s.level + '|' + JSON.stringify(s.fired)) {
      s.ticksFor = s.level + '|' + JSON.stringify(s.fired);
      let h = '';
      for (let lv = 0; lv <= 12; lv++) {
        const ang = lvAng(lv), p0 = dirPt(ang, 160), p1 = dirPt(ang, 172), t = dirPt(ang, 206), gold = lv === 3 || lv === 6 || lv === 9, lit = gold && s.fired[lv];
        h += '<line x1="' + p0.x.toFixed(1) + '" y1="' + p0.y.toFixed(1) + '" x2="' + p1.x.toFixed(1) + '" y2="' + p1.y.toFixed(1) + '" stroke="' + (gold ? '#e8c36a' : '#6a5f86') + '" stroke-width="' + (gold ? 5 : 2) + '"/>' +
          (lit ? '<circle cx="' + dirPt(ang, 150).x.toFixed(1) + '" cy="' + dirPt(ang, 150).y.toFixed(1) + '" r="5" fill="#ffd86a"/>' : (gold ? '<circle cx="' + dirPt(ang, 150).x.toFixed(1) + '" cy="' + dirPt(ang, 150).y.toFixed(1) + '" r="4" fill="none" stroke="#7a6320" stroke-width="2"/>' : '')) +
          '<text x="' + t.x.toFixed(1) + '" y="' + (t.y + 5).toFixed(1) + '" text-anchor="middle" font-size="14" fill="' + (gold ? '#e8c36a' : '#9b92ae') + '">' + lv + '</text>';
      }
      X.html('n3ticks', h);
    }
    const trem = s.tg_trem && s.level > 2 ? Math.sin(performance.now() / 47) * 0.12 * s.level : 0;
    X.rot('n3needle', a.needle - 90 + trem, 0, 0);
    X.set('n3red', { d: arc(lvAng(s.max), 165, 184) });
    const mp = dirPt(lvAng(s.max) + 6, 232); X.set('n3maxlbl', { x: mp.x.toFixed(1), y: (mp.y + 4).toFixed(1) });
    X.set('n3fill', { d: arc(15, Math.max(15.2, a.needle), 184), stroke: s.level >= 9 ? '#e0505c' : s.level >= 6 ? '#e8a05c' : '#8c78f0' });
    X.op('n3aura', (s.level / 12 * 0.35).toFixed(2));
    X.txt('n3val', 'Haunt ' + s.level + ' / ' + s.max);
  },
  resync(X) { X.jump('needle', lvAng(X.state.level)); X.prop('Reconnected. Needle jumps to Haunt ' + X.state.level + ' with no show. State drives the needle, events only add the flourish.'); },
  events: [
    { id: 'round', group: 'Haunt goes up', label: 'A Round ends: +1', run: up('Round ended.') },
    { id: 'wrong', label: 'A wrong Accusation is revealed: +1', run: up('A wrong Accusation was revealed.') },
    { id: 'clock', label: 'A Turn ends by the clock: +1', run: up('A Turn ended by the clock.') },
    { id: 'two', label: 'Round ends with a wrong Accusation: +2 at once', sub: 'Two steps, one after the other', run: async (x) => { await up('Round ended.')(x); await up('A wrong Accusation was revealed.')(x); } },
    { id: 'lull', group: 'Haunt goes down', label: 'Lull: −1', run: async (x) => { const s = x.state; if (s.level < 1) return; x.pub('Lull applied. Haunt ' + (s.level - 1) + '.'); await rise(x, s.level - 1); } },
    { id: 'quick', group: 'Preset sets the maximum', label: 'Quick: maximum 8', sub: 'Clip the red tab at 8. Haunt Events fire at 3 and 6 only.', run: async (x) => { x.state.max = 8; x.pub('Preset Quick: Haunt maximum 8.'); } },
    { id: 'classic', label: 'Classic: maximum 10', run: async (x) => { x.state.max = 10; x.pub('Preset Classic: Haunt maximum 10.'); } },
    { id: 'gentle', label: 'Gentle: maximum 12', run: async (x) => { x.state.max = 12; x.pub('Preset Gentle: Haunt maximum 12.'); } },
    { id: 'missed', group: 'Wi-Fi test', label: 'Wi-Fi is down: 2 rises are missed', sub: 'Then press “Wi-Fi drop, then reconnect”', run: async (x) => { const s = x.state; s.level = Math.min(s.max, s.level + 2); x.warn('ESP32 is offline. Two Haunt rises happen and the needle does not move.'); } },
    { id: 'new', group: 'Next game', label: 'Play again: Haunt back to 0', run: async (x) => { const s = x.state; s.level = 0; s.fired = {}; x.pub('New game. Haunt 0.'); await x.move('needle', lvAng(0), 1500); } }
  ],
  listens: ['The Haunt level and its maximum (both in the Public View)', 'A Haunt Event firing at 3, 6, 9', 'Play again'],
  never: ['Any Hand, Residue position or Accusation content', 'Resolve counts', 'Who caused a rise'],
  parts: '1 servo, a printed dial (0 to 12) and a straw or card needle. Send the maximum with each update. Two rises at once play two steps, 0.6 s apart. A tremble that grows with the level is a nice touch but servos buzz and wear when they hold a dither, so it is off by default.',
  spec: ['party-mode 11.1 Haunt rises', 'party-mode 11.2 events at 3, 6, 9', 'party-mode 11.5 Public View carries the level'],
  ask: ['Absolute dial 0 to 12 with a hand-clipped red tab: fine, or should the dial rescale to the maximum?', 'Does the shake at 3, 6 and 9 compete with the ghost in the box (#1) if you build both?', 'Do you want the tremble, knowing the servo will hum?'],
  shot: { event: 'two', wait: 900 }
});
