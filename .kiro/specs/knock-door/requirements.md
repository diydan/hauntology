# Requirements Document

## Introduction

Doors between the Zones of a Room. A shut door blocks the way for everyone and keeps the Zone behind it closed. It opens to the ghost's secret knock (puzzles Requirement 24) or when two or three Players act together (puzzles Requirement 25), and when it opens it opens for every screen: the TV shows it swing, and each phone feels it by where it is and which way it faces. A door only decides which Zones can be reached. It never changes a card, the Solution, the Turn order or the winners, and every lock can be opened by touch alone. Added 2026-11-17 by the owner, after the Secret knock and Shake demos worked on the lab.

This spec joins four others. `puzzles` owns the Secret knock Kind and the shared actions; `party-mode` owns the Room, the Zones, the Turn and the Haunt; `world-pipeline` owns the Manifest; `world-viewer` owns the walk.

## Glossary

- **Door**: a listed way between two Zones, with a place, a width, a lock and a state (open or shut).
- **Passage**: a way between two Zones with no door (open ground).
- **Home Zone**: the Zone nearest the spawn, where the group starts.
- **Behind a door**: a Zone is behind a door when a Player at the Home Zone can reach it with that door open and cannot with that door shut, the other doors as they stand.
- **Knock door**: a Door whose lock is the Secret knock.
- **Heavy door**: a Door that opens when `need` different Players (2 or 3) act together inside the window.
- **Slam**: the Haunt Event in which the ghost shuts an open Door and knocks at the TV.
- **Window**: `ACT_WINDOW_MS`, 2 seconds (puzzles Requirement 25.1).
- Terms not defined here (Room, Zone, Round, Turn, Detective, Player, Poltergeist, Haunt level, Help, Sight, Lock, Faded clue, Case, Solution, Master, Gentle preset, Wander, Skip, Manifest) are as in the specs that own them.

## Requirements

### Requirement 1

**User Story:** As the author of a world, I want to list a few doors in it, so that a Room can have places that open only when the group works for them.

#### Acceptance Criteria

