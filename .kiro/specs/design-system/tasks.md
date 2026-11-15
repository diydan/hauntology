# Implementation Plan

- [x] 1. Tokens (`design/tokens.json`, `tools/lib/design-tokens.mjs`, `tools/build-tokens.mjs`)
  - [x] 1.1 The token file: palette, roles, type, space, corners, strokes, glows, shadow, motion, touch, breakpoints, layers, the contrast rules
    - Built 2026-11-15 from the play-through mockup. The six steering colours and the app's `--fade`, `--target`, `--font-ui`, `--font-ghost` are unchanged.
    - _Requirements: 1.1, 1.3, 2.1, 3.1_
  - [x] 1.2 The checker and the writer: `pnpm build-tokens`, `pnpm check-tokens`; writes `web/src/styles/tokens.css` and `shared/src/design/tokens.ts`
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 **Property 1: Tokens are written once**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [x] 1.4 **Property 2: Text is readable on every surface it may sit on**
    - **Validates: Requirements 3.1**
  - [x] 1.5 The memory card draws with `shared/src/design/tokens.ts` instead of its own hex
    - _Requirements: 1.4_

- [x] 2. Elements, fonts and the catalogue
  - [x] 2.1 `design/elements.css`: the page, text, surfaces, buttons, fields, the stage, the HUD, the transport, the progress dots, the sheet and the journal
    - _Requirements: 2.2, 2.3, 2.4, 3.2, 3.3, 4.1, 4.5, 4.6_
  - [x] 2.2 **Property 3: Elements are made of tokens only**
    - **Validates: Requirements 2.2, 3.3, 4.1**
  - [x] 2.3 Fonts self-hosted in `design/fonts/` with `design/fonts.css` and the two licences
    - _Requirements: 3.4_
  - [x] 2.4 `design/catalogue.html` and `design/catalogue.mjs`, served at `/design/` by `pnpm voice-demo`
    - _Requirements: 4.2, 5.1_
  - [x] 2.5 **Property 4: The catalogue shows every element**
    - **Validates: Requirements 4.2, 4.5**

- [x] 3. Pages
  - [x] 3.1 The play-through mockup rebuilt from the elements (its own style is layout only)
    - Checked in a headless browser: the same behaviour as before, 44 px targets, no sideways scroll on a 390 px phone, no console errors; the catalogue page renders every element.
    - _Requirements: 4.3, 4.4, 5.1_
  - [x] 3.2 **Property 5: A page uses only elements that exist**
    - **Validates: Requirements 4.3, 5.1**
  - [x] 3.3 The web app loads `design/fonts.css` and `design/elements.css` after `tokens.css` (`web/src/main.tsx`); the production build bundles the four fonts from the app's own origin
    - _Requirements: 5.2_

- [ ] 4. Move the screens built before this spec
  - [x] 4.1 `web/src/puzzles/puzzles.css`: the raw hex colours (`#14171c`, `#1c2027`) and `rgb(233 228 216 / 22%)` are surface and text roles; the puzzle styles hold no hex, no `rgb()` and no palette name
    - Done 2026-11-15. The wire colours and the 12 shelf-item hues in `web/src/puzzles/art/` stay as hex on purpose: they are game content that must tell things apart, not interface colour (see 4.5).
    - _Requirements: 5.3_
  - [x] 4.2 `web/src/styles/app.css` is layout only (689 lines became about 80): `.button`, `.banner`, `.notice`, `.card`, `.dialog` and the rest are the shared elements, and `<body class="ui-page">`
    - Done 2026-11-15. The app's body text is now the mockup's 13 px mono (it was 16 px). Ghost lines in the Chat are cream serif with a green edge, not green text.
    - _Requirements: 5.3_
  - [x] 4.3 `web/src/app/screens/*`, `web/src/app/play/*`, `web/src/app/create/*`, `web/src/app/haunt/*`, `web/src/app/case/*`: the same, screen by screen, one `ui-button--primary` to a screen
    - Done 2026-11-15. Checked in a headless browser at 390 and 1280 px: no console errors, no sideways scroll, no control under 44 px. `create/surface.ts` still paints black ink on white paper: that is the ink check's pixel contract, not look.
    - _Requirements: 5.2, 5.3_
  - [x] 4.4 The 11 puzzle phone screens: buttons, panels, hints, status, gauges and rows are `ui-` elements; the game pieces keep `pz-` classes made of roles and tokens; 48 px targets stay (`--pz-target` on the host); `--pz-space-*` is gone, they use `--space-1` to `--space-4`
    - Done 2026-11-15. Checked in a headless browser at 390 px: every kind, no console errors, no sideways scroll, every control at least 48 px.
    - _Requirements: 5.3_
  - [x] 4.5 The leftovers of the move: 14 `art-*` colour tokens for the wire and shelf-item hues (the puzzle code now holds no hex at all); `ui-switch`, `ui-switch-name`, `ui-switch-state` and `ui-segments` (with `aria-checked` looking pressed) for the puzzle settings; `ui-lines`, a plain serif list, for the journal and the End screen; `ui-panel--danger` for the Create and Confirm error blocks
    - Done 2026-11-15. The puzzle settings were checked in a headless browser at 390 px; the new pieces are on the catalogue.
    - _Requirements: 4.4, 5.3_

- [x] 5. Specs and steering
  - [x] 5.1 `.kiro/steering/design-system.md`, `visual-style.md` and `structure.md` updated
    - _Requirements: 6.2_
  - [x] 5.2 A "Shared look" requirement, a design section and a task in each spec that has a screen
    - _Requirements: 6.1_
  - [x] 5.3 Every spec folder is a screen spec or says why it has no screen; the test fails for a new folder that is neither; the five specs that had a screen part and no Shared look (`world-pipeline`, `conditions`, `ghost-engine`, `errands`, `world-clues`) now carry it
    - _Requirements: 6.1, 6.3, 6.4_

- [ ] 6. Checkpoint
  - Run `pnpm check-tokens`, `node tools/check-traceability.mjs`, `node --test tools/test/design-tokens.test.mjs tools/test/design-system.test.mjs tools/test/voice-demo.test.mjs`, `pnpm --filter web test` and `pnpm typecheck`; open `/design/` and the play-through on a real phone (`mtest.hauntology.app/design/` after `cd tools/playtest && node build.mjs && wrangler deploy`). Nothing is open.
