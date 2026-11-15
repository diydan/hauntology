# Design Document

## Overview

Three layers, each one reading only the layer above it.

```
design/tokens.json            the values (hand-edited, the only place a value is written)
   | pnpm build-tokens
   +--> web/src/styles/tokens.css       CSS variables: palette, roles, type, space, corners, strokes, glows, shadows, motion, touch, breakpoints, layers
   +--> shared/src/design/tokens.ts     the same colours and numbers for an SVG, a canvas or Three.js
design/elements.css           the reusable pieces (hand-edited; reads roles and tokens, never a raw value)
design/fonts.css + fonts/     IBM Plex Mono and Newsreader, self-hosted, with their licences
design/catalogue.html         every element and every token, on one page (/design/ in `pnpm voice-demo`)
a page or a screen            loads the three CSS files and says only where things go
```

`tools/lib/design-tokens.mjs` (pure) reads and checks the token file and makes the two generated files; `tools/build-tokens.mjs` is the command (`pnpm build-tokens`, `pnpm check-tokens`). The tests are `tools/test/design-tokens.test.mjs` and `tools/test/design-system.test.mjs`.

## Tokens

| Group | CSS name | Notes |
|---|---|---|
| Palette | `--ink --ink-deep --void --wood --wood-2 --wood-3 --ember --wood-line --leather --dust --ash --bone --lantern --lantern-hi --ghost --alarm --orb-*` | `ink bone lantern ghost dust alarm` are frozen (steering). `ash` is the quiet text colour: 6.8 to 1 or better on every surface. `dust` is for shapes only (3.85 to 1). |
| Roles | `--surface-page -sunk -panel -raised -hover`, `--line --line-strong`, `--text --text-quiet --shape-quiet`, `--accent --accent-hi --accent-rare --danger --on-accent --focus`, `--speaker-whisper -keeper -suspect` | What elements use. Change a role's colour and every element follows. |
| Type | `--font-ui --font-ghost`, `--text-micro -small -control -body -title -lead -speech -display` | Sizes in rem (10.5 to 40 px at the default). |
| Space | `--space-0 .. --space-6` | 2, 4, 8, 12, 16, 24, 32 px. Steps 1 to 4 are the puzzle screens' `--pz-space-1` to `-4`. |
| Shape | `--radius-xs sm md lg xl pill round`, `--stroke-thin ring frame edge`, `--glow-sm md lg`, `--shadow-lift` | |
| Motion | `--fade-quick` 300, `--fade` 400, `--fade-slow` 600, `--breathe` 2400, `--ease` | The three fades are 0 ms under reduced motion. |
| Touch | `--target` 44 px, `--target-main` 52 px | |
| Layout | `--bp-wide` 900 px, `--bp-roomy` 640 px, `--z-sticky -sheet -modal -skip` | A media query cannot read a variable: `elements.css` repeats the breakpoints and a test keeps them equal. |

### Colour scheme

Black for the page, four dark browns for depth (page, panel, raised, hovered), leather for a divider that must show, cream for text, **yellow for the main colour**, **green rare**, red for warnings. Each speaker has a light: Whisper green, Keeper yellow, Suspect cream. Red text is kept off the hovered brown (4.18 to 1); `check-tokens` encodes that as a missing rule rather than a comment.

## Elements

| Element | Classes | Used for |
|---|---|---|
| Page | `ui-page ui-header ui-header-title ui-header-sub ui-skip ui-sr-only` | The body, the header, the skip link, text only a screen reader gets |
| Text | `ui-prompt ui-title ui-lead ui-eyebrow ui-hint ui-status ui-notice ui-key` | The `>` prompt, titles, quiet lines, the content notice, a key cap |
| Surfaces | `ui-panel ui-card ui-modal` | A block, a card, the title card over the page |
| Buttons | `ui-button` + `--primary --danger --quiet --main`, `ui-button-sub ui-choices ui-story ui-story-title ui-story-sub ui-stories ui-grid ui-grid--one` | One main button per view; a story card is a brown choice with a yellow edge |
| Fields | `ui-field ui-field-label ui-field--check ui-select ui-range ui-check` | A label and its control |
| Stage | `ui-stage` + `--whisper --keeper --suspect`, `ui-portrait` + the same, `ui-orb ui-orb--whisper ui-clipnote ui-nameplate` + the same, `ui-scene ui-dialogue ui-speech ui-word ui-speech-tail ui-note ui-dialogue-action` | A speaker, lit, with what they say |
| HUD | `ui-hud ui-hud-box ui-hud-box--right ui-lamps ui-lamp ui-compass ui-compass-row ui-compass-text ui-compass-ring ui-compass-tick ui-needle ui-bars ui-bar ui-meter ui-seg ui-seg--event ui-seg--max ui-chips ui-chip` | Only what the rules give the player |
| Moving | `ui-transport ui-tool ui-tool-glyph ui-tool--narrow-only ui-keys ui-progress-label ui-dots ui-dot ui-progress-next` | Pause, back, next, stop; where in a story |
| Sheet | `ui-sheet ui-sheet-head ui-sheet-title ui-sheet-close ui-fold` | Bottom sheet on a phone, side panel from 900 px |
| Journal | `ui-log ui-log-row ui-log-id ui-log-who` | What was said |
| Screens | `ui-stack ui-stack--tight ui-stack--loose ui-row ui-row--center ui-row--between ui-heading ui-input ui-choice ui-notice--danger ui-button--block ui-button--round ui-figure ui-figure--thumb ui-facts ui-steps ui-step ui-gauge ui-gauge--thin ui-gauge-fill ui-line ui-line--whisper ui-line--system ui-line-who ui-progress` | Layout helpers, headings, inputs, pictures, lists, progress and chat lines for the web app and the puzzle screens; a link used as a button is `a.ui-button` |
| State | `is-on is-done is-current is-active is-haunting is-speaking is-open is-warn is-bad is-blackout is-locked is-none` | Set from script |