1. A world's Manifest MAY list up to 3 doors (`doors`), and a world with none SHALL play exactly as it did before this spec.
2. EACH door SHALL have an `id` (a lowercase letter, then lowercase letters, digits or hyphens, 16 characters at most, different from every other door's), a place `at` (two finite numbers), a `width` from 0.9 to 1.6 m, the two different Zones it joins (`a` and `b`), and a `lock` that is `knock` or `heavy`; a `heavy` door SHALL also have `need`, 2 or 3, and a `knock` door SHALL NOT.
3. EVERY Zone SHALL stay reachable from the Home Zone through Passages and doors taken as open, so a door can never cut a Zone off for good; a list that names an unknown Zone, a width out of range, a fourth door or a Zone with no way in SHALL be refused with a reason for each fault (`doorProblems`).
4. THE first doors SHALL be written by hand in a world's file and checked with the Zones when the Master picks the world; WHEN a world's doors fail the check THEN the world SHALL still be played, with no doors, and the Master SHALL be told why in words.
5. A door SHALL NOT hold a card, the answer to a clue or any part of the Solution.

### Requirement 2

**User Story:** As a Player, I want a shut door to block the way for everyone and a door that opens to open for everyone, so that the room is one place and not four separate screens.

#### Acceptance Criteria

1. THE server SHALL own the state of every door (open or shut), as it does for every shared thing (puzzles Requirement 25.2); a phone only asks, and every screen is told the result.
2. WHERE puzzles are on THEN every door SHALL start shut; WHERE puzzles are off THEN every door SHALL start open and SHALL never be shut.
3. A shut door SHALL block the walk for everyone, and a Zone behind a shut door SHALL be closed: it SHALL NOT be offered as the place of a Turn or a Lock, and no Player SHALL be sent there, until a door that leads to it opens.
4. WHEN a door opens THEN it SHALL open for every screen at once: the TV SHALL show it swing open slowly and never flash, our `creak` sound SHALL play, each phone SHALL feel it by where it is and which way it faces (`feel`, puzzles Requirement 25.4), and the change SHALL be said in words in the live region.
5. AN open door SHALL stay open, except when a Slam shuts it (Requirement 5).
6. A door that is shut after a failed knock or a Slam SHALL open by itself at the start of the next Round, so no door ever stays shut for good.

### Requirement 3

**User Story:** As a Detective, I want a door that opens only to the ghost's secret knock, which I heard once and then knock back on the table, so that opening it feels like a ritual and not a menu.

#### Acceptance Criteria

1. A Knock door SHALL be the Secret knock Kind (puzzles Requirement 24) and its level and seed SHALL come from the Room seed and the door's id and nothing else (`doorKnock`), so the server, the clue and the Lock always agree, whatever order the doors are listed in.
2. THE ghost's knock SHALL be heard once as a Sight on one Player's phone (puzzles Requirement 24.2), SHALL be private to that phone (the TV and the other phones SHALL NOT receive it), and SHALL be the Faded clue at the Lock when it was missed.
3. A Detective on their Turn SHALL knock the pattern back on the table (puzzles Requirements 24.3 and 24.4), and WHEN the knock is right THEN the door SHALL open for everyone (Requirement 2.4) and the Detective's Turn SHALL go on as the rules of a solved Lock say.
4. A Knock door SHALL give three tries a Turn (`KNOCK_TRIES`), and a wrong try SHALL say what was heard ("You knocked 2, 3.") and never the answer.
5. AFTER three wrong tries the Turn SHALL end and the door SHALL open by itself at the start of the next Round (Requirement 2.6), with no other cost to any Player.

### Requirement 4

**User Story:** As a group, we want some doors that open only when two or three of us push together, so that a heavy door is a thing we do as a team.

#### Acceptance Criteria

1. A Heavy door SHALL open when `need` different Players have acted inside the Window (by shaking, by a knock, or by the control, puzzles Requirement 25.3); one Player SHALL count once however often they act, an act older than the Window SHALL NOT count, and WHEN the door opens THEN the count SHALL start again.
2. A Heavy door SHALL NEVER ask for more Players than are seated and never fewer than 1 (`heavyNeed`), so a solo game still opens it.
3. A Heavy door SHALL count acts by seat and the Window only; it SHALL NOT depend on where a phone is or which way it faces, which only decide what each phone feels (puzzles Requirement 25.4).
4. WHILE a Heavy door waits THEN every Player SHALL see how many are still needed ("2 of 3"), in words and in the live region, and a control SHALL always let a Player act.

### Requirement 5

**User Story:** As the ghost, I want to slam a door shut and knock at the TV, so that the Haunt has a moment that takes the room away from the Players for a while.

#### Acceptance Criteria

1. AT Haunt level 6 the Slam MAY be one of the two options of the Haunt Event, WHEN at least one door can be shut; the Poltergeists choose it as they choose any option (party-mode Requirement 11), and with none, or no choice in time, the first option applies.
2. A Slam SHALL shut one open door only when no Player is behind it and it did not open by itself in the same Round (`canSlam`); a door that fails either rule SHALL NOT be shut, and WHEN no door can be shut THEN the Slam SHALL NOT be offered.
3. THE Slam SHALL be shown to every screen: the TV shows the door close with a knock, and the ghost SHALL knock a pattern at the TV for every Player at once, the first to knock it back getting Help (puzzles Requirement 24.6); the knock SHALL be easy level, from the Room seed and the Round only, and public because every Player hears it, a knock-back SHALL count only in the Round of the Slam, wrong tries SHALL cost nothing and say what was heard, and Help SHALL be 10 seconds more on that Player's next Turn (as a Nudge gives, never past 120 seconds).
4. A slammed door SHALL open by itself at the start of the next Round (Requirement 2.6).
5. WHERE puzzles are off or the Gentle preset is on THEN no Slam SHALL be offered.

### Requirement 6

**User Story:** As a visitor in Wander, I want a door on the way to a memory that I can always get past, so that the walk has a threshold and never a trap.

#### Acceptance Criteria

1. A Wander walk MAY have one door on the way to a memory; with one Player it SHALL be a Knock door or a Heavy door that asks for 1.
2. SKIP SHALL always be available at a Wander door, and WHEN it is used THEN the door SHALL open at once and the walk SHALL go on, and the visitor SHALL be told in words that it opened.

### Requirement 7

**User Story:** As any Player, I want doors never to decide who wins and never to shut me out, so that they are part of the story and not part of the score.

#### Acceptance Criteria

1. A door SHALL NOT change a card, the Solution, the Turn order, a score or the winners; it SHALL change only which Zones can be reached and what a Turn at a Lock is spent on.
2. EVERY lock SHALL be openable by touch alone: a Tap control for the knock, a control to act for a Heavy door, and Skip in Wander; a Player with no sensor, no microphone or no wish to shake SHALL take part in full.
3. A door SHALL move slowly and never flash, with reduced motion it SHALL simply be open or shut, and every change of a door SHALL be said in words ("The door to the cellar opens.") in the live region.

### Requirement 8

**User Story:** As the server, I want the doors to live in the Room beside the rest of the game, so that every phone and the TV agree about them even after the Room sleeps.

#### Acceptance Criteria

1. THE Room SHALL keep the state of its doors in its storage, so that it outlives hibernation; a stored door state that is not valid SHALL fall back to the start (every door shut, or open when puzzles are off).
2. THE Room SHALL have messages `door` (to every screen: which door, open or shut, and why), `doorKnock` (a Detective's try, taken only on their own Turn) and `doorAct` (a Player acts on a Heavy door); every message SHALL be validated by the socket protocol and counted by the Room's per-socket rate limit like every other message (a malformed one closes the socket, a message over the limit is refused unread), and a `doorKnock` or `doorAct` the rules do not allow SHALL be refused with a code, and SHALL change nothing; the Detective also gets a `doorResult` for each try.
3. THE knock pattern SHALL never leave the server except in the Sight sent to the one Player who hears it.
4. A phone or a TV that joins late SHALL be told the state of every door in `welcome`.
5. THE changes of a door SHALL be made by pure functions in `shared/src/party/doors.ts` (`openDoor`, `failKnock`, `shutDoor`, `tickRound`), so the Durable Object only stores the result and sends it.

### Requirement 9

**User Story:** As the viewer of the TV, I want to see the doors in the room, so that I know why the way is blocked and what changed when it opens.

#### Acceptance Criteria

1. THE Viewer SHALL treat a shut door as a thin collider box across the doorway (the door's width, 0.2 m thick, from the floor to 2.2 m) and take it away when the door opens; a spike SHALL record whether the box stops a walker cleanly in a real Gallery world before the Viewer depends on it.
2. THE TV SHALL show each door as a marker on the diorama (shut or open), and a Player SHALL count as standing at a door when within 1.5 m of its place on the plan; with one shared camera the TV SHALL NOT need to know which Player is nearest.
3. WHERE a world has no doors THEN neither the Viewer nor the TV SHALL show or load anything for doors.

### Requirement 10

**User Story:** As a Player, I want the door prompts, markers, and touch controls to look and behave like the rest of the game, so that they feel like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (the phone door Lock / Knock / Tap controls, Heavy door Act button, Wander Skip control, and the diorama door markers on the TV) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE phone door controls SHALL use `ui-panel`, `ui-prompt`, `ui-button`, and `ui-status` live-region announcements, and diorama/Viewer door visuals SHALL take their colours and glow from `shared/src/design/tokens.ts`.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
