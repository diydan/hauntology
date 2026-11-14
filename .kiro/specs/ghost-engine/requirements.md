# Requirements Document

## Introduction

The ghost engine runs the text-adventure loop: the visitor walks to three hidden anchors in the world and, by engaging with the ghost near each one, discovers three memories (a sound, a person, a promise). The engine decides all game state deterministically; a language model only narrates. The game must be completable even with no model, no quota and no luck, must never leak undiscovered memories, and must never produce unsuitable output.

## Glossary

- **Engine**: the pure logic in `shared/src/ghost/`, the `PlaySession` Durable Object and the narration glue in `api/src/ghost/`.
- **Session**: one play-through in one world, held by the PlaySession Durable Object.
- **Anchor**: a position in the world (id, position, radius) where one memory can be found.
- **Memory Seed**: a hidden, generic prompt for one memory (archetype plus a short hook).
- **Memory**: a seed that has been revealed, with its narrated text.
- **Action**: one visitor input after parsing: `look`, `listen`, `touch`, `ask`, `say` or `hint`.
- **Directive**: the instruction the engine gives the narrator: `reveal`, `echo`, `tease`, `ambient`, `hint`, `ending` or `refuse`.
- **Narrator**: the component that turns a Directive into text using a model or scripted lines.
- **Scripted Mode**: narration using only scripted lines, no model calls.

## Requirements

### Requirement 1

**User Story:** As a visitor, I want the hunt to be set up for my world and survive a page reload, so that I can play at my own pace.

#### Acceptance Criteria

1. WHEN the visitor enters a world THEN the Engine SHALL create a Session holding the Ghost Profile, Place Brief, three Anchors and three hidden Memory Seeds, and SHALL return to the client only the Anchors and ghost display data.
2. WHEN Anchors are placed THEN the Engine SHALL choose three positions deterministically from a seed, on walkable floor, within the walk radius, at least 3 m from the spawn and at least 4 m from each other in scaled world units.
3. WHERE a Gallery World supplies authored Anchors THEN the Engine SHALL use them instead of placing new ones.
4. WHEN the visitor reloads within 24 hours THEN the Engine SHALL restore the Session including found memories and the last 8 turns, and SHALL delete Sessions after 24 hours.
5. IF client-placed Anchors fail validation on bounds, spawn distance or spacing THEN the Engine SHALL reject them and use a fixed ring layout around the spawn instead.

### Requirement 2

**User Story:** As a visitor, I want to speak to the ghost in my own words or with quick buttons, so that the game feels like a text adventure without needing a manual.

#### Acceptance Criteria

1. WHEN the visitor presses a quick button (Look, Listen, Touch, Ask, Hint) or types free text THEN the Engine SHALL map the input deterministically to exactly one Action, treating text without a recognised verb as `say`.
2. WHEN input is received THEN the Engine SHALL truncate it to 200 characters and SHALL accept at most one turn per 1.5 seconds per Session.
3. WHEN input is used in a prompt THEN the Engine SHALL strip control characters and place it only inside a delimited data block.

### Requirement 3

**User Story:** As a visitor, I want memories to appear when I find the right place and engage, so that exploring is rewarded.

#### Acceptance Criteria

1. WHEN the visitor is within an unfound Anchor's radius and the Action is `look`, `listen`, `touch`, `ask` or `say` THEN the Engine SHALL reveal that Anchor's memory, mark it found and issue a `reveal` Directive.
2. WHEN the visitor is not within any unfound Anchor's radius THEN the Engine SHALL issue only `tease` or `ambient` Directives and SHALL NOT reveal or change any memory.
3. WHEN the visitor engages an Anchor that is already found THEN the Engine SHALL issue an `echo` Directive and SHALL NOT change the found set.
4. WHEN the third memory is found THEN the Engine SHALL mark the Session ended, issue an `ending` Directive, and from then on issue only `ambient` or `ending` Directives.
5. WHEN a position is reported by the client THEN the Engine SHALL clamp it to the world bounds and ignore non-finite values.

### Requirement 4

**User Story:** As a stuck visitor, I want gentle hints, so that I can find the memories without frustration.

#### Acceptance Criteria

1. WHEN the Action is `hint` THEN the Engine SHALL issue a `hint` Directive giving a relative bearing and a distance band to the nearest unfound Anchor.
2. WHEN eight consecutive turns or 90 seconds pass without progress THEN the Engine SHALL issue an automatic `hint` Directive.
3. WHEN a hint is narrated THEN the Engine SHALL use only bearing words (ahead, behind, left, right, diagonals) and distance bands (far, nearer, very close), and SHALL NOT include coordinates, numbers or memory content.

### Requirement 5

**User Story:** As a visitor, I want the ghost to speak in a consistent, atmospheric voice, so that I feel I am talking to someone.

#### Acceptance Criteria

1. WHEN a Directive needs narration THEN the Narrator SHALL call the configured Workers AI text model with the persona, fixed rules, only the revealed memories and the Directive, and optionally the weather class, the time-of-day bucket and the moon name from the frozen conditions snapshot (nothing else about the real world), with at most 220 output tokens and a 6-second timeout.
2. WHEN any prompt is built THEN the Engine SHALL include no text of any memory that is not yet revealed.
3. WHEN a model reply is received THEN the Engine SHALL validate it (non-empty, at most 600 characters, no URLs, markup or control characters, no out-of-fiction phrases), retry once on failure and then substitute a scripted line.
4. THE Engine SHALL provide at least five persona-flavoured scripted lines for every Directive kind, selected with a seeded random generator.
5. WHEN a `reveal` Directive is narrated THEN the Narrator SHALL produce two to four first-person sentences grounded in the Place Brief and the seed's archetype, and the Engine SHALL store the validated text as the Memory.
6. IF the visitor tries to change the ghost's rules or leave the fiction THEN the Narrator SHALL respond in character and steer back to the place.

### Requirement 6

**User Story:** As the operator, I want model usage capped without breaking the game, so that cost is bounded and the demo never dies.

#### Acceptance Criteria

1. WHEN a Session reaches its model-turn cap (40) or the global daily model cap is reached THEN the Engine SHALL switch to Scripted Mode and SHALL make no further model calls.
2. WHEN the model kill switch is on THEN the Engine SHALL operate in Scripted Mode.
3. THE Engine SHALL compute game state transitions independently of narration, so that the sequence of states for a given sequence of Actions and positions is identical whether narration uses the model, fails, or is scripted.

### Requirement 7

**User Story:** As a visitor, I want to always be able to finish, so that I am never stuck.

#### Acceptance Criteria

1. FROM any reachable Session state, THE Engine SHALL allow the visitor to complete the game by walking to each unfound Anchor and performing one engaging Action there, in Scripted Mode or with the model.

### Requirement 8

**User Story:** As a visitor, I want to keep what I found and play again, so that the ending feels earned.

#### Acceptance Criteria

1. WHEN a memory is found THEN the Engine SHALL add it to the journal with its archetype title and text, and SHALL persist it in the Session.
2. WHEN the game ends THEN the Engine SHALL return the farewell text and the data needed for the memory card (three excerpts and the world id).
3. WHEN the visitor chooses "Haunt again" THEN the Engine SHALL start a new Session in the same world with a fresh seed and an empty journal.

### Requirement 9

**User Story:** As the operator, I want to see health without seeing visitors' words, so that I can run the demo safely.

#### Acceptance Criteria

1. THE Engine SHALL record only counters (turns, reveals, fallbacks, validation failures, completions) and error codes, and SHALL NOT record visitor input, prompts or model output.
