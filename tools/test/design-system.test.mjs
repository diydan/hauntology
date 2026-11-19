// The shared elements (design/elements.css), the catalogue that shows them (design/catalogue.html), the fonts, and the rule that every screen is built from them.
// Run: node --test tools/test/design-system.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, entries, roleHex } from '../lib/design-tokens.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const tokens = JSON.parse(read('design/tokens.json'));
const tokensCss = read('web/src/styles/tokens.css');
const rawElements = read('design/elements.css');
const elements = rawElements.replace(/\/\*[\s\S]*?\*\//g, ''); // the rules, without the comments

/** [selector, declarations] of every rule (at-rule bodies are flattened, so a rule inside @media counts). */
const rules = [];
for (const m of elements.matchAll(/([^{}]+)\{([^{}]*)\}/g)) { const sel = m[1].trim().replace(/^@media[^{]*$/, ''); if (sel) rules.push([sel.replace(/\s+/g, ' '), m[2].trim()]); }
const declarations = [];
for (const [sel, body] of rules) for (const d of body.split(';')) { const i = d.indexOf(':'); if (i > 0) declarations.push({ sel, prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() }); }
const decl = (prop) => declarations.filter((d) => d.prop === prop);

const classesIn = (text) => new Set([...text.matchAll(/(?<![\w-])\.?(ui-[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?)(?![\w-])/g)].map((m) => m[1]));
const stateClassesIn = (text) => new Set([...text.matchAll(/(?<![\w-])(is-[a-z]+)(?![\w-])/g)].map((m) => m[1]));
const defined = new Set([...elements.matchAll(/\.(ui-[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?)(?![\w-])/g)].map((m) => m[1]));
const definedStates = new Set([...elements.matchAll(/\.(is-[a-z]+)(?![\w-])/g)].map((m) => m[1]));
const localProps = new Set([...elements.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const tokenProps = new Set([...tokensCss.matchAll(/^\s+(--[a-z0-9-]+):/gm)].map((m) => m[1]));

test('the elements are there: the real file, with the pieces the mockup is made of', () => {
  assert.ok(defined.size >= 90, `${defined.size} classes`);
  for (const c of ['ui-page', 'ui-button', 'ui-stage', 'ui-portrait', 'ui-nameplate', 'ui-dialogue', 'ui-hud', 'ui-lamp', 'ui-meter', 'ui-chip', 'ui-transport', 'ui-dots', 'ui-sheet', 'ui-fold', 'ui-story', 'ui-card', 'ui-modal', 'ui-log']) assert.ok(defined.has(c), c);
});

test('no raw colour: a colour is a role or a token, never a hex, rgb(), hsl() or a colour name', () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(elements), 'a hex colour');
  assert.ok(!/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/.test(elements), 'a colour function');
  const named = /\b(?:white|black|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|gold|silver|cyan|magenta)\b/i;
  for (const d of declarations) if (/color|background|border|shadow|fill|stroke|outline|filter|gradient/.test(d.prop + d.value)) assert.ok(!named.test(d.value.replace(/var\([^)]*\)/g, '')), `${d.sel} { ${d.prop}: ${d.value} } names a colour`);
});

test('every variable an element reads is a token (or one the elements set themselves), and none is misspelled', () => {
  for (const m of elements.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(tokenProps.has(m[1]) || localProps.has(m[1]), `${m[1]} is not in tokens.css`);
  const used = new Set([...elements.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  for (const must of ['--accent', '--surface-raised', '--text', '--text-quiet', '--line', '--space-2', '--radius-md', '--fade', '--fade-slow', '--target', '--font-ui', '--font-ghost', '--speaker-whisper']) assert.ok(used.has(must), `${must} is used (the check is looking at the real file)`);
});

test('elements use the roles, not the palette: only the light colours (orb, ember, void) are used by their own names', () => {
  const light = new Set(entries(tokens, 'color').filter(([, v]) => v.use === 'light').map(([k]) => `--${k}`));
  const palette = entries(tokens, 'color').map(([k]) => `--${k}`);
  for (const m of elements.matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!palette.includes(m[1])) continue;
    assert.ok(light.has(m[1]), `${m[1]} is a palette colour with a role: use the role`);
  }
});

test('motion: every duration is a fade token, every easing is --ease, and there is no screen shake or flicker', () => {
  for (const d of [...decl('transition'), ...decl('animation')]) {
    for (const part of d.value.split(/,(?![^(]*\))/)) {
      const times = part.match(/\b\d*\.?\d+m?s\b/g) ?? [];
      for (const t of times) assert.ok(/^0m?s$/.test(t), `${d.sel}: a raw time ${t}`);
      if (/var\(--(fade|breathe)/.test(part) || /\b0s\b/.test(part) || part.trim() === 'none') continue;
      assert.fail(`${d.sel} { ${d.prop}: ${part.trim()} } has no fade token`);
    }
    // An easing keyword is only allowed on the looping breath, and `linear` on a visibility flip (a switch, not a movement).
    const withoutVars = d.value.replace(/var\([^)]*\)/g, '').replace(/visibility 0s linear/g, '');
    assert.ok(!/\b(ease-in|ease-out|ease-in-out|linear|ease)\b/.test(withoutVars) || /ui-breathe/.test(d.value), `${d.sel}: easing is var(--ease)`);
  }
  assert.ok(decl('transition').length >= 10, 'the check is looking at real transitions');
  assert.ok(!/@keyframes\s+ui-(shake|flash|flicker|blink)/i.test(elements));
  assert.match(elements, /@keyframes ui-breathe \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.12\); \} \}/, 'one small slow breath');
  assert.match(elements, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ui-orb\.is-speaking \{ animation: none; \}/, 'the loop stops under reduced motion (every fade is already 0 ms in tokens.css)');
  assert.match(rawElements, /animation: ui-breathe var\(--breathe\) ease-in-out infinite/);
});

test('space and corners: every gap, margin and padding is a space token, every corner a radius token, every text size a type token', () => {
  const SPACE = /^(0|auto|inherit|var\(--space-[0-6]\)|calc\((?:var\(--space-[0-6]\)|[-+*/() 0-9.])+\))$/;
  /** A value split at the spaces that are not inside parentheses, so `calc(var(--space-4) + var(--space-2))` stays one piece. */
  const tokensOf = (v) => { const out = []; let depth = 0; let cur = ''; for (const ch of v) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
  for (const d of declarations) {
    if (/^(gap|row-gap|column-gap|padding(-[a-z]+)?|margin(-[a-z]+)?)$/.test(d.prop) && !/^\.ui-sr-only/.test(d.sel)) for (const t of tokensOf(d.value)) assert.match(t, SPACE, `${d.sel} { ${d.prop}: ${d.value} }`);
    if (d.prop === 'border-radius') for (const t of tokensOf(d.value)) assert.match(t, /^(0|var\(--radius-(xs|sm|md|lg|xl|pill|round)\))$/, `${d.sel} { border-radius: ${d.value} }`);
    if (d.prop === 'font-size') assert.match(d.value, /^(inherit|var\(--text-[a-z]+\))$/, `${d.sel} { font-size: ${d.value} }`);
    if (d.prop === 'font') assert.match(d.value, /^inherit$|var\(--text-[a-z]+\)/, `${d.sel} { font: ${d.value} } has no type size token`);
    if (/^border(-(top|right|bottom|left))?$/.test(d.prop) && /\d/.test(d.value)) assert.match(d.value, /^(0|var\(--stroke-[a-z]+\) )/, `${d.sel} { ${d.prop}: ${d.value} }`);
  }
  assert.ok(decl('padding').length > 20 && decl('border-radius').length > 20 && decl('font-size').length > 20, 'the check is looking at the real file');
});

test('text colour is never a shape colour: --shape-quiet, --line and --line-strong carry no words', () => {
  for (const d of declarations) if (d.prop === 'color' || d.prop === '-webkit-text-fill-color') for (const r of tokens.contrast.neverText) assert.ok(!d.value.includes(`var(--${r})`), `${d.sel} { color: ${d.value} }`);
  assert.ok(decl('color').length > 25);
});

test('every control is at least 44 px (the main ones 52 px) and the focus ring is the lantern', () => {
  for (const sel of ['.ui-button', '.ui-select, .ui-range, .ui-input', '.ui-fold > summary', '.ui-field--check .ui-field-label']) assert.match(rules.find(([s]) => s === sel)[1], /min-height: var\(--target\)/, sel);
  for (const sel of ['.ui-tool', '.ui-button--main']) assert.match(rules.find(([s]) => s === sel)[1], /min-height: var\(--target-main\)/, sel);
  assert.match(rawElements, /\.ui-page :focus-visible \{ outline: var\(--stroke-ring\) solid var\(--focus\); outline-offset: var\(--stroke-ring\); \}/);
  assert.match(rules.find(([s]) => s === 'a.ui-button')[1], /display: inline-flex/, 'a link used as a button is a box, so its height counts');
  assert.match(rules.find(([s]) => s === '.ui-stack > *')[1], /margin: 0/, 'the gap of a stack is the only space between its blocks');
  assert.equal(tokens.role.focus.color, 'lantern');
  assert.ok(!/outline:\s*none/.test(elements.replace(/\.ui-sheet-title:focus \{[^}]*\}/, '')), 'the only ring turned off is the one on a title that is a focus target, not a control');
});

test('the transport tools are never narrower than a touch target: they wrap instead of shrinking (a 320 px screen), and from the wide breakpoint the five are a grid', () => {
  const tool = rules.find(([s]) => s === '.ui-tool')[1];
  assert.match(tool, /min-width: var\(--target\)/, 'a tool is at least a touch target wide as well as tall');
  assert.match(tool, /flex: 1 1 auto/, 'a tool starts from the width of its own label (the word Director is wider than a touch target) and the tools share what is left');
  const bar = rules.find(([s]) => s === '.ui-transport')[1];
  assert.match(bar, /display: flex/);
  assert.match(bar, /flex-wrap: wrap/, 'six tools that do not fit wrap onto a second row, so none is squeezed under a touch target');
  assert.ok(!/grid-template-columns/.test(bar), 'six equal columns shrank each tool to 40 px at 320 px');
  assert.match(rawElements, /@media \(min-width: 900px\) \{[\s\S]*?\.ui-tool--narrow-only \{ display: none; \} \.ui-transport \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \}/);
  // What one row needs: five touch targets, the Director's label (about 60 px with its padding), five gaps, the bar's padding on both sides and its edge: about 330 px of bar, a screen of about 355 px. Below that the last tool wraps.
  const px = (v) => (v.endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v));
  assert.equal(px(tokens.size.target.value), 44);
  const gap = px(tokens.space['2'].value);
  const sidePad = px(tokens.space['1'].value);
  assert.match(bar, /padding: var\(--space-2\) var\(--space-1\)/, 'the bar keeps its height and gives the row 8 px more width');
  assert.ok(5 * 44 + 60 + 5 * gap + 2 * sidePad + 2 <= 334, 'one row must fit a 360 px phone, whose bar is 334 px wide, with room to spare');
});

test('text on the dialogue is readable on every lit surface it can take, and a warning inside it keeps the red to its edge (red words are 4.2 to 1 there)', () => {
  const dialogue = rules.find(([s]) => s === '.ui-dialogue')[1];
  const tint = dialogue.match(/background: color-mix\(in srgb, var\(--lit, var\(--accent\)\) (\d+)%, var\(--surface-raised\)\);/);
  assert.ok(tint, 'the dialogue is the raised surface tinted by the light of whoever speaks');
  const share = Number(tint[1]) / 100;
  const lit = [...elements.matchAll(/--lit: var\(--([a-z-]+)\)/g)].map((m) => m[1]);
  assert.ok(lit.includes('accent') && lit.includes('speaker-whisper') && lit.includes('speaker-keeper') && lit.includes('speaker-suspect'), `the lights are ${lit}`);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, p, b) => '#' + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('');
  let redFails = 0;
  for (const light of lit) {
    const surface = mix(roleHex(tokens, light), share, roleHex(tokens, 'surface-raised'));
    for (const role of ['text', 'text-quiet']) assert.ok(contrast(roleHex(tokens, role), surface) >= 4.5, `${role} on the dialogue lit by ${light} is ${contrast(roleHex(tokens, role), surface).toFixed(2)}`);
    if (contrast(roleHex(tokens, 'danger'), surface) < 4.5) redFails++;
  }
  assert.ok(redFails > 0, 'red words do not reach 4.5 on a lit dialogue, which is why a warning there is not red text (if this fails, the special rule is no longer needed)');
  const warn = rules.find(([s]) => s === '.ui-dialogue .ui-note.is-warn')[1];
  assert.match(warn, /color: var\(--text\)/);
  assert.match(warn, /border-left: var\(--stroke-frame\) solid var\(--danger\)/);
});

