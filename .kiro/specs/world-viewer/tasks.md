# Implementation Plan

Depends on `world-pipeline` task 1.1 (real fixtures) and task 3.14 (manifest). Pure logic first, then glue.

- [ ] 1. Spike: render a real splat in three + Spark
  - Load a fixture World Bundle in a bare page. Record in `docs/spikes/2.1.md`: Spark version and API for opacity/recolor/LOD, orientation and scale of a real world, spawn defaults, frame rate on an integrated-GPU laptop and a mid-range phone at each LOD, whether the Collider GLB needs Draco/Meshopt decoders.
  - _Requirements: 1.4, 5.1_
  - Progress (2026-11-16): done except hardware frame rates, in `docs/spikes/2.1.md` with the recorded `marble-1.1` kitchen (bare page `tools/viewer-spike/`). Settled: Spark 2.4.0 + three 0.187.0; `opacity` and `recolor` hooks exist and work; `poseFromService` is confirmed by eye (upright, facing as the photo, floor under the spawn; without the fix the room is inverted); the Collider GLB needs no decoder. Owner hardware runs (2026-11-17, in `docs/spikes/2.1.md`): phone 120 / 54.0 / 37.0 / 49.4 fps at 100k / 150k / 500k / full; laptop 120.4 / 114.4 / 92.0 fps at 100k / 150k / 500k. Not done: laptop `full`, the last frame-rate number.

- [x] 2. Pure viewer logic (`shared/src/viewer/`)
  - [x] 2.1 `orientationTransform`
    - _Requirements: 1.4_
  - [x]* 2.2 Write property test for orientation
    - **Property 1: Orientation maps up to +Y and preserves handedness**
    - **Validates: Requirements 1.4**
  - [x] 2.3 `stepMovement` and `constrainToDisc`
    - _Requirements: 2.3, 2.5, 2.6_
  - [x]* 2.4 Write property test for movement
    - **Property 2: Movement stays in bounds, never exceeds speed, and is frame-rate independent**
    - **Validates: Requirements 2.3, 2.6**
  - [x]* 2.5 Write property test for disc fallback
    - **Property 4: Disc fallback confines and holds height**
    - **Validates: Requirements 2.5**
  - [x] 2.6 `flicker`
    - _Requirements: 3.2, 6.2_
  - [x]* 2.7 Write property test for flicker
    - **Property 5: Flicker is bounded and off under reduced motion**
    - **Validates: Requirements 3.2, 6.2**
  - [x] 2.8 `orbIntensity` and `ghostPlacement`
    - _Requirements: 3.3, 3.4_
  - [x]* 2.9 Write property test for orb intensity
    - **Property 6: Orb intensity is monotone and zero when found**
    - **Validates: Requirements 3.3**
  - [x]* 2.10 Write property test for ghost placement
    - **Property 7: Ghost placement keeps distance and bounds**
    - **Validates: Requirements 3.4**
  - [x] 2.11 `nextQuality` and `chooseLod`
    - _Requirements: 1.1, 5.2_
  - [x]* 2.12 Write property test for quality control
    - **Property 8: Quality control obeys its timing rules**
    - **Validates: Requirements 5.2**
  - [x]* 2.13 Write property test for LOD choice
    - **Property 10: LOD choice is available and monotone**
    - **Validates: Requirements 1.1**
  - [x] 2.14 `inputReduce` and `layoutMemoryCard`
    - _Requirements: 4.2, 7.1_
  - [x]* 2.15 Write property test for input mode
    - **Property 9: Chat mode suspends movement**
    - **Validates: Requirements 4.2**
  - [x]* 2.16 Write property test for the memory card
    - **Property 11: Memory card contains exactly the found memories**
    - **Validates: Requirements 7.1**
  - [x] 2.17 `atmosphereParams` and `tiltLook`
    - _Requirements: 3.6, 8.1_
  - [x]* 2.18 Write property test for atmosphere and tilt
    - **Property 12: Atmosphere and tilt are bounded and never touch movement**
    - **Validates: Requirements 3.6, 8.1**

- [ ] 3. Loader and fallbacks
  - [x] 3.1 `WorldLoader`: manifest fetch, LOD choice, progress stages, retry ×2 with backoff, orientation applied, spawn placed
    - _Requirements: 1.1, 1.3, 1.4_
    - Done (2026-11-16): `loadWorld` in `shared/src/viewer/loader.ts` over injected ports (`fetchManifest`, `fetchAsset`, `initSplat`, `sleep`), so the whole ladder is tested over fakes in `loader.test.ts` (6 tests, 4 deliberate breakages caught): the manifest is validated with `WorldManifestSchema`, the LOD comes from `chooseLod`, stages are labelled (`LOAD_STAGE_LABELS`), a failed collider is a warning, not a stop.
  - [ ] 3.2 WebGL2 / Spark capability check and `PanoFallback` (pano → thumbnail ladder), chat still mounted
    - _Requirements: 1.2_
    - Progress (2026-11-16): the decision half is in `loadWorld`: no WebGL2, or the splat start failing, gives the pano rung, then the thumbnail, then a fatal code; the shell keeps the Chat at every rung (it only receives a `degraded` message). Not done: reading real device capabilities in the browser and drawing the panorama — both wait on task 1, which picks the Spark and three versions.

- [x] 4. Player controls and collision
  - [x] 4.1 Desktop controls: pointer lock, WASD/arrows, Shift, Esc
    - _Requirements: 2.1_
  - [x] 4.2 Touch controls: movement stick, look drag, scroll/zoom prevention
    - _Requirements: 2.2_
  - [x] 4.3 `CollisionWorld`: build BVH from Collider, capsule resolve, floor snap, slope limit; disc fallback when absent; last-safe-position reset
    - _Requirements: 2.3, 2.4, 2.5, 2.6_
  - [x]* 4.4 Write property test for collision
    - **Property 3: Collision resolution never leaves the player inside geometry**
    - **Validates: Requirements 2.4**
  - [x] 4.5 Tilt to look on phones: one motion-permission tap, a calibration tap, wobble threshold, drag-to-look as the fallback, movement and collision untouched
    - _Requirements: 8.1_
  - Done (2026-11-16): the real Viewer mounts behind the shell seam (`web/src/app/viewer/mount.ts`, the default `LoadViewer`; the demo keeps the stand-in). Controls mapping is pure and tested (`controls.ts`); collision is a BVH capsule with floor snap and the 35 degree slope limit (`collision.ts`, Property 3 over generated rooms); tilt uses the pure `tiltLook`. Deps pinned by Spike 2.1: three 0.187.0, Spark 2.4.0, three-mesh-bvh 0.9.18. Verified headless end to end with the recorded kitchen world served through intercepted routes: spawn upright, W walks forward at the clamped rate, poses flow at 4 Hz. Two build notes: Spark's console.log calls are rewritten out of its module at build (Requirement 9.5), and the bundle test's Viewer marker and the demo platform keys were updated for the real Viewer.

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

- [ ] 11. Shared look (added 2026-11-15, after the other tasks were numbered; satisfies Requirement 9 and the `design-system` spec)
  - [ ] 11.1 Build each screen of this spec from the elements in `design/catalogue.html`; its own style says only where things go
    - _Requirements: 9.1, 9.3_
  - [ ] 11.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 9.2_
  - [ ] 11.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 9.4_
  - [ ] 11.4 A screen already built moves onto the elements when it is next changed, in the same change (`design-system` task 4)
    - _Requirements: 9.1_
