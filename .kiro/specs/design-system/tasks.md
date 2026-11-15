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

- [ ] 4. Move the screens built before this spec (each one when it is next touched, in the same change)
  - [ ] 4.1 `web/src/puzzles/puzzles.css`: the raw hex colours (`#14171c`, `#1c2027`) and `rgb(233 228 216 / 22%)` become surface and text tokens
    - _Requirements: 5.3_
  - [ ] 4.2 `web/src/styles/app.css`: `.button`, `.banner` and `.screen` become `ui-button`, `ui-notice` and `ui-panel` in the screens that use them; `.button`'s 4 px corner becomes `--radius-md`
    - _Requirements: 5.3_
  - [ ] 4.3 `web/src/app/screens/*`, `web/src/app/play/*`, `web/src/app/create/*`, `web/src/app/haunt/*`: the same, screen by screen
    - _Requirements: 5.2, 5.3_
  - [ ] 4.4 Move the 11 puzzle phone screens (`pz-` classes) onto `ui-button`, `ui-panel`, `ui-status` and the spacing tokens; keep their 48 px targets (`--pz-target`)
    - _Requirements: 5.3_

- [x] 5. Specs and steering
  - [x] 5.1 `.kiro/steering/design-system.md`, `visual-style.md` and `structure.md` updated
    - _Requirements: 6.2_
  - [x] 5.2 A "Shared look" requirement, a design section and a task in each spec that has a screen
    - _Requirements: 6.1_
  - [x] 5.3 Every spec folder is a screen spec or says why it has no screen; the test fails for a new folder that is neither; the five specs that had a screen part and no Shared look (`world-pipeline`, `conditions`, `ghost-engine`, `errands`, `world-clues`) now carry it
    - _Requirements: 6.1, 6.3, 6.4_

- [ ] 6. Checkpoint
  - Run `pnpm check-tokens`, `node tools/check-traceability.mjs`, `node --test tools/test/design-tokens.test.mjs tools/test/design-system.test.mjs tools/test/voice-demo.test.mjs`, `pnpm --filter web test` and `pnpm typecheck`; open `/design/` and the play-through on a real phone. Open: tasks 4.1 to 4.4.