test('a button that cannot be pressed still has words you can read (4.5 to 1), and the main one is not a faded yellow block but a tinted one with a yellow edge', () => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, p, b) => '#' + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('');
  const raised = roleHex(tokens, 'surface-raised');
  // an ordinary button is dimmed by opacity: its words are the text colour mixed with the surface
  for (const sel of [".ui-button:disabled", ".ui-button[aria-disabled='true']"]) {
    const o = Number(rules.find(([s]) => s === sel)[1].match(/opacity: ([\d.]+)/)[1]);
    assert.match(rules.find(([s]) => s === sel)[1], /border-style: dashed/, 'a button that cannot be pressed is told by its edge as well as by its fade');
    for (const [role, need] of [['text', 4.5], ['text-quiet', 4.5], ['accent', 4.5], ['danger', 3]]) for (const surface of ['surface-raised', 'surface-page', 'surface-panel']) {
      const words = mix(roleHex(tokens, role), o, roleHex(tokens, surface));
      assert.ok(contrast(words, roleHex(tokens, surface)) >= need, `${role} on a dimmed button on ${surface} at opacity ${o} is ${contrast(words, roleHex(tokens, surface)).toFixed(2)}, under ${need}`);
    } // red words are 5.1 to 1 on the page and 3.2 when dimmed: a disabled Stop is rare, and it keeps its dashed edge
  }
  // the main button: no opacity, a tint of yellow on the raised surface, quiet words
  const mainOff = rules.find(([s]) => s.includes('.ui-button--primary:disabled'));
  assert.ok(mainOff && mainOff[0].includes(".ui-button--primary[aria-disabled='true']"), 'the same rule for the real and the aria way of being disabled');
  for (const body of [mainOff[1]]) {
    const tint = Number(body.match(/background: color-mix\(in srgb, var\(--accent\) (\d+)%, var\(--surface-raised\)\)/)[1]) / 100;
    assert.match(body, /color: var\(--text-quiet\)/);
    assert.match(body, /opacity: 1/, 'no second fade on top of the tint');
    assert.ok(!/background: var\(--accent\)/.test(body), 'a disabled main button is not solid yellow');
    const bg = mix(roleHex(tokens, 'accent'), tint, raised);
    assert.ok(contrast(roleHex(tokens, 'text-quiet'), bg) >= 4.5, `quiet words on the disabled main button are ${contrast(roleHex(tokens, 'text-quiet'), bg).toFixed(2)}`);
    assert.ok(contrast(bg, raised) >= 1.4, 'the disabled main button still stands out from a raised surface a little');
  }
  const primary = rules.findIndex(([s]) => s === '.ui-button--primary');
  assert.ok(rules.indexOf(mainOff) > primary, 'the disabled rule comes after the main button rule, so it wins');
  assert.match(read('design/catalogue.html'), /ui-button--primary" type="button" disabled/, 'the catalogue shows a disabled main button');
});

