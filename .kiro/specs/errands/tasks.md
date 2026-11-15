# Implementation Plan

- [x] 1. Errand logic in `shared/src/party/errands.ts` (tests in `errands.test.ts`; Room and Controller wait for `PartyRoom`)
  - [x] 1.1 The object catalogue, `nextErrand` with Target rules and the photo preference
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.2_
  - [x] 1.2 **Property 1: Errands pick only fair Targets**
    - **Validates: Requirements 1.1, 1.2, 1.3**
  - [x] 1.3 `settleDone` and `settleCaught`, Scare points and Bonus Seconds
    - _Requirements: 2.1, 2.2, 2.3, 3.2, 3.3_
  - [x] 1.4 **Property 3: Done and Caught settle once**
    - **Validates: Requirements 2.1, 2.2, 2.3, 3.2, 3.3**

- [ ] 2. Room wiring in `PartyRoom`
  - [ ] 2.1 Give an Errand on becoming a Poltergeist, keep it private, renew after two Rounds; Bots never take part
    - _Requirements: 1.1, 1.3, 4.4_
  - [ ] 2.2 The Target's private Yes/No prompt with a 20 second timeout, the public log line and the ending recap
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 2.3 The Errands setting (off by default, Master only) and the Target opt-out
    - _Requirements: 4.1, 4.3_
  - [ ] 2.4 **Property 2: Errands never touch the case**
    - **Validates: Requirements 4.4**

- [ ] 3. Controller screens
  - [ ] 3.1 The Poltergeist's Errand card with Done and the "Never grab or push" line; the Detective's Caught picker once per Round
    - _Requirements: 3.1, 4.3_
  - [ ] 3.2 Checkpoint: playtest one evening with Errands on; note any object people could not find or felt unsafe with
    - _Requirements: 4.2_

- [ ] 4. Shared look (added 2026-11-15, after the other tasks were numbered; satisfies Requirement 5 and the `design-system` spec)
  - [ ] 4.1 Build each screen of this spec from the elements in `design/catalogue.html`; its own style says only where things go
    - _Requirements: 5.1, 5.3_
  - [ ] 4.2 A missing piece goes into `design/elements.css` and `design/catalogue.html` first, made of tokens, and is then used
    - _Requirements: 5.2_
  - [ ] 4.3 Check each screen at 390 px and at 1280 px next to the play-through: contrast, 44 px targets, the focus ring, reduced motion, one solid yellow button
    - _Requirements: 5.4_
