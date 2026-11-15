# Requirements Document

## Introduction

Puzzles are short phone mini-games that guard something the player wants. In Party Mode, each Zone gets a **Lock**; Inspect opens it, and solving it gives the same private Residue answer a plain Inspect gives today. In Wander, an optional Lock sits in front of each memory and can always be skipped. There are ten Kinds (Lock pick, Cut wires, Clock time, Safe code, Music box, Candle order, What moved, Torn photo, Hidden words, Spirit board) and one optional extra (Marble maze). Four of them test **memory across scenes**: a small private clue (a **Sight**) is shown once in an earlier place, and the Lock needs it later. The phone is the instrument: it tilts (gyroscope), buzzes (vibration), plays synthesised sound and, once, listens for a breath. Every one of those is an extra, never a requirement: each Kind can be finished with touch alone, and every sound and buzz has a visual twin. One more optional layer, **Spirit clues**, can show a Sight as clues that hang in the air around the phone (the digits of a code, and story clues such as an address, a phone number and a date), found by turning round with the phone, and optionally drawn over the phone's own camera.

A Puzzle changes no rule. It never touches the Solution, a Hand, a Residue position, the Haunt, Resolve or Bonus Seconds. It decides only whether, and how fast, one Player learns what is in the Zone they are standing in. It costs nothing to run: no model, no paid call, no new sound file (except the Whisper reading a short word for the Spirit board). Design reference: the Cyber-Orb demo (tilt moves a ball, a wall hit buzzes the phone), read for ideas only and not copied (its licence is CC BY-NC 4.0).

## Glossary

- **Puzzle**: one playable mini-game of a **Kind**.
- **Kind**: one of `lockpick`, `wires`, `clock`, `safe`, `musicbox`, `candles`, `moved`, `photo`, `words`, `board`, and the optional `maze`.
- **Lock**: a Puzzle placed in front of something: a Zone's Residue (Party Mode) or a memory (Wander). A Lock has a Kind, a level and a seed.
- **Level**: `easy`, `medium` or `hard`. They differ only in size, tolerance, step and how often a clue can be replayed.
- **Puzzle setting**: `off`, `easy`, `medium` or `hard`, set for a Room by the Master (Party) or by a visitor (Wander).
- **Sight**: a small private clue shown once on a phone in an earlier place (a Zone, or the end of a found memory) that a memory Kind needs later.
- **Memory Kind**: a Kind that needs a Sight: `wires`, `clock`, `safe`, `moved`, `photo`.
- **Faded**: the version of a memory Kind a Player gets when they never saw its Sight: the clue is shown once at the Lock for a short time, then the Puzzle runs unchanged.
- **Attempt**: one submitted answer to a Lock. A Lock gives three.
- **Transcript**: the small record of a Player's moves for one Attempt, sent for checking.
- **Cap**: the most Turn time a Lock may use (25 seconds Classic, 40 Gentle, 20 Quick).
- **Plain Inspect**: the party-mode Inspect with no Puzzle (10 seconds, always succeeds in finding what is there).
- **Feel**: the phone feedback of a Puzzle: vibration, synthesised sound, tilt and (once) breath.
- **Tilt**: the phone's angle read from its orientation sensor (the gyroscope and accelerometer together).
- **Touch path**: the way to finish a Kind using only the touchscreen.
- **Assist**: a per-device setting that keeps Sights in the notebook, lengthens Sights and shows text for sounds.
- **Skip**: Wander's "Let the ghost open it".
- **Spirit clue**: one small clue hung in the air round a phone by the optional Spirit clues layer: a Code piece or a Story clue.
- **Code piece**: one digit of the Safe code, shown as a Spirit clue with its place in the code (for example 2 of 4).
- **Story clue**: a Spirit clue that no Lock needs: an Address, a Phone number or a Date, always taken from fixed lists of made-up values.
- **Clue ring**: the sphere 1.5 metres round the Player on which Spirit clues hang, centred on the way the Player faced when it opened.
- **Clue list**: the notebook page that lists every Spirit clue as text, read or "Not found yet".
- **Place**: one blank, flat surface of a locked-off footage shot (a brass plate on a door, a misted window pane, a blank page), declared by its four corners, the times it is in view and its brightness, where the Host may write a Scene clue.
- **Scene clue**: a World Clue or Decoy (`world-clues`) with a text answer, drawn by the Host over the video on a Place while the game runs, and never in a clip file.

## Requirements

### Requirement 1

**User Story:** As a Player in Party Mode, I want Inspect to be a small puzzle on my phone, so that searching a Zone is something I do and not something I wait for.

#### Acceptance Criteria