test('yellow is the main colour and only the main button and the skip link are solid yellow; green is rare and only the Whisper and the tick box have it', () => {
  const solid = declarations.filter((d) => d.prop === 'background' && d.value === 'var(--accent)').map((d) => d.sel);
  assert.deepEqual(solid.filter((s) => /button|skip|story|tool|dialogue-action/.test(s)).sort(), ['.ui-button--primary', '.ui-skip']);
  assert.ok(!declarations.some((d) => /^\.ui-story/.test(d.sel) && d.prop === 'background' && /accent/.test(d.value)), 'a story card is brown with a yellow edge, not a yellow block');
  assert.match(rules.find(([s]) => s === '.ui-story')[1], /border-left: var\(--stroke-edge\) solid var\(--accent\)/);
  const green = declarations.filter((d) => /--accent-rare|--speaker-whisper|--orb-ghost/.test(d.value)).map((d) => d.sel);
  for (const sel of green) assert.ok(/whisper|\.ui-check/.test(sel), `green only for the Whisper and the tick box, not: ${sel}`);
  assert.ok(green.length >= 5 && green.length <= 8, `green is used by ${green.length} rules: ${green.join(' | ')}`);
  const yellow = declarations.filter((d) => /var\(--accent(-hi)?\)|--speaker-keeper/.test(d.value)).length;
  assert.ok(yellow > green.length * 4, `yellow (${yellow} uses) is used far more than green (${green.length})`);
  assert.match(rules.find(([s]) => s === '.ui-button--danger')[1], /border-color: var\(--danger\)[^}]*background: var\(--surface-page\)[^}]*color: var\(--danger\)/, 'Stop is red on black, where red passes');
});

