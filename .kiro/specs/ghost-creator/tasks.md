# Implementation Plan

Depends on `world-pipeline` tasks 1.2 (Workers AI behaviour), 4.1 (SpendGuard) and 5.2 (WorkersAiClient).

- [x] 1. Shared logic (`shared/src/creator/`)
  - [x] 1.1 `TraitsSchema`, `defaultTraits`, `randomTraits`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [x]* 1.2 Write property test for trait validation
    - **Property 1: Trait validation accepts exactly the domain**
    - **Validates: Requirements 1.1, 1.5**
  - [x]* 1.3 Write property test for randomise and default
    - **Property 2: Randomise and default always produce valid, stable traits**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 1.4 `sanitizeDetail`
    - _Requirements: 1.2, 2.1, 2.3_
  - [x]* 1.5 Write property test for sanitisation
    - **Property 3: Sanitisation is idempotent and clean**
    - **Validates: Requirements 2.1, 2.3**
  - [x] 1.6 `buildPortraitPrompt`
    - _Requirements: 3.1, 3.4, 2.3_
  - [x]* 1.7 Write property test for prompt building
    - **Property 4: Portrait prompts are deterministic, bounded and contained**
    - **Validates: Requirements 3.1, 3.4, 2.3**
  - [x] 1.8 `validateSprite`
    - _Requirements: 4.2_
  - [x]* 1.9 Write property test for sprite validation
    - **Property 5: Sprite validation matches its thresholds**
    - **Validates: Requirements 4.2**
  - [x] 1.10 `buildPersona` with curated name lists per era, rule tables per voice and temperament
    - _Requirements: 5.1, 5.2, 5.3_
  - [x]* 1.11 Write property test for personas
    - **Property 6: Personas are deterministic and complete**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [x] 1.12 Ghost Profile serialise/parse
    - _Requirements: 4.3, 6.2_
  - [x]* 1.13 Write property test for profile round-trip
    - **Property 8: Ghost Profiles round-trip**
    - **Validates: Requirements 6.2, 4.3**
  - Done (2026-11-17): `traits.ts`, `sanitize.ts`, `portrait-prompt.ts`, `sprite.ts`, `persona.ts` and `profile.ts` in `shared/src/creator/`, with Properties 1 to 6 and 8 in `creator.prop.test.ts` (generators in `creator.arb.ts`); three deliberate breakages caught. One reading of the design worth recording: a detail over 140 characters as sent is refused on `detail` rather than silently cut, and the profile id is a content hash, so the same ghost is the same id everywhere.

- [x] 2. Presets
  - Produce six Preset Ghosts and `GET /api/ghosts/presets`. The art is already made, one set of three crops per Suspect in `docs/story/art/` (colour by default, plus a black and white version and a transparent cut-out of each); ship the colour cut-out as `spriteUrl` and the black and white one as `monoUrl`, compressed (WebP) under `web/public/ghosts/` with a licence note. Give each Preset its `lodgerVoice`: Percy `mark`, Captain Thorne `conrad`, Dr. Pike `arjun`, Cora Bell `chloe`, Lady Vane `eleanor`, Mrs. Dunmore `victoria`.
  - _Requirements: 3.3, 4.2_
  - Done (2026-11-17): the made art lives in `tools/playtest/art/` (transparent colour cut-outs, 300 px wide); the colour WebP and a black-and-white version of each ship under `web/public/ghosts/` with `LICENCE.md` (alpha coverage 0.52 to 0.70, each at most 36 KB). The six profiles are authored in `shared/src/creator/presets.ts` (traits from the characters in `docs/story/CHARACTERS.md`, persona built then named, locked Lodger Voices) and listed by `GET /api/ghosts/presets` with the Gallery's public footing.