1. WHEN the Puzzle setting is easy, medium or hard and a human Player standing in a Zone starts Inspect THEN the Room SHALL open that Zone's Lock on the Player's phone instead of the plain 10 second wait, and WHEN the setting is off THEN Inspect SHALL behave exactly as the party-mode rule, so the result, the log line and the time charged are identical to a Room without this spec.
2. WHEN a Lock is solved THEN the Room SHALL show the Player privately exactly what a plain Inspect shows (the Residue card in that Zone or that there is none), mark the Zone inspected for that Player, add nothing else to the public log, and charge the Turn the time spent, never less than 10 seconds and never more than the Cap.
3. IF the three Attempts are spent, or the Cap is reached, or the Player gives up, or the Turn ends THEN the Room SHALL close the Lock with "nothing came loose", show nothing about the Zone, NOT mark the Zone inspected (the Player may open the same Lock again that Turn or on a later Turn), charge the same time as in 1.2, and WHEN a Cold Spot covers the Zone THEN the Lock SHALL still open, as Inspect does.
4. THE Room SHALL take the Puzzle setting from the preset (Classic medium, Gentle easy, Quick off; hard only when the Master picks it), let only the Master change it, apply a change from the next Inspect, and send the setting to every phone in the Public View. THE setting SHALL be the starting level, and the level of a Lock SHALL rise with the Haunt when the Lock opens: one step at Haunt 3 and one more at Haunt 6, never above hard, never below the setting, and at most one step under the Gentle preset; a Memory Kind SHALL open at the level its Sight was made at, so the clue always fits; Wander has no Haunt and keeps the setting.
5. WHEN a game starts THEN the Room SHALL place exactly one Lock in each Zone, deterministically from the seed and the Puzzle setting, using each enabled Kind at most twice, SHALL give every Memory Kind a Sight in a different Zone, and SHALL choose Kinds and answers without reading the Solution, any Hand or any Residue position.
6. WHEN a Bot has a Turn THEN the Room SHALL run a plain Inspect for it as today, and a Bot SHALL never receive a Sight or open a Lock.
7. WHERE a Player turns on Plain Inspect for themselves (an access setting) THEN that Player's Inspect SHALL always succeed and always charge the full Cap, the choice SHALL be kept on the seat and survive a reconnect, and no other Player or screen SHALL be told.

### Requirement 2

**User Story:** As a visitor in Wander, I want an optional lock in front of each memory that I can always skip, so that the walk can have a puzzle without ever blocking me.

#### Acceptance Criteria

1. THE Play start screen SHALL offer a Locks switch that is off by default, and WHILE it is off THEN the Engine's output, the Session and the Viewer SHALL be identical to those of a build without this spec.
2. WHEN Locks are on and the visitor engages an unfound Anchor inside its radius THEN the Engine SHALL open that Anchor's Lock, and SHALL issue the same `reveal` Directive with the same memory text as without Locks only once the Lock is solved or skipped, and not before.
3. THE Wander Lock SHALL have no clock and unlimited Attempts, SHALL offer Skip after 20 seconds or after two wrong Attempts, whichever comes first, and Skip SHALL always work, so that a memory is never out of reach.
4. WHEN the first memory of a Session is about to be revealed THEN its Lock SHALL be a Kind that needs no Sight, and a later Lock MAY be a Memory Kind that uses the Sight given after an earlier memory, chosen by the order of discovery and not by which Anchor it is.
5. WHEN a memory is revealed and the next Lock is a Memory Kind THEN the Engine SHALL show its Sight card after the memory text, and SHALL save in the Session which Sights were shown, so that a reload within 24 hours keeps them.
6. WHILE a Lock is open THEN the Viewer SHALL suspend movement and release pointer lock as it does for chat, and WHEN the Lock closes THEN it SHALL restore play input.

### Requirement 3

**User Story:** As a Player, I want the first three puzzles to be a lock to pick, wires to join and a clock to set, so that the game has a feel from the start.

#### Acceptance Criteria

1. THE **Lock pick** SHALL show 3 (easy), 4 (medium) or 5 (hard) pins, each with a hidden sweet-spot window of 14 (easy), 10 (medium) or 8 (hard) degrees inside a range of minus 40 to plus 40 degrees, WHILE the Player holds the tension button THEN the pick position SHALL follow Tilt (or a slider on the Touch path), the phone SHALL buzz faster the nearer the pick is to the current pin's window and click on entering it, a pin SHALL set after the pick stays in its window for 400 milliseconds, pins SHALL set in order, and the Lock SHALL open when every pin is set.
2. THE **Cut wires** SHALL show 4 (easy), 5 (medium) or 6 (hard) cut wires, each with its own colour and its own pattern, with the cut ends in a shuffled order on the left and numbered terminals on the right with no colour, WHEN the Player drags each wire to a terminal and submits THEN the Room SHALL accept the Attempt only when each wire is on the terminal that matches its place in the Sight (the fuse box seen earlier, top to bottom), and the phone SHALL buzz a snap when a wire connects and a short buzz when an Attempt is wrong.
3. THE **Clock time** SHALL show a clock face with the hands at 12:00 and the Player SHALL set the hands by dragging them or, with motion on, by turning the phone like a dial, in steps of 15 (easy), 5 (medium) or 1 (hard) minutes with a tick buzz at each step, and WHEN the Player submits THEN the Room SHALL accept the Attempt only when the time equals the time on the stopped clock in the Sight.
4. EVERY Kind SHALL have an easy, a medium and a hard level that differ only in size (pins, wires, notes, pieces, letters, digits), tolerance, step and replays, the Room SHALL use easy under the Gentle preset and medium under Classic, and the two levels SHALL use the same input and the same rules.

### Requirement 4

**User Story:** As a Player, I want a safe to crack, a music box to answer, candles to put out in order and a room to compare, so that there are different kinds of remembering.

#### Acceptance Criteria

1. THE **Safe code** SHALL show a dial of the digits 0 to 9 where the Player turns to each digit of a code of 3 (easy), 4 (medium) or 5 (hard) digits and presses Set, with a click at each digit and a thunk on Set, WHEN the Player has set every digit THEN the Room SHALL accept the Attempt only when the code equals the code on the plaque in the Sight, and with motion on the Player MAY turn the dial by twisting the phone.
2. THE **Music box** SHALL play a tune of 3 (easy), 4 (medium) or 5 (hard) notes from five notes up to three times (twice on hard) (each play starts with a button the Player presses), and WHEN the Player plays the tune back on five keys THEN the Room SHALL accept the Attempt only when the notes and their order are equal, with every note also lighting its key and buzzing once.
3. THE **Candle order** SHALL show 4 (easy), 5 (medium) or 6 (hard) lit candles, show the order they must go out by letting each gutter once in turn (shown up to two times, once on hard), and WHEN the Player snuffs the candles by tapping them in that order THEN the Room SHALL accept the Attempt, a wrong order SHALL relight every candle and count as a wrong Attempt.
4. THE **What moved** SHALL show in its Sight a shelf of 6 (easy), 8 (medium) or 9 (hard) objects, and at the Lock the shelf SHALL fade to dark for 2 seconds (1.5 on hard) and return with 2 (easy), 3 (medium) or 4 (hard) objects changed (moved, swapped or missing), and WHEN the Player taps the changed objects and submits THEN the Room SHALL accept the Attempt only when the chosen set equals the changed set, and the phone SHALL rumble once during the dark.

