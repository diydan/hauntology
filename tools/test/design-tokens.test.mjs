// The design tokens: design/tokens.json is the one source, tools/build-tokens.mjs writes web/src/styles/tokens.css and shared/src/design/tokens.ts from it.
// Run: node --test tools/test/design-tokens.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FROZEN, contrast, contrastFailures, contrastPairs, entries, roleHex, toCss, toTs, validate } from '../lib/design-tokens.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const clone = () => structuredClone(tokens);
const hex = (name) => tokens.color[name].value;
const hsl = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) { hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; }
  return { h: hue, s, l };
};

test('the token file is sound: every name, value and note is in order', () => {
  assert.deepEqual(validate(tokens), []);
  assert.ok(entries(tokens, 'color').length >= 18 && entries(tokens, 'role').length >= 18, 'it is the real file');
});

test('the generated files are up to date with the token file (run `pnpm build-tokens`)', () => {
  assert.equal(readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8'), toCss(tokens));
  assert.equal(readFileSync(join(root, 'shared/src/design/tokens.ts'), 'utf8'), toTs(tokens));
});

test('the six names steering/visual-style.md has always used keep their values, in the steering file and in the tokens', () => {
  const steering = readFileSync(join(root, '.kiro/steering/visual-style.md'), 'utf8');
  for (const [name, value] of Object.entries(FROZEN)) {
    assert.equal(hex(name), value, `--${name}`);
    assert.match(steering, new RegExp(`--${name}\\s+${value}`), `${name} ${value} is in the steering palette`);
  }
});

test('the scheme is black, dark brown, yellow and a little green, with depth in the browns', () => {
  assert.ok(hsl(hex('ink')).l < 0.07, 'the page is black');
  assert.ok(hsl(hex('ink-deep')).l < 0.05 && hex('void') === '#000000');
  for (const n of ['wood', 'wood-2', 'wood-3', 'wood-line', 'leather']) { const c = hsl(hex(n)); assert.ok(c.h >= 20 && c.h <= 36 && c.s > 0.25, `${n} is brown (hue ${Math.round(c.h)})`); }
  const depth = ['ink', 'wood', 'wood-2', 'wood-3'].map((n) => hsl(hex(n)).l);
  assert.ok(depth[0] < depth[1] && depth[1] < depth[2] && depth[2] < depth[3], `each level is lighter than the one below: ${depth.map((l) => l.toFixed(3))}`);
  assert.ok(hsl(hex('wood')).l < 0.09 && hsl(hex('wood-2')).l < 0.12 && hsl(hex('wood-3')).l < 0.14, 'the panels, buttons and hovered buttons are all DARK brown');
  assert.ok(hsl(hex('leather')).l > hsl(hex('wood-line')).l, 'leather is a stronger brown than the borders');
  const g = hsl(hex('ghost'));
  assert.ok(g.h >= 140 && g.h <= 170, `ghost is green (hue ${Math.round(g.h)})`);
  for (const n of ['lantern', 'lantern-hi']) { const y = hsl(hex(n)); assert.ok(y.h >= 36 && y.h <= 46 && y.s > 0.6, `${n} is yellow-amber (hue ${Math.round(y.h)})`); }
  assert.ok(hsl(hex('bone')).l > 0.8, 'text is cream');
  assert.equal(tokens.color.moss, undefined, 'the deep green is gone: green is only an accent');
});

test('the roles say who uses what: yellow is the main colour, green is rare, and the speakers have a colour each', () => {
  const role = (r) => tokens.role[r].color;
  assert.equal(role('accent'), 'lantern');
  assert.equal(role('accent-hi'), 'lantern-hi');
  assert.equal(role('focus'), 'lantern', 'the focus ring is the lantern (steering)');
  assert.equal(role('accent-rare'), 'ghost');
  assert.equal(role('danger'), 'alarm');
  assert.equal(role('text'), 'bone');
  assert.equal(role('on-accent'), 'ink');
  assert.deepEqual([role('speaker-whisper'), role('speaker-keeper'), role('speaker-suspect')], ['ghost', 'lantern', 'bone']);
  const roleOfPalette = new Set(Object.values(tokens.role).map((r) => r.color));
  for (const [name, v] of entries(tokens, 'color')) if (['text', 'accent', 'surface', 'line', 'shape'].includes(v.use)) assert.ok(roleOfPalette.has(name), `${name} has a role, so elements never need the palette name`);
});

test('text reaches 4.5 to 1 on every surface it may sit on, and red never sits on the hovered brown', () => {
  assert.deepEqual(contrastFailures(tokens), []);
  assert.ok(contrastPairs(tokens).length >= 25, 'the rules cover the real pairs');
  const alarmOnHover = contrast(roleHex(tokens, 'danger'), roleHex(tokens, 'surface-hover'));
  assert.ok(alarmOnHover < 4.5, `red on the hovered brown is ${alarmOnHover.toFixed(2)}:1, so it is kept off it`);
  assert.ok(!contrastPairs(tokens).some((p) => p.text === 'danger' && p.on === 'surface-hover'));
  assert.ok(contrast(hex('dust'), hex('ink')) < 4.5, '--dust stays a shape colour: below 4.5 on ink');
  assert.deepEqual(tokens.contrast.neverText, ['shape-quiet', 'line', 'line-strong']);
  for (const r of tokens.contrast.neverText) assert.ok(!tokens.contrast.rules.some((x) => x.text.includes(r)), `${r} is not a text colour`);
});

test('the sizes the steering file fixes: a touch target of 44 px, fades of 300 to 600 ms, a wide breakpoint of 900 px', () => {
  assert.equal(tokens.size.target.value, '44px');
  assert.ok(parseInt(tokens.size['target-main'].value, 10) >= 48);
  for (const k of ['fade-quick', 'fade', 'fade-slow']) { const ms = parseInt(tokens.motion[k].value, 10); assert.ok(ms >= 300 && ms <= 600, `${k} ${ms}ms`); }
  assert.equal(tokens.breakpoint.wide.value, '900px');
  const scale = entries(tokens, 'space').map(([, v]) => v.value);
  assert.deepEqual(scale.slice(1, 5), ['0.25rem', '0.5rem', '0.75rem', '1rem'], 'the same 4, 8, 12 and 16 px steps as the puzzle screens (--pz-space-1 to -4)');
  for (const [k, v] of entries(tokens, 'text-size')) assert.ok(/rem|clamp\(/.test(v.value) && !/px/.test(v.value), `text-${k} is in rem, so the player's own text size still works`);
  for (const [k, v] of entries(tokens, 'text-size')) {
    const smallest = v.value.startsWith('clamp(') ? parseFloat(v.value.slice(6)) : parseFloat(v.value); // the first number of a clamp is its least
    assert.ok(smallest >= 0.75, `text-${k} is ${smallest * 16} px at the default: no text on a phone is under 12 px`);
  }
  assert.ok(parseFloat(tokens['text-size'].body.value) >= 0.875, 'running text is at least 14 px');
});

test('the game-art colours (wires, shelf items, metals, woods, paper) are tokens of their own: the art-* colours, none of them a role, all bright enough to see on the dark ground', () => {
  const art = entries(tokens, 'color').filter(([, v]) => v.use === 'art');
  assert.ok(art.length >= 26);
  const roleColors = new Set(Object.values(tokens.role).map((r) => r.color));
  for (const [k, v] of art) {
    assert.ok(k.startsWith('art-'), k);
    assert.ok(!roleColors.has(k), `${k} is game content, not a role`);
    assert.ok(contrast(v.value, hex('ink')) >= 3, `${k} keeps 3:1 against the dark ground (the wires' own rule)`);
  }
  assert.equal(new Set(art.map(([, v]) => v.value)).size, art.length, 'no two art hues are the same colour');
  const css = readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8');
  for (const [k, v] of art) assert.ok(css.includes(`--${k}: ${v.value};`) && readFileSync(join(root, 'shared/src/design/tokens.ts'), 'utf8').includes(`"${k}": "${v.value}"`), `${k} is generated`);
});

test('tokens.css: every token is written, the old names still exist, every fade is 0 under reduced motion, and no other origin is named', () => {
  const css = readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8');
  for (const [name, hexv] of Object.entries(FROZEN)) assert.match(css, new RegExp(`--${name}: ${hexv};`));
  for (const old of ['--fade: 400ms;', '--target: 44px;', '--font-ui: "IBM Plex Mono"', '--font-ghost: Newsreader']) assert.ok(css.includes(old), `the name the app already uses stays: ${old}`);
  const written = new Set([...css.matchAll(/^\s+(--[a-z0-9-]+):/gm)].map((m) => m[1]));
  const expected = [...entries(tokens, 'color').map(([k]) => `--${k}`), ...entries(tokens, 'role').map(([k]) => `--${k}`), ...entries(tokens, 'space').map(([k]) => `--space-${k}`), ...entries(tokens, 'radius').map(([k]) => `--radius-${k}`), ...entries(tokens, 'text-size').map(([k]) => `--text-${k}`), '--fade-quick', '--fade-slow', '--breathe', '--ease', '--target-main', '--bp-wide', '--z-modal'];
  for (const n of expected) assert.ok(written.has(n), `${n} is in tokens.css`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--fade: 0ms;\s*--fade-quick: 0ms;\s*--fade-slow: 0ms;\s*\}\s*\}/);
  assert.ok(!/--breathe: 0/.test(css), 'the loop is not zeroed (that would freeze it mid-breath); elements.css turns it off');
  assert.ok(!/https?:\/\/|@import|url\(/.test(css));
  assert.match(css, /^\/\* GENERATED from design\/tokens\.json/);
});

test('tokens.ts holds the same values for code that cannot read a CSS variable', async () => {
  const ts = await import('../../shared/src/design/tokens.ts').catch(() => null);
  const src = readFileSync(join(root, 'shared/src/design/tokens.ts'), 'utf8');
  assert.match(src, /^\/\/ GENERATED from design\/tokens\.json/);
  for (const [k, v] of entries(tokens, 'color')) assert.ok(src.includes(`"${k}": "${v.value}"`), `${k}`);
  for (const [k] of entries(tokens, 'role')) assert.ok(src.includes(`"${k}": "${roleHex(tokens, k)}"`), `role ${k} is its colour, not its name`);
  assert.ok(src.includes('"wide": 900') && src.includes('"roomy": 640'));
  assert.ok(src.includes('"fade": 400') && src.includes('"fadeQuick": 300') && src.includes('"fadeSlow": 600') && src.includes('"breathe": 2400'));
  assert.ok(src.includes('export const targetPx = 44;'));
  void ts; // Node cannot import .ts here; the shared package's own tests compile it
});

test('the memory card (shared/src/app/memory-card.ts) draws with the tokens, not its own hex colours', () => {
  const src = readFileSync(join(root, 'shared/src/app/memory-card.ts'), 'utf8');
  assert.match(src, /from "\.\.\/design\/tokens"/);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(src.replace(/\/\/.*$/gm, '')), 'no raw colour is left in it');
});

