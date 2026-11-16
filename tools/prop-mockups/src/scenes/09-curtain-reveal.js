const folds = (x0, x1) => { let h = ''; for (let x = x0 + 14; x < x1; x += 22) h += '<line x1="' + x + '" y1="78" x2="' + x + '" y2="372" stroke="#2a0a12" stroke-width="2" opacity=".5"/>'; return h; };

Mock({
  num: 9, title: 'Curtain reveal', group: 'Props', rank: 3, leak: 'None', effort: 'Medium',
  trigger: 'Game ends',
  summary: 'A small stage curtain opens when the game ends and reveals the Solution on a little screen. One servo pulls both panels with a thread loop. Switch to the backstage view to see the build.',
  stageNote: 'Finding: an ESP32 cannot know which printed card is behind the curtain, so the card is a small screen (an ESP32 with a 1.8 inch display) that only lights up when the ending arrives. Use the toggles to see backstage and to wait for the recap.',
  servos: { curtain: { label: 'Curtain servo', rest: 0 } },
  svg: `
    <defs><pattern id="c9pat" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#000" opacity=".5"/></pattern></defs>
    <rect x="40" y="372" width="560" height="30" fill="#15111d"/>
    <rect x="205" y="96" width="230" height="258" rx="12" fill="#0b0912" stroke="#3b3354" stroke-width="3"/>
    <polygon id="c9beam" points="320,50 140,372 500,372" fill="#fff3c4" opacity="0"/>
    <g id="c9card" opacity="0">
      <text x="320" y="132" text-anchor="middle" font-size="13" letter-spacing="3" fill="#e8c36a" font-weight="700">THE SOLUTION</text>
      <circle cx="320" cy="198" r="42" fill="#1a1426" stroke="#e8c36a" stroke-width="3"/>
      <circle cx="320" cy="188" r="15" fill="#6a8fc0"/><path d="M296 226 q24 -40 48 0 z" fill="#6a8fc0"/>
      <text x="320" y="268" text-anchor="middle" font-size="19" fill="#ebe6f5" font-weight="600">Dr. Pike</text>
      <text x="320" y="296" text-anchor="middle" font-size="15" fill="#cfc7e0">in the Cellar</text>
      <text x="320" y="320" text-anchor="middle" font-size="15" fill="#cfc7e0">with the Candlestick</text>
    </g>
    <rect id="c9off" x="214" y="105" width="212" height="240" rx="6" fill="#050408"/>
    <rect x="214" y="105" width="212" height="240" rx="6" fill="url(#c9pat)" opacity=".28"/>
    <g id="c9back" style="display:none">
      <rect x="236" y="362" width="168" height="26" rx="4" fill="#1d4a3a" stroke="#4aa37a" stroke-width="1.5"/><text x="320" y="379" text-anchor="middle" font-size="11" fill="#9fe8be">ESP32 + 1.8″ screen</text>
      <path d="M320 354 V362" stroke="#4aa37a" stroke-width="3"/>
    </g>
    <g id="c9L"><rect x="60" y="78" width="262" height="294" fill="url(#gVelvet)"/>${folds(60, 322)}</g>
    <g id="c9R"><rect x="318" y="78" width="262" height="294" fill="url(#gVelvet)"/>${folds(318, 580)}</g>
    <path d="M52 52 H588 V88 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 q-14 16 -28 0 Z" fill="#3a0a14" stroke="#e8c36a" stroke-width="2"/>
    <g id="c9mech" style="display:none">
      <rect x="40" y="26" width="560" height="10" rx="3" fill="#6a5f86"/>
      <circle cx="46" cy="66" r="9" fill="#3b3354" stroke="#9b92ae" stroke-width="2"/>
      <line id="c9t1" stroke="#e8c36a" stroke-width="2.5"/><line id="c9t2" stroke="#e8c36a" stroke-width="2.5"/><line id="c9t3" stroke="#e8c36a" stroke-width="2.5"/>
      <rect x="560" y="40" width="50" height="40" rx="6" fill="#2a2340" stroke="#6a5f86" stroke-width="2"/>
      <g transform="translate(585 60)"><g id="c9horn"><line x1="0" y1="0" x2="0" y2="-24" stroke="#e8c36a" stroke-width="5" stroke-linecap="round"/></g><circle r="6" fill="url(#gMetal)"/></g>
      <text x="585" y="98" text-anchor="middle" font-size="10" fill="#9b92ae">servo</text>
      <text x="46" y="92" text-anchor="middle" font-size="10" fill="#9b92ae">pulley</text>
    </g>`,
  state: () => ({ rev: false, v: 0, prev: 0 }),
  toggles: [
    { id: 'back', label: 'Backstage view (servo, thread, screen board)', on: false },
    { id: 'wait', label: 'Open after the recap (wait 4 s)', on: false }
  ],
  frame(dt, a, s) { const vel = (a.curtain - s.prev) / Math.max(dt, 0.001); s.prev = a.curtain; s.v = s.v * 0.85 + vel * 0.15; },
  render(a, s, X) {
    const k = 1 - 0.9 * (a.curtain / 180), sk = X.clamp(s.v * 0.025, -7, 7), back = !!s.tg_back;
    X.xf('c9L', 'translate(60 78) skewX(' + sk.toFixed(2) + ') scale(' + k.toFixed(3) + ' 1) translate(-60 -78)');
    X.xf('c9R', 'translate(580 78) skewX(' + (-sk).toFixed(2) + ') scale(' + k.toFixed(3) + ' 1) translate(-580 -78)');
    X.op('c9L', back ? 0.3 : 1); X.op('c9R', back ? 0.3 : 1);
    X.show('c9mech', back); X.show('c9back', back);
    const xl = 60 + 262 * k, xr = 580 - 262 * k;
    X.rot('c9horn', a.curtain - 90, 0, 0);
    const ht = { x: 585 + 24 * Math.sin((a.curtain - 90) * Math.PI / 180), y: 60 - 24 * Math.cos((a.curtain - 90) * Math.PI / 180) };
    X.set('c9t1', { x1: ht.x.toFixed(1), y1: ht.y.toFixed(1), x2: xr.toFixed(1), y2: 62 });
    X.set('c9t2', { x1: xr.toFixed(1), y1: 62, x2: 46, y2: 57 });
    X.set('c9t3', { x1: 46, y1: 75, x2: xl.toFixed(1), y2: 66 });
    const open = a.curtain / 180;
    X.op('c9card', s.rev ? Math.min(1, open * 1.6) : 0);
    X.op('c9off', s.rev ? 0 : 1);
    X.op('c9beam', s.rev ? (open * 0.09).toFixed(3) : 0);
  },
  events: [
    { id: 'early', group: 'During the game', label: 'Mid-game: nothing is sent', sub: 'The screen stays blank', run: async (x) => { x.priv('The ESP32 has not been sent the Solution. Its screen is blank and the curtain is shut.'); } },
    { id: 'win', group: 'The end', label: 'Game ends: a Player wins', sub: 'Solution revealed', run: async (x) => {
      x.pub('Correct Accusation. Solution revealed: Dr. Pike, the Cellar, the Candlestick.');
      if (x.state.tg_wait) { x.note('The Display plays the ending recap first. The curtain waits 4 s.'); await x.wait(4000); }
      x.state.rev = true; x.prop('Screen wakes. Curtain opens over 2.4 s.'); x.noise(1800, 0.05, 250); await x.move('curtain', 180, 2400, 'inOut');
    } },
    { id: 'house', label: 'Game ends: the haunting wins', sub: 'The Solution is still revealed', run: async (x) => {
      x.pub('The haunting wins. The Solution is revealed anyway.');
      if (x.state.tg_wait) { await x.wait(4000); }
      x.state.rev = true; x.noise(2400, 0.05, 250); await x.move('curtain', 180, 3200, 'inOut');
    } },
    { id: 'again', label: 'Play again', sub: 'Curtain closes, screen clears', run: async (x) => { x.pub('New game.'); await x.move('curtain', 0, 1800, 'inOut'); x.state.rev = false; } }
  ],
  listens: ['The game ending', 'The Solution, only once the game has ended', 'Play again'],
  never: ['The Solution before the end', 'Any Hand or Residue position'],
  parts: '1 servo and a thread loop around a pulley, so one horn pulls two panels in opposite directions. Plus an ESP32 with a small colour screen (or use a second ESP32 only for the screen). Without a screen the curtain can open on a stage where the Display shows the card. Do the reveal while the ending recap plays, not at the first frame of the end.',
  spec: ['party-mode 6.5 end of game returns the Solution', 'party-mode 6.8 ending recap', 'ghost-voice 1.9 no audio prepared from the Solution'],
  ask: ['Do you own a small screen for the reveal, or should the curtain open on empty stage and leave the card to the TV?', 'Should the curtain open the moment the game ends or after the recap? Try the toggle.', 'Do you want the screen to show anything before the end, such as the Room Code?'],
  shot: { event: 'win', wait: 1700 }
});
