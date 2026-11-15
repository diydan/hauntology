const COL = ['#e0505c', '#4aa3ff', '#6fdc9a', '#ffd36a', '#b88aff'];
const RES = ['1 k', '2.2 k', '4.7 k', '10 k', '22 k'];
const SIGHT = [2, 0, 4, 1, 3];
const wy = (i) => 84 + i * 50;
const TX = 308;
const lines = (m) => String(m || '').split('|');
async function check(x) {
  const s = x.state;
  if (!s.open || !s.paired) { x.note('Set ignored: no open Wires Lock is paired to this box.'); return; }
  if (s.plug.some((p) => p < 0)) { x.warn('Set ignored: not every wire is plugged in. The ESP32 only sends full boards.'); return; }
  const at = []; s.plug.forEach((t, w) => { at[t] = w; });
  x.prop('Set pressed. The box sends which wire sits on which terminal, read from the resistor values.'); s.setp = 1; x.tone(110, 50, 140, 'sine', 0.25); await x.wait(200); s.setp = 0;
  if (at.every((w, t) => w === SIGHT[t])) { s.msg = 'Opened.|Residue: the Candlestick.'; s.open = false; s.paired = false; x.priv('Result goes to the phone only.'); }
  else { s.tries--; s.msg = s.tries > 0 ? 'Not that wiring.|' + s.tries + ' attempts left.' : 'Nothing came loose.|The Lock closes.'; if (s.tries <= 0) { s.open = false; s.paired = false; } }
}
function plugTo(s, w, t) { const other = s.plug.indexOf(t); if (other >= 0) s.plug[other] = -1; s.plug[w] = t; }
async function autoWire(x, order) {
  const s = x.state;
  if (!s.open || !s.paired) { x.note('Wires ignored: no open Wires Lock is paired to this box.'); return; }
  s.plug = [-1, -1, -1, -1, -1];
  for (let t = 0; t < 5; t++) { s.sel = order[t]; await x.wait(250); plugTo(s, order[t], t); s.sel = -1; x.tone(500, 420, 40, 'square', 0.04); await x.wait(220); }
  await x.wait(300); await check(x);
}

