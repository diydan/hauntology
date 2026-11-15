// Fills the token tables of design/catalogue.html from design/tokens.json, so the page cannot drift from it.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const entries = (g) => Object.entries(g).filter(([, v]) => v && typeof v === 'object');
try {
  const t = await (await fetch('/design/tokens.json')).json();
  const swatch = (name, hex, note) => { const s = el('div', 'cat-swatch'); const c = el('div', 'cat-chip'); c.style.background = `var(--${name})`; const d = el('div'); d.append(el('b', null, `--${name}`), el('span', null, `${hex} · ${note}`)); s.append(c, d); return s; };
  document.getElementById('roleSwatches').append(...entries(t.role).map(([k, v]) => swatch(k, t.color[v.color].value, v.note)));
  document.getElementById('paletteSwatches').append(...entries(t.color).map(([k, v]) => swatch(k, v.value, v.note)));
  const rows = (id, head, groups) => { const table = document.getElementById(id); const tr = el('tr'); for (const h of head) tr.append(el('th', null, h)); table.append(tr); for (const [prefix, g] of groups) for (const [k, v] of entries(g)) { const r = el('tr'); r.append(el('td', null, `--${prefix}${k}`), el('td', null, v.value), el('td', null, v.note)); table.append(r); } };
  rows('textTable', ['Token', 'Value', 'Use'], [['font-', t.font], ['text-', t['text-size']]]);
  rows('scaleTable', ['Token', 'Value', 'Use'], [['space-', t.space], ['radius-', t.radius], ['stroke-', t.stroke], ['glow-', t.glow]]);
  rows('motionTable', ['Token', 'Value', 'Use'], [['', t.motion]]);
} catch (e) { document.getElementById('roleSwatches').textContent = `Could not read design/tokens.json (${e.message}).`; }
