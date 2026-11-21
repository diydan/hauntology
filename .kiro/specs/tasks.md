# Hauntology: main task list

Counted from ticked boxes (`- [x]`) in each `.kiro/specs/*/tasks.md` on `integration/overnight-merge` (origin/main plus PRs #81 to #91), 2026-11-21 22:55. Every nesting level is counted.

## Progress by spec

| Spec | Done | Left | Total | Done % |
|---|---|---|---|---|
| design-system | 37 | 0 | 37 | 100% |
| world-clues | 17 | 0 | 17 | 100% |
| ghost-creator | 29 | 1 | 30 | 97% |
| world-viewer | 49 | 4 | 53 | 92% |
| haunwallker | 80 | 9 | 89 | 90% |
| errands | 15 | 2 | 17 | 88% |
| world-pipeline | 55 | 8 | 63 | 87% |
| ghost-engine | 39 | 7 | 46 | 85% |
| party-mode | 199 | 37 | 236 | 84% |
| conditions | 44 | 11 | 55 | 80% |
| game-songs | 16 | 6 | 22 | 73% |
| ghost-voice | 52 | 19 | 71 | 73% |
| spirit-table | 32 | 13 | 45 | 71% |
| integration | 31 | 13 | 44 | 70% |
| puzzles | 114 | 50 | 164 | 70% |
| knock-door | 36 | 14 | 50 | 72% |
| **Total** | **845** | **194** | **1039** | **81%** |

## What is left (top-level groups with unticked work)

- **conditions**: 1 Spikes, 3 API, 4 viewer atmosphere, 5 narrator lines, 8 Checkpoint, 9 Shared look.
- **errands**: 3 Controller screens (3.2 is a human playtest).
- **game-songs**: 1 Song Service spike (paid), 4 Shared look, 5 catalogue and house style.
- **ghost-creator**: 5 Checkpoint.
- **ghost-engine**: 6 chat and journal (6.3 waits on the viewer), 7 Gallery content, 8 Checkpoint, 9 Shared look.
- **ghost-voice**: 1 Spikes, 3 API (3.12), 4 web in Play and Host, 6 Live mode (stretch), 7 Checkpoint, 8 Shared look.
- **haunwallker**: 10 tests (10.3 needs `@playwright/test` approval, 10.4 a person with a phone), 11 Checkpoint, 13 Shared look.
- **integration**: 2 Engine, 4 solo case (4.5 playtest), 5 phones (5.1, 5.2, 5.6), 6 Wander puzzles, 7 optional layers, 8 Shared look.
- **knock-door**: 5 Haunt Slam, 6 Wander door, 7 collider spike, 8 screens, 9 fairness pass, 10 Checkpoint, 11 Shared look.
- **party-mode**: 1 hardware spikes, 2.114, 4.1, 5.5, 7, 8.1/8.3/8.4/8.9, 9.24, 12 Gallery worlds, 13 sounds, 14 Checkpoint, 15 Shared look.
- **puzzles**: 1 Spikes, 6 demo slice, 8 third Kinds, 10 Spirit clues (cut first), 11 Shared look, 13 to 15 footage and scenes, 16 Secret knock, 17 Shake.
- **spirit-table**: 1 Spike, 3 the phone (3.6 clue ring), 4 checks, 5 Shared look, 6 drag to mark.
- **world-pipeline**: 1 Spikes, 9 Gallery, 11 Enhance (optional).
- **world-viewer**: 1 Spike, 3 Loader and fallbacks, 10 Checkpoint.

## What blocks the rest

- **Needs a person, phone, TV or browser:** playtests, real WebGL checks, 390 and 1280 px views.
- **Needs a paid call or key:** game-songs 1.1 and 5.2, ghost-voice 1.1, World Labs spikes, the selfie ghost.
- **Needs an owner decision:** `@playwright/test`, a QR encoder (party-mode 8.1), spend-guard caps for room scopes, the Mureka adapter (expects an instant answer; the real API is asynchronous).
- **Needs another spec or PR:** Viewer messages for the Host (8.3, 8.4, 8.9), the Gallery worlds (in the bucket, not the repo).

## Known failing checks

- `tools/test/guarded-only.test.mjs`: `api/dev/playthrough-calls.ts` calls `ai.run` outside `api/src/guarded/` (on main).
- `api/src/worker.test.ts` weather test depends on the date.
- `api` tsc: 8 errors on main (`CONDITIONS_ENABLED`, `ORIGIN`, `node:fs`).