- [x] 3. API
  - [x] 3.1 `POST /api/ghosts/portraits`
    - Validate traits, sanitise, moderate non-empty detail through the guarded WorkersAiClient, Llama Guard 3 (fail closed), reserve `image`, request two candidates, return quota.
    - _Requirements: 1.5, 2.2, 3.1, 3.2_
  - [x] 3.2 `POST /api/ghosts/sprite`
    - Background removal with Cloudflare Images `segment=foreground`, downscale to ≤ 768 px, validate, retry once with new seed, store RGBA PNG ≤ 1 MB, build Ghost Profile.
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 3.3 `GET /api/worlds/:id/ghost` and profile persistence
    - _Requirements: 6.2_
  - [x]* 3.4 Write property test for failure handling
    - **Property 7: Failure never blocks the game**
    - **Validates: Requirements 3.3, 4.2**
  - Done (2026-11-17) over fakes: `api/src/creator/{service,store}.ts` behind the guarded doors (new text-to-image door in `guarded/workersai/image.ts`, `WorkersAiClient.portraitist`), routes in `api/src/routes/ghosts.ts`, mounted in the Worker when the bindings exist. The sprite step validates through the guarded cut-out door and `validateSprite`, retries once with a new seed, and falls back to a deterministic Preset. The shell reads `GET /api/worlds/:id/ghost` as a small portrait view (`GhostProfileView`).

- [x] 4. Web UI
  - [x] 4.1 `TraitForm`
    - Controls for all traits, free-text with counter and prompt, Randomise, three presets, field-level errors.
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - [x] 4.2 Candidate picker
    - Two candidates, pick or regenerate, quota display, Preset Ghosts when exhausted or failed, skip option using the default ghost.
    - _Requirements: 1.4, 3.2, 3.3_
  - [x] 4.3 Ghost presentation
    - Circular chat portrait with alt text, billboard texture hand-off to the Viewer, "meet your ghost" scripted line, restore on reload.
    - _Requirements: 6.1, 6.2, 6.3_
  - Done (2026-11-17): `web/src/app/haunt/creator-ui.tsx` is the real Creator behind the shell seam (the demo keeps the stand-in). Play asks the world for its ghost when memory holds no picture, so a made ghost's sprite is the chat portrait; the Viewer fetches the same profile and swaps its billboard texture to the sprite. Restore is the Creator opening on the ghost already made.

- [ ] 5. Checkpoint
  - Run tests, typecheck, `node tools/check-traceability.mjs`; review three generated ghosts for tone; ask the user if questions arise.
  - **Run 2026-11-21 night, left open for one step:** tests pass (`shared` creator 8, `api` creator and ghost routes 3, `web` haunt screens 33; the full suites pass: `shared` 1908, `api` 1199, `web` 1469), `node tools/check-traceability.mjs` prints OK, typecheck matches the main checkout. NOT done: the review of three generated ghosts. A generated ghost needs the Workers AI portrait model (a paid call), which is not allowed overnight. The part that needs no model was read instead, for three seeded trait sets (`randomTraits` 11, 222, 3333 through `buildPersona` and `buildPortraitPrompt`). Tone notes for the owner: (1) the `soft` voice's rule says "say so sweetly", and the portrait prompt says "gentle and not frightening"; the project's ghost narration is horror told calmly, not sweet, so these two lines pull the other way and are worth a decision; (2) every persona gets the same first two rules ("Speak airily ... the menace is implied and never carried out", "Name one small, odd, exact thing and end on it"), which is good, but the third to fifth differ only by temperament and relation, so two ghosts of the same temperament read alike; (3) the prompts name no artist, title or living person; (4) the era names (Terry, Martin, Hank) are plain and fit.

- [x] 6. Shared look (added 2026-11-15, after the other tasks were numbered; satisfies Requirement 7 and the `design-system` spec)
  - [x] 6.1 Build each screen of this spec from the elements in `design/catalogue.html`; its own style says only where things go
    - _Requirements: 7.1, 7.3_
  - [x] 6.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 7.2_
  - [x] 6.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 7.4_
  - [x] 6.4 A screen already built moves onto the elements when it is next changed, in the same change (`design-system` task 4)
    - _Requirements: 7.1_
  - Done (2026-11-17): the Creator is built from `ui-card`, `ui-field`, `ui-select`, `ui-range`, `ui-check`, `ui-portrait` and one `ui-button--primary`; checked headless at 390 and 1280 px (every control at least 44 px, no horizontal overflow inside `ui-page`). One elements fix rode along: a field's children may shrink, so a range track fits its column at phone widths.
