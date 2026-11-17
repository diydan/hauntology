// Main menu for mtest.hauntology.app: creators, 3D parts & prop mockups, test scenes, app demos, device lab, and all 11 phone puzzles.
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
const card = ({ href, title, desc, tags = [], accent = '', note = '' }) => h(
  'a',
  { href, ...(accent ? { class: accent } : {}) },
  h('b', {}, title),
  h('small', { class: 'muted' }, desc),
  note ? h('small', { style: { marginTop: '4px' } }, note) : null,
  tags.length ? h('div', { class: 'tags' }, ...tags.map(tag)) : null,
);

const SECTIONS = [
  {
    id: 'sec-tools',
    title: 'Tools & Creators',
    nav: 'Creators & 3D',
    wide: true,
    items: [
      {
        href: 'character-builder/',
        accent: 'accent-gold',
        title: 'Character creator',
        desc: 'Build 3D suspects and portraits in the Atelier: body sliders, wardrobe, hair strands and face print.',
        tags: ['3D', 'portraits', 'wardrobe'],
      },
      {
        href: 'ar.html',
        accent: 'accent-ghost',
        title: 'Spirit table (mockup)',
        desc: 'Private 3D board and ghost on your table through the camera, plus a 2D tabletop toggle.',
        tags: ['camera', 'tilt', '2D toggle'],
      },
      {
        href: 'design/',
        accent: 'accent-lab',
        title: 'Design system',
        desc: 'Living catalogue of every colour token, type role and ui- element used across Hauntology.',
        tags: ['tokens', 'elements', 'fonts'],
      },
    ],
  },
  {
    id: 'sec-scenes',
    title: 'Test Scenes & Parts',
    nav: 'Scenes & Parts',
    wide: true,
    items: [
      {
        href: 'footage.html',
        accent: 'accent-gold',
        title: 'Test scenes (Footage)',
        desc: 'Turn-clock stair shadow, AI Haunt shots, Wander memory scenes and endings in three film looks.',
        tags: ['reel', 'wander', 'endings'],
      },
      {
        href: 'props/viewer.html',
        accent: 'accent-ghost',
        title: '3D parts viewer',
        desc: 'Inspect all 45 printable STLs and reference models by build stage, group and filament colour.',
        tags: ['45 STLs', '3D', 'print kit'],
      },
      {
        href: 'props/',
        accent: 'accent-lab',
        title: 'Prop mockups',
        desc: 'Interactive standalone ESP32 mockups: Ghost in the Box, Haunt Needle, Relic Vault and Cut Wires.',
        tags: ['servos', '7 mockups', 'rules'],
      },
    ],
  },
  {
    id: 'sec-apps',
    title: 'Web App Demos',
    nav: 'App Demos',
    wide: true,
    items: [
      {
        href: 'puzzles/',
        accent: 'accent-gold',
        title: 'Puzzles app (demo)',
        desc: 'Built web puzzle suite from the main Vite app with shared game theme and accessibility flow.',
        tags: ['web app', 'all 10', 'vite'],
      },
      {
        href: 'controller/',
        accent: 'accent-lab',
        title: 'Party controller (demo)',
        desc: 'Phone controller shell wired to a stand-in Room (enter K7M2 to join as Master).',
        tags: ['room K7M2', 'controller', 'phones'],
      },
    ],
  },
  {
    id: 'sec-lab',
    title: 'Device Lab & Phone Checks',
    nav: 'Device Lab',
    wide: true,
    items: [
      {
        href: 'lab.html',
        accent: 'accent-lab',
        title: 'Device lab',
        desc: 'Open one link on many devices. Fire sound, light and buzz locally or push synced combos.',
        tags: ['push', 'light', 'sound', 'buzz'],
      },
      {
        href: 'check.html',
        accent: 'accent-lab',
        title: 'Check my phone',
        desc: 'Buzz, tilt, sound and mic diagnostics on your phone with a copyable hardware report.',
        tags: ['start here', 'diagnostics'],
      },
      {
        href: 'knock.html',
        accent: 'accent-lab',
        title: 'Knock test',
        desc: 'Lay the phone on a table and tap: compare motion and mic knock detection vs speech.',
        tags: ['motion', 'mic', 'idea'],
      },
      {
        href: 'secret-knock.html',
        accent: 'accent-lab',
        title: 'Secret knock',
        desc: 'A locked door: hear the ghost knock once, then knock it back on the table to open it.',
        tags: ['motion', 'mic', 'lock'],
      },
      {
        href: 'shake.html',
        accent: 'accent-lab',
        title: 'Shake together',
        desc: 'Actions that need two or three Players at once, and what each phone feels by where it is and which way it faces.',
        tags: ['motion', 'buzz', 'idea'],
      },
    ],
  },
];

app.classList.add('menu');
app.append(
  h('header', { class: 'bar' }, h('h1', {}, 'Hauntology hub')),
  h('p', { class: 'muted' }, 'All playtest tools, 3D creators, part viewers, footage scenes, app demos, device lab diagnostics, and standalone phone puzzles.'),
  h(
    'nav',
    { class: 'menu-nav', 'aria-label': 'Sections' },
    ...SECTIONS.map((s) => h('a', { href: `#${s.id}` }, s.nav)),
    h('a', { href: '#sec-puzzles' }, `Puzzles (${ALL.length})`),
    h('a', { href: '#sec-results' }, 'Saved results'),
  ),
  ...SECTIONS.map((sec) => h(
    'section',
    { class: 'menu-sec', id: sec.id },
    h('h2', {}, sec.title),
    h('div', { class: sec.wide ? 'cards cards--tools' : 'cards' }, ...sec.items.map(card)),
  )),
  h(
    'section',
    { class: 'menu-sec', id: 'sec-puzzles' },
    h('h2', {}, `Standalone Phone Puzzles (${ALL.length})`),
    h(
      'div',
      { class: 'cards' },
      ...ALL.map((k) => card({
        href: `${k.id}.html`,
        title: k.title,
        desc: k.blurb.split('. ')[0] + '.',
        tags: [...(k.memory ? ['memory'] : []), ...k.feelTags],
        note: stat(k.id),
      })),
    ),
  ),
  h(
    'section',
    { class: 'menu-sec', id: 'sec-results' },
    h('h2', {}, 'Saved results'),
    h('p', { class: 'muted' }, `${results.length} runs saved on this phone. Paste them to the developer to tune the Cap and the minimum solve times.`),
    h(
      'div',
      { class: 'row' },
      h('button', { onClick: async (e) => { e.target.textContent = (await copyText(JSON.stringify(loadResults(), null, 1))) ? 'Copied' : 'Could not copy'; } }, 'Copy all results'),
      h('button', { class: 'danger', onClick: () => { localStorage.removeItem(RESULTS_KEY); location.reload(); } }, 'Clear results'),
    ),
    h('p', { class: 'muted' }, 'Each puzzle remembers its settings: Touch only, Assist, Cap, Walk delay and Buzz mode. Add #seed=12345&level=normal to replay the same lock on two phones.'),
  ),
);
