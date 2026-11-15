// Pure logic for the design tokens: read design/tokens.json, check it, and write the two generated files
// (web/src/styles/tokens.css and shared/src/design/tokens.ts). No file or network access here; tools/build-tokens.mjs does that.

/** The CSS name of each group: `--<prefix><key>`. A group not listed here is not written out. */
export const PREFIX = {
  color: '', role: '', font: 'font-', 'text-size': 'text-', space: 'space-', radius: 'radius-', stroke: 'stroke-',
  glow: 'glow-', shadow: 'shadow-', motion: '', size: '', breakpoint: 'bp-', z: 'z-',
};
const GROUP_ORDER = ['color', 'role', 'font', 'text-size', 'space', 'radius', 'stroke', 'glow', 'shadow', 'motion', 'size', 'breakpoint', 'z'];
export const USES = ['surface', 'light', 'line', 'shape', 'text', 'accent'];
/** Colours that existed before this file did (steering/visual-style.md and the first tokens.css). Their names and values never change. */
export const FROZEN = { ink: '#0b0d10', bone: '#e9e4d8', lantern: '#e0a43a', ghost: '#9fe8d0', dust: '#6b6f76', alarm: '#d4604a' };

const HEX = /^#[0-9a-f]{6}$/;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Entries of a group: every key whose value is an object with a `value` or `color` (so `about` strings are skipped). */
export function entries(tokens, group) {
  return Object.entries(tokens[group] ?? {}).filter(([, v]) => v && typeof v === 'object');
}
export const cssName = (group, key) => `--${PREFIX[group]}${key}`;

/** The problems in a token file, as a list of sentences (empty when it is sound). */
export function validate(tokens) {
  const bad = [];
  const seen = new Map();
  for (const group of GROUP_ORDER) {
    if (!tokens[group]) { bad.push(`the group "${group}" is missing`); continue; }
    for (const [key, v] of entries(tokens, group)) {
      if (!NAME.test(key)) bad.push(`${group}.${key}: the name must be lowercase words joined by hyphens`);
      const css = cssName(group, key);
      if (seen.has(css)) bad.push(`${group}.${key}: ${css} is already written by ${seen.get(css)}`);
      seen.set(css, `${group}.${key}`);
      if (typeof v.note !== 'string' || v.note.length < 3) bad.push(`${group}.${key}: say in a note what it is for`);
      if (group === 'role') { if (!tokens.color?.[v.color]) bad.push(`role.${key}: colour "${v.color}" does not exist`); continue; }
      if (typeof v.value !== 'string') { bad.push(`${group}.${key}: needs a string value`); continue; }
      if (group === 'color') {
        if (!HEX.test(v.value)) bad.push(`color.${key}: "${v.value}" is not a 6 digit lowercase hex colour`);
        if (!USES.includes(v.use)) bad.push(`color.${key}: "use" must be one of ${USES.join(', ')}`);
      }
      if (group === 'motion' && !/^(\d+ms|cubic-bezier\([^)]*\))$/.test(v.value)) bad.push(`motion.${key}: "${v.value}" must be a time in ms or a cubic-bezier`);
      if (group === 'motion' && /^\d+ms$/.test(v.value) && key.startsWith('fade') && (Number.parseInt(v.value, 10) < 300 || Number.parseInt(v.value, 10) > 600)) bad.push(`motion.${key}: a fade is 300 to 600 ms (steering/visual-style.md)`);
      if (group === 'size' && key === 'target' && Number.parseInt(v.value, 10) < 44) bad.push('size.target: a touch target is at least 44px (steering/visual-style.md)');
      if (group === 'space' && !/^\d*\.?\d+rem$/.test(v.value)) bad.push(`space.${key}: "${v.value}" must be in rem`);
    }
  }
  for (const [name, hex] of Object.entries(FROZEN)) if (tokens.color?.[name]?.value !== hex) bad.push(`color.${name} must stay ${hex}: it is named in steering/visual-style.md`);
  for (const rule of tokens.contrast?.rules ?? []) {
    for (const r of [...rule.text, ...rule.on]) if (!tokens.role?.[r]) bad.push(`contrast: role "${r}" does not exist`);
  }
  for (const r of tokens.contrast?.neverText ?? []) if (!tokens.role?.[r]) bad.push(`contrast.neverText: role "${r}" does not exist`);
  return bad;
}

