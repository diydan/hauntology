# Implementation Plan

Depends on `puzzles` (the Secret knock Kind, `makeLock`, `judgeKnock`, the shared actions of Requirement 25) and `party-mode` (the Room, the Zones, the Turn, the Haunt). Pure logic first, then the Room, then what the screens show.

- [x] 1. Door logic (`shared/src/party/doors.ts`)
  - [x] 1.1 Types, `doorProblems` and `validateDoors`
    - _Requirements: 1.1, 1.2, 1.3_
  - [x]* 1.2 Write property test for the manifest check
    - **Property 1: A door list is valid, or it is refused with a reason**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [x] 1.3 `initialDoors`, `openDoor`, `failKnock`, `shutDoor`, `tickRound`, `reachableZones`, `zonesBehind`
    - _Requirements: 2.2, 2.3, 2.5, 2.6_
  - [x]* 1.4 Write property test for the start state
    - **Property 2: Doors start by the puzzle setting**
    - **Validates: Requirements 2.2**
  - [x]* 1.5 Write property test for closed Zones
    - **Property 3: A shut door closes only what lies behind it**
    - **Validates: Requirements 2.3**
  - [x] 1.6 `doorKnock`
    - _Requirements: 3.1_
  - [x]* 1.7 Write property test for the knock lock
    - **Property 4: The lock comes from the Room seed and the door id only**
    - **Validates: Requirements 3.1**
  - [x] 1.8 `heavyNeed`, `liveActs`, `actCount`, `actsTogether`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 1.9 Write property test for the Player cap
    - **Property 5: A door never asks for more Players than are seated**
    - **Validates: Requirements 4.2**
  - [x]* 1.10 Write property test for the act count
    - **Property 6: Acts count each Player once inside the window**
    - **Validates: Requirements 4.1, 4.3**
  - [x] 1.11 `canSlam` and `slamTargets`
    - _Requirements: 5.2, 5.4_
  - [x]* 1.12 Write property test for the Slam rule
    - **Property 7: A Slam shuts only an open door that nobody stands behind**
    - **Validates: Requirements 2.6, 5.2, 5.4**
  - Progress (2026-11-17): done, 21 tests in `shared/src/party/doors.test.ts`. Mutation checks on the route check, the Player cap, the act count, the Slam rule, the puzzles-off rule and the seed rule are NOT yet run.

- [ ] 2. Room wiring (`shared/src/party/`, `api/`)
  - [x] 2.1 Keep `{ doors, acts }` in the Room's storage; a stored value that does not parse falls back to the start
    - _Requirements: 8.1_
  - [x] 2.2 Messages `door`, `doorKnock` and `doorAct` in `protocol.ts`: validated by the socket protocol and counted by the per-socket rate limit, a refused one changes nothing and gets a code; `doorKnock` only on the sender's own Turn
    - _Requirements: 8.2_
  - [x] 2.3 `welcome` carries the state of every door
    - _Requirements: 8.4_
  - [x] 2.4 The knock pattern goes only to the one phone that hears it, as the Sight, and never in `door`
    - _Requirements: 8.3, 3.2_
  - [x] 2.5 Reduce door changes with the pure functions only; the Durable Object stores and sends
    - _Requirements: 8.5, 2.1_
  - [x] 2.6 The start of a Round calls `tickRound`
    - _Requirements: 2.6_
  - Progress (2026-11-17): 2.1 to 2.6 are in `shared/src/party/` (`doors.ts`, `engine.ts`, `protocol.ts`, `server.ts`, `bot.ts`) with `doors-engine.test.ts` and new tests in `doors.test.ts` and `server.test.ts`. The Durable Object in `api/` is untouched: the Room core already saves the whole Engine state as one text, so the doors persist with it. 2.7 is half done: the check, the fallback and the reasons are built (`createEngine({ doors })`, `Ports.doors()`), but the Room has no world pick yet, so nothing feeds a real world's doors in, and the Master is not told in words (that is UI). 2.8 is half done: a walk into a closed Zone is refused and Bots avoid them, but Lock placement (`placePuzzles`) is unchanged.
  - [ ] 2.7 When the Master picks the world, check its doors with the Zones; a world that fails is played with no doors and the Master is told why; a door never holds a card or a clue answer
    - _Requirements: 1.4, 1.5_
  - [ ] 2.8 The Turn picker and Lock placement use `reachableZones`, so a Zone behind a shut door is not offered
    - _Requirements: 2.3_

