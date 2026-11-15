# Requirements Document

## Introduction

This spec joins the parts that are built and tested on their own into the main game. The pure rules of `party-mode` (tasks 2.1 to 2.32), the puzzle screens and rules of `puzzles`, and the logic of `errands` and `world-clues` exist; what is missing is the spine that runs a game: one engine that combines the rules, a thin `PartyRoom` server around it, and the pages that use it. The order is fixed so that each phase ends in something that can be played or tested, and the **solo case** (one screen, one human against Bots, no phone) is the first playable game, because it is the judge's path and the Case screen already has a socket for it (`HostPort`). Phones, puzzles on phones, Wander puzzles and the optional layers follow.

## Glossary

- **Engine**: the pure function `step(state, action, nowMs)` in `shared/src/party/engine.ts` that applies one Action to the Room state with the rules of `party-mode` and returns the new state and the Outbox. It is the only place the rules are combined.
- **Action**: one validated input to the Engine: a client message, an alarm firing, or a Bot's choice.
- **Outbox**: the messages one step produces, each addressed to the Public View audience, one seat, the Host or the Display.
- **Room server**: the `PartyRoom` Durable Object and `PartyDirectory`, holding sockets, storage and the one alarm, and calling the Engine for every Action.
- **Phase**: one step of the delivery order in Requirement 1.
- **Optional layer**: a feature behind its own Master switch, off by default: Errands, World Clues, Nudges, Cues, Frames, and the extras in the `party-mode` cut list.
- Other terms (Room, Master, Player, Bot, Host, Controller, Lock, Inspect, Wander, Public View, Private View, solo case) are as in `party-mode`, `puzzles`, `errands` and `world-clues`.

## Requirements

### Requirement 1

**User Story:** As the team, I want a fixed delivery order where every phase ends in something playable or testable, so that the game is never half-joined.

#### Acceptance Criteria

1. THE delivery SHALL follow seven Phases in this order: (1) the last core rules, (2) the Engine, (3) the Room server, (4) the solo case, (5) phones with puzzles on Inspect, (6) Wander puzzles, (7) the Optional layers.
2. EACH Phase SHALL end at a checkpoint named in the tasks, with its tests green and, from Phase 4 on, a game a person can play from start to end.
3. A later Phase SHALL NOT change an earlier Phase's rules except through the spec that owns them, and SHALL NOT be started while an earlier checkpoint is red.

### Requirement 2

**User Story:** As a developer, I want one engine that combines every rule, so that the whole game can be tested without a server.

#### Acceptance Criteria

1. THE Engine SHALL be a pure, deterministic function of the state, the Action, the time and the Room seed, SHALL read the rules only from the `party-mode`, `puzzles`, `errands` and `world-clues` modules, and SHALL hold no rule of its own beyond their order.
2. THE Engine SHALL validate every Action against the sender's token role and seat and SHALL refuse an illegal Action with a reason code and an unchanged state.
3. EVERY Outbox message SHALL be built only by `publicView`, `privateView` or a function of the same kind that reads only what its audience may see, and no message to the Public View audience SHALL contain a Hand, a Residue card, the Solution before the end, a shown card, or the sender of a Frame, a House Cue, a Rattle or an Errand.
4. THE Engine SHALL return with every step the next wake time from `nextWake`, so that the Room server needs exactly one alarm.

### Requirement 3

**User Story:** As a player, I want the Room to keep my game safe across reconnects and restarts, so that nothing is lost or leaked.

#### Acceptance Criteria

1. THE Room server SHALL call the Engine for every socket message, every alarm and every Bot choice, SHALL save the state after every step before it sends the Outbox, and SHALL set its alarm to the next wake time.
2. THE Room server SHALL enforce the Room caps through `PartyDirectory`, rate limit every token, and delete the Room with all of its data at its time to live or when it is ended.
3. THE Room server SHALL contain no game rule, so that every rule is covered by the Engine's tests.

### Requirement 4

**User Story:** As a visitor alone, I want to play a whole case on one screen against Bots, so that I can finish a game with no phone and no friends.

#### Acceptance Criteria

1. WHEN the visitor starts a case on the Case screen THEN the `HostPort` SHALL be backed by a real Room with one human Master and two to five Bots, as `soloSetup` of `party-mode` says, and the stand-in SHALL no longer be used.
2. THE solo case SHALL be played with the pad on the same screen, SHALL need no phone, no account and no paid call, and SHALL end on the ending screen with Play again.
3. THE solo case SHALL use the Gallery worlds and Preset Ghosts when nothing was contributed, so that it always starts.

### Requirement 5

**User Story:** As a player with a phone, I want Inspect to open a puzzle on my phone, so that searching a room is something I do with my hands.

#### Acceptance Criteria

1. WHEN a human Detective starts Inspect on a phone and the Puzzle setting is not `off` THEN the Room SHALL open that Zone's Lock on that phone through the `PuzzleHost` of `puzzles`, with the level of the Puzzle setting, and a solved Lock SHALL give the same private result a plain Inspect gives.
2. A Bot, and a Player in the solo case on the shared screen, SHALL get a plain Inspect.
3. THE phone SHALL supply the puzzle feel layer (tilt, buzz, sound, breath) from its own device settings, and every puzzle SHALL stay finishable by touch alone.

### Requirement 6

**User Story:** As a Wander player, I want an optional lock before each memory, so that the walk has a little challenge and can always be skipped.

#### Acceptance Criteria

1. THE Wander integration SHALL follow the `puzzles` spec's `PlaySession` tasks, with Skip always available and the clue for a memory Lock given after an earlier memory.
2. WANDER SHALL keep working with puzzles off, and turning them on SHALL add no paid call.

### Requirement 7

**User Story:** As a Master, I want the extra layers to be optional and to arrive last, so that the core game is finished first.

#### Acceptance Criteria

1. EACH Optional layer SHALL have its own Master switch, off by default, and turning it off SHALL leave every other rule, view and outcome unchanged.
2. ERRANDS and World Clues SHALL be joined in Phase 7, through the Engine, with their own specs, and SHALL NOT be started before the Phase 5 checkpoint.
3. WHEN time runs short THEN the cut order of the `party-mode` tasks SHALL apply, and a cut layer SHALL leave no dead switch or screen behind.
