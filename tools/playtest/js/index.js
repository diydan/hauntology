// The playtest menu: one card per puzzle, the phone check, and the saved results.
import { h, $, copyText } from './dom.js';
import { ALL } from './kinds/index.js';
import { loadResults, RESULTS_KEY } from './feel.js';

const app = $('#app');
const results = loadResults();
const stat = (id) => {
  const r = results.filter((x) => x.kind === id);
  if (!r.length) return '';
  const won = r.filter((x) => x.outcome === 'solved');
  const avg = won.length ? (won.reduce((a, x) => a + x.elapsedMs, 0) / won.length / 1000).toFixed(1) : '–';
  return `${won.length}/${r.length} solved · avg ${avg}s`;
};
const tag = (t) => h('span', { class: 'tag' }, t);

app.append(
  h('header', { class: 'bar' }, h('h1', {}, 'Hauntology playtest')),
  h('p', { class: 'muted' }, 'A device lab for sound, light and buzz (local and pushed), a phone check, and ten phone puzzles plus one extra. Tilt, buzz and sound are extras: every puzzle works with touch alone.'),
  h('div', { class: 'cards' },
    h('a', { href: 'lab.html', style: { borderColor: '#b9a6ff' } }, h('b', {}, 'Device lab'), h('small', { class: 'muted' }, 'Open one link on many devices. See who is on it. Fire sound, light and buzz here, or push them to others.'), tag('push'), tag('light'), tag('sound'), tag('buzz')),
    h('a', { href: 'check.html', style: { borderColor: '#b9a6ff' } }, h('b', {}, 'Check my phone'), h('small', { class: 'muted' }, 'Buzz, tilt, sound and mic tests. Copy the report.'), tag('start here')),
    h('a', { href: 'ar.html', style: { borderColor: '#8fe3d4' } }, h('b', {}, 'Spirit table (mockup)'), h('small', { class: 'muted' }, 'A private 3D board and ghost that only your phone can see, on your table through the camera.'), tag('camera'), tag('tilt'), tag('mockup')),
    ...ALL.map((k) => h('a', { href: `${k.id}.html` },
      h('b', {}, k.title),
      h('small', { class: 'muted' }, k.blurb.split('. ')[0] + '.'),
      k.memory ? tag('memory') : null,
      ...k.feelTags.map(tag),
      h('small', { style: { marginTop: '6px' } }, stat(k.id))))),
  h('h2', {}, 'Saved results'),
  h('p', { class: 'muted' }, `${results.length} runs saved on this phone. Paste them to the developer to tune the Cap and the minimum solve times.`),
  h('div', { class: 'row' },
    h('button', { onClick: async (e) => { e.target.textContent = (await copyText(JSON.stringify(loadResults(), null, 1))) ? 'Copied' : 'Could not copy'; } }, 'Copy all results'),
    h('button', { class: 'danger', onClick: () => { localStorage.removeItem(RESULTS_KEY); location.reload(); } }, 'Clear results')),
  h('p', { class: 'muted' }, 'Each page remembers its settings: Touch only, Assist, Cap, Walk delay and Buzz mode. Add #seed=12345&level=normal to a puzzle address to replay the exact same lock on two phones.'));
