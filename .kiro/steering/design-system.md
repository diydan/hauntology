---
inclusion: fileMatch
fileMatchPattern: ["web/**/*.tsx", "web/**/*.css", "design/**", "tools/voice-demo/**"]
---
# Design system: build every screen from the tokens and the elements

The look is written once. Do not invent a colour, a size, a gap, a corner or a time, and do not write a button, a panel or a HUD piece again.

## Where things are
- `design/tokens.json`: the values. The only file you edit to change a value. Then run `pnpm build-tokens` and commit `web/src/styles/tokens.css` and `shared/src/design/tokens.ts` with it (`pnpm check-tokens` fails if they are stale). Never edit those two by hand.
- `design/elements.css`: the reusable elements, `ui-` classes (`ui-block`, `ui-block-part`, `ui-block--variant`, `is-state`). `design/fonts.css`: IBM Plex Mono (the interface) and Newsreader (what a ghost says), self-hosted.
- `design/catalogue.html`: every element and token on one page, with copyable markup. Run `pnpm voice-demo` and open `/design/`. The play-through (`tools/voice-demo`) is the reference screen.
- Spec: `.kiro/specs/design-system/`.

## Building a screen
1. Load `tokens.css`, `fonts.css`, `elements.css`; the body (or the screen's wrapper) is `ui-page`.
2. Pick elements from the catalogue. The screen's own style says only where things go: grid areas, widths, order. No colour, type size or corner in a screen's own style.
3. Colours are **roles** (`--text`, `--text-quiet`, `--surface-raised`, `--accent`, `--danger`...), never the palette names (`--wood`, `--lantern`) and never a hex. Only the light colours (orb, `--ember`, `--void`) are used by their own names. Code that cannot read a CSS variable (SVG, canvas, Three.js) imports `shared/src/design/tokens.ts`.
4. Gaps and padding are `--space-n`, corners `--radius-n`, text `--text-*`, times `--fade-quick | --fade | --fade-slow`, touch `--target` (44 px) or `--target-main` (52 px).
5. **Yellow is the main colour.** One solid yellow button per view (`ui-button--primary`). A choice that starts something is a `ui-story` card (brown, yellow edge). **Green is rare**: the Whisper and the tick box only. Red: warnings, Stop, the last Haunt segment.
6. Text must be 4.5 to 1 on its surface. `--shape-quiet`, `--line`, `--line-strong` are never text. Red text never on `--surface-hover`.
7. A new piece? Add it to `design/elements.css` **and** `design/catalogue.html` in the same change, from tokens, then use it. A new value? `design/tokens.json`. Do not copy an element into a screen.
8. In production the style policy is `style-src 'self'`: no `style=""` and no `<style>` in HTML. State is a class (`is-on`); a moving number goes through the CSSOM (`el.style.transform`).

## New specs and new screens
- A spec whose feature has a screen carries a **Shared look** requirement, a `## Shared look (design system, ...)` section in its design (a table of which elements each part uses) and a task, as the specs listed in `SCREEN_SPECS` do. Copy them from one of those, change the screens and the elements, keep criteria 1, 2 and 4 as they are.
- A new folder under `.kiro/specs/` must be added to `SCREEN_SPECS` or to `NO_SCREEN_SPECS` (with the reason) in `tools/test/design-system.test.mjs`; the test fails until it is. A spec that gains a screen later adds the three parts in the same change.
- New code builds from the elements the first time. Old code (a screen built before this) moves onto them the next time it is changed, in the same change; do not mix a raw colour, gap, corner or time into either.

## Checks that fail the build
`pnpm check-tokens`, `tools/test/design-tokens.test.mjs`, `tools/test/design-system.test.mjs`, and the web app's `styles.test.ts`. Run them after touching `design/`.

## Screens
The web app (`web/src/app/**`, `web/src/styles/app.css`) and the puzzle screens (`web/src/puzzles/**`) are on the elements. `app.css` is layout only. A puzzle's game pieces keep `pz-` classes but use roles and tokens only; its buttons, panels, hints, status and gauges are `ui-` elements, with the 48 px targets set on `.pz-host`. Tests keep raw colours and palette names out of those stylesheets, and raw hex out of the puzzle code: the wire and shelf-item hues are the `art-*` tokens (`color["art-red"]` from `@hauntology/shared/design/tokens`). A switch is a `ui-button ui-switch` with `role="switch"` and `aria-checked`.
