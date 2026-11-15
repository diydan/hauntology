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
