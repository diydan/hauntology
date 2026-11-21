# Implementation Plan

Order is fixed (Requirement 1). Task numbers in other specs are named in the text, for example "party-mode 2.35".

- [x] 0. Already built: party-mode 2.1 to 2.32 (lobby, deal, views, zones, notebook, turns, clock, suggestions, accusations), puzzles pure logic and all eleven screens, errands logic 1.x, world-clues placement 1.x
  - _Requirements: 1.1_

- [x] 1. Phase 1: the last core rules (pure, in `shared/src/party/`)
  - [x] 1.1 Residue and Inspect (party-mode `residue.ts`), Haunt Events with `fireEvent` and the four options (`haunt.ts`), the ending payload and Play again (party-mode 2.35, 2.36), Resolve and Eavesdrop
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 `soloSetup` and the Bot mind (party-mode Bot tasks, Properties 57 and 59)
    - _Requirements: 1.1, 4.1_
  - [x] 1.3 Checkpoint: every party-mode property for these modules green
    - _Requirements: 1.2_

- [ ] 2. Phase 2: the Engine (`shared/src/party/engine.ts`)
  - [x] 2.1 (Built: `shared/src/party/engine.ts` exports `EngineState` (the design's `RoomGameState`), `Action`, `Outbound`, `StepResult`; `shared/src/party/protocol.ts` has `ClientMsgSchema` for client messages; server messages are typed by `Outbound` only, with no server-side zod schema) `RoomGameState`, `Action`, `Outbound`, `StepResult` and the protocol schemas (party-mode `protocol.ts`)
    - _Requirements: 2.1_
  - [ ] 2.2 (core loop done in `shared/src/party/engine.ts`: start, Turns, walk, plain Inspect, Suggestions with the answer choice, Accusations, the clock, Round end, Haunt Events, ending, Bots, Eavesdrop, Nudges with every limit, the Master pause, Cues, Frames, House Cues on every Haunt Event, sound consent, reconnects (20 s grace, the two-miss skip, the Master hand-over after 60 s); presets and switches from the Master, Locks on a human's Inspect (Sights on entering a Zone, Attempts, give-up, the Cap, the Turn end, Plain Inspect, the level rising with the Haunt); still to add: Haunting puzzles, Bots that Eavesdrop) `step` for the lobby, start, turns, Suggestions, the answer choice, Accusations, Inspect, the Haunt, alarms and Bots, calling only the rule modules
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 2.3 **Property 1: The Engine is deterministic and refuses without change**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 2.4 **Property 2: No outbound message leaks**
    - **Validates: Requirements 2.3**
  - [x] 2.5 **Property 3: One alarm is enough**
    - **Validates: Requirements 2.4, 3.1**
  - [x] 2.6 (Built: `shared/src/party/engine.prop.test.ts`, opt-in `HAUNT_CHECKPOINT_10K=1`: 10,000 seeded all-Bot games, 2 to 6 seats, hauntMax 8/10/12; 0 leaks, 0 stuck alarms, 0 unended; 92 s run on 2026-11-21) Checkpoint: ten thousand random all-Bot games end, with no leak and no stuck alarm
    - _Requirements: 1.2, 2.3_

- [x] 3. Phase 3: the Room server (`api/`)
  - [x] 3.1 (`RoomCore` in `shared/src/party/server.ts` holds the logic, tested with fake ports; `api/src/do/party-room.ts` plugs in hibernating sockets, storage and the alarm) `PartyRoom` DO: sockets with the Hibernation API, token to `Who`, `step`, save before send, the one alarm (party-mode 4.1, 4.4)
    - _Requirements: 3.1, 3.3_
  - [x] 3.2 (`api/src/do/party-directory.ts` and `api/src/routes/party.ts`, mounted at `/api/party` in `app.ts`, both objects bound in `worker.ts` and `wrangler.jsonc` (migration `v3`); `shared/src/party/protocol.ts` checks every message; limits: 20 join attempts a minute per hashed IP, 40 messages a second per socket; `PARTY_ENABLED` off answers `party_disabled`; an ended Room frees its directory place, and an entry is dropped after a day. Smoke run under `wrangler dev` on 2026-11-15: create, join, sockets, start, privacy, end) `PartyDirectory` caps, rate limits, time to live and deletion; `/api/party` routes (party-mode 4.8, 4.10, 7)
    - _Requirements: 3.2_
  - [x] 3.3 (think time 1.5 to 6 s in the Engine, run by the Room's alarm; tested in `server.test.ts`: three whole all-Bot games end on the alarm alone, no Bot moves sooner than 1.5 s) Bot runner by alarm with think time (party-mode 4.9)
    - _Requirements: 3.1_
  - [x] 3.4 (2026-11-15 under `wrangler dev`: four Bots started by the host's `startBots` played to the ending in 8.3 minutes on the alarm alone, 102 messages to the TV and no private view among them; the same day a solo case through `startSolo` (seat 1 against two Bots, Quick) ended in 3 minutes and its Room was gone after Exit) Checkpoint: a whole all-Bot game runs on the local server
    - _Requirements: 1.2_

- [ ] 4. Phase 4: the solo case (the first playable game)
  - [ ] 4.1 (built: `web/src/app/case/room-client.ts` (`startSolo`: the Room, seat 1 as Master, the preset, the Bots, start; `replace` ends the visitor's old Room) and `host.tsx`, the default Host; the stand-in stays only for `?demo=1`; still to do: the world-size check of `soloSetup` with the world's walk radius, with 4.3) Back the Case screen's `HostPort` with a real Room via `soloSetup`; the visitor is the Master on the embedded pad; remove the stand-in
    - _Requirements: 4.1_
  - [ ] 4.2 (started: the solo table in `host.tsx`: status, rooms, Search, Ask, End turn, Pass, show a card, the house's choice, the hand, the notebook, the accusation with a second press, the log and the ending with the answer; Play again is a Room message; puzzles are off until 5.3; the world view beside the table (`case-split`; it shows the Haunt rising through `apply_view`, and the case plays on without it); still to do: the full ending screen (party-mode 8.5) and the design pass) The pad on the shared screen sends Controller messages; the Host view, the hand, notebook, suggest and seal screens on one page; the ending screen and Play again
    - _Requirements: 4.2_
  - [ ] 4.3 Gallery worlds and Preset Ghosts when nothing is contributed
    - _Requirements: 4.3_
  - [x] 4.4 **Property 4: Every solo case ends**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ] 4.5 Checkpoint: a person plays a solo case from the Case screen to the ending on a laptop, with no phone and zero quota
    - _Requirements: 1.2, 4.2_

- [ ] 5. Phase 5: phones, with puzzles on Inspect
  - [ ] 5.1 Controller web app: join by code or QR, pad, hand, notebook, suggest, seal, answer choice (party-mode 9)
    - _Requirements: 1.1_
  - [ ] 5.2 Host page for party mode (party-mode 8); the Display stays optional
    - _Requirements: 1.1_
  - [ ] 5.3 Inspect opens a Lock on the phone through `PuzzleHost` at the Puzzle setting's level; a solved Lock gives the plain Inspect result; Bots get a plain Inspect; the solo case opens the Lock on the shared screen by touch or mouse; the level follows the Haunt (puzzles 3, 1.4)
    - _Requirements: 5.1, 5.2_
  - [ ] 5.4 `PlatformKit.puzzleFeel` from the Controller's device settings; touch-only always works
    - _Requirements: 5.3_
  - [ ] 5.5 Move the puzzle screens onto the design system as they join the game (`design-system` 4.1 and 4.4), in the same change: `--pz-space-1..4` become `--space-1..4` (same values); palette names (`--lantern`, `--ink`, `--dust`, `--bone`) become roles (`--accent`, `--surface-*`, `--line`, `--text`); the raw hex surfaces become surface tokens; `.pz-btn` becomes `ui-button` with one `ui-button--primary` per view (the puzzle's own Set or Check); the frame becomes `ui-panel` and the status line `ui-status`; fades use `--fade-quick`, `--fade` or `--fade-slow`; the 48 px puzzle targets stay (above the 44 px `--target`); the buzz and sound twin line stops using green (green is only the Whisper and the tick box) and uses quiet text; positions and turns stay set through React's style object (the CSSOM), never a `style=""` attribute in HTML; `spacing.test.ts` is moved to check the shared tokens
    - _Requirements: 5.3, 8.1, 8.2_
  - [ ] 5.7 Haunting puzzles for Players who joined the haunting: one per Round, Scare points only (puzzles 17)
    - _Requirements: 5.1_
  - [ ] 5.6 Checkpoint: two phones and a laptop play a party game with at least one puzzle solved on Inspect
    - _Requirements: 1.2_

- [ ] 6. Phase 6: Wander puzzles
  - [ ] 6.1 `PlaySession` Locks before memories with Skip, clues after earlier memories (puzzles 4)
    - _Requirements: 6.1_
  - [ ] 6.2 Wander with puzzles off is unchanged and makes no new paid call
    - _Requirements: 6.2_

- [ ] 7. Phase 7: the Optional layers
  - [x] 7.1 Errands through the Engine (errands 2 and 3), behind the Errands switch
    - _Requirements: 7.1, 7.2_
  - [x] 7.2 World Clues through the Engine and the Viewer (world-clues 2 to 4), behind the Clue place setting
    - _Requirements: 7.1, 7.2_
  - [ ] 7.3 Nudges, Cues, Frames and the other party-mode layers, each behind its switch, in the party-mode cut order
    - _Requirements: 7.1, 7.3_
  - [x] 7.4 **Property 5: Optional layers change nothing when off**
    - **Validates: Requirements 7.1**

- [ ] 8. Shared look (added 2026-11-15, after the other tasks were numbered; satisfies Requirement 8 and the `design-system` spec)
  - [ ] 8.1 Build each screen of this spec from the elements in `design/catalogue.html`; its own style says only where things go
    - _Requirements: 8.1, 8.3_
  - [ ] 8.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 8.2_
  - [ ] 8.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 8.4_
  - [ ] 8.4 A screen already built moves onto the elements when it is next changed, in the same change (`design-system` task 4)
    - _Requirements: 8.1_