### Requirement 5

**User Story:** As a Player, I want a torn photo, hidden words, a spirit board and an optional marble maze, so that the set is complete and a few of them use the phone as a tilting object.

#### Acceptance Criteria

1. THE **Torn photo** SHALL show in its Sight a picture drawn from simple shapes, and at the Lock the picture SHALL be torn into 4 (easy), 6 (medium) or 9 (hard) pieces, shuffled and (on medium and hard only) turned in 90 degree steps, the Player SHALL drag or tap to place and, on medium and hard, tap to turn, the phone SHALL click when a piece fits, and the Room SHALL accept the Attempt when every piece is in its place and turned the right way.
2. THE **Hidden words** SHALL show a dark panel where a torch beam, moved by Tilt (or a finger on the Touch path), shows the letters of a word of 4 (easy), 5 (medium) or 6 (hard) letters set left to right at different heights, the phone SHALL buzz when the beam crosses a letter, and the Room SHALL accept the Attempt when the Player taps the letters in reading order.
3. THE **Spirit board** SHALL show the 26 letters in three rows large enough for a thumb, a planchette and, under the board, a short clue of a few words that never contains the word and the number of letters, the Whisper SHALL say a word of 3 (easy), 4 (medium) or 5 (hard) letters and then its clue and then the word again, up to twice (once on hard), the planchette SHALL roll under Tilt (or move under a finger on the Touch path) and SHALL be drawn gently toward a letter it is nearly resting on, and the Player SHALL select the letter under the planchette by tapping anywhere on the board or by resting on it for 350 milliseconds (or by tapping a letter directly on the Touch path), with a tick when it reaches a letter and a thunk when one is chosen, and the Room SHALL accept the Attempt when the letters spell the word.
4. WHERE the optional **Marble maze** is built THEN it SHALL show one of five authored mazes with an orb that rolls under Tilt (or a finger drag), a 100 millisecond buzz and a bump sound on every wall hit, and a hole, and the Room SHALL accept the Attempt when the orb reaches the hole at a plausible time.

### Requirement 6

**User Story:** As a Player, I want to remember something from an earlier scene and use it later, so that exploring the whole house matters.

#### Acceptance Criteria

1. WHEN a human Player moves into a Zone they have not been in before, or starts a Turn in one, and that Zone holds a Sight THEN the Controller SHALL show the Sight once for 5 seconds (8 with Assist), let the Player close it earlier with a tap, and the seat SHALL record that it was shown, and no other seat SHALL be told.
2. THE Sight SHALL be a function of the seed, the Kind and its place only, and SHALL carry exactly the clue the Lock needs: the order of the wires, the time on the clock, the code, the shelf or the finished picture.
3. WHEN a Player opens a Lock whose Sight they never saw THEN the Controller SHALL show the same clue once at the Lock for 4 seconds (8 with Assist) before the Puzzle starts, with no other change, so that a missed Sight never blocks a Lock.
4. WHERE Assist is on (the Gentle preset turns it on) THEN the notebook SHALL keep a Sights page with every clue shown to that Player, and the Lock SHALL offer "See the clue again" (the clock keeps running), and WHERE Assist is off THEN a clue SHALL never be shown again after it closes.
5. THE Sight, its place and the fact that a Player has seen it SHALL never appear in the Public View, the public log, the ending recap, a narrator prompt, a Host or Display screen, or another Player's Private View.
6. WHEN a phone reconnects THEN the Room SHALL restore the seat's record of shown Sights and SHALL NOT show a Sight a second time.

### Requirement 7

**User Story:** As a Player, I want the puzzles to be fair and to change nothing else about the game, so that skill with a phone never decides who is the detective.

#### Acceptance Criteria

1. WHEN a Lock opens THEN the Room SHALL send the Player's phone only the parameters it needs to draw and play that Kind, and SHALL keep the answer on the server for every Kind except Lock pick, Music box, Candle order, What moved, Torn photo, Hidden words and Marble maze, whose phone must know their own tune, order, shelf, picture, letters and layout to play them, and no answer SHALL be sent to any other seat or screen.
2. WHEN a Player submits an Attempt THEN the Room SHALL check the Transcript with `verify`, accept it only when it is the answer, reject a Transcript with more than 64 events or 4 KB or that is malformed, reject one that is faster than the Kind's minimum solve time, and never fail with an exception.
3. WHEN an Attempt is wrong THEN the Room SHALL tell the Player only that it was wrong and how many Attempts are left, and SHALL give no count of right wires, digits, notes, objects or pieces.
4. THE Puzzle SHALL change no rule: no Haunt, Resolve, Bonus Seconds, Achievement, Hand, Residue position, Solution or Round outcome SHALL depend on a Puzzle, except the Turn time charged under 1.2 and 1.3 and the private result of the one Zone.
5. THE Lock pick and the Marble maze SHALL be checked for plausibility only (the order of events, the times and the minimum solve time), because the phone must know their layout to give feel, and the specification SHALL say so.
6. THE Room SHALL allow one open Lock per Player and at most one Attempt per second per Lock, and SHALL refuse the rest with a reason code.

