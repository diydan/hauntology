# Implementation Plan

- [x] 1. Placement in `shared/src/puzzles/world-clues.ts` (tests in `world-clues.test.ts`; Room, Viewer and Lock wiring wait for `PartyRoom`)
  - [x] 1.1 Signs, `decoyFor`, `placeWorldClues` (at most three real clues and three Decoys)
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 **Property 1: World clues are placed fairly**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [x] 1.3 **Property 2: The Lock and its World Clue agree**
    - **Validates: Requirements 1.2, 3.1**

- [ ] 2. Room and Public View
  - [ ] 2.1 The Clue place setting (`phone` by default, Master only); `phone` keeps today's Sights
    - _Requirements: 1.4_
  - [ ] 2.2 Add World Clues and Decoys to the Public View and nothing else of the answers
    - _Requirements: 2.2_
  - [ ] 2.3 Bots ignore World Clues
    - _Requirements: 3.4_

- [ ] 3. Viewer
  - [ ] 3.1 Draw clue props near Zone anchors with their Sign; show the answer within 3 metres and in view; slow glow only; labels as well as colour
    - _Requirements: 2.1, 2.3_

- [ ] 4. Lock and notebook
  - [ ] 4.1 The Lock prompt names the Sign and shows no answer
    - _Requirements: 3.1_
  - [ ] 4.2 Assist keeps clues seen on the Player's own Turn; Faded when a clue was never in view
    - _Requirements: 3.2, 3.3_