Mock({
  num: 20, title: 'Cut wires board', group: 'Puzzle inputs', leak: 'Low', effort: 'Medium',
  trigger: 'Player plugs wires',
  noServoNote: 'No servo needed. Five coloured jumper wires and five terminals. Each wire has its own resistor, so the ESP32 reads which wire sits on which terminal.',
  summary: 'Five real coloured wires and five numbered terminals for the Cut wires puzzle. The phone shows the fuse box seen earlier. The player drags each plug to a terminal and presses Set.',
  stageNote: 'Drag a wire’s plug to a terminal (or tap the plug, then the terminal). The strip under the board is what the ESP32 reads. The fuse box order is on the phone only, so the table sees someone wiring and no order.',
  servos: {},
  svg: `
    <rect x="0" y="414" width="640" height="6" fill="#15111d"/>
    <rect x="30" y="44" width="316" height="290" rx="14" fill="url(#gWoodD)" stroke="#2a1a12" stroke-width="2"/>
    <circle id="w20led" cx="52" cy="62" r="6" fill="#2a2d3c" stroke="#6a5f86" stroke-width="2"/>
    <text x="64" y="66" font-size="11" fill="#9b92ae">paired</text>
    ${[0, 1, 2, 3, 4].map((t) => `<g id="w20t_${t}" style="cursor:pointer"><rect x="288" y="${wy(t) - 17}" width="42" height="34" rx="6" fill="#1d182b" stroke="#6a5f86" stroke-width="2"/><circle cx="${TX}" cy="${wy(t)}" r="8" fill="#07050b" stroke="#9b92ae" stroke-width="2"/><text x="338" y="${wy(t) + 5}" font-size="14" fill="#cfc7e0" font-weight="700" pointer-events="none">${t + 1}</text></g>`).join('')}
    ${COL.map((c, w) => `<path id="w20p_${w}" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/><rect x="40" y="${wy(w) - 8}" width="16" height="16" rx="4" fill="#3b3354" stroke="#6a5f86" stroke-width="2"/>
    <g id="w20e_${w}" style="cursor:grab;touch-action:none"><circle id="w20pl_${w}" r="13" fill="${c}" stroke="#fff" stroke-width="3" stroke-opacity="0"/><circle r="5" fill="#0d0b12" opacity=".55"/></g>`).join('')}
    <g id="w20set" style="cursor:pointer"><g id="w20sett"><rect x="130" y="302" width="100" height="26" rx="8" fill="#6a4a8a" stroke="#9a7ac0" stroke-width="2"/><text x="180" y="320" text-anchor="middle" font-size="14" fill="#fff" font-weight="700" pointer-events="none">SET</text></g></g>
    <text x="36" y="356" font-size="10.5" fill="#9b92ae" letter-spacing="1.5">THE ESP32 READS</text>
    ${[0, 1, 2, 3, 4].map((t) => `<rect x="${36 + t * 62}" y="362" width="56" height="38" rx="6" fill="#130f1c" stroke="#3b3354"/><text x="${64 + t * 62}" y="376" text-anchor="middle" font-size="10" fill="#6f6788">T${t + 1}</text><text id="w20r_${t}" x="${64 + t * 62}" y="393" text-anchor="middle" font-size="14" fill="#6f6788" font-weight="700" font-family="ui-monospace,Menlo,monospace">open</text>`).join('')}
    <rect x="384" y="40" width="226" height="330" rx="26" fill="#0a070f" stroke="#3d3557" stroke-width="3"/>
    <text x="497" y="74" text-anchor="middle" font-size="10" fill="#9b92ae" letter-spacing="1.5">PLAYER’S PHONE · PRIVATE</text>
    <text x="497" y="102" text-anchor="middle" font-size="15" fill="#ebe6f5" font-weight="600">Cut wires: fuse box</text>
    <g id="w20fuse" opacity="0">${SIGHT.map((w, t) => `<rect x="440" y="${118 + t * 32}" width="114" height="22" rx="5" fill="${COL[w]}"/><text x="426" y="${134 + t * 32}" text-anchor="middle" font-size="13" fill="#cfc7e0">${t + 1}</text>`).join('')}</g>
    <text id="w20m0" x="497" y="318" text-anchor="middle" font-size="13" fill="#ebe6f5"></text>
    <text id="w20m1" x="497" y="338" text-anchor="middle" font-size="13" fill="#cfc7e0"></text>`,
  state: () => ({ plug: [-1, -1, -1, -1, -1], sel: -1, drag: null, open: false, paired: false, tries: 3, setp: 0, fuse: 0, msg: 'No Lock open.' }),
  init(s, X) {
    for (let w = 0; w < 5; w++) {
      const g = X.el('w20e_' + w);
      g.addEventListener('pointerdown', (e) => {
        const st = X.state; if (!st.paired) { X.note('Wire ignored: not paired.'); return; }
        e.preventDefault(); g.setPointerCapture(e.pointerId); const p = X.pt(e);
        st.drag = { w, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false };
      });
      g.addEventListener('pointermove', (e) => {
        const d = X.state.drag; if (!d || d.w !== w) return;
        const p = X.pt(e); d.x = p.x; d.y = p.y; if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
      });
      g.addEventListener('pointerup', () => {
        const st = X.state, d = st.drag; if (!d || d.w !== w) return; st.drag = null;
        if (d.moved) {
          let best = -1, bd = 44;
          for (let t = 0; t < 5; t++) { const dd = Math.hypot(d.x - TX, d.y - wy(t)); if (dd < bd) { bd = dd; best = t; } }
          if (best >= 0) { plugTo(st, w, best); X.tone(500, 420, 40, 'square', 0.04); } else { st.plug[w] = -1; }
        } else { st.sel = st.sel === w ? -1 : w; }
      });
    }
    for (let t = 0; t < 5; t++) X.el('w20t_' + t).addEventListener('click', () => X.run(async (x) => { const st = x.state; if (st.sel < 0) return; plugTo(st, st.sel, t); st.sel = -1; x.tone(500, 420, 40, 'square', 0.04); }, { queue: false }));
    X.el('w20set').addEventListener('click', () => X.run((x) => check(x), { queue: false }));
  },
  render(a, s, X) {
    for (let w = 0; w < 5; w++) {
      const t = s.plug[w], dr = s.drag && s.drag.w === w;
      const px = dr ? s.drag.x : t >= 0 ? TX : 170, py = dr ? s.drag.y : t >= 0 ? wy(t) : wy(w);
      X.set('w20p_' + w, { d: 'M48 ' + wy(w) + ' C 110 ' + wy(w) + ', ' + (px - 70) + ' ' + py + ', ' + px.toFixed(1) + ' ' + py.toFixed(1) });
      X.tr('w20e_' + w, px.toFixed(1), py.toFixed(1)); X.set('w20pl_' + w, { 'stroke-opacity': s.sel === w || dr ? 1 : 0 });
    }
    for (let t = 0; t < 5; t++) { const w = s.plug.indexOf(t); X.txt('w20r_' + t, w >= 0 ? RES[w] : 'open'); X.fill('w20r_' + t, w >= 0 ? COL[w] : '#6f6788'); }
    X.fill('w20led', s.paired ? '#6fdc9a' : '#2a2d3c'); X.tr('w20sett', 0, s.setp ? 4 : 0); X.op('w20fuse', s.fuse);
    const L = lines(s.msg); X.txt('w20m0', L[0] || ''); X.txt('w20m1', L[1] || '');
  },
  events: [
    { id: 'open', group: 'The Wires Lock', label: 'The active player opens the Wires Lock', sub: 'Their phone shows the fuse box seen earlier', run: async (x) => {
      const s = x.state; s.open = true; s.paired = false; s.tries = 3; s.plug = [-1, -1, -1, -1, -1]; s.fuse = 1; s.msg = 'Wire it like the fuse box.|Tap “Use the box”.';
      x.pub('Seat 2 inspects the Kitchen. A Lock opens on their phone.'); x.priv('The fuse-box order is the Sight. The box is never sent it.');
    } },
    { id: 'pair', label: 'The player taps “Use the box”', run: async (x) => { const s = x.state; if (!s.open) { x.warn('No open Lock to pair.'); return; } s.paired = true; x.prop('Pairing LED on. Reading the resistor on each terminal.'); } },
    { id: 'right', group: 'Wiring', label: 'Plug the wires in the right order', sub: 'Then press Set. Or drag them yourself.', run: (x) => autoWire(x, SIGHT) },
    { id: 'wrong', label: 'Plug the wires 1 to 5 in order', run: (x) => autoWire(x, [0, 1, 2, 3, 4]) },
    { id: 'clear', label: 'Pull all the plugs out', run: async (x) => { x.state.plug = [-1, -1, -1, -1, -1]; x.state.sel = -1; } }
  ],
  listens: ['That the active player’s Lock is open and paired', 'Which wire is on which terminal, when Set is pressed'],
  never: ['The fuse box order (the Sight)', 'Whether the wiring was right', 'The wire names the phone shows'],
  parts: '5 jumper wires each with a different resistor (1 k, 2.2 k, 4.7 k, 10 k, 22 k), 5 sockets read through ADC pins or a multiplexer, one Set button, one LED. No servo. Send only a full board, so the room cannot watch a half-right wiring grow.',
  spec: ['puzzles 3.2 Cut wires', 'puzzles 6.2 the Sight carries the wire order', 'puzzles 7.3 a wrong Attempt reports no count of right wires'],
  ask: ['Is wiring a box worth the build? It is the most physical of the four.', 'Do the wires need a name on the box (colour only is fine)?', 'Should the box show a light when a terminal is filled, or stay dark?'],
  shot: { before: ['open', 'pair'], event: 'right', wait: 1400 }
});