test('the stage is lit by whoever speaks, in the speaker\'s colour, and a portrait is always round and fills with the face', () => {
  const body = (sel) => rules.find(([s]) => s === sel)[1];
  assert.match(body('.ui-stage--whisper'), /--lit: var\(--speaker-whisper\)/);
  assert.match(body('.ui-stage--keeper'), /--lit: var\(--speaker-keeper\)/);
  assert.match(body('.ui-stage--suspect'), /--lit: var\(--speaker-suspect\)/);
  assert.match(body('.ui-stage'), /color-mix\(in srgb, var\(--lit\) 12%/);
  assert.match(body('.ui-stage'), /background: radial-gradient\(ellipse at 50% 28%, var\(--ember\) 0%, var\(--surface-panel\) 70%\); background: radial-gradient/, 'a plain gradient comes first, for a browser without color-mix');
  assert.match(body('.ui-dialogue'), /color-mix\(in srgb, var\(--lit, var\(--accent\)\) 5%, var\(--surface-raised\)\)/, 'the dialogue takes a little of the light, and still works outside a stage');
  assert.match(body('.ui-portrait'), /border-radius: var\(--radius-round\)/);
  assert.match(body('.ui-portrait'), /overflow: hidden/);
  assert.match(body('.ui-portrait > img, .ui-portrait > video'), /border-radius: var\(--radius-round\)/);
  assert.match(body('.ui-portrait > img, .ui-portrait > video'), /object-fit: cover/, 'a round frame fills with the face, it does not letterbox');
  assert.match(body('.ui-orb'), /border-radius: var\(--radius-round\)/);
  assert.match(body('.ui-portrait--whisper'), /--halo: var\(--speaker-whisper\)/);
  assert.match(body('.ui-portrait--keeper'), /--halo: var\(--speaker-keeper\)/);
  assert.match(body('.ui-portrait--suspect'), /--halo: var\(--speaker-suspect\)/);
});

test('phone behaviour: hover only where a pointer can hover, text boxes at 16 px so an iPhone does not zoom, heights in dvh, and the browser bar takes the page black', () => {
  // every :hover rule is inside @media (hover: hover), so a tap on a phone does not leave a button lit
  const outside = rawElements.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media \(hover: hover\) \{[\s\S]*?\n\}\n/g, '');
  assert.ok(!/:hover/.test(outside), 'a :hover rule is outside @media (hover: hover)');
  assert.ok((rawElements.match(/:hover/g) ?? []).length >= 5, 'the hover rules are there');
  // text boxes and menus: 16 px or more
  const input = tokens['text-size'].input.value;
  assert.ok(/^1(\.\d+)?rem$/.test(input) && parseFloat(input) >= 1, `--text-input is ${input}: under 16px an iPhone zooms the page on focus`);
  assert.match(rules.find(([s]) => s === '.ui-select, .ui-range, .ui-input')[1], /font-size: var\(--text-input\)/);
  // a vh height always has the dvh height after it (the old unit is only the fallback)
  for (const d of declarations.filter((x) => /vh$/.test(x.value) && !/dvh$/.test(x.value))) {
    const re = new RegExp(`${d.prop}: ${d.value};\\s*${d.prop}: ${d.value.replace('vh', 'dvh')};`);
    assert.match(rawElements, re, `${d.sel} { ${d.prop}: ${d.value} } has no dvh version`);
  }
  // the browser bar (theme-color) is the page black, on every page that is a whole screen
  const ink = tokens.color.ink.value;
  for (const f of ['web/index.html', 'web/puzzles-demo.html', 'design/catalogue.html', 'tools/voice-demo/index.html']) assert.match(read(f), new RegExp(`<meta name="theme-color" content="${ink}"`), `${f} sets theme-color to ink`);
});