### Requirement 8

**User Story:** As a Player, I want to tilt and turn my phone as part of a puzzle, so that it feels like holding a lock or a board, without a sensor ever being required.

#### Acceptance Criteria

1. WHEN a Kind can use the phone's motion sensor (Lock pick, Hidden words, Spirit board and Marble maze by Tilt; Safe code and Clock by Twist) THEN the Controller SHALL turn Tilt on by default, and the Safe code and the Clock SHALL start with Twist on, WHERE a motion sensor really answers: on a phone that must be asked (an iPhone) inside the tap that ends the faded clue and starts the Lock, or the first tap in the Lock; on any other phone at once when the Lock opens, with no tap. IT SHALL NOT ask for a Kind that has no use for the sensor (Wires, Candles, What moved, Music box, Torn photo), SHALL keep Tilt off once the Player turned it off (the Tilt button, the Tilt switch or Touch only) and remember that on the device, SHALL NOT try again after a denial or after no reading arrives, and WHERE permission is denied or there is no sensor THEN it SHALL use the Touch path with no error text and without a long wait.
2. THE Controller SHALL turn raw orientation into Tilt by smoothing it, ignoring changes under 2 degrees, clamping it to plus or minus 45 degrees, reading at most 30 samples a second, ignoring non-finite values, correcting for the screen angle in portrait and landscape, and zeroing on a "hold level" tap so that the angle the Player holds the phone at is the neutral one.
3. THE Controller SHALL move the pick, the torch, the planchette and the orb in fixed time steps, so that the same Tilt over the same time gives the same path however often the phone reports and however fast the screen draws.
4. WHEN the page is hidden or the phone is face down THEN the Controller SHALL stop reading Tilt, and WHEN the Lock closes THEN it SHALL remove the listener.
5. THE raw sensor values SHALL stay on the phone, and only the Transcript SHALL be sent.
6. NO feature SHALL require motion, and a Player SHALL be able to turn tilt off for their device at any time.

### Requirement 9

**User Story:** As a Player, I want the phone to buzz in tune with the puzzle, so that I can feel a lock click or a wire snap.

#### Acceptance Criteria

1. THE Controller SHALL feature-detect vibration, and WHERE it is unavailable THEN it SHALL give the visual twin of every buzz and SHALL use any other haptic route only if Spike puzzles 1.1 confirms it works.
2. THE Controller SHALL take every buzz from a named catalogue (tick, click, thunk, snap, buzz, bump, rumble, heartbeat), with every pulse at most 400 milliseconds, the rumble at most 1.2 seconds and used at most once per Attempt, at most four pulses in any second and at most six seconds of vibration in one Attempt.
3. THE Lock pick's "hot and cold" buzz SHALL pulse at an interval that never gets longer as the pick gets nearer the window, between 800 and 250 milliseconds.
4. THE Controller SHALL offer a vibration switch (on by default) on the device, and no feature SHALL depend on vibration.
5. EVERY buzz SHALL have a visual twin (a short shake or a glow) that obeys the limits of 12.2.

### Requirement 10

**User Story:** As a Player, I want the clicks, notes and whispers to sound like a real lock and a real music box, without the game ever relying on my speaker.

#### Acceptance Criteria