- [ ] 3. Knock door in a Turn
  - [x] 3.1 A Detective's try goes to `judgeKnock` with the door's pattern; right opens the door for everyone
    - _Requirements: 3.3, 2.4_
  - [x] 3.2 Wrong tries say what was heard and never the answer; three wrong tries call `failKnock` and end the Turn with no other cost
    - _Requirements: 3.4, 3.5_
  - Progress (2026-11-17): 3.1, 3.2 and the Sight of 3.3 are in the Engine (`doorKnock`, `hearKnocks`) with tests; the Faded clue for a Detective who missed the Sight is not built.
  - [ ] 3.3 The ghost's knock is a Sight on one phone, and the Faded clue at the Lock when missed
    - _Requirements: 3.2_

- [ ] 4. Heavy door in the Room
  - [x] 4.1 `doorAct` appends an act; `actsTogether` with `heavyNeed` opens the door and clears the acts
    - _Requirements: 4.1, 4.2_
  - Progress (2026-11-17): 4.1 is in the Engine (`doorAct`) with tests; the public view and every `door` message carry `need` and `have`, so 4.2 only needs the screens.
  - [ ] 4.2 Every phone shows "n of need" in words and in the live region, with a control to act
    - _Requirements: 4.4_

- [ ] 5. Haunt Slam
  - [ ] 5.1 Add the `slam` option at threshold 6: offered only when `slamTargets` is not empty, puzzles are on and the Gentle preset is off
    - _Requirements: 5.1, 5.5_
  - [ ] 5.2 Count the Players behind each door with `zonesBehind`; shut the first target with `shutDoor`
    - _Requirements: 5.2_
  - [ ] 5.3 The ghost knocks a pattern at the TV for every Player; the first to knock it back gets Help
    - _Requirements: 5.3_

- [ ] 6. Wander door
  - [ ] 6.1 One door on the way to a memory, a Knock door or a Heavy door that asks for 1
    - _Requirements: 6.1_
  - [ ] 6.2 Skip always shown at the door: it opens at once, and says so in words
    - _Requirements: 6.2_

- [ ] 7. Spike: the collider box
  - [ ] 7.1 In a real Gallery world, put a box across a doorway and record in `docs/spikes/` whether the walker stops cleanly, slides, snags or steps through at speed
    - _Requirements: 9.1_

- [ ] 8. What the screens show
  - [ ] 8.1 The Viewer adds or removes the doorway box when a door changes
    - _Requirements: 9.1_
  - [ ] 8.2 The TV shows each door as a marker on the diorama, and swings it open or shut slowly with the `creak` sound; a Player is at a door within 1.5 m
    - _Requirements: 2.4, 9.2_
  - [ ] 8.3 Each phone runs `feel` for the change from its own place and facing
    - _Requirements: 2.4_
  - [ ] 8.4 A world with no doors loads and shows nothing for doors
    - _Requirements: 9.3_

- [ ] 9. Fairness and access pass
  - [ ] 9.1 Check that no door code reads or writes a card, the Solution, the Turn order, a score or the winners
    - _Requirements: 7.1_
  - [ ] 9.2 Every lock opens by touch alone (the Tap control, the control to act, Skip)
    - _Requirements: 7.2_
  - [ ] 9.3 No flash, reduced motion shows the final state, every change is words in the live region
    - _Requirements: 7.3, 2.5_

- [ ] 10. Checkpoint
  - Run `pnpm check-traceability`, the `shared` tests and the types; do the manual pass on the lab with two phones and the TV.
