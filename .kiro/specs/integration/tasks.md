# Implementation Plan

Order is fixed (Requirement 1). Task numbers in other specs are named in the text, for example "party-mode 2.35".

- [x] 0. Already built: party-mode 2.1 to 2.32 (lobby, deal, views, zones, notebook, turns, clock, suggestions, accusations), puzzles pure logic and all eleven screens, errands logic 1.x, world-clues placement 1.x
  - _Requirements: 1.1_

- [ ] 1. Phase 1: the last core rules (pure, in `shared/src/party/`)
  - [ ] 1.1 Residue and Inspect (party-mode `residue.ts`), Haunt Events with `fireEvent` and the four options (`haunt.ts`), the ending payload and Play again (party-mode 2.35, 2.36), Resolve and Eavesdrop
    - _Requirements: 1.1, 1.3_
  - [ ] 1.2 `soloSetup` and the Bot mind (party-mode Bot tasks, Properties 57 and 59)
    - _Requirements: 1.1, 4.1_
  - [ ] 1.3 Checkpoint: every party-mode property for these modules green
    - _Requirements: 1.2_

- [ ] 2. Phase 2: the Engine (`shared/src/party/engine.ts`)
  - [ ] 2.1 `RoomGameState`, `Action`, `Outbound`, `StepResult` and the protocol schemas (party-mode `protocol.ts`)
    - _Requirements: 2.1_
  - [ ] 2.2 `step` for the lobby, start, turns, Suggestions, the answer choice, Accusations, Inspect, the Haunt, alarms and Bots, calling only the rule modules
    - _Requirements: 2.1, 2.2, 2.4_
  - [ ] 2.3 **Property 1: The Engine is deterministic and refuses without change**
    - **Validates: Requirements 2.1, 2.2**
  - [ ] 2.4 **Property 2: No outbound message leaks**
    - **Validates: Requirements 2.3**
  - [ ] 2.5 **Property 3: One alarm is enough**
    - **Validates: Requirements 2.4, 3.1**
  - [ ] 2.6 Checkpoint: ten thousand random all-Bot games end, with no leak and no stuck alarm
    - _Requirements: 1.2, 2.3_

- [ ] 3. Phase 3: the Room server (`api/`)
  - [ ] 3.1 `PartyRoom` DO: sockets with the Hibernation API, token to `Who`, `step`, save before send, the one alarm (party-mode 4.1, 4.4)
    - _Requirements: 3.1, 3.3_
  - [ ] 3.2 `PartyDirectory` caps, rate limits, time to live and deletion; `/api/party` routes (party-mode 4.8, 4.10, 7)
    - _Requirements: 3.2_
  - [ ] 3.3 Bot runner by alarm with think time (party-mode 4.9)
    - _Requirements: 3.1_
  - [ ] 3.4 Checkpoint: a whole all-Bot game runs on the local server
    - _Requirements: 1.2_

- [ ] 4. Phase 4: the solo case (the first playable game)
  - [ ] 4.1 Back the Case screen's `HostPort` with a real Room via `soloSetup`; the visitor is the Master on the embedded pad; remove the stand-in
    - _Requirements: 4.1_
  - [ ] 4.2 The pad on the shared screen sends Controller messages; the Host view, the hand, notebook, suggest and seal screens on one page; the ending screen and Play again
    - _Requirements: 4.2_
  - [ ] 4.3 Gallery worlds and Preset Ghosts when nothing is contributed
    - _Requirements: 4.3_
  - [ ] 4.4 **Property 4: Every solo case ends**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [ ] 4.5 Checkpoint: a person plays a solo case from the Case screen to the ending on a laptop, with no phone and zero quota
    - _Requirements: 1.2, 4.2_

- [ ] 5. Phase 5: phones, with puzzles on Inspect
  - [ ] 5.1 Controller web app: join by code or QR, pad, hand, notebook, suggest, seal, answer choice (party-mode 9)
    - _Requirements: 1.1_
  - [ ] 5.2 Host page for party mode (party-mode 8); the Display stays optional
    - _Requirements: 1.1_
  - [ ] 5.3 Inspect opens a Lock on the phone through `PuzzleHost` at the Puzzle setting's level; a solved Lock gives the plain Inspect result; Bots and the shared pad get a plain Inspect (puzzles 3)
    - _Requirements: 5.1, 5.2_
  - [ ] 5.4 `PlatformKit.puzzleFeel` from the Controller's device settings; touch-only always works
    - _Requirements: 5.3_
  - [ ] 5.5 Checkpoint: two phones and a laptop play a party game with at least one puzzle solved on Inspect
    - _Requirements: 1.2_

- [ ] 6. Phase 6: Wander puzzles
  - [ ] 6.1 `PlaySession` Locks before memories with Skip, clues after earlier memories (puzzles 4)
    - _Requirements: 6.1_
  - [ ] 6.2 Wander with puzzles off is unchanged and makes no new paid call
    - _Requirements: 6.2_

- [ ] 7. Phase 7: the Optional layers
  - [ ] 7.1 Errands through the Engine (errands 2 and 3), behind the Errands switch
    - _Requirements: 7.1, 7.2_
  - [ ] 7.2 World Clues through the Engine and the Viewer (world-clues 2 to 4), behind the Clue place setting
    - _Requirements: 7.1, 7.2_
  - [ ] 7.3 Nudges, Cues, Frames and the other party-mode layers, each behind its switch, in the party-mode cut order
    - _Requirements: 7.1, 7.3_
  - [ ] 7.4 **Property 5: Optional layers change nothing when off**
    - **Validates: Requirements 7.1**