1. THE Controller SHALL make every Puzzle sound with Web Audio synthesis (no new sound file), unlocked by the same tap that unlocks audio at join in Party Mode and by the Locks switch tap in Wander.
2. THE Controller SHALL play a Puzzle sound only after the owner said yes to sound (the seat's choice in Party Mode, the Sound switch in Wander), only on the Player's own phone, never on another phone or the Host, and WHEN it does THEN these sounds SHALL be the Player's own interface sounds and SHALL NOT count toward the three sounds per phone per Round that the Cues share.
3. EVERY Puzzle sound SHALL have a visual twin, the Music box SHALL light each key as it plays, and WHERE Assist is on THEN the Spirit board word SHALL also be shown as text.
4. THE synthesiser SHALL use at most four voices at once, a master gain of at most 0.5 and notes of at least 300 hertz, because phone speakers have no bass.
5. THE Spirit board word SHALL be spoken through the Whisper's Library of the ghost-voice spec (a fixed list of 24 words), with the browser's speech voice as the fallback and no model call.
6. THE Controller SHALL say once, in text, that a phone on silent may play no sound, and the Puzzle SHALL still be solvable.

### Requirement 11

**User Story:** As a Player, I want to blow out a candle with my breath, if I choose, so that the phone's microphone has a fun and safe use.

#### Acceptance Criteria

1. THE Controller SHALL offer the microphone only in the Candle order, only from an explicit tap on "Blow to snuff", off by default, and the Touch path (tap a candle to snuff it) SHALL always be there.
2. THE Controller SHALL compute only a loudness number in the phone, and SHALL NOT record, store, buffer beyond one analysis frame, play back or send any audio, and the Puzzle code SHALL NOT use `MediaRecorder`.
3. WHILE the microphone listens THEN the Controller SHALL show a visible microphone indicator and a stop control, and SHALL stop listening when the Attempt ends, the Lock closes, the page is hidden or the Player stops it.
4. THE Controller SHALL count a breath only after the loudness stays above a threshold for at least 300 milliseconds, and SHALL ignore shorter bursts.

### Requirement 12

**User Story:** As a Player with any phone, any hands and any eyes, I want every puzzle to be comfortable and finishable, so that the puzzles never lock me out.

#### Acceptance Criteria

1. EVERY Kind SHALL be finishable with touch alone: no motion, no sound, no vibration and no microphone.
2. THE dimming, the torch and the candle light SHALL be fades only, at most two brightness changes in any second, with a peak below full white and no strobing, and SHALL be replaced by a still image when the Player prefers reduced motion.
3. EVERY Memory Kind's prompt SHALL name what is to be matched (for example "the stopped clock you saw"), every instruction SHALL be shown once, EVERY control SHALL have a touch target of at least 48 CSS pixels, Give up SHALL ask once before it closes the Lock, EVERY puzzle SHALL have a "?" button that opens a short card on how it works (the goal, the controls, the limits and the phone extras, and never how to solve it) while the clock keeps running, a wire, a candle, a piece or an object SHALL never be told apart by colour alone (each has a pattern or a shape), and every state SHALL have a text label for a screen reader.
4. WHEN the Player prefers reduced motion THEN the Controller SHALL turn off screen shake and beam sway, and SHALL leave the Player's own Tilt and buzz settings as they chose.
5. THE Controller SHALL offer Assist as a device setting (off by default, on under the Gentle preset), which keeps Sights in the notebook, lets the Player look at the clue again while playing, lengthens Sights and Faded clues to 8 seconds and shows text for the Spirit board, and SHALL change no verdict of `verify`.

### Requirement 13

**User Story:** As a Player, I want puzzles to fit the turn clock, pauses and disconnects, so that nothing breaks the game around them.

#### Acceptance Criteria

1. WHILE a Lock is open THEN the Turn Clock SHALL keep running, the Cap SHALL end the Lock if it comes first, a Master pause SHALL freeze the Lock's timer, a Nudge SHALL apply to the Turn as always, and WHEN the Turn ends THEN the Lock SHALL close as in 1.3.
2. WHEN a phone disconnects with a Lock open THEN the Room SHALL keep the Lock open until the Cap and keep the Attempts already used, and WHEN the phone reconnects THEN the Room SHALL rebuild the same Puzzle from the seed with progress inside an Attempt lost.
3. WHILE every other seat is a Bot (a solo case) THEN the Room SHALL run Locks exactly as with human Players, with the same Sights and the same limits.

### Requirement 14

**User Story:** As the owner, I want puzzles to cost nothing, store nothing private and use nothing I do not own, so that they are safe to ship.

#### Acceptance Criteria

1. THE Puzzles SHALL make no paid call and no model call, SHALL use no SpendTicket, and WHEN `PUZZLES_ENABLED` is false THEN Party Mode SHALL run a plain Inspect and Wander SHALL show no Locks switch.
2. THE Room and the Session SHALL delete Transcripts, open Locks and the record of shown Sights with the Room or the Session, SHALL not log a Transcript, and SHALL count only the Kind, the outcome and the number of Attempts (never a time, a Player or a Tilt value) in telemetry.
3. THE Puzzles SHALL use no third-party game code, picture or sound, except public-domain footage that meets Requirement 18; the Cyber-Orb demo and its licence (CC BY-NC 4.0) SHALL be referenced as a design source only, and nothing from it SHALL be copied.
4. THE project SHALL record the phone checks in `docs/spikes/puzzles-<n>.md` and add the unverified assumptions of this spec to `.kiro/steering/tech.md`.

### Requirement 15

**User Story:** As a Player, I want clues to hang in the air around me, so that finding a code, an address, a phone number or a date means turning round with my phone, and so that the haunting is a layer only I can see.

#### Acceptance Criteria

1. THE Controller SHALL offer Spirit clues as an optional layer, off by default, turned on by the Player for themselves from an explicit tap (the same tap that asks for motion permission), and WHERE it is off, unsupported or denied THEN every Sight SHALL be shown as 6.1 says, WHERE there is no motion sensor or Tilt is off THEN the Player SHALL look round by dragging, and the layer SHALL change only how a Sight is shown, never what it says and never a verdict of `verify`.
2. THE Clue ring SHALL hang four forms of Spirit clue: a Code piece (one digit of the Safe code, with its place shown as dots), an Address, a Phone number and a Date, and WHEN the Sight is the Safe code THEN each digit SHALL be one Code piece, numbered from 1, and the ring MAY add up to three Story clues (at most one of each form) that are not part of the Sight, never making more than seven clues in all (a five-digit code gets two).
3. EVERY Address, Phone number and Date SHALL come from fixed lists of made-up values kept in `shared/src/puzzles/` (at least 12 addresses on invented streets, at least 12 dates before 1950, and Phone numbers only from 555-0100 to 555-0199, the range reserved for fiction), and no Spirit clue SHALL be typed, chosen or sent by a Player or SHALL name a real person or a working number.
4. THE Controller SHALL place the clues from the seed and the code only: one clue to each of n equal slots of the full turn, the slots in a seeded order, a turn within 8 degrees of the middle of its slot, no two clues closer than 35 degrees of turn, a height between 30 degrees below and 40 degrees above level, and every quarter of the turn holding at least one clue WHEN there are four or more.
5. WHILE a clue is unread THEN the Controller SHALL show only a ring with a question mark where it hangs (a dark disc with a light ring, so that it shows on any backdrop, the camera included), and WHEN the middle of the view stays within 12 degrees of a clue for 0.7 seconds of steady looking THEN the clue SHALL be read: shown in full, buzzed once with the `click` pattern (visual twin: one soft pulse), added to the Clue list, and kept read until the Lock closes, with the progress falling back to empty in 1.4 seconds WHEN the view leaves, and the same at any event rate.
6. WHEN the layer is on THEN the Controller SHALL show the Sight as the Clue ring instead of the 5 seconds of 6.1, keep it until the Player taps Done, every clue is read or 30 seconds have passed (45 with Assist), treat it in the Turn exactly as a Sight is treated, and SHALL keep the Faded clue of 6.3 as plain text at the Lock.
7. THE Controller SHALL offer a Clue list (every clue read or "Not found yet", and "Code so far" with a question mark for each missing digit) and a "Show all as text" button that reads every clue at once, so that every Lock stays finishable without turning (12.1), and WHEN nothing has been read for 3 seconds and a clue is unread THEN it SHALL show an arrow at the edge of the view pointing towards the nearest unread clue, until a clue is read or the Clue list opens.
8. THE Spirit clues SHALL be drawn from the Player's own Sight and the seed only, so the Room SHALL send nothing new, SHALL use no marker and SHALL not track the room, SHALL keep no clue, direction or reading outside the phone, and SHALL add nothing to the telemetry of 14.2.
9. THE Clue ring SHALL draw at most 12 clues at no more than 30 frames a second, SHALL pause when the phone is face down or the page is hidden, SHALL be still (no pulse or drift) WHEN the Player prefers reduced motion, SHALL give every control a touch target of at least 48 CSS pixels, SHALL tell the four forms apart by shape and not by colour alone (a digit with dots, underlined letters, handwriting, a torn page), and SHALL give every clue a text label for a screen reader.
10. THE Controller MAY show the phone's rear camera behind the Clue ring, and WHERE it does THEN it SHALL do so only from the Player's own tap on "Camera" (off each time the ring opens, and the Master unable to turn it on for anyone), the ring SHALL look and work the same on the plain stand-in backdrop, the picture SHALL be shown in a video element only and SHALL NOT be recorded, stored, copied to a canvas, analysed or sent (the Puzzle code SHALL NOT use `MediaRecorder`, `ImageCapture` or `getDisplayMedia`, or draw the video to a canvas), WHILE it is on THEN a visible camera indicator and a stop control SHALL show, it SHALL stop when the Clue ring closes, the page is hidden or the Player stops it, and WHERE the permission is refused or there is no camera THEN the Controller SHALL say so once and carry on with the stand-in backdrop.

### Requirement 16

**User Story:** As a Player, I want the screens of this feature to look and behave like the rest of the game, so that it feels like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (Puzzle) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE Puzzle screens SHALL be built from `ui-panel`, `ui-button`, `ui-status`, `ui-notice` and the space tokens, SHALL keep their 48 pixel targets (`--pz-target`, never below `--target`), SHALL take the colours of their pictures from the CSS roles or `shared/src/design/tokens.ts`, and the first thing to move is the raw hex colours in `web/src/puzzles/puzzles.css`.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.

### Requirement 17

**User Story:** As a Player who joined the haunting, I want a puzzle to play between Turns, so that I still have something to do and can earn Scare points.

#### Acceptance Criteria

1. WHILE the Puzzle setting is not `off` THEN a human Poltergeist SHALL be able to start one **Haunting puzzle** per Round on their own phone (or the solo screen), at any time except during their own Answer choice, of a Kind with no Sight, at the level of 1.4.
2. WHEN a Haunting puzzle is solved THEN the Room SHALL give that Poltergeist one Scare point, and a Haunting puzzle SHALL change no card, Hand, Residue, Turn, Turn Clock, Haunt level or win, and SHALL appear in no public log line during the game.
3. A Haunting puzzle SHALL NOT be offered to a Detective or a Bot, SHALL NOT use a Zone's Lock, and SHALL close without a point when the game ends or the Round ends.

### Requirement 18

**User Story:** As the owner, I want old public-domain film on the phone screens, from a shot of a few seconds to whole scenes, so that the haunting has a real past that no model can make, for the cost of storage and delivery only and without a rights claim on a game I may sell. (Footage rules, added 2026-11-15; lengthened the same day)

#### Acceptance Criteria

1. THE game SHALL use a clip of a film only WHEN the film is free in the United States (published before 1931) and free in the European Union and Luxembourg (the last of its director, screenplay author, dialogue author and composer of music made for the film died more than 70 years ago, Directive 2006/116/EC Art. 2(2)), and a film that is free only in the United States (for example Night of the Living Dead, House on Haunted Hill and Carnival of Souls) SHALL NOT be used.
2. EVERY clip SHALL have an entry in a `PROVENANCE.md` kept beside the clip, giving the film and year, the shot and its time (a long film gets one entry for each scene cut from it), the source address and the date it was fetched, what the source file is (an original print or a restoration, and who made it), the credited makers with their death years read from at least two sources, why the film is free, the flash check of 18.6, any open point, and who checked it and when, clips cut from one source file MAY share one source record for the rows about that source (the source, what the file is, the makers, why it is free, the open point and the check) while each keeps its own shot, cut, size and flash check, and a test SHALL fail WHEN a clip has no entry or a missing row.
3. THE clip SHALL be taken from a public archive (Wikimedia Commons or the Internet Archive) and not from a disc, a streaming service or a copy that cannot be traced to a print, WHERE the copy is a restoration THEN the record SHALL say so and name who made it, and the clip SHALL be served from the game's own origin (a static asset, or a bucket behind the game's own Worker) with byte ranges so that a phone can start anywhere, with no hotlink and no third-party player.
4. THE clip SHALL be picture only: no audio track, none of the film's music, and no title card or intertitle (the original and restored ones are the restorers' work), and the game SHALL use its own sound.
5. THE screens SHALL treat footage as decoration: muted, `playsinline`, no controls, hidden from a screen reader, never needed to solve, read or finish anything, with no text over the picture (text sits in a solid panel at 4.5 to 1), stopped WHILE the page is hidden, a still poster frame WHEN the Player prefers reduced motion or the browser is set to save data (a tap on Play is the Player's own choice), loading only its metadata until its screen plays it (`preload="metadata"` for a file over 1 MB), a Stop control of at least 48 CSS pixels on the screen WHILE a scene that lasts over 5 seconds plays, and WHERE a clip cannot load THEN the still frame SHALL stay and nothing else SHALL break.
6. A scene SHALL last at most 10 minutes, each video file SHALL be at most 40 MB and at most 480 pixels high and its poster at most 50 KB, a scene SHALL come as a `.webm`, an `.mp4` (for iPhone) and a `.jpg`, a scene SHALL be screened with `tools/playtest/flash-check.mjs` and SHALL NOT show more than three flashes in any one second (WCAG 2.3.1; the light limits of Property 16 still hold for what the phone adds), a scene with lightning or a strobe SHALL also be watched by a person, and footage SHALL cost nothing per play beyond storage and delivery (no model call and no paid per-view service, 14.1).
7. THE credits SHALL name each film and year, and a film's title, poster or logo SHALL NOT be used as the game's name or in its store page or marketing.
8. BEFORE the game is sold, a lawyer SHALL read every `PROVENANCE.md` entry, the restoration point most of all, and a film marked Held or Check in the design SHALL NOT ship until it is checked.

### Requirement 19

**User Story:** As a Player at the table, I want the Turn Clock to be a shadow climbing the stairs on the shared screen, so that everyone feels the time and sees a Help or a Spook change it. (Clock shadow, added 2026-11-15)

#### Acceptance Criteria

1. WHILE a Turn Clock runs THEN the Host MAY show the clock shadow: one clip that is scrubbed and never played, whose position is `1 - remaining / base` of the Turn (0 at the start of the Turn, 1 when the clock reaches zero, held between), where `remaining` and `base` are the public values the Turn Clock shows.
2. WHEN a Help or a Spook changes the Turn Clock THEN the shadow SHALL step back or forward, within one second, by the share of the Turn that the change is (10 seconds of the base), because the shadow follows the clock and nothing else.
3. THE clock shadow SHALL take no input but the public Turn Clock, SHALL never move on a private result, a Hand, a Residue, an Inspect or the sender of a Nudge, SHALL stand still WHILE the clock is paused, and SHALL NOT be shown WHERE the Master chose no Turn Clock.
4. WHEN the Player prefers reduced motion, the browser is set to save data, or the Master has footage off THEN the shadow SHALL move at most once a second and never ahead of the clock, and the Turn Clock SHALL always be shown as numbers beside it (a picture is never the only signal).
5. THE clip SHALL have a clear picture at every position, the Host SHALL set its time at most ten times a second, and WHEN the clock reaches zero THEN it SHALL show its last frame and say in words that the clock ran out.

### Requirement 20

**User Story:** As a Player, I want the film on the shared screen to play forward as the Haunt rises, so that I read the danger from the picture and not from a number. (The Reel, added 2026-11-15)

#### Acceptance Criteria

1. THE Host MAY show the Reel: one shot for each Haunt level, from `reelShot(level, max)` in `tools/playtest/js/scenes.js`: the ship at levels 0 to 2, the crate at 3, the street at 4 and 5, the stairs at 6, the hand at 7 and 8, the bed from 9 to the level below the maximum, and the house at the maximum, for every maximum the Master can choose (8, 10 and 12), and the shot SHALL never go back to an earlier shot as the level rises.
2. WHEN the Haunt first reaches 3, 6 or 9 below the maximum (a Haunt Event of `party-mode`) THEN the shot SHALL differ from the shot of the level before, so that an Event is always seen.
3. WHEN the Haunt level rises THEN the Host SHALL play the shot of the new level once, muted, and SHALL say in words, in the public log and its live region, what the shot shows and that a Haunt Event fired, and the Haunt number and its meter SHALL stay on screen.
4. THE Reel SHALL move only on the public Haunt level, SHALL NOT play during the 15 second window after a Suggestion or during an answer choice, SHALL always be skippable, and SHALL NOT be shown on the Display under the pyramid in this version (its light limits are those of `party-mode` 7.4).
5. EVERY shot SHALL be a clip under Requirement 18 of at most 5 seconds, and the game SHALL work with every shot missing, because the Haunt number, the meter and the words carry the meaning.
6. THE Reel MAY play two sounds of our own with a shot, `scrape` (a claw on the rim of the crate, Haunt 3) and `knock` (the shadow hand at the door, Haunt 7 and 8), from `web/public/sounds/` and under the rules of the sound files in `docs/SOUNDS.md` (mono `.m4a`, at most 50 KB and 3 seconds, about -16 LUFS and not clipped, CC0 or bought, credited in `docs/sounds/CREDITS.md`, no words and no real person's voice), only WHERE the Master has sound on, never as the only signal of a shot (the words of 20.3 carry the meaning), and the game SHALL work with both missing. Each sound SHALL start at the moment of its shot that it belongs to while the shot plays (`SOUND_AT` in `tools/playtest/js/scenes.js`: the scrape 3.1 seconds and the knock 2.1 seconds into the shot, found on the frames of the clips), and at once when the picture is still, and a sound still waiting for its moment SHALL be dropped when the Reel moves to another level.
7. WHEN a Haunt Event applies (`party-mode` 11.2: the first option at once, or the Poltergeist's choice within 15 seconds) THEN the Reel SHALL sit under the one line the Room already speaks for it, the Whisper's `haunt.cold-spot`, `haunt.blackout`, `haunt.restless` or `haunt.lull` line, WHERE the Master has spoken narration on (`party-mode` 7.6, off by default), over the shot of the level that fired the Event, still playing or held on its last frame, with the same line in the log, the live region and the captions, and the Reel SHALL add no spoken line of its own and no Event of its own.
8. THE shot SHALL be chosen by the Haunt level and the line by the Event kind, independently, so a shot at an Event level SHALL be a mood shot that shows no Event kind (no cold place, no lights going out, no restless ghost, no lull) and no shot's words SHALL name one, and WHEN the Event is a Blackout THEN the shot SHALL dim by the same amount and over the same time as the Host scene, within the photosensitivity limits of `party-mode` 7.4.
9. WHEN the Haunt falls (a Lull) THEN the Reel SHALL show the shot of the new, lower level held on its last frame and SHALL NOT play it, so that the picture lets go with the line, and WHERE footage or spoken narration is off THEN the Event SHALL read the same in the log and nothing SHALL be lost.

### Requirement 21

**User Story:** As a Player, I want the game to end on a scene and a card of words, so that a win and a haunting feel different and the end can be shared. (Two endings and title cards, added 2026-11-15)

#### Acceptance Criteria

1. WHEN the game ends with a Detective winner THEN the Host MAY play the shot `dawn` (the sun rises and the window is empty) and then show a title card, and WHEN the house wins THEN it MAY play the shot `house` (something waits in a doorway and a woman hides her face at a window) and then show a title card.
2. THE house card SHALL say that the haunting continues, that no one won and who joined the haunting (the rule of `party-mode` on the ending screen), and no card, string or log line of the scenes SHALL use the word Poltergeist.
3. THE title card SHALL be our own words in the design system's own font on our own card, never a card or intertitle taken from a film, and the ending recap of `party-mode` SHALL follow it.
4. WHILE an ending shot plays THEN a Skip control of at least 48 CSS pixels SHALL be on screen, and Skip SHALL stop the shot and show the card at once.
5. WHEN footage is off (reduced motion, data saver, a clip that cannot load) THEN the card SHALL show at once with the still frame, and the ending SHALL read the same in words.
6. THE shot and the card SHALL show only public state: who won or that the house did, and the nicknames of those who joined the haunting, and never the Solution before the order of the recap allows it.

### Requirement 22

**User Story:** As a Player watching the TV, I want a clue to be written on something in the scene, such as a brass plate on a door or a misted window, so that the film feels like the house and not like a screen with a caption on it. (Scene clues, added 2026-11-15)

#### Acceptance Criteria

1. A Place SHALL be declared in `tools/playtest/js/places.js` for each shot that may carry a Scene clue: the shot, the four corners of one blank surface (shares of the picture's width and height, in order, forming a convex four-sided shape at least 12 per cent of the width and 8 per cent of the height), the surface (`plate`, `pane`, `page` or `plaque`), the ink (`engraved`, `condensation` or `handwritten`), the times from which it is in view and unobstructed (`from`, and `to` up to the last frame) and its measured brightness. A shot with no Place SHALL never carry a Scene clue.
2. WHERE the Clue place setting is `world` (`world-clues`) THEN the Host MAY draw one Scene clue on a Place: a World Clue or Decoy of the Public View whose answer is text (a code, a time or a word), together with its Sign, and never a Spirit clue, a card, the Solution, a Hand, a Residue position or the answer of a Lock that is not a World Clue.
3. THE Scene clue SHALL be drawn by the Host over the video while the game runs and never in a clip file, so the same file serves every game, and a clip file SHALL show no mark at its Place (no letter, digit, Sign or line: the Place's pixels carry no more edge energy than the clip's own grain in any frame of the window, checked by `tools/playtest/place-check.mjs`).
4. THE Scene clue SHALL look like part of the scene: drawn no sharper than the clip (at the clip's own pixel size, then scaled up with the same smoothing), fitted to the Place by a perspective transform of its four corners, blended with `multiply` for dark ink on a light surface and `screen` for light ink on a dark one (the ink being `ink` or `bone` of the tokens, with no hue), set in IBM Plex Mono for `engraved` and in Newsreader italic for `handwritten` and `condensation`, and the grain, flicker and vignette of the film SHALL be laid once over the clip and the Scene clue together, as the last layer, so that no seam shows.
5. THE Scene clue SHALL be in view only from the Place's `from` time until the shot is replaced (the held last frame included), SHALL fade in over `fade-slow` and out over `fade` and not at all under reduced motion, and SHALL show no flash and no movement of its own (the photosensitivity limits of `party-mode` 7.4).
6. THE Scene clue SHALL be readable: its ink SHALL be at least 4.5 to 1 against the Place's measured brightness and its letters at least 5 per cent of the picture's height, and a Place that cannot meet both for the clue's text SHALL not be used for it.
7. EVERY Scene clue SHALL also be in the Clue list as words, with the name of its Sign, in a solid panel at 4.5 to 1, SHALL be said once in the live region (for example "A clue is written on the brass plate: the moon, 3 2 5."), and WHEN footage is off (reduced motion, data saver, a hidden page, a clip that cannot load) or the shot has no Place THEN the panel SHALL show the clue at once and nothing SHALL be lost. This is the one place where words sit on the picture, an exception to 18.5, allowed because the picture is never the only way to read the clue.
8. THE choice of the World Clue or Decoy a Place shows SHALL be a function of the seed, the shot and the Public View only, SHALL be the same for the same inputs, SHALL be made without reading the Solution, and a Decoy SHALL look the same as a clue in every way (the same Place, ink, timing and size) except its Sign and its answer.
9. A Bot SHALL ignore Scene clues, a phone SHALL show none on its footage (a Spirit clue is private and a Scene clue is for the table), and the Display under the pyramid SHALL show none in this version.
10. A clip made by a model SHALL have a Place only after a person has looked at every frame of the Place's window and `place-check.mjs` has passed it, and its `PROVENANCE.md` entry SHALL name the model, the date, the prompt and the take.
