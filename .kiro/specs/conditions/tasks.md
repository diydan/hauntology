# Implementation Plan

Depends on `world-viewer` 6.3 (ViewerBridge, which carries `setAtmosphere` per `world-viewer` criterion 3.6), `ghost-engine` 2.9 (`step`), 2.15 (`buildNarrationPrompt`), 2.17 (`validateGhostReply` and the scripted lines) and 3.1 (PlaySession start), `party-mode` Requirement 15.4 (the Master's choice and the Public View), and `haunwallker` 9.6 and 7.1 for the UI. Nothing here is paid, so no task needs a SpendTicket, and no test calls the real Open-Meteo.

Order: the spike first, then pure logic with property tests, then the API module, then the viewer. Cheapest first among the extras: build the sky dome (4.4, with group 6) before anything else optional; the ambient loops (4.3) are optional and come last. Tasks marked `*` are optional test tasks that should still be done before submission.

- [ ] 1. Spikes (record each in `docs/spikes/conditions-<n>.md`)
  - [ ] 1.1 Spike conditions 1.1: Open-Meteo from a Worker
    - Deploy a throwaway Worker that calls Open-Meteo geocoding (`count=5`, the fields returned, the time zone name), forecast (`current` weather code, temperature and wind, `timezone=auto`), sunrise and sunset (could they replace the fixed hour table), and the archive (back to 1940, hourly weather codes or daily only, the newest date that has data, how a missing date looks). Record p50 and p95 latency against the 3 second limit, the real weather-code table, the rate limits and what happens to many Workers sharing egress addresses, the attribution wording, and that the free tier is non-commercial only, so a paid plan is needed if the game is ever sold (record the paid plan's host and key handling). Check whether the Workers Cache API works on our host or KV is needed for the 15 minute cache. Save scrubbed answers in `shared/fixtures/weather/`.
    - Sensors: on a real iPhone, a real Android phone and a TV browser, record the `navigator.geolocation` prompt, denial and timeout behaviour; and whether a photo picked on iOS Safari and Android Chrome still carries `DateTimeOriginal` (HEIC conversion, stripped metadata).
    - Also check, with one real outdoor and one real indoor world, whether the sky behind the splat is visible for the sky dome. Write `docs/spikes/conditions-1.1.md`.
    - _Requirements: 2.3, 2.4, 2.5, 3.2_

- [ ] 2. Pure logic (`shared/src/conditions/`)
  - [x] 2.1 `types.ts`: types and zod schemas from the design (Place, TimeOfDay, WeatherClass, bands, MoonPhase, MemoryDay, SkyStar, ConditionsSnapshot, Atmosphere, PublicConditions, PromptFields); add `conditions_disabled`, `bad_place`, `bad_memory_day` and `geocode_unavailable` to `shared/src/errors.ts`
    - _Requirements: 2.2_
  - [ ] 2.2 `normalizePlace` and `normalizeMatches` (round to two decimals, drop every other field, at most five matches)
    - _Requirements: 1.1, 1.3_
  - [ ]* 2.3 Write property test for place privacy
    - **Property 1: A Place keeps only a position rounded to two decimals**
    - **Validates: Requirements 1.1, 1.3**
  - [ ] 2.4 `localHour`, `timeOfDay`, `REP_HOUR`, `defaultSnapshot`
    - _Requirements: 1.4_
  - [ ]* 2.5 Write property test for time of day
    - **Property 2: Every hour maps to exactly one time of day**
    - **Validates: Requirements 1.4**
  - [ ] 2.6 `weatherClassFromCode`, `tempBand`, `windBand`, `atmosphereLook`, `particleBudget`
    - _Requirements: 2.3, 4.2, 4.3_
  - [ ]* 2.7 Write property test for the weather mapping
    - **Property 3: Weather class and band mapping is total**
    - **Validates: Requirements 2.3, 4.2, 4.3**
  - [ ] 2.8 `moonPhase` and `moonAge` (eight phases, no service); known-value unit tests
    - _Requirements: 2.6_
  - [ ]* 2.9 Write property test for the moon
    - **Property 8: Moon phase is one of eight and cycles in order**
    - **Validates: Requirements 2.6**
  - [ ] 2.10 `validateMemoryDay` (1940 to yesterday, real calendar dates), `instantFor`, and the archive `WeatherRequest` builder
    - _Requirements: 3.1, 3.2_
  - [ ]* 2.11 Write property test for Memory Day
    - **Property 6: Memory Day stays in range and uses recorded weather**
    - **Validates: Requirements 3.1, 3.2**
  - [ ] 2.12 `readCaptureDate` (JPEG EXIF reader for `DateTimeOriginal` only; returns a date and a Time of Day or nothing; never throws)
    - _Requirements: 3.3_
  - [ ]* 2.13 Write property test for the photo timestamp reader
    - **Property 9: Photo timestamp reading keeps only the capture date**
    - **Validates: Requirements 3.3**
  - [ ] 2.14 `readSnapshot`, `freezeSnapshot`, `cacheKey`, `isFresh`, `toAtmosphere`, `toPromptFields`, `toPublicConditions` (clock, timer, fetch and cache injected; 3000 ms limit; never rejects)
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [ ]* 2.15 Write property test for one frozen snapshot
    - **Property 4: One frozen snapshot per game, one call, cached 15 minutes**
    - **Validates: Requirements 2.1, 2.5**
  - [ ]* 2.16 Write property test for the fallback
    - **Property 5: A timeout or failure falls back to the default**
    - **Validates: Requirements 2.4**

- [ ] 3. API (`api/src/conditions/`)
  - [ ] 3.1 `open-meteo.ts`: `geocode`, `forecast`, `archive`; the only module that calls an outside weather host; `AbortSignal.timeout(3000)`; `WEATHER_BASE_URL`; zod parse down to the fields used; counters only in logs; no upstream host in any answer
    - _Requirements: 1.1, 2.3, 2.4, 3.2_
  - [ ] 3.2 `cache.ts`: `ConditionsCache` over the Cache API or KV (as Spike 1.1 decides), TTL 15 minutes
    - _Requirements: 2.5_
  - [ ] 3.3 Snapshot store for `PlaySession` and `PartyRoom`: read once at start, store, return the stored Snapshot on every later read, include `atmosphere` in the client view, read again only for a new game
    - _Requirements: 2.1, 2.2, 4.1_
  - [ ] 3.4 Variables `CONDITIONS_ENABLED` (default `true`) and `WEATHER_BASE_URL`; off means the Default and no outside call, and a search answers `conditions_disabled`
    - _Requirements: 2.4_
  - [ ] 3.5 `POST /api/conditions/search`: origin and cookie checks, rate limit, query trimmed to 60 characters, at most five rounded matches, `geocode_unavailable` on failure
    - _Requirements: 1.1, 1.3_
  - [ ] 3.6 Privacy tests: nothing under `api/src/conditions/` reads `request.cf` location or logs a query, coordinates or label; no module outside `open-meteo.ts` names an Open-Meteo host; no answer carries an upstream host
    - _Requirements: 1.2, 1.3_
  - [ ] 3.7 `telemetry.ts` counter whitelist (reads, cache hits, timeouts, errors, defaults, geocode calls, geocode errors)
    - _Requirements: 2.4_

- [ ] 4. Atmosphere in the viewer (`web/src/viewer/atmosphere/`)
  - [ ] 4.1 Tint and fog: `setAtmosphere` applies `atmosphereLook` to the grade overlay uniforms (idempotent; `null` restores the normal look; storms add no flashes of their own)
    - _Requirements: 4.1, 4.2_
  - [ ] 4.2 Precipitation: instanced rain and snow capped by `particleBudget`; lower cap at quality level 1 or lower and under reduced motion (quarter speed)
    - _Requirements: 4.3_
  - [ ] 4.3 Optional ambient loops: up to 12 files `web/public/sounds/ambient/<weather>-<day|night>.m4a`, gain at most 0.3, started only after a user gesture, mute and chat ducking, a missing or undecodable file is skipped silently, every file credited in `docs/sounds/CREDITS.md`
    - _Requirements: 4.4_
  - [ ] 4.4 Sky dome using the Star Texture: a dome mesh behind the world; call `rasterizeSky` once per Atmosphere (never per frame); `DataTexture`; not added when visibility is zero; dispose on unmount; test that a thousand frames call it zero times
    - _Requirements: 6.2, 6.3_

- [ ] 5. Narrator and scripted lines
  - [ ] 5.1 Pass `toPromptFields(snapshot)` into `buildNarrationPrompt` (ghost-engine 2.15): one fixed sentence built from the three enums, none when the source is the Default; add one weather case per persona to ghost-engine Spike 4.1
    - _Requirements: 5.1_
  - [ ] 5.2 `mentionsRealWorld` word-stem list (news, crime, death, real events) wired into `validateGhostReply` (ghost-engine 2.17): a matching reply is replaced by a scripted line
    - _Requirements: 5.2_
  - [ ] 5.3 Scripted weather lines (per Weather Class and time bucket, at least five variants each) and star lines; `pickStarLine` names one star above 20 degrees at most once per game, with the flag kept in the narration record and not in game state
    - _Requirements: 5.2, 5.3_
  - [ ] 5.4 Red-team fixture for real events: 20 or more news, crime, death and real-event strings, and hostile place labels, through `validateGhostReply`, `buildNarrationPrompt` and the scripted library
    - _Requirements: 5.2_
  - [ ] 5.5 Rules stay free of conditions: a source-level test that `shared/src/ghost/engine.ts` and the Party Mode reducers do not import `shared/src/conditions/`; a model-based run of `step` with and without a Snapshot
    - _Requirements: 4.1, 5.1_
  - [ ]* 5.6 Write property test for the narrator prompt and scripted lines
    - **Property 11: Scripted lines and the narrator prompt carry no news, crime, death or real events**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [ ]* 5.7 Write property test for rules unchanged by the real world
    - **Property 7: The real world never changes a rule**
    - **Validates: Requirements 2.2, 4.1, 5.1**

- [ ] 6. Stars (`shared/src/conditions/`)
  - [ ] 6.1 `STAR_LIST`: at most 300 stars from a public-domain catalogue, brightest first, proper names where they exist; header records the source and licence (avoid share-alike catalogues); unit test for length, ranges and unique names
    - _Requirements: 6.1_
  - [ ] 6.2 `starsAbove` and `moonSky`: sidereal time, hour angle, altitude and azimuth, simple low-precision formulas; unit tests against a few known positions
    - _Requirements: 6.1_
  - [ ] 6.3 `skyVisibility` and `rasterizeSky`: RGBA buffer at most 1024 by 512 (512 by 256 at low quality), dimmed under cloud, empty in fog, rain, storm and snow, nothing at dawn or day
    - _Requirements: 6.2, 6.3_
  - [ ]* 6.4 Write property test for the star texture
    - **Property 10: Star texture bounds and dimming**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 7. Web: the sky panel
  - [ ] 7.1 City search: built under `.kiro/specs/haunwallker` task 9.6 (the Set the sky card on the Haunt screen) and task 7.1 (photo timestamp read before the re-encode); tick this line when those are done
    - _Requirements: 1.1_
  - [ ] 7.2 "Use this table's location" button, asked only on the tap and rounded in the browser: built under `.kiro/specs/haunwallker` task 9.6 (the Set the sky card on the Haunt screen) and task 7.1 (photo timestamp read before the re-encode); tick this line when those are done
    - _Requirements: 1.2_
  - [ ] 7.3 Memory Day picker (date from 1940 to yesterday, time of day): built under `.kiro/specs/haunwallker` task 9.6 (the Set the sky card on the Haunt screen) and task 7.1 (photo timestamp read before the re-encode); tick this line when those are done
    - _Requirements: 3.1_
  - [ ] 7.4 Photo timestamp suggestion, changeable and clearable: built under `.kiro/specs/haunwallker` task 9.6 (the Set the sky card on the Haunt screen) and task 7.1 (photo timestamp read before the re-encode); tick this line when those are done
    - _Requirements: 3.3_

- [ ] 8. Checkpoint
  - Run tests, typecheck, `node tools/check-traceability.mjs`; play one game with conditions off, one with a city, one with a Memory Day, and one with the weather call failing; confirm each looks right and that the game state is the same in all four; ask the user if questions arise.
