const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', ''];
const kx = (i) => 530 + (i % 3) * 34, ky = (i) => 186 + Math.floor(i / 3) * 34;
const lerp = (a, b, t) => a + (b - a) * t;
const poly = (t) => '250,252 450,252 ' + lerp(470, 445, t).toFixed(1) + ',' + lerp(272, 176, t).toFixed(1) + ' ' + lerp(230, 255, t).toFixed(1) + ',' + lerp(272, 176, t).toFixed(1);
const PHONES = [['Mina', 18], ['Joe', 106], ['Ravi', 194]];
async function press(x, d) {
  const s = x.state;
  if (s.open || s.busy) return;
  if (d === 'C') { s.entry = ''; return; }
  s.entry += d; x.tone(640, 640, 50, 'sine', 0.06);
  if (s.entry.length < 4) return;
  s.busy = true;
  if (s.entry === s.code) {
    x.prop('Correct PIN. The servo pulls the latch and a spring lifts the lid.');
    await x.move('latch', 90, 600, 'inOut'); s.open = true; x.tone(300, 600, 200, 'triangle', 0.1);
  } else {
    s.wrong++; x.warn('Wrong PIN (' + s.wrong + '). The keypad buzzes and clears.'); s.err = 1; x.tone(140, 110, 300, 'square', 0.08); await x.wait(900); s.err = 0;
  }
  s.entry = ''; s.busy = false;
}
const typeCode = async (x, code) => { for (const d of code) { await press(x, d); await x.wait(380); } };

