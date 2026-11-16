const FL = [-52, -26, 0, 26, 52];
const LINES = ['the floorboards creaked', 'a wind passed', 'the house rumbled'];
const TIER = ['creak', 'wind', 'rumble'];
const TCOL = ['#8fd0ff', '#ffd36a', '#ff7a7a'];
const BAT = 'M0 -4 C-8 -16 -26 -14 -34 -4 C-26 -6 -20 0 -16 6 C-12 0 -6 2 0 8 C6 2 12 0 16 6 C20 0 26 -6 34 -4 C26 -14 8 -16 0 -4 Z';

Mock({
  num: 12, title: 'Rattle prop: bats', group: 'Props', rank: 4, leak: 'None', effort: 'Easy',
  trigger: 'A Poltergeist rattles',
  summary: 'A hanging prop moves when a player who joined the haunting shakes their phone. The number of Rattles in a Turn picks a creak, a wind or a rumble. Bats are the pick. The chandelier and the doll are in the select only to compare.',
  stageNote: 'The servo tugs the top of the string and the prop swings under its own weight. Nobody learns who rattled. The pips count Rattles this Turn and the bar is the 4 s cooldown between sends.',
  servos: { tug: { label: 'Tug servo', rest: 90 } },
  svg: `
    <rect x="70" y="22" width="500" height="34" rx="6" fill="url(#gWoodD)" stroke="#2a1a12" stroke-width="2"/>
    <rect x="288" y="16" width="64" height="46" rx="6" fill="#2a2340" stroke="#4a3f6a" stroke-width="2"/>
    <g transform="translate(320 40)"><g id="c12horn"><rect x="-4" y="0" width="8" height="30" rx="3" fill="#e8c36a"/></g><circle r="6" fill="#3b3354"/></g>
    <g id="c12g">
      <use href="#c12inner" transform="translate(20 16)" filter="url(#blur6)" opacity=".22"/>
      <g id="c12inner">
        <line x1="0" y1="0" x2="0" y2="150" stroke="#9a8e78" stroke-width="3"/><circle r="5" fill="#9a8e78"/>
        <g id="c12v_chand" transform="translate(0 158)">
          ${FL.map((f, i) => `<path d="M0 0 Q${f * 0.7} -4 ${f} -8" stroke="#b08a3a" stroke-width="4" fill="none"/>
          <circle cx="${f}" cy="-52" r="26" fill="url(#gGlow)" opacity=".55"/>
          <rect x="${f - 5}" y="-40" width="10" height="30" rx="2" fill="#efe6cf" stroke="#b0a27a"/>
          <ellipse id="c12f${i}" cx="${f}" cy="-50" rx="5" ry="9" fill="#ffd36a"/>`).join('')}
          <ellipse rx="68" ry="13" fill="url(#gBrass)" stroke="#6a5220" stroke-width="2"/>
          <path d="M-20 12 L0 40 L20 12 Z" fill="url(#gBrass)" stroke="#6a5220" stroke-width="2"/>
        </g>
        <g id="c12v_bats" style="display:none">
          <rect x="-64" y="146" width="128" height="7" rx="3" fill="url(#gWoodD)" stroke="#2a1a12"/>
          ${[[-46, 172], [0, 192], [46, 172]].map((b) => `<line x1="${b[0]}" y1="153" x2="${b[0]}" y2="${b[1] - 6}" stroke="#9a8e78" stroke-width="2"/>
          <g transform="translate(${b[0]} ${b[1]}) scale(1 -1)"><path d="${BAT}" fill="#1c1626" stroke="#6a5f86" stroke-width="1.5"/><circle cx="-3" cy="2" r="1.6" fill="#ff6b7a"/><circle cx="3" cy="2" r="1.6" fill="#ff6b7a"/></g>`).join('')}
        </g>
        <g id="c12v_doll" style="display:none" transform="translate(0 150)">
          <path d="M-16 50 L16 50 L28 112 L-28 112 Z" fill="#8a3a5a" stroke="#4a1a2e" stroke-width="2"/>
          <line x1="-16" y1="56" x2="-34" y2="86" stroke="#e8d9c0" stroke-width="6" stroke-linecap="round"/><line x1="16" y1="56" x2="34" y2="86" stroke="#e8d9c0" stroke-width="6" stroke-linecap="round"/>
          <rect x="-12" y="112" width="8" height="22" fill="#e8d9c0"/><rect x="4" y="112" width="8" height="22" fill="#e8d9c0"/>
          <circle cy="26" r="21" fill="#e8d9c0" stroke="#8a7a5a" stroke-width="2"/>
          <path d="M-22 22 C-22 2 22 2 22 22 C14 12 -14 12 -22 22 Z" fill="#3a2a1a"/>
          <circle cx="-7" cy="28" r="3" fill="#1a1426"/><circle cx="7" cy="28" r="3" fill="#1a1426"/><path d="M-6 38 Q0 33 6 38" fill="none" stroke="#7a2a3a" stroke-width="2"/>
        </g>
      </g>
    </g>
    <text x="40" y="388" font-size="10.5" fill="#9b92ae">Rattles this Turn</text>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<circle id="c12p${i}" cx="${48 + i * 20}" cy="402" r="7" fill="#2a2340" stroke="#4a3f6a" stroke-width="2"/>`).join('')}
    <text x="470" y="388" font-size="10.5" fill="#9b92ae">next Rattle allowed in</text>
    <rect x="470" y="396" width="130" height="8" rx="4" fill="#2a2340"/><rect id="c12cool" x="470" y="396" width="0" height="8" rx="4" fill="#e8c36a"/>`,
  state: () => ({ th: 0, om: 0, count: 0, last: -1e9, tier: -1 }),
  selects: [{ id: 'prop', label: 'Hanging prop (bats chosen)', value: 'bats', options: [['chand', 'Chandelier'], ['bats', 'Bats'], ['doll', 'Doll']] }],
  frame(dt, a, s, X) {
    const h = Math.min(dt, 0.05) / 3;
    for (let i = 0; i < 3; i++) {
      s.om += (-30 * s.th - 0.6 * s.om + 0.52 * (a.tug - 90)) * h; s.th += s.om * h;
      if (s.th > 0.9) { s.th = 0.9; s.om = 0; } if (s.th < -0.9) { s.th = -0.9; s.om = 0; }
    }
  },
  render(a, s, X) {
    const px = 320 + (a.tug - 90) * 0.35, t = performance.now(), p = s.se_prop || 'chand';
    X.xf('c12g', 'translate(' + px.toFixed(1) + ' 72) rotate(' + (s.th * 180 / Math.PI).toFixed(2) + ')');
    X.rot('c12horn', (a.tug - 90) * 0.8, 0, 0);
    X.show('c12v_chand', p === 'chand'); X.show('c12v_bats', p === 'bats'); X.show('c12v_doll', p === 'doll');
    for (let i = 0; i < 5; i++) X.set('c12f' + i, { ry: (9 + 1.6 * Math.sin(t / (110 + i * 17))).toFixed(2) });
    for (let i = 0; i < 6; i++) X.set('c12p' + i, { fill: i < s.count ? TCOL[i < 2 ? 0 : i < 4 ? 1 : 2] : '#2a2340' });
    const cool = X.clamp(1 - (t - s.last) / (4000 / X.speed()), 0, 1);
    X.set('c12cool', { width: (130 * cool).toFixed(1) });
  },
  toggles: [{ id: 'master', label: 'Master’s Rattle switch', on: true }],
  events: [
    { id: 'rattle', group: 'A player who joined the haunting shakes their phone', queue: false, label: 'Rattle', sub: 'Press repeatedly: 1–2 creak, 3–4 wind, 5–6 rumble', run: async (x) => {
      const s = x.state, now = performance.now();
      if (!s.tg_master) { x.warn('The Master’s Rattle switch is off. Nothing happens and nothing moves.'); return; }
      if (now - s.last < 4000 / x.speed()) { x.warn('Refused: 4 seconds between sends.'); return; }
      if (s.count >= 6) { x.warn('Refused: 6 Rattles per Turn for the whole table.'); return; }
      s.last = now; s.count++;
      const kind = s.count <= 2 ? 0 : s.count <= 4 ? 1 : 2; s.tier = kind;
      x.pub('“' + LINES[kind] + '”  (Rattle ' + s.count + ' this Turn)');
      x.priv('Who rattled is not in the event. The ending screen names the senders.');
      x.caption('“' + LINES[kind] + '” · ' + TIER[kind]);
      if (kind === 0) { x.noise(500, 0.04, 300); await x.anim('tug', (p) => 90 + 2.2 * Math.sin(p * 2.4 * Math.PI * 2) * (1 - p * 0.4), 2400); }
      else if (kind === 1) { x.noise(1500, 0.05, 500); await x.anim('tug', (p) => 90 + 26 * Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI), 3000); }
      else { x.noise(1800, 0.12, 120); await x.anim('tug', (p) => 90 + 14 * Math.sin(p * 2 * 8 * Math.PI * 2) * Math.sin(p * Math.PI), 2000); }
      await x.move('tug', 90, 300);
    } },
    { id: 'turn', group: 'Next', label: 'A new Turn starts', sub: 'The Rattle count resets', run: async (x) => { x.state.count = 0; x.caption(''); x.pub('New Turn. The Rattle count is back to 0.'); } }
  ],
  listens: ['Accepted Rattles this Turn (a count) and the public line for it', 'A new Turn (resets the count)'],
  never: ['Who sent the Rattle', 'Which phone was shaken', 'Any Hand, Haunt level or Solution (a Rattle touches none of them)'],
  parts: '1 servo, thread, a light hanging prop (a paper chandelier, three cardboard bats or a small doll) and a hook. The servo tugs and gravity does the swinging. Start at the cue’s start time so it lines up with the Display. Bots never rattle, so a solo game never moves it.',
  spec: ['party-mode 19.1 only a Poltergeist can Rattle', 'party-mode 19.2 4 s between sends, 6 per Turn', 'party-mode 19.4 effect follows the count', 'party-mode 19.5 three public lines and no sender'],
  ask: ['Chandelier, bats or a doll? Use the select to compare how each swings.', 'Is a creak at 2 s long enough to notice, or should the first Rattle always swing wider?'],
  shot: { before: [], event: 'rattle', wait: 1500 }
});
