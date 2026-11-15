# Implementation Plan

Depends on `party-mode` (the Public View and Private View, the pool, the Seat Portraits and `seatLook`, the Controller settings and the solo-case rule) and on `puzzles` (the Spirit clues of Requirement 15 and their camera rules). Nothing here is paid, so no task needs a SpendTicket and no test calls a model, a sensor, a camera or the network. The mockup `tools/playtest/ar.html` already shows the look; the real code is built from this spec.

Order: the spike on real phones, then the pure logic with property tests, then the phone drawing, then the Controller wiring, then the checks.

Cut order if time runs short, first to last: the Solution lighting at the end (3.3), the Cold Spot glow and the Whisper's tour (2.4), the Table list's extras, the camera backdrop (5.x), the whole Spirit table. The Spirit lens stays.

- [ ] 1. Spike (record in `docs/spikes/spirit-table-1.md`)
  - [x] 1.1 Mockup of the Table, the standees, the Whisper, the Marks, the camera opt-in and the controls, with a guard test
    - Built in `tools/playtest/ar.html`, `js/ar.js`, `css/ar.css` and `test/ar.test.js`, live on the playtest site. Sample data; it differs from this spec where the design says so.
    - _Requirements: 2.5, 4.2, 4.3, 5.1_
  - [ ] 1.2 Spike spirit-table 1.1: on a real Android phone and a real iPhone (Safari and the installed web app), with and without the camera: drift over 30 seconds, whether Place is enough, the comfortable size and distance, thumb targets, battery and warmth over 20 minutes at 30 frames a second, and the camera prompt in the installed app
    - _Requirements: 4.1, 4.2, 4.4, 5.1, 6.1_

- [ ] 2. Pure logic (`shared/src/table/`)
  - [ ] 2.1 `data.ts`: `tableData(publicView, privateView, notebook)` (rooms, Pawns from the log, the Line-up, the Shelf, Marks, inspected Zones, the Cold Spot, the Haunt, the Solution only at the end)
    - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3_
  - [ ] 2.2 **Property 1: The table reads only what the phone may already see**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [ ] 2.3 `layout.ts`: `tableLayout(roomCode, zones)` (a seeded shuffle by a hash of the Room Code, never the Room seed)
    - _Requirements: 2.1, 2.3_
  - [ ] 2.4 **Property 2: The layout is the same everywhere and says nothing**
    - **Validates: Requirements 2.1, 2.3**
  - [ ] 2.5 `pawns.ts`: `pawnsOf(publicView)` (the newest public event's Zone, the door, `mono` for a Poltergeist, the ring on the Turn seat)
    - _Requirements: 2.2_
  - [ ] 2.6 **Property 3: Pawns stand where the public log says**
    - **Validates: Requirements 2.2**
  - [ ] 2.7 `whisper.ts`: `whisperAt(roomCode, zones, coldSpot, haunt, tMs, reducedMotion)`
    - _Requirements: 2.4_
  - [ ] 2.8 **Property 4: The Whisper's tour reads nothing hidden**
    - **Validates: Requirements 2.4**
  - [ ] 2.9 `place.ts`: `placeTable(dir, lastHeading)`
    - _Requirements: 4.1_
  - [ ] 2.10 **Property 5: Place puts the table in front of the player**
    - **Validates: Requirements 4.1**
  - [ ] 2.11 `plan.ts`: `tablePlan({sensors, faceDown, hidden, reducedMotion, webgl, now})` (30 frames a second, pause, drag, list, still)
    - _Requirements: 4.3, 6.1_
  - [ ] 2.12 **Property 6: The table obeys its limits**
    - **Validates: Requirements 4.3, 6.1**
  - [ ] 2.13 Source-level checks: nothing in `shared/src/table/` imports `party/solution`, a Hand, a Residue position or the Room seed, and nothing in it or `web/src/table/` sends a message or stores a Mark, a direction or a picture
    - _Requirements: 1.3, 3.1, 3.4_

- [ ] 3. The phone (`web/src/table/`)
  - [ ] 3.1 `SpiritTable.tsx`: the scene at real size (slab, six rooms with labels, low walls, standees that face the Player, the Whisper with a faded hem and mist, Mark tags with stems, the Cold Spot glow, the ring under a picked piece, the Place pulse), turned by the orientation sensor or by dragging, at most 30 frames a second, paused face down or hidden, still under reduced motion
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 4.1, 4.2, 4.3, 4.4, 6.1_
  - [ ] 3.2 `TableList.tsx` and the text labels for a screen reader (every room with its Pawns and the Player's Marks, every Suspect and Relic), the only view when WebGL is missing
    - _Requirements: 6.3_
  - [ ] 3.3 The backdrop: the dark stand-in table, and the camera in a video element under the canvas from the Camera tap only, with a visible indicator, a stop control, stop on close or hide, and one line of text on refusal
    - _Requirements: 5.1, 5.2_
  - [ ] 3.4 The row of four controls (Camera, Place, Tilt, Clues) and the piece card (48 pixel targets, one row at 320 pixels, shapes besides colour, tap picks a figure before the room beneath, a narrow tap area for the Whisper, the arrow to the board)
    - _Requirements: 2.6, 4.5, 4.6, 6.2_
  - [ ] 3.5 Controller wiring: the "Spirit table" device switch (off by default, with the motion tap, no Master control), absent in a solo case and with `SPIRIT_TABLE_ENABLED` false, a lazy chunk, nothing sent and no effect on any rule or the Turn Clock
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.4_
  - [ ] 3.6 Hang the Clue ring of `puzzles` round the same viewpoint, and show the count of read clues on the Clues control
    - _Requirements: 7.1_

- [ ] 4. Checks and docs
  - [ ] 4.1 Access pass: a jsdom pass of the Table list and the controls, and a real-browser pass at 320 by 568 and 390 by 844 CSS pixels (every control 48 pixels, one row, no sideways scroll, no console error)
    - _Requirements: 6.2, 6.3_
  - [ ] 4.2 Art budget check: every picture the Table loads is at most 120 kilobytes, cut-outs where they exist and a round card where not, and no spend, model call or new sound file
    - _Requirements: 2.5, 6.4_
  - [ ] 4.3 Docs: `docs/spikes/spirit-table-1.md`, assumptions T1 to T4 and `SPIRIT_TABLE_ENABLED` in `.kiro/steering/tech.md`, the folders in `structure.md`, the solo-case line and the Controller switch in `party-mode`, and a line in `docs/SUBMISSION.md`
    - _Requirements: 1.2, 6.4_
  - [ ] 4.4 Final checkpoint: run `node tools/check-traceability.mjs`, the whole test suite and a mutation pass on `tableData`, `tableLayout`, `whisperAt` and `placeTable`. Ensure every test passes; ask the user if questions arise.

- [ ] 5. Shared look (added 2026-11-15, after the other tasks were numbered; satisfies Requirement 8 and the `design-system` spec)
  - [ ] 5.1 Build each screen of this spec from the elements in `design/catalogue.html`; its own style says only where things go
    - _Requirements: 8.1, 8.3_
  - [ ] 5.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 8.2_
  - [ ] 5.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 8.4_
  - [ ] 5.4 A screen already built moves onto the elements when it is next changed, in the same change (`design-system` task 4)
    - _Requirements: 8.1_