test('the breakpoints in the media queries are the ones in the token file, and the sheet is a bottom sheet below the wide one', () => {
  const found = [...rawElements.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => Number(m[1]));
  assert.ok(found.length >= 3);
  const allowed = new Set(entries(tokens, 'breakpoint').map(([, v]) => parseInt(v.value, 10)));
  for (const px of found) assert.ok(allowed.has(px), `a media query of ${px}px is not a token breakpoint (${[...allowed]})`);
  assert.ok(found.includes(parseInt(tokens.breakpoint.wide.value, 10)));
  assert.match(rawElements, /\.ui-sheet \{ position: fixed;[^}]*transform: translateY\(105%\); visibility: hidden;/);
  assert.match(rawElements, /\.ui-sheet\.is-open \{ transform: none; visibility: visible;/);
  assert.match(rawElements, /@media \(min-width: 900px\) \{\s*\.ui-sheet \{ position: static;[^}]*transform: none; visibility: visible; \}\s*\.ui-sheet-close \{ display: none; \}/);
});

test('the elements name no other origin: no url, no import, no link', () => {
  assert.ok(!/url\(|@import|https?:\/\//.test(elements));
});

test('fonts are self-hosted: IBM Plex Mono for the interface and Newsreader for what a ghost says, four real WOFF2 files with their licences', () => {
  const css = read('design/fonts.css');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => ({ family: /font-family:\s*'([^']+)'/.exec(m[1])[1], url: /url\('\.\/fonts\/([a-z0-9-]+\.woff2)'\)/.exec(m[1])[1] }));
  assert.equal(faces.length, 4);
  assert.deepEqual([...new Set(faces.map((f) => f.family))].sort(), ['IBM Plex Mono', 'Newsreader']);
  for (const f of faces) assert.equal(readFileSync(join(root, 'design/fonts', f.url)).subarray(0, 4).toString('latin1'), 'wOF2', `${f.url} is a real WOFF2 file`);
  assert.deepEqual(readdirSync(join(root, 'design/fonts')).filter((f) => f.endsWith('.woff2')).sort(), faces.map((f) => f.url).sort(), 'no font file is unused and none is missing');
  assert.ok(!/https?:\/\/|@import/.test(css), 'no third-party request');
  assert.match(tokens.font.ui.value, /^"IBM Plex Mono"/);
  assert.match(tokens.font.ghost.value, /^Newsreader/);
  for (const f of ['OFL-Newsreader.txt', 'OFL-IBM-Plex-Mono.txt']) assert.match(read(`design/fonts/${f}`), /SIL Open Font License/, `${f} is kept with the fonts`);
  assert.match(read('design/fonts/README.md'), /Newsreader[\s\S]*IBM Plex Mono/);
  assert.match(rawElements, /\.ui-page \{[^}]*font: var\(--text-body\) \/ 1\.55 var\(--font-ui\)/, 'the interface is monospace');
  for (const sel of ['.ui-speech', '.ui-title', '.ui-lead', '.ui-log']) assert.match(rules.find(([s]) => s === sel)[1], /var\(--font-ghost\)/, `${sel} is the serif`);
  assert.match(read('.kiro/steering/visual-style.md'), /Self-host fonts/);
});

// ---- the catalogue and the pages that use the elements -------------------------------------------------------------------------------------
const catalogue = read('design/catalogue.html');
const pages = { 'tools/voice-demo/index.html': read('tools/voice-demo/index.html'), 'tools/voice-demo/page.mjs': read('tools/voice-demo/page.mjs'), 'design/catalogue.html': catalogue };

test('the catalogue shows every element: a class in elements.css that is not on the catalogue page fails', () => {
  const shown = classesIn(catalogue);
  const missing = [...defined].filter((c) => !shown.has(c));
  assert.deepEqual(missing, [], `these elements are not in design/catalogue.html: ${missing.join(', ')}`);
  for (const s of definedStates) assert.ok(catalogue.includes(s), `the state ${s} is not explained in the catalogue`);
  assert.ok(catalogue.includes('pnpm build-tokens'));
});

test('a page uses only elements that exist: no misspelled ui- class or is- state in a page, its script or the catalogue', () => {
  for (const [file, text] of Object.entries(pages)) {
    for (const c of classesIn(text)) assert.ok(defined.has(c), `${file} uses ${c}, which design/elements.css does not define`);
    for (const s of stateClassesIn(text.replace(/<code>[^<]*<\/code>/g, ''))) assert.ok(definedStates.has(s), `${file} sets ${s}, which design/elements.css does not define`);
  }
});

test('the play-through page is built from the design system: its three links, its body class, and a style that only says where things go', () => {
  const html = pages['tools/voice-demo/index.html'];
  assert.match(html, /<link rel="stylesheet" href="\/design\/tokens\.css">\s*<link rel="stylesheet" href="\/design\/fonts\.css">\s*<link rel="stylesheet" href="\/design\/elements\.css">/);
  assert.match(html, /<body class="ui-page">/);
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(style), 'no raw colour on the page');
  assert.ok(!/var\(--(ink|wood|bone|lantern|ghost|alarm|dust|ash|leather)[a-z0-9-]*\)/.test(style), 'no palette name on the page: it uses no colour at all');
  assert.ok(!/@font-face/.test(style), 'the fonts come from design/fonts.css');
  assert.ok(style.length < 1800, `the page's own style is ${style.length} characters: look belongs in design/elements.css`);
});

test('the web app loads the same fonts and elements as the mockup', () => {
  const main = read('web/src/main.tsx');
  assert.match(main, /import "\.\/styles\/tokens\.css";/);
  assert.match(main, /import "\.\.\/\.\.\/design\/fonts\.css";\s*import "\.\.\/\.\.\/design\/elements\.css";/);
});

test('the commands exist: build-tokens, check-tokens, and the traceability check that runs them', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['build-tokens'], 'node tools/build-tokens.mjs');
  assert.equal(pkg.scripts['check-tokens'], 'node tools/build-tokens.mjs --check');
  assert.ok(existsSync(join(root, 'tools/build-tokens.mjs')));
});

