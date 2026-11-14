# Implementation Plan

Depends on `world-pipeline` tasks 1.2 (Workers AI behaviour), 4.1 (SpendGuard) and 5.2 (WorkersAiClient).

- [ ] 1. Shared logic (`shared/src/creator/`)
  - [ ] 1.1 `TraitsSchema`, `defaultTraits`, `randomTraits`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [ ]* 1.2 Write property test for trait validation
    - **Property 1: Trait validation accepts exactly the domain**
    - **Validates: Requirements 1.1, 1.5**
  - [ ]* 1.3 Write property test for randomise and default
    - **Property 2: Randomise and default always produce valid, stable traits**
    - **Validates: Requirements 1.3, 1.4**
  - [ ] 1.4 `sanitizeDetail`
    - _Requirements: 1.2, 2.1, 2.3_
  - [ ]* 1.5 Write property test for sanitisation
    - **Property 3: Sanitisation is idempotent and clean**
    - **Validates: Requirements 2.1, 2.3**
  - [ ] 1.6 `buildPortraitPrompt`
    - _Requirements: 3.1, 3.4, 2.3_
  - [ ]* 1.7 Write property test for prompt building
    - **Property 4: Portrait prompts are deterministic, bounded and contained**
    - **Validates: Requirements 3.1, 3.4, 2.3**
  - [ ] 1.8 `validateSprite`
    - _Requirements: 4.2_
  - [ ]* 1.9 Write property test for sprite validation
    - **Property 5: Sprite validation matches its thresholds**
    - **Validates: Requirements 4.2**
  - [ ] 1.10 `buildPersona` with curated name lists per era, rule tables per voice and temperament
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 1.11 Write property test for personas
    - **Property 6: Personas are deterministic and complete**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [ ] 1.12 Ghost Profile serialise/parse
    - _Requirements: 4.3, 6.2_
  - [ ]* 1.13 Write property test for profile round-trip
    - **Property 8: Ghost Profiles round-trip**
    - **Validates: Requirements 6.2, 4.3**

- [ ] 2. Presets
  - Produce six Preset Ghosts (sprites generated once with the Creator, cut out, committed under `web/public/ghosts/` with licence note) and `GET /api/ghosts/presets`.
  - _Requirements: 3.3, 4.2_

- [ ] 3. API
  - [ ] 3.1 `POST /api/ghosts/portraits`
    - Validate traits, sanitise, moderate non-empty detail through the guarded WorkersAiClient, Llama Guard 3 (fail closed), reserve `image`, request two candidates, return quota.
    - _Requirements: 1.5, 2.2, 3.1, 3.2_
  - [ ] 3.2 `POST /api/ghosts/sprite`
    - Background removal with Cloudflare Images `segment=foreground`, downscale to ≤ 768 px, validate, retry once with new seed, store RGBA PNG ≤ 1 MB, build Ghost Profile.
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 3.3 `GET /api/worlds/:id/ghost` and profile persistence
    - _Requirements: 6.2_
  - [ ]* 3.4 Write property test for failure handling
    - **Property 7: Failure never blocks the game**
    - **Validates: Requirements 3.3, 4.2**

- [ ] 4. Web UI
  - [ ] 4.1 `TraitForm`
    - Controls for all traits, free-text with counter and prompt, Randomise, three presets, field-level errors.
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - [ ] 4.2 Candidate picker
    - Two candidates, pick or regenerate, quota display, Preset Ghosts when exhausted or failed, skip option using the default ghost.
    - _Requirements: 1.4, 3.2, 3.3_
  - [ ] 4.3 Ghost presentation
    - Circular chat portrait with alt text, billboard texture hand-off to the Viewer, "meet your ghost" scripted line, restore on reload.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 5. Checkpoint
  - Run tests, typecheck, `node tools/check-traceability.mjs`; review three generated ghosts for tone; ask the user if questions arise.