// ---- the checks can disagree: each of these breaks the file in one way and must be caught ------------------------------------------------
test('validate catches a bad colour, a missing note, a bad name, a double name, a moved steering colour, a fade out of range and a small target', () => {
  const breaks = [
    ['a colour that is not 6 hex digits', (t) => { t.color.ash.value = '#b3aa9'; }, /not a 6 digit/],
    ['a colour in capitals', (t) => { t.color.ash.value = '#B3AA97'; }, /not a 6 digit/],
    ['a colour with no use', (t) => { delete t.color.ash.use; }, /"use" must be one of/],
    ['a token with no note', (t) => { t.space['3'].note = ''; }, /say in a note/],
    ['a name with a capital', (t) => { t.radius.Big = { value: '3px', note: 'a big corner' }; }, /lowercase words/],
    ['two tokens with one CSS name', (t) => { t.font.ui2 = t.font.ui; t.size['font-ui2'] = { value: '1px', note: 'twice' }; t.font['ui2'] = { value: 'x', note: 'twice' }; t.color['font-ui2'] = { value: '#000001', use: 'light', note: 'twice' }; }, /already written by/],
    ['a role that points nowhere', (t) => { t.role.text.color = 'chalk'; }, /does not exist/],
    ['ink moved', (t) => { t.color.ink.value = '#0b0d11'; }, /color\.ink must stay #0b0d10/],
    ['lantern moved', (t) => { t.color.lantern.value = '#e0a43b'; }, /color\.lantern must stay/],
    ['a fade of 250 ms', (t) => { t.motion.fade.value = '250ms'; }, /300 to 600 ms/],
    ['a fade of 700 ms', (t) => { t.motion['fade-slow'].value = '700ms'; }, /300 to 600 ms/],
    ['a touch target of 40 px', (t) => { t.size.target.value = '40px'; }, /at least 44px/],
    ['a space in px', (t) => { t.space['2'].value = '8px'; }, /must be in rem/],
    ['a group missing', (t) => { delete t.glow; }, /group "glow" is missing/],
    ['a contrast rule naming a role that is not there', (t) => { t.contrast.rules[0].text.push('nothing'); }, /role "nothing" does not exist/],
  ];
  for (const [what, mutate, expected] of breaks) {
    const t = clone(); mutate(t);
    const problems = validate(t);
    assert.ok(problems.some((p) => expected.test(p)), `${what}: ${JSON.stringify(problems)}`);
  }
});

test('the contrast check catches quiet text that fell below 4.5 to 1, and red text on the hovered brown', () => {
  const dim = clone(); dim.color.ash.value = '#6b6f76';
  assert.ok(contrastFailures(dim).some((f) => /text-quiet on/.test(f)), 'ash made as dim as dust');
  const hover = clone(); hover.contrast.rules[1].text.push('danger');
  assert.ok(contrastFailures(hover).some((f) => /danger on surface-hover is 4\.1/.test(f)));
  const dark = clone(); dark.color.ink.value = '#0b0d10'; dark.color.lantern.value = '#7a5718';
  assert.ok(contrastFailures(dark).length > 0, 'a darker yellow fails');
});

// ---- the command ---------------------------------------------------------------------------------------------------------------------------
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'tokens-'));
  for (const f of ['tools/build-tokens.mjs', 'tools/lib/design-tokens.mjs', 'design/tokens.json', 'web/src/styles/tokens.css', 'shared/src/design/tokens.ts']) { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(root, f), join(dir, f)); }
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [join(dir, 'tools/build-tokens.mjs'), ...args], { encoding: 'utf8' });

