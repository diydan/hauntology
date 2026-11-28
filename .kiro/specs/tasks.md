# Hauntology: main task list

Counted from ticked boxes (`- [x]`) in each `.kiro/specs/*/tasks.md` on `integration/overnight-merge` (origin/main plus PRs #81 to #91 and #95 to #98), 2026-11-21 23:55. Every nesting level is counted.

## Progress by spec

| Spec | Done | Left | Total | Done % |
|---|---|---|---|---|
| design-system | 37 | 0 | 37 | 100% |
| world-clues | 17 | 0 | 17 | 100% |
| ghost-creator | 29 | 1 | 30 | 96% |
| haunwallker | 86 | 3 | 89 | 96% |
| world-viewer | 51 | 2 | 53 | 96% |
| world-pipeline | 58 | 5 | 63 | 92% |
| integration | 40 | 4 | 44 | 90% |
| errands | 15 | 2 | 17 | 88% |
| ghost-engine | 40 | 6 | 46 | 86% |
| conditions | 47 | 8 | 55 | 85% |
| party-mode | 202 | 34 | 236 | 85% |
| spirit-table | 37 | 8 | 45 | 82% |
| puzzles | 131 | 33 | 164 | 79% |
| ghost-voice | 56 | 15 | 71 | 78% |
| game-songs | 17 | 5 | 22 | 77% |
| knock-door | 38 | 12 | 50 | 76% |
| **Total** | **912** | **127** | **1039** | **88%** |

Update 2026-11-28: PR #93 merged in, the three known failing checks fixed, Playwright smoke run (haunwallker 10.3), and the 390/1280 px shared-look checks run in headless Chrome (conditions 9.3, ghost-engine 9.3, ghost-voice 8.3, party-mode 15.3, puzzles 11.3, spirit-table 5.3). Content decisions the owner settled ("all recommended"): knock-door 5 and puzzles 8.3 (24 Whisper board lines, unrendered) are done. 912 done, 127 left.

## What is left, and why it is not built

Every open item below needs something the build agents do not have. None is a plain coding task.

- **A person with a phone, TV or browser** (spikes, playtests, real-device and 390 / 1280 px checks, checkpoints):
  conditions 1.1, 8, 9.3 · errands 3.2 · ghost-engine 6.3 (real-browser look), 8, 9.3 · ghost-voice 1.2, 1.3, 4.7, 8.3, 7 · haunwallker 10.4 · integration 4.5, 5.6 · knock-door 7.1, 8.1, 9.2, 10 · party-mode 1.1 to 1.10, 14, 15 · puzzles 1.1 to 1.6, 6.6, 11.3, 13.3, 14.8, 14.12, 15.11, 16.4, 17.4 · spirit-table 1.2, 5.3 · world-viewer 1, 10.
- **Paid calls or keys:** game-songs 1.1 and 5.2 · ghost-voice 1.1 · ghost-creator 5 (paid portraits) · party-mode 5.5 (selfie ghost) · world-pipeline 1.2, 1.3.
- **A dependency approval:** haunwallker 10.3 (`@playwright/test`).
- **A design or content decision:** knock-door 5 (Slam voice lines), 8.3 · puzzles 8.3 (Voice Library), 13.4 to 13.8 (film rights) · party-mode 8.1 and 8.4 Host feed · world-pipeline 9.1 and ghost-engine 7 (Gallery pictures and licences).
- **Another PR:** knock-door 6.1, 6.2 live on PR #93 (`feat/knock-door-wander`).
- **Stretch or waiting on another task:** ghost-voice 6.3, 6.5 (live mode) · ghost-voice 3.12 and 4.8 (Single player has no speak signal) · party-mode 2.114 (story-writer review) · spirit-table 4.3, 6.7 (party-mode doc lines, notebook storage).

## Known failing checks (all three fixed 2026-11-28)

- `tools/test/guarded-only.test.mjs`: `api/dev/playthrough-calls.ts` calls `ai.run` outside `api/src/guarded/` (red on main).
- `api/src/worker.test.ts` weather test depends on the date.
- `api` tsc: 8 errors on main (`CONDITIONS_ENABLED`, `ORIGIN`, `node:fs`).

## Checks on the combined branch (2026-11-21 23:50)

shared 1993 pass · api 1251 pass (30 skipped) · web 1588 pass · tools 478 of 479 · traceability and tokens OK.