// ---- contrast (WCAG 2) -------------------------------------------------------------------------------------------------------------------
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export const roleHex = (tokens, role) => tokens.color[tokens.role[role].color].value;

/** Every text/surface pair the contrast rules name, with its ratio. */
export function contrastPairs(tokens) {
  const out = [];
  for (const rule of tokens.contrast.rules) for (const t of rule.text) for (const on of rule.on) {
    out.push({ text: t, on, ratio: contrast(roleHex(tokens, t), roleHex(tokens, on)), min: tokens.contrast.min });
  }
  return out;
}
export const contrastFailures = (tokens) => contrastPairs(tokens).filter((p) => p.ratio < p.min).map((p) => `${p.text} on ${p.on} is ${p.ratio.toFixed(2)}:1, below ${p.min}:1`);

// ---- output ------------------------------------------------------------------------------------------------------------------------------
const WARNING = 'GENERATED from design/tokens.json by tools/build-tokens.mjs. Do not edit: change the JSON and run `pnpm build-tokens`.';

export function toCss(tokens) {
  const lines = [`/* ${WARNING} */`, ':root {'];
  const block = (title, group, fn) => {
    const list = entries(tokens, group);
    if (!list.length) return;
    lines.push('', `  /* ${title} */`);
    for (const [key, v] of list) lines.push(`  ${cssName(group, key)}: ${fn(key, v)};${v.note ? ` /* ${v.note} */` : ''}`);
  };
  block('Colour: the palette', 'color', (_, v) => v.value);
  block('Colour: roles. Elements use these, never the palette directly', 'role', (_, v) => `var(--${v.color})`);
  block('Type', 'font', (_, v) => v.value);
  block('Type sizes', 'text-size', (_, v) => v.value);
  block('Space', 'space', (_, v) => v.value);
  block('Corners', 'radius', (_, v) => v.value);
  block('Strokes', 'stroke', (_, v) => v.value);
  block('Glow sizes', 'glow', (_, v) => v.value);
  block('Shadows', 'shadow', (_, v) => v.value);
  block('Motion', 'motion', (_, v) => v.value);
  block('Touch', 'size', (_, v) => v.value);
  block('Breakpoints (a media query cannot read these; elements.css repeats them and a test keeps them equal)', 'breakpoint', (_, v) => v.value);
  block('Layers', 'z', (_, v) => v.value);
  lines.push('', '  color-scheme: dark; /* the browser\'s own scrollbars, menus and form controls are dark too */', '}', '');
  const fades = entries(tokens, 'motion').filter(([k, v]) => k.startsWith('fade') && /ms$/.test(v.value)).map(([k]) => k);
  lines.push('/* Every fade is instant when the player asks for less motion. The looping breathe is switched off in elements.css instead. */', '@media (prefers-reduced-motion: reduce) {', '  :root {');
  for (const k of fades) lines.push(`    --${k}: 0ms;`);
  lines.push('  }', '}', '');
  return lines.join('\n');
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const q = (s) => JSON.stringify(s);
export function toTs(tokens) {
  const L = [`// ${WARNING}`, '// For code that cannot read a CSS variable: an SVG or canvas picture, a Three.js colour, a test. Everything else uses the CSS variables.', ''];
  const obj = (name, rows) => { L.push(`export const ${name} = {`); for (const [k, v] of rows) L.push(`  ${q(k)}: ${v},`); L.push('} as const;', ''); };
  obj('color', entries(tokens, 'color').map(([k, v]) => [k, q(v.value)]));
  obj('role', entries(tokens, 'role').map(([k]) => [k, q(roleHex(tokens, k))]));
  obj('breakpointPx', entries(tokens, 'breakpoint').map(([k, v]) => [k, Number.parseInt(v.value, 10)]));
  obj('motionMs', entries(tokens, 'motion').filter(([, v]) => /ms$/.test(v.value)).map(([k, v]) => [camel(k), Number.parseInt(v.value, 10)]));
  L.push('export const targetPx = ' + Number.parseInt(tokens.size.target.value, 10) + ';', '');
  L.push('export type ColorName = keyof typeof color;', 'export type RoleName = keyof typeof role;', '');
  return L.join('\n');
}