The class list is the file; the catalogue is the picture. A test keeps them equal.

## What the checks enforce

`design-tokens.test.mjs` and `design-system.test.mjs` fail when: a token is malformed or a frozen colour moves; a generated file is stale; a text colour is under 4.5 to 1 on a surface it may sit on; `elements.css` holds a raw colour, a raw gap, corner, text size or time, a palette name where a role exists, an unknown variable, a shape colour used as text, a control under 44 px, an outline turned off, a transition without a fade token, a breakpoint that is not a token, a second solid yellow control, green on anything but the Whisper and the tick box; an element is missing from the catalogue; a page uses a class the elements do not define; the page's own style holds a colour or grows past layout.

## Rules for the next screen

1. Load `tokens.css`, `fonts.css`, `elements.css`; put `ui-page` on the body (or wrap the screen in it).
2. Build the screen from the elements in the catalogue. Write only layout (grid areas, widths) in the screen's own style.
3. Need something new? Add it to `design/elements.css` and `design/catalogue.html`, from tokens, then use it. Need a new value? Add it to `design/tokens.json`, run `pnpm build-tokens`.
4. In the production app a stylesheet is `style-src 'self'`: no `style=""` and no `<style>` in HTML. State is a class; a number that moves (a rotation) is set through the CSSOM (`el.style.transform = ...`), which that policy allows.
5. A screen that keeps its own look (the 3D viewer's canvas) takes its colours from `shared/src/design/tokens.ts`.

## Left out on purpose

- Light mode. The game is dark only (`color-scheme: dark`).
- Making the puzzle game art generic. The wires, safe dial, candles, maze, photo board and the rest keep their `pz-` classes, made of roles and tokens; their content hues (wire colours, shelf items) are still hex in `web/src/puzzles/art/` until a `game-art` token group exists (task 4.5).
- `site/` (the marketing page) and `tools/prop-mockups` have their own palettes; they may adopt the tokens later.
- A JavaScript component library. The elements are CSS and markup; React screens use the same class names.

## Correctness Properties

### Property 1: Tokens are written once
For every token file that passes the checks, the two generated files equal what `toCss` and `toTs` make from it, and a change to one value changes only the lines that read it.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Text is readable on every surface it may sit on
For every pair of text role and surface role the token file lists, the contrast is at least 4.5 to 1, and no shape or line colour is a text colour.
**Validates: Requirements 3.1**

### Property 3: Elements are made of tokens only
For every rule of `design/elements.css`, a colour is a role or a light token, a gap is a space token, a corner a radius token, a text size a type token and a time a fade token.
**Validates: Requirements 2.2, 3.3, 4.1**

### Property 4: The catalogue shows every element
For every `ui-` class and every `is-` state the elements define, the catalogue page names it.
**Validates: Requirements 4.2, 4.5**

### Property 5: A page uses only elements that exist
For every `ui-` class and `is-` state a page, its script or the catalogue uses, `design/elements.css` defines it, and the page's own style holds no colour.
**Validates: Requirements 4.3, 5.1**

## Testing

Example tests and the deliberate-break checks in `tools/test/design-tokens.test.mjs` (the token file and the command) and `tools/test/design-system.test.mjs` (the elements, the catalogue, the pages, the specs; it also fails for a folder under `.kiro/specs/` that is neither in `SCREEN_SPECS`, with its Shared look requirement, design section and task, nor in `NO_SCREEN_SPECS`, with a reason). Contrast and the other pure checks are in `tools/lib/design-tokens.mjs`. The web app's own `styles.test.ts` keeps the six steering colours and the one fade. Breaks that must be caught: a moved steering colour, a stale generated file, a dim quiet text, a raw hex in an element, a raw time, a second solid yellow button, an element missing from the catalogue, a misspelled class in a page.
