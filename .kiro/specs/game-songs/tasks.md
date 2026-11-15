# Implementation Plan

- [ ] 1. Spike: the Song Service
  - [ ] 1.1 Try Mureka with three template lyrics: time to make a song, price per song, the licence for game use, and whether it sings a given name clearly; record in `docs/spikes/songs-1.md`
    - _Requirements: 1.4, 3.2_

- [ ] 2. Song logic in `shared/src/songs/`
  - [ ] 2.1 `lyricFacts` and `writeLyrics` with the consent rule and role names
    - _Requirements: 1.1, 3.1_
  - [ ] 2.2 **Property 1: Songs sing only public facts**
    - **Validates: Requirements 1.1, 2.2, 3.1**
  - [ ] 2.3 `clueHint` from the public log and seed
    - _Requirements: 2.2, 2.3_
  - [ ] 2.4 **Property 2: Clue hints are fair and fixed**
    - **Validates: Requirements 2.2, 2.3**
  - [ ] 2.5 `songRequests` (Moments, the Ballad at the last Round or Haunt 8, the limits) and `nextSlot`
    - _Requirements: 1.2, 1.3, 1.4, 2.1_
  - [ ] 2.6 **Property 3: Songs change no rule and never wait**
    - **Validates: Requirements 1.3, 1.4, 4.3**

- [ ] 3. Server and Host
  - [ ] 3.1 The guarded Song Service adapter, the `song` spend meter and cap, the kill switch, and deletion with the Room
    - _Requirements: 3.2, 3.3_
  - [ ] 3.2 The Room asks for songs and plays them at Song Slots; Stock Songs as the fallback
    - _Requirements: 1.1, 1.2, 1.4, 2.1_
  - [ ] 3.3 Captions in a live region, the hint line in the public log, mute, skip, the Songs setting and "Sing my name"
    - _Requirements: 4.1, 4.2, 3.1_

- [ ] 4. Shared look (added 2026-11-15; satisfies Requirement 5 and the `design-system` spec)
  - [ ] 4.1 Build the captions, the Songs setting with mute and skip, and the ending screen's song line from the elements in `design/catalogue.html`; their own style says only where things go
    - _Requirements: 5.1, 5.3_
  - [ ] 4.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 5.2_
  - [ ] 4.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 5.4_
