const NAMES = ['Mina', 'Joe', 'Ravi', 'Ola', 'Pim', 'Zed'];
const COL = ['#c0708a', '#8a7cc0', '#6aa58a', '#c09a5a', '#6a8fc0', '#a08a7a'];
const px = (i) => 95 + i * 90;
const servos = {};
NAMES.forEach((n, i) => { servos['s' + i] = { label: 'Flap ' + (i + 1) + ' (' + n + ')', rest: 0 }; });
// which seats will secretly be wrong when sealed: only the game knows
const SECRET = { 1: 'wrong', 2: 'right', 3: 'wrong', 4: 'wrong' };

Mock({
  num: 5, title: 'Haunting flipper', group: 'Props', rank: 5, leak: 'None', effort: 'Medium',
  trigger: 'Wrong Accusation revealed',
  summary: 'Each seat has a pawn on a flap. When an Accusation is sealed an envelope appears. At the Round-end reveal, every wrong one flips to its ghost side. The player stays in the game.',
  stageNote: 'Six flaps in a row, front view, flip drawn as a card turning. The envelope is public (the spec publishes that a player sealed). Whether it is right or wrong is only known to the game until the reveal.',
  servos,
  svg: `
    <rect x="40" y="304" width="560" height="34" rx="8" fill="url(#gWood)" stroke="#2a1a12" stroke-width="2"/>
    ${NAMES.map((n, i) => `
    <ellipse id="f5sh${i}" cx="${px(i)}" cy="296" rx="30" ry="6" fill="#000" opacity=".4"/>
    <g id="f5g${i}" transform="translate(${px(i)} 236)">
      <g id="f5f${i}">
        <rect x="-32" y="-56" width="64" height="112" rx="8" fill="#241d36" stroke="#4a3f6a" stroke-width="2"/>
        <circle cy="-22" r="15" fill="${COL[i]}"/><path d="M-22 40 Q0 -26 22 40 Z" fill="${COL[i]}"/>
      </g>
      <g id="f5b${i}" style="display:none">
        <rect x="-32" y="-56" width="64" height="112" rx="8" fill="#2c2a38" stroke="#5a5870" stroke-width="2"/>
        <path d="M-24 40 V-8 a24 24 0 0 1 48 0 V40 q-6 -8 -12 0 q-6 8 -12 0 q-6 -8 -12 0 q-6 8 -12 0 z" fill="#d8d6e4"/>
        <ellipse cx="-8" cy="-10" rx="3" ry="5" fill="#2a2733"/><ellipse cx="8" cy="-10" rx="3" ry="5" fill="#2a2733"/><ellipse cy="6" rx="4" ry="6" fill="#2a2733"/>
      </g>
    </g>
    <g id="f5e${i}" opacity="0" transform="translate(${px(i)} 160)"><rect x="-16" y="-11" width="32" height="22" rx="3" fill="url(#gPaper)" stroke="#8a7a50" stroke-width="1.5"/><path d="M-16 -11 L0 3 L16 -11" fill="none" stroke="#8a7a50" stroke-width="1.5"/><circle cy="3" r="3.5" fill="#c43a4c"/></g>
    <g id="f5c${i}" opacity="0" transform="translate(${px(i)} 164)"><path d="M-14 8 L-16 -8 L-7 0 L0 -12 L7 0 L16 -8 L14 8 Z" fill="#e8c36a" stroke="#7a6320"/></g>
    <circle cx="${px(i)}" cy="338" r="7" fill="#2a2340" stroke="#4a3f6a"/>
    <text x="${px(i)}" y="364" text-anchor="middle" font-size="13" fill="#ebe6f5" font-weight="600">${n}</text>
    <text id="f5t${i}" x="${px(i)}" y="380" text-anchor="middle" font-size="10.5" fill="#b0a8c4"></text>`).join('')}
    <text id="f5top" x="320" y="76" text-anchor="middle" font-size="14" fill="#9b92ae">Seat pawns. A flipped pawn means “joined the haunting”.</text>
    <text x="320" y="402" text-anchor="middle" font-size="10.5" fill="#6f6788">small circles: the servo under each flap</text>`,
  state: () => ({ ghost: [0, 0, 0, 0, 0, 0], sealed: [0, 0, 0, 0, 0, 0], win: [0, 0, 0, 0, 0, 0] }),
  render(a, s, X) {
    for (let i = 0; i < 6; i++) {
      const v = a['s' + i], rad = v * Math.PI / 180, sx = Math.cos(rad), sy = 1 - 0.07 * Math.sin(rad);
      X.xf('f5g' + i, 'translate(' + px(i) + ' ' + (236 - 8 * Math.sin(rad)).toFixed(1) + ') scale(' + (Math.abs(sx) < 0.02 ? 0.02 : sx).toFixed(3) + ' ' + sy.toFixed(3) + ')');
      X.set('f5sh' + i, { rx: (30 * Math.abs(sx) + 4).toFixed(1) });
      X.show('f5f' + i, v < 90); X.show('f5b' + i, v >= 90);
      X.txt('f5t' + i, s.ghost[i] ? 'joined the haunting' : s.win[i] ? 'winner' : s.sealed[i] ? 'sealed an Accusation' : '');
      X.op('f5e' + i, s.sealed[i] ? 1 : 0); X.op('f5c' + i, s.win[i] ? 1 : 0);
    }
  },
  events: [
    { id: 'seal2', group: 'During the Round: seats seal', label: 'Seat 2 seals an Accusation', sub: 'Secretly wrong. The envelope is public, the verdict is not.', run: async (x) => { x.state.sealed[1] = 1; x.pub('Joe sealed an Accusation.'); x.priv('Right or wrong is not known to anyone until the Round ends. The flap stays still.'); } },
    { id: 'seal3', label: 'Seat 3 seals an Accusation', sub: 'Secretly right', run: async (x) => { x.state.sealed[2] = 1; x.pub('Ravi sealed an Accusation.'); } },
    { id: 'seal4', label: 'Seat 4 seals an Accusation', sub: 'Secretly wrong', run: async (x) => { x.state.sealed[3] = 1; x.pub('Ola sealed an Accusation.'); } },
    { id: 'reveal', group: 'The Round-end reveal', label: 'The Round ends: Accusations are revealed together', sub: 'Wrong ones flip. If any is right the game ends.', run: async (x) => {
      const s = x.state, flips = {}, wins = [];
      [0, 1, 2, 3, 4, 5].forEach((i) => { if (s.sealed[i]) { if (SECRET[i] === 'wrong') { s.ghost[i] = 1; flips['s' + i] = 180; } else { wins.push(i); } } });
      if (!Object.keys(flips).length && !wins.length) { x.note('No Accusations were sealed this Round.'); return; }
      x.pub('Round ends. Accusations are revealed. ' + Object.keys(flips).length + ' wrong: those players joined the haunting.' + (wins.length ? ' One was right: the game ends.' : ''));
      s.sealed = [0, 0, 0, 0, 0, 0]; await x.moveAll(flips, 900, 'back');
      wins.forEach((i) => { s.win[i] = 1; });
      if (wins.length) x.note('Winners are shown by the Display or the curtain (#9). The flippers only turn the wrong ones.');
    } },
    { id: 'all', group: 'The end', label: 'Every player has joined the haunting', sub: 'House wins. Remaining flaps flip, one after another.', run: async (x) => {
      x.pub('Every player is now haunting. The house wins.');
      for (let i = 0; i < 6; i++) { if (!x.state.ghost[i]) { x.state.ghost[i] = 1; x.state.sealed[i] = 0; x.move('s' + i, 180, 800, 'back'); await x.wait(260); } }
    } },
    { id: 'again', label: 'Play again', run: async (x) => { x.pub('New game. Everyone is a detective again.'); const s = x.state; s.ghost = [0, 0, 0, 0, 0, 0]; s.sealed = [0, 0, 0, 0, 0, 0]; s.win = [0, 0, 0, 0, 0, 0]; await x.moveAll({ s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 }, 900); } }
  ],
  listens: ['Which seats sealed an Accusation (public: only that they sealed)', 'Which seats joined the haunting (public from the Round-end reveal)', 'Play again'],
  never: ['Accusation content, right or wrong parts', 'Whether a sealed Accusation is right before the reveal', 'Hands'],
  parts: 'One servo per seat (up to 6) on one ESP32. A pawn on a card flap with a sheet-ghost on its back. Use a 5 V 3 A supply and share ground. Player-facing words are “joined the haunting”, never “Poltergeist”. The envelope can be a paper flag on a second, cheaper servo or just a printed card.',
  spec: ['party-mode 6.3 sealing is public, content is not', 'party-mode 6.5 Round-end order', 'party-mode 11.3 joined the haunting', 'party-mode 14.2 wording'],
  ask: ['Six servos for one moment per wrong Accusation: worth it, or one shared flipper that tips only the newest pawn?', 'Should the pawn flip at the reveal or when the Display plays the sting?', 'Do you want the envelope at all, or only the flip?'],
  shot: { before: ['seal2', 'seal3', 'seal4'], event: 'reveal', wait: 560 }
});
