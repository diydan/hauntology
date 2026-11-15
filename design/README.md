# design/

The look of Hauntology, written once. Spec: `.kiro/specs/design-system/`. Rules for building a screen: `.kiro/steering/design-system.md`.

| File | What it is | Edit by hand? |
|---|---|---|
| `tokens.json` | Every colour, role, font, text size, space step, corner, stroke, glow, shadow, motion time, touch size, breakpoint and layer, with a note each, and the contrast rules | **Yes: the only place a value is written** |
| `elements.css` | The reusable `ui-` elements, made only of tokens | Yes (and add the element to the catalogue) |
| `catalogue.html`, `catalogue.mjs` | Every element and token on one page. `pnpm voice-demo`, then open http://127.0.0.1:8780/design/ | Yes |
| `fonts.css`, `fonts/` | IBM Plex Mono and Newsreader, self-hosted, with their licences (SIL OFL 1.1) | Rarely |
| `../web/src/styles/tokens.css`, `../shared/src/design/tokens.ts` | Generated from `tokens.json` | **No** (`pnpm build-tokens`) |

## Use
```html
<link rel="stylesheet" href="tokens.css"> <link rel="stylesheet" href="fonts.css"> <link rel="stylesheet" href="elements.css">
<body class="ui-page"> ... <button class="ui-button ui-button--primary">Begin</button>
```
In the web app they are imported in `web/src/main.tsx`.

## Change the look
1. A value: edit `tokens.json`, run `pnpm build-tokens`, commit the two generated files with it. (`pnpm check-tokens` fails if they are stale or a contrast rule fails; a hook runs the build when you save the file.)
2. A new element: add it to `elements.css` **and** `catalogue.html`, from tokens only.
3. Run `node --test tools/test/design-tokens.test.mjs tools/test/design-system.test.mjs`.
