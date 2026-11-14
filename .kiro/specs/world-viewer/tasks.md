# Implementation Plan

Depends on `world-pipeline` task 1.1 (real fixtures) and task 3.14 (manifest). Pure logic first, then glue.

- [ ] 1. Spike: render a real splat in three + Spark
  - Load a fixture World Bundle in a bare page. Record in `docs/spikes/2.1.md`: Spark version and API for opacity/recolor/LOD, orientation and scale of a real world, spawn defaults, frame rate on an integrated-GPU laptop and a mid-range phone at each LOD, whether the Collider GLB needs Draco/Meshopt decoders.
  - _Requirements: 1.4, 5.1_

- [ ] 2. Pure viewer logic (`shared/src/viewer/`)
  - [ ] 2.1 `orientationTransform`
    - _Requirements: 1.4_
  - [ ]* 2.2 Write property test for orientation
    - **Property 1: Orientation maps up to +Y and preserves handedness**
    - **Validates: Requirements 1.4**
  - [ ] 2.3 `stepMovement` and `constrainToDisc`
    - _Requirements: 2.3, 2.5, 2.6_
  - [ ]* 2.4 Write property test for movement
    - **Property 2: Movement stays in bounds, never exceeds speed, and is frame-rate independent**
    - **Validates: Requirements 2.3, 2.6**
  - [ ]* 2.5 Write property test for disc fallback
    - **Property 4: Disc fallback confines and holds height**
    - **Validates: Requirements 2.5**
  - [ ] 2.6 `flicker`
    - _Requirements: 3.2, 6.2_
  - [ ]* 2.7 Write property test for flicker
    - **Property 5: Flicker is bounded and off under reduced motion**
    - **Validates: Requirements 3.2, 6.2**
  - [ ] 2.8 `orbIntensity` and `ghostPlacement`
    - _Requirements: 3.3, 3.4_
  - [ ]* 2.9 Write property test for orb intensity
    - **Property 6: Orb intensity is monotone and zero when found**
    - **Validates: Requirements 3.3**
  - [ ]* 2.10 Write property test for ghost placement
    - **Property 7: Ghost placement keeps distance and bounds**
    - **Validates: Requirements 3.4**
  - [ ] 2.11 `nextQuality` and `chooseLod`
    - _Requirements: 1.1, 5.2_
  - [ ]* 2.12 Write property test for quality control
    - **Property 8: Quality control obeys its timing rules**
    - **Validates: Requirements 5.2**
  - [ ]* 2.13 Write property test for LOD choice
    - **Property 10: LOD choice is available and monotone**
    - **Validates: Requirements 1.1**
  - [ ] 2.14 `inputReduce` and `layoutMemoryCard`
    - _Requirements: 4.2, 7.1_
  - [ ]* 2.15 Write property test for input mode
    - **Property 9: Chat mode suspends movement**
    - **Validates: Requirements 4.2**
  - [ ]* 2.16 Write property test for the memory card
    - **Property 11: Memory card contains exactly the found memories**
    - **Validates: Requirements 7.1**
  - [ ] 2.17 `atmosphereParams` and `tiltLook`
    - _Requirements: 3.6, 8.1_
  - [ ]* 2.18 Write property test for atmosphere and tilt
    - **Property 12: Atmosphere and tilt are bounded and never touch movement**
    - **Validates: Requirements 3.6, 8.1**

- [ ] 3. Loader and fallbacks
  - [ ] 3.1 `WorldLoader`: manifest fetch, LOD choice, progress stages, retry ×2 with backoff, orientation applied, spawn placed
    - _Requirements: 1.1, 1.3, 1.4_
  - [ ] 3.2 WebGL2 / Spark capability check and `PanoFallback` (pano → thumbnail ladder), chat still mounted
    - _Requirements: 1.2_

- [ ] 4. Player controls and collision
  - [ ] 4.1 Desktop controls: pointer lock, WASD/arrows, Shift, Esc
    - _Requirements: 2.1_
  - [ ] 4.2 Touch controls: movement stick, look drag, scroll/zoom prevention
    - _Requirements: 2.2_
  - [ ] 4.3 `CollisionWorld`: build BVH from Collider, capsule resolve, floor snap, slope limit; disc fallback when absent; last-safe-position reset
    - _Requirements: 2.3, 2.4, 2.5, 2.6_
  - [ ]* 4.4 Write property test for collision
    - **Property 3: Collision resolution never leaves the player inside geometry**
    - **Validates: Requirements 2.4**
  - [ ] 4.5 Tilt to look on phones: one motion-permission tap, a calibration tap, wobble threshold, drag-to-look as the fallback, movement and collision untouched
    - _Requirements: 8.1_

- [ ] 5. Haunt layer
  - [ ] 5.1 Grade overlay (desaturate, vignette, grain, dim) driven by Haunt Level with smoothing
    - _Requirements: 3.1_
  - [ ] 5.2 Flicker applied to the brightness uniform; reduced-motion switch
    - _Requirements: 3.2, 6.2_
  - [ ] 5.3 Orbs (additive sprites) with proximity pulse; fade on found
    - _Requirements: 3.3_
  - [ ] 5.4 Ghost billboard (alpha-tested sprite, y-locked) with bob and fade
    - _Requirements: 3.4_
  - [ ] 5.5 Procedural ambient audio with mute and ducking (optional stretch)
    - _Requirements: 3.5_
  - [ ] 5.6 Atmosphere from `setAtmosphere`: tint and fog by weather class and time of day, capped rain or snow, sky dome from the star texture at dusk and night (the `conditions` spec supplies the snapshot and the texture)
    - _Requirements: 3.6_

- [ ] 6. HUD and interaction
  - [ ] 6.1 Interaction prompt, memory counter, journal button, Exit control
    - _Requirements: 4.1, 4.3, 4.4_
  - [ ] 6.2 `InputRouter` integration: chat open releases pointer lock and suspends movement
    - _Requirements: 4.2_
  - [ ] 6.3 `ViewerBridge` to the ghost engine (pose ≤ 4 Hz, haunt level, found ids, ghost visibility, `setAtmosphere`), importing its messages from `shared/src/app/events.ts`
    - _Requirements: 3.3, 3.4, 3.6, 4.1_

- [ ] 7. Performance
  - [ ] 7.1 `QualityController` wired to render loop; resolution scale and LOD switching; `?debug=1` overlay
    - _Requirements: 5.1, 5.2_
  - [ ] 7.2 Pause when hidden; dispose geometries, textures, listeners on unmount
    - _Requirements: 5.3, 5.4_

- [ ] 8. Accessibility and safety
  - [ ] 8.1 Content notice with acknowledgement; keyboard-only path; focus rings; contrast check of HUD tokens
    - _Requirements: 6.1, 6.3, 6.5_
  - [ ] 8.2 Live region for ghost speech; captions for any audio
    - _Requirements: 6.4_

- [ ] 9. Memory card
  - Render `layoutMemoryCard` to a canvas PNG with download button; strip any metadata (canvas export has none).
  - _Requirements: 7.1_

- [ ] 10. Checkpoint
  - Run tests, typecheck, `node tools/check-traceability.mjs`; complete the manual perf checklist; ask the user if questions arise.
