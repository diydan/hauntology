const RING = 163.4;
const gp = (a, r) => ({ x: 548 - r * Math.cos(a * Math.PI / 180), y: 388 - r * Math.sin(a * Math.PI / 180) });
const garc = (a0, a1, r) => { const p = gp(a0, r), q = gp(a1, r); return 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + q.x.toFixed(1) + ' ' + q.y.toFixed(1); };
const creak = (x) => x.tone(170, 250, 520, 'sawtooth', 0.025);

Mock({
  num: 1, title: 'Ghost in the box', group: 'Props', rank: 2, leak: 'None', effort: 'Easy',
  trigger: 'Haunt Event',
  summary: 'A ghost pops out of a box when a Haunt Event fires. One servo moves a lever: first the lid, then the ghost. The lid cracks open while a Poltergeist chooses.',
  stageNote: 'Front view of the box. The inset shows what one servo does: 0 to 30 degrees lifts the lid, 20 to 90 degrees lifts the ghost. The ring is the 15 s choice window from the spec.',
  servos: { arm: { label: 'Lever servo', rest: 0, max: 90 } },
  svg: `
    <defs><radialGradient id="g1gb"><stop offset="0" stop-color="#8fd0ff" stop-opacity=".8"/><stop offset="1" stop-color="#8fd0ff" stop-opacity="0"/></radialGradient></defs>
    <rect x="0" y="352" width="640" height="68" fill="#15111d"/>
    <ellipse cx="320" cy="364" rx="170" ry="14" fill="#000" opacity=".5" filter="url(#blur6)"/>
    <circle id="g1glow" cx="320" cy="150" r="150" fill="url(#gGlowP)" opacity="0"/>
    <circle id="g1frost" cx="320" cy="170" r="170" fill="url(#g1gb)" opacity="0"/>
    <rect x="204" y="240" width="232" height="26" rx="4" fill="#0a070f"/>
    <clipPath id="g1clip"><rect x="0" y="0" width="640" height="256"/></clipPath>
    <g clip-path="url(#g1clip)"><g id="g1ghost">
      <path d="M276 150 V140 a44 44 0 0 1 88 0 V300 q-11 -12 -22 0 q-11 12 -22 0 q-11 -12 -22 0 q-11 12 -22 0 q-11 -12 -22 0 z" fill="url(#gGhost)"/>
      <ellipse id="g1eyeL" cx="305" cy="136" rx="5" ry="8" fill="#241b3a"/><ellipse id="g1eyeR" cx="335" cy="136" rx="5" ry="8" fill="#241b3a"/>
      <ellipse id="g1mouth" cx="320" cy="160" rx="7" ry="10" fill="#241b3a"/>
    </g></g>
    <rect x="196" y="252" width="248" height="110" rx="6" fill="url(#gWood)" stroke="#2a1a12" stroke-width="2"/>
    <g stroke="#2e1d15" stroke-width="2" opacity=".7"><line x1="198" y1="280" x2="442" y2="280"/><line x1="198" y1="308" x2="442" y2="308"/><line x1="198" y1="336" x2="442" y2="336"/></g>
    <rect x="304" y="262" width="32" height="20" rx="4" fill="url(#gBrass)" stroke="#6a5220"/>
    <circle cx="320" cy="272" r="3" fill="#3a2a10"/>
    <g id="g1lid"><rect x="190" y="234" width="260" height="22" rx="4" fill="url(#gWoodD)" stroke="#2a1a12" stroke-width="2"/></g>

    <g id="g1win" opacity="0"><circle cx="580" cy="92" r="26" fill="#130f1c" stroke="#2a2340" stroke-width="6"/>
      <circle id="g1ring" cx="580" cy="92" r="26" fill="none" stroke="#e8c36a" stroke-width="6" stroke-dasharray="${RING}" stroke-dashoffset="0" transform="rotate(-90 580 92)"/>
      <text id="g1winT" x="580" y="98" text-anchor="middle" font-size="18" fill="#ebe6f5" font-weight="700">15</text>
      <text x="580" y="136" text-anchor="middle" font-size="10" fill="#9b92ae">choice window</text></g>

    <rect x="468" y="262" width="160" height="148" rx="12" fill="#130f1c" stroke="#3b3354" stroke-width="2"/>
    <text x="548" y="282" text-anchor="middle" font-size="10" fill="#9b92ae" letter-spacing="1.5">LEVER SERVO</text>
    <path d="${garc(0, 30, 50)}" fill="none" stroke="#6a8fc0" stroke-width="9"/>
    <path d="${garc(20, 90, 38)}" fill="none" stroke="#b9a7ff" stroke-width="9"/>
    <text x="492" y="344" font-size="10" fill="#6a8fc0">lid</text><text x="552" y="326" font-size="10" fill="#b9a7ff">ghost</text>
    <g transform="translate(548 388)"><g id="g1needle"><line x1="0" y1="0" x2="0" y2="-58" stroke="#e8c36a" stroke-width="3" stroke-linecap="round"/></g><circle r="7" fill="url(#gMetal)"/></g>
    <text id="g1ang" x="548" y="404" text-anchor="middle" font-size="11" fill="#ebe6f5">0°</text>`,
  state: () => ({ winOn: false, winT: 15, fx: '' }),
  frame(dt, a, s, X) {
    if (s.winOn) {
      s.winT -= dt * X.speed();
      if (s.winT <= 0) { s.winOn = false; s.winT = 0; X.pub('15 s passed and nobody chose. The first option applies: Cold Spot.'); X.fire('cold'); }
    }
  },
  render(a, s, X) {
    const lid = X.clamp(a.arm / 30, 0, 1);
    X.rot('g1lid', -lid * 108, 196, 250);
    const r = X.clamp((a.arm - 20) / 70, 0, 1), now = performance.now();
    const sway = r > 0.15 ? Math.sin(now / 260) * 3 * r : 0;
    X.xf('g1ghost', 'translate(' + sway.toFixed(1) + ' ' + ((1 - r) * 175).toFixed(1) + ')');
    X.op('g1glow', (r * 0.9).toFixed(2));
    X.op('g1frost', s.fx === 'cold' ? (r * 0.55).toFixed(2) : 0);
    const blink = now % 3300 < 130;
    X.set('g1eyeL', { ry: blink ? 1 : 8 }); X.set('g1eyeR', { ry: blink ? 1 : 8 });
    X.set('g1mouth', { ry: s.fx === 'blackout' ? 14 : 10, rx: s.fx === 'blackout' ? 10 : 7 });
    X.rot('g1needle', a.arm, 0, 0);
    X.txt('g1ang', Math.round(a.arm) + '°');
    X.op('g1win', s.winOn ? 1 : 0);
    X.set('g1ring', { 'stroke-dashoffset': (RING * (1 - X.clamp(s.winT / 15, 0, 1))).toFixed(1) });
    X.txt('g1winT', Math.max(0, Math.ceil(s.winT)));
  },
  events: [
    { id: 'peek', group: 'A human Poltergeist has 15 s to choose', label: 'Haunt Event fires: crack the lid', sub: 'The ring counts down. If nobody chooses, the first option applies.', run: async (x) => {
      const s = x.state; s.winOn = true; s.winT = 15;
      x.pub('Haunt reached 3. A Haunt Event fires with two options. A Poltergeist has 15 s to choose.');
      creak(x); await x.move('arm', 10, 900);
      x.prop('Lid cracked open to 10°. The ghost stays hidden.');
    } },
    { id: 'cold', group: 'The option that applies', label: 'Cold Spot', sub: 'Slow rise and a shiver. A blue chill.', run: async (x) => {
      const s = x.state; s.winOn = false; s.fx = 'cold';
      x.pub('Option applied: Cold Spot. One Zone cannot be suggested in until the end of the next Round.');
      x.noise(1200, 0.05, 400); await x.move('arm', 90, 1800, 'inOut'); await x.shake('arm', 3, 12, 900); await x.wait(1100); await x.move('arm', 0, 1600, 'inOut');
      s.fx = ''; x.prop('Ghost sank back into the box.');
    } },
    { id: 'blackout', label: 'Blackout', sub: 'Fast pop, then a slump. The room dims.', run: async (x) => {
      const s = x.state; s.winOn = false; s.fx = 'blackout';
      x.pub('Option applied: Blackout. The next Turn is 15 s shorter and the Display dims.');
      x.dim(0.55); x.noise(250, 0.12, 700); await x.move('arm', 90, 260, 'out'); await x.move('arm', 62, 450); await x.wait(1400); await x.move('arm', 0, 1200); x.dim(0); s.fx = '';
    } },
    { id: 'restless', label: 'Restless', sub: 'Three quick peeks', run: async (x) => {
      const s = x.state; s.winOn = false; s.fx = 'restless';
      x.pub('Option applied: Restless. The ghost moves to another Zone.');
      for (let i = 0; i < 3; i++) { await x.move('arm', 58, 340); await x.move('arm', 24, 340); }
      await x.move('arm', 0, 500); s.fx = '';
    } },
    { id: 'lull', label: 'Lull', sub: 'Rises a little, then sinks. The Haunt falls by one.', run: async (x) => {
      const s = x.state; s.winOn = false; s.fx = 'lull';
      x.pub('Option applied: Lull. The Haunt falls by one.');
      await x.move('arm', 48, 900); await x.wait(400); await x.move('arm', 0, 2000, 'inOut'); s.fx = '';
    } },
    { id: 'max', group: 'The end', label: 'Haunt reaches its maximum', sub: 'The house wins. The ghost stays up.', run: async (x) => {
      x.state.winOn = false; x.pub('The Haunt is at its maximum. The haunting wins and no player does.');
      x.noise(900, 0.1, 500); await x.move('arm', 90, 2200, 'inOut'); await x.shake('arm', 2.5, 9, 1500, false); x.prop('Ghost stays up until Play again.');
    } },
    { id: 'again', label: 'Play again', sub: 'Ghost sinks and the lid closes', run: async (x) => { x.pub('New game. Haunt back to 0.'); await x.move('arm', 0, 1600); } }
  ],
  listens: ['A Haunt Event firing (Haunt first reaches 3, 6 or 9, below the maximum)', 'Which option applied (public in the log)', 'The Haunt reaching its maximum', 'Play again'],
  never: ['Any Hand or Residue position', 'A sealed Accusation', 'Which Poltergeist picked the option'],
  parts: '1 servo (an SG90 is enough), a lever arm, a card hinge for the lid and a rubber band. Servo 0 to 30 degrees lifts the lid. 20 to 90 degrees lifts the ghost. Detach the servo after each move so it does not buzz. Up to 3 pops a game (2 on Quick).',
  spec: ['party-mode 11.2 Haunt Events at 3, 6, 9, two options, 15 s to choose', 'party-mode 6.5 end of Round order', 'party-mode 11.1 Haunt maximum 8, 10 or 12'],
  ask: ['Is the lid crack during the 15 s choice worth it, or should the ghost only pop once the option applies?', 'Should the ghost stay up after the house wins, or sink when the recap starts?', 'Do you want a different ghost move for each option, or one pop for all four?'],
  shot: { before: ['peek'], event: 'cold', wait: 1500 }
});