// ---- the screens built before the spec are on the elements now ----------------------------------------------------------------------------
function cssFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? cssFiles(`${dir}/${e.name}`) : e.name.endsWith('.css') ? [`${dir}/${e.name}`] : []));
}
// Every stylesheet of a screen under web/src, so the 3D viewer (web/src/viewer) and the party screens (web/src/party) are held to the same rules
// the moment they exist. Only the generated tokens.css (which is where the colours are written) and the dev-only demo styles are left out.
const SCREEN_CSS = cssFiles('web/src').filter((f) => f !== 'web/src/styles/tokens.css' && !f.includes('/demo/'));
/** Variables a screen sets for itself (like --pz-target on the puzzle host), in any screen stylesheet, or inline from its code (like --pz-ratio on the photo board). */
const screenTsx = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? screenTsx(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []));
const localScreenProps = new Set([
  ...SCREEN_CSS.flatMap((f) => [...read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
  ...screenTsx('web/src').flatMap((f) => [...read(f).matchAll(/"(--[a-z0-9-]+)":/g)].map((m) => m[1])),
]);

test('every screen stylesheet (the web app, the puzzles, and the 3D viewer and party screens once they exist) writes no colour of its own: no hex, no rgb(), and no palette name where a role exists', () => {
  assert.ok(SCREEN_CSS.length >= 12 && SCREEN_CSS.includes('web/src/styles/app.css'), `${SCREEN_CSS.length} screen stylesheets found`);
  const palette = entries(tokens, 'color').map(([k]) => k);
  for (const file of SCREEN_CSS) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), `${file} has a hex colour`);
    assert.ok(!/\b(?:rgb|rgba|hsl|hsla)\(/.test(css), `${file} has a colour function`);
    for (const m of css.matchAll(/var\(--([a-z0-9-]+)/g)) assert.ok(!palette.includes(m[1]) || ['light', 'art'].includes(tokens.color[m[1]].use), `${file} uses the palette name --${m[1]}: use its role`);
    for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(tokenProps.has(m[1]) || localScreenProps.has(m[1]), `${file} reads ${m[1]}, which is neither a token nor a variable a screen sets itself`);
    assert.ok(!/\.(?:button|banner|card|notice)\s*[{,.:]/.test(css) || file.includes('puzzles'), `${file} still styles an old look class`);
  }
});

test('screen code writes no hex colour (puzzles, and the 3D viewer and party screens once they exist): game-art hues are the art-* tokens, written once in the token file', () => {
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []));
  const files = ['web/src/puzzles', 'web/src/viewer', 'web/src/party'].filter((d) => existsSync(join(root, d))).flatMap(walk);
  assert.ok(files.filter((f) => f.startsWith('web/src/puzzles/')).length > 30, 'the puzzle code is there');
  for (const f of files) assert.ok(!/#[0-9a-fA-F]{6}\b/.test(read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${f} writes a hex colour`);
  // art that draws its colours in code takes them from the generated tokens; art that styles them in CSS takes them from var(--art-*) (checked above: no hex, only tokens)
  assert.match(read('web/src/puzzles/art/wires.tsx'), /from "@hauntology\/shared\/design\/tokens"/, 'the wires take their hues from the tokens');
  for (const f of ['web/src/puzzles/art/shelf.css', 'web/src/puzzles/art/patina.css']) assert.match(read(f), /var\(--art-[a-z]+\)/, `${f} takes its colours from the art tokens`);
  const art = entries(tokens, 'color').filter(([, v]) => v.use === 'art');
  assert.ok(art.length >= 26, `${art.length} art colours: the 6 wire hues, the shelf hues and the materials`);
  for (const [k] of art) assert.ok(k.startsWith('art-'), k);
});

test('the elements have a switch (a button with aria-checked), a segmented row, a plain serif list and a danger panel, and a checked button looks pressed', () => {
  assert.match(rawElements, /\.ui-button\[aria-checked='true'\]:not\(\.ui-button--danger\) \{ border-color: var\(--accent\); color: var\(--accent\); \}/);
  assert.match(rules.find(([s]) => s === '.ui-switch')[1], /justify-content: space-between/);
  assert.match(rules.find(([s]) => s === '.ui-lines')[1], /var\(--font-ghost\)/);
  assert.match(rules.find(([s]) => s === '.ui-panel--danger')[1], /border-color: var\(--danger\)/);
  assert.ok(!declarations.some((d) => /^\.ui-switch/.test(d.sel) && /background/.test(d.prop)), 'an on switch is a yellow edge, not a yellow block');
});

test('the old look classes are gone from the screens: no className="button" (in a .tsx or in a .ts that makes elements, such as the demo Turnstile stand-in), no pz-btn or pz-help-btn in web/src', () => {
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const files = walk('web/src');
  assert.ok(files.length > 40);
  for (const f of files) {
    const text = read(f);
    assert.ok(!/className="button[ "]/.test(text) && !/className\s*=\s*["']button["']/.test(text) && !/classList\.add\(\s*["']button["']/.test(text), `${f} uses the old button`);
    assert.ok(!/\bpz-btn(-[a-z]+)?\b|\bpz-help-btn\b/.test(text), `${f} uses an old puzzle button class`);
  }
  for (const f of files) for (const c of classesIn(read(f))) assert.ok(defined.has(c), `${f} uses ${c}, which design/elements.css does not define`);
});

// ---- the specs and steering say: build from these ---------------------------------------------------------------------------------------------
/** The specs that have a screen of their own: each one carries the shared look requirement, a design section and a task. */
const SCREEN_SPECS = ['haunwallker', 'puzzles', 'party-mode', 'world-viewer', 'spirit-table', 'ghost-voice', 'integration', 'ghost-creator', 'world-pipeline', 'conditions', 'ghost-engine', 'errands', 'world-clues', 'game-songs', 'knock-door'];
/** The specs that have no screen, with the reason. A new folder under .kiro/specs/ goes in one of these two lists, or the test below fails. */
const NO_SCREEN_SPECS = { 'design-system': 'it is the design system itself: the source of the look, not a user of it' };

test('the design-system spec exists with its requirements, design and tasks', () => {
  for (const f of ['requirements', 'design', 'tasks']) assert.ok(existsSync(join(root, `.kiro/specs/design-system/${f}.md`)), f);
  const req = read('.kiro/specs/design-system/requirements.md');
  for (const word of ['design/tokens.json', 'design/elements.css', 'design/catalogue.html', 'pnpm build-tokens', 'pnpm check-tokens', '4.5', '44']) assert.ok(req.includes(word), `the requirements mention ${word}`);
  assert.ok(SCREEN_SPECS.every((s) => req.includes(`\`${s}\``)), 'Requirement 6 names every spec that has a screen');
});

test('the steering says how to build a screen: tokens, elements, the catalogue, and when a new element may be added', () => {
  const s = read('.kiro/steering/design-system.md');
  assert.match(s, /^---\ninclusion: fileMatch\nfileMatchPattern: .+\n---/);
  for (const word of ['design/tokens.json', 'design/elements.css', 'design/catalogue.html', 'pnpm build-tokens', 'pnpm check-tokens', 'ui-', 'is-', 'roles', 'One solid yellow', 'Green is rare']) assert.ok(s.includes(word), word);
  const v = read('.kiro/steering/visual-style.md');
  assert.match(v, /design\/tokens\.json/, 'the visual style points at the token file as the source');
  assert.match(v, /design-system\.md/);
  assert.match(v, /yellow as the main colour/i);
  assert.match(read('.kiro/steering/structure.md'), /design\/\s+the design system: tokens\.json/, 'the layout lists the design folder');
  assert.match(read('.kiro/steering/structure.md'), /build-tokens\.mjs/);
});

test('every spec that has a screen says its screens are built from the design system, with a requirement, a design section and a task', () => {
  for (const name of SCREEN_SPECS) {
    const req = read(`.kiro/specs/${name}/requirements.md`);
    const m = /### Requirement (\d+)\s+\*\*User Story:\*\*[^\n]*\(Shared look\)([\s\S]*?)(?=\n### Requirement |$)/.exec(req);
    assert.ok(m, `${name} has no "Shared look" requirement`);
    assert.match(m[2], /design\/tokens\.json/, `${name}: the requirement points at the tokens`);
    assert.match(m[2], /design\/elements\.css/, `${name}: the requirement points at the elements`);
    assert.match(m[2], /design\/catalogue\.html/, `${name}: the requirement says a missing piece goes in the catalogue`);
    assert.match(m[2], /4\.5 to 1/, `${name}: the requirement keeps the shared rules`);
    const design = read(`.kiro/specs/${name}/design.md`);
    assert.match(design, /## Shared look \(design system/, `${name}: the design has a Shared look section`);
    assert.match(design, /design\/catalogue\.html/, `${name}: the design points at the catalogue`);
    const tasks = read(`.kiro/specs/${name}/tasks.md`);
    assert.match(tasks, new RegExp(`- \\[[ x]\\] \\d+\\. Shared look[^\\n]*Requirement ${m[1]}\\b`), `${name}: a task builds the screens from the shared elements`);
    for (let i = 1; i <= 4; i++) assert.ok(tasks.includes(`_Requirements: ${m[1]}.`), `${name}: tasks cover Requirement ${m[1]}`);
  }
});

test('every folder under .kiro/specs is a screen spec or says why it has no screen, so a new spec cannot skip the question', () => {
  const folders = readdirSync(join(root, '.kiro/specs'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const known = new Set([...SCREEN_SPECS, ...Object.keys(NO_SCREEN_SPECS)]);
  const unknown = folders.filter((f) => !known.has(f));
  assert.deepEqual(unknown, [], `a new spec folder must carry the Shared look requirement, design section and task and be added to SCREEN_SPECS, or be added to NO_SCREEN_SPECS with a reason: ${unknown.join(', ')}`);
  const gone = [...known].filter((f) => !folders.includes(f));
  assert.deepEqual(gone, [], `listed here but no such spec folder: ${gone.join(', ')}`);
  for (const [name, why] of Object.entries(NO_SCREEN_SPECS)) assert.ok(why.length >= 10 && !SCREEN_SPECS.includes(name), `${name} has a reason and is not also a screen spec`);
});

test('a hook rebuilds the generated token files when the token file is saved', () => {
  const hook = JSON.parse(read('.kiro/hooks/tokens-on-save.json'));
  assert.equal(hook.version, 'v1');
  const h = hook.hooks[0];
  assert.equal(h.trigger, 'PostFileSave');
  assert.ok(new RegExp(h.matcher).test('design/tokens.json') && !new RegExp(h.matcher).test('design/elements.css'), 'it runs for the token file and for nothing else');
  assert.equal(h.action.type, 'command');
  assert.match(h.action.command, /build-tokens/);
});