test('build-tokens --check passes when everything is current, fails when a generated file was edited by hand, and a normal run puts it right', () => {
  const dir = sandbox();
  assert.equal(run(dir, '--check').status, 0);
  const css = join(dir, 'web/src/styles/tokens.css');
  writeFileSync(css, readFileSync(css, 'utf8').replace('--lantern: #e0a43a;', '--lantern: #ffffff;'));
  const bad = run(dir, '--check');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /STALE\s+web\/src\/styles\/tokens\.css/);
  assert.equal(run(dir).status, 0, 'a normal run writes the file again');
  assert.equal(readFileSync(css, 'utf8'), toCss(tokens));
  assert.equal(run(dir, '--check').status, 0);
});

test('build-tokens fails, and writes nothing, when the token file is unsound or a contrast rule fails', () => {
  const dir = sandbox();
  const json = join(dir, 'design/tokens.json');
  const before = readFileSync(join(dir, 'web/src/styles/tokens.css'), 'utf8');
  const t = clone(); t.color.ink.value = '#0b0d11';
  writeFileSync(json, JSON.stringify(t));
  let r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /color\.ink must stay/);
  const t2 = clone(); t2.color.ash.value = '#6b6f76';
  writeFileSync(json, JSON.stringify(t2));
  r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /text-quiet on/);
  assert.equal(readFileSync(join(dir, 'web/src/styles/tokens.css'), 'utf8'), before, 'the generated file was not touched');
});