Mock({
  num: 15, title: 'Relic vault', group: 'Lock boxes', leak: 'None', effort: 'Medium',
  trigger: 'Players type the PIN from a phone',
  summary: 'A keypad box holding the six 3D-printed Relics. Every seated phone can show the same 4-digit PIN. Someone types it on the box and the servo latch lets the spring lid open.',
  stageNote: 'Lock box idea B with the PIN on every phone. The PIN opens a box of toys, not the game, so it is not a game secret. Every seated player can read it, and a phone with no seat cannot. Tap a phone to show or hide its PIN, then click the keypad to type.',
  servos: { latch: { label: 'Latch servo', rest: 0, max: 90 } },
  svg: `
    <rect x="0" y="352" width="640" height="68" fill="#15111d"/>
    ${PHONES.map((p, i) => `<g id="v15p${i}" style="cursor:pointer"><rect x="${p[1]}" y="26" width="80" height="124" rx="14" fill="#0a070f" stroke="#3d3557" stroke-width="3"/>
      <text x="${p[1] + 40}" y="46" text-anchor="middle" font-size="10" fill="#9b92ae" pointer-events="none">${p[0]}</text>
      <text x="${p[1] + 40}" y="68" text-anchor="middle" font-size="12" fill="#cfc7e0" pointer-events="none">Box PIN</text>
      <text id="v15code${i}" x="${p[1] + 40}" y="100" text-anchor="middle" font-size="16" fill="#e8c36a" font-weight="700" pointer-events="none">• • • •</text>
      <text id="v15tap${i}" x="${p[1] + 40}" y="132" text-anchor="middle" font-size="10" fill="#9b92ae" pointer-events="none">tap to show</text></g>`).join('')}
    <ellipse cx="350" cy="356" rx="160" ry="12" fill="#000" opacity=".5" filter="url(#blur6)"/>
    <polygon id="v15lidB" fill="url(#gWoodD)" stroke="#2a1a12" stroke-width="2" style="display:none"/>
    <polygon points="250,252 450,252 470,272 230,272" fill="#0a070f"/>
    <g id="v15relics" opacity="0">
      <rect x="258" y="238" width="7" height="32" fill="#e8c36a"/><ellipse cx="261.5" cy="236" rx="6" ry="7" fill="#ffd36a"/>
      <circle cx="298" cy="252" r="10" fill="none" stroke="#c0c6d8" stroke-width="3.5"/><rect x="296.5" y="240" width="3" height="-8" fill="#c0c6d8"/>
      <path d="M332 270 L336 228 L340 270 Z" fill="#c0c6d8"/><rect x="328" y="268" width="16" height="4" fill="#8a6b45"/>
      <ellipse cx="372" cy="252" rx="9" ry="12" fill="#c0708a" stroke="#6a2a44"/><rect x="371" y="236" width="2" height="8" fill="#c0708a"/>
      <circle cx="406" cy="252" r="12" fill="#1d182b" stroke="#6a8fc0" stroke-width="3"/><line x1="406" y1="252" x2="406" y2="244" stroke="#6a8fc0" stroke-width="2"/>
      <path d="M432 270 V248 q0 -8 6 -8 q6 0 6 8 V270 Z" fill="#6aa58a" stroke="#2d5a44"/>
    </g>
    <rect x="230" y="272" width="240" height="82" rx="6" fill="url(#gWood)" stroke="#2a1a12" stroke-width="2"/>
    <g stroke="#2e1d15" stroke-width="2" opacity=".7"><line x1="232" y1="298" x2="468" y2="298"/><line x1="232" y1="326" x2="468" y2="326"/></g>
    <rect x="316" y="276" width="36" height="24" rx="4" fill="url(#gBrass)" stroke="#6a5220"/>
    <g id="v15bolt"><rect x="322" y="284" width="26" height="8" rx="2" fill="#6a5220"/></g>
    <polygon id="v15lidF" fill="url(#gWoodD)" stroke="#2a1a12" stroke-width="2"/>
    <rect id="v15clasp" x="338" y="262" width="24" height="10" rx="2" fill="url(#gBrass)" stroke="#6a5220"/>
    <rect x="498" y="100" width="120" height="216" rx="12" fill="#241d36" stroke="#4a3f6a" stroke-width="2"/>
    <rect x="510" y="112" width="96" height="40" rx="6" fill="#07050b"/>
    <text id="v15disp" x="558" y="140" text-anchor="middle" font-size="22" fill="#9fe8be" letter-spacing="4" font-family="ui-monospace,Menlo,monospace">____</text>
    ${KEYS.map((k, i) => k === '' ? '' : `<g id="v15k_${k}" style="cursor:pointer"><circle cx="${kx(i)}" cy="${ky(i) + 8}" r="14" fill="#3a3158" stroke="#6a5f86" stroke-width="2"/><text x="${kx(i)}" y="${ky(i) + 14}" text-anchor="middle" font-size="14" fill="#ebe6f5" pointer-events="none">${k}</text></g>`).join('')}
    <text x="558" y="334" text-anchor="middle" font-size="10" fill="#9b92ae">PIN checked on the ESP32</text>
    <text id="v15wrong" x="558" y="348" text-anchor="middle" font-size="10" fill="#9b92ae"></text>`,
  state: () => ({ code: '4719', shown: [false, false, false], entry: '', open: false, busy: false, err: 0, wrong: 0 }),
  init(s, X) {
    KEYS.forEach((k) => { if (k) X.el('v15k_' + k).addEventListener('click', () => X.run((x) => press(x, k), { queue: false })); });
    PHONES.forEach((p, i) => X.el('v15p' + i).addEventListener('click', () => X.run(async (x) => { x.state.shown[i] = !x.state.shown[i]; }, { queue: false })));
  },
  render(a, s, X) {
    const t = X.clamp((a.latch - 45) / 45, 0, 1), pts = poly(t);
    X.set('v15lidB', { points: pts }); X.set('v15lidF', { points: pts });
    X.show('v15lidB', t > 0.55); X.show('v15lidF', t <= 0.55);
    X.op('v15clasp', (1 - t * 2 > 0 ? 1 - t * 2 : 0).toFixed(2)); X.op('v15relics', t.toFixed(2));
    X.tr('v15bolt', -(a.latch / 90) * 20, 0);
    PHONES.forEach((p, i) => {
      X.txt('v15code' + i, s.shown[i] ? s.code.split('').join(' ') : '• • • •');
      X.txt('v15tap' + i, s.shown[i] ? 'tap to hide' : 'tap to show');
    });
    X.txt('v15disp', s.err ? 'WRONG' : s.entry.padEnd(4, '_').split('').join(' '));
    X.fill('v15disp', s.err ? '#ff7a7a' : '#9fe8be');
    X.txt('v15wrong', s.wrong ? 'wrong PINs so far: ' + s.wrong : '');
  },
  events: [
    { id: 'show', group: 'On the players’ phones', label: 'Players open “Box PIN” on their phones', sub: 'Every seated phone shows the same PIN. It is not on the Host screen.', run: async (x) => { x.state.shown = [true, true, true]; x.note('The Room made this PIN when the room opened and sent it to the box and to every seated phone.'); } },
    { id: 'type', group: 'At the box', label: 'Type the PIN from a phone', sub: 'Or click the keypad yourself', run: async (x) => { x.state.shown = [true, true, true]; await typeCode(x, x.state.code); } },
    { id: 'wrong', label: 'Type a wrong PIN', run: (x) => typeCode(x, '0000') },
    { id: 'late', label: 'Someone with no seat asks for the PIN', sub: 'A phone with no token cannot take a seat once the game has started', run: async (x) => { x.note('No seat means no PIN card. The PIN reaches seated phones only.'); } },
    { id: 'start', label: 'The Master starts the game without opening it', sub: 'Nothing changes', run: async (x) => { x.pub('The Master started the game.'); x.note('The box is garnish. The game never waits for it and works with no printer.'); } },
    { id: 'new', group: 'Between games', label: 'New room: a new PIN reaches every phone and the box', run: async (x) => { const s = x.state; s.code = String(Math.floor(1000 + Math.random() * 9000)); s.wrong = 0; s.shown = [false, false, false]; x.note('New PIN sent to the box and to every seated phone.'); if (s.open) { s.open = false; await x.move('latch', 0, 900); } } },
    { id: 'again', label: 'Play again: relock the box', sub: 'Someone presses the lid down', run: async (x) => { x.pub('New game.'); x.state.open = false; await x.move('latch', 0, 900); } }
  ],
  listens: ['A PIN the Room creates for the room and sends to the box and to every seated phone', 'Play again (relock)'],
  never: ['Any game secret: the PIN opens a box of toys, not the game', 'Anything about the Solution, a Hand or a Residue position'],
  parts: '1 servo as a latch, a spring-loaded lid hinged at the back, a 3x4 keypad on 7 GPIO pins, a 4-digit display (optional). The 6 printed Relics sit inside. The Room makes the PIN when the room opens and sends it to the box over Wi-Fi and to every seated phone (a "Box PIN" card in the menu). The box checks the typed digits itself, so it keeps working if the Wi-Fi drops afterwards. It never gates the game.',
  spec: ['party-mode: a phone without a token cannot take a seat after the game has started (1.4)', 'party-mode intro: relics can be 3D printed, the mode needs no printer'],
  ask: ['Should the "Box PIN" card be in the lobby only, or also in the menu during play?', 'Or should a phone send the PIN straight to the box, so the box needs no keypad?', 'Lock the keypad for 10 s after 3 wrong PINs, or never?'],
  shot: { before: ['show'], event: 'type', wait: 3300 }
});
