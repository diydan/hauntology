# Requirements Document

## Introduction

Puzzles are short phone mini-games that guard something the player wants. In Party Mode, each Zone gets a **Lock**; Inspect opens it, and solving it gives the same private Residue answer a plain Inspect gives today. In Wander, an optional Lock sits in front of each memory and can always be skipped. There are ten Kinds (Lock pick, Cut wires, Clock time, Safe code, Music box, Candle order, What moved, Torn photo, Hidden words, Spirit board) and one optional extra (Marble maze). Four of them test **memory across scenes**: a small private clue (a **Sight**) is shown once in an earlier place, and the Lock needs it later. The phone is the instrument: it tilts (gyroscope), buzzes (vibration), plays synthesised sound and, once, listens for a breath. Every one of those is an extra, never a requirement: each Kind can be finished with touch alone, and every sound and buzz has a visual twin.

A Puzzle changes no rule. It never touches the Solution, a Hand, a Residue position, the Haunt, Resolve or Bonus Seconds. It decides only whether, and how fast, one Player learns what is in the Zone they are standing in. It costs nothing to run: no model, no paid call, no new sound file (except the Whisper reading a short word for the Spirit board). Design reference: the Cyber-Orb demo (tilt moves a ball, a wall hit buzzes the phone), read for ideas only and not copied (its licence is CC BY-NC 4.0).

## Glossary

- **Puzzle**: one playable mini-game of a **Kind**.
- **Kind**: one of `lockpick`, `wires`, `clock`, `safe`, `musicbox`, `candles`, `moved`, `photo`, `words`, `board`, and the optional `maze`.
- **Lock**: a Puzzle placed in front of something: a Zone's Residue (Party Mode) or a memory (Wander). A Lock has a Kind, a level and a seed.
- **Level**: `easy` or `normal`. The two differ only in size and tolerance.
- **Puzzle setting**: `off`, `easy` or `normal`, set for a Room by the Master (Party) or by a visitor (Wander).
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

## Requirements

### Requirement 1

**User Story:** As a Player in Party Mode, I want Inspect to be a small puzzle on my phone, so that searching a Zone is something I do and not something I wait for.

#### Acceptance Criteria

1. WHEN the Puzzle setting is easy or normal and a human Player standing in a Zone starts Inspect THEN the Room SHALL open that Zone's Lock on the Player's phone instead of the plain 10 second wait, and WHEN the setting is off THEN Inspect SHALL behave exactly as the party-mode rule, so the result, the log line and the time charged are identical to a Room without this spec.
2. WHEN a Lock is solved THEN the Room SHALL show the Player privately exactly what a plain Inspect shows (the Residue card in that Zone or that there is none), mark the Zone inspected for that Player, add nothing else to the public log, and charge the Turn the time spent, never less than 10 seconds and never more than the Cap.
3. IF the three Attempts are spent, or the Cap is reached, or the Player gives up, or the Turn ends THEN the Room SHALL close the Lock with "nothing came loose", show nothing about the Zone, NOT mark the Zone inspected (the Player may open the same Lock again that Turn or on a later Turn), charge the same time as in 1.2, and WHEN a Cold Spot covers the Zone THEN the Lock SHALL still open, as Inspect does.
4. THE Room SHALL take the Puzzle setting from the preset (Classic normal, Gentle easy, Quick off), let only the Master change it, apply a change from the next Inspect, and send the setting to every phone in the Public View.
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

1. THE **Lock pick** SHALL show 3 (easy) or 4 (normal) pins, each with a hidden sweet-spot window of 14 (easy) or 10 (normal) degrees inside a range of minus 40 to plus 40 degrees, WHILE the Player holds the tension button THEN the pick position SHALL follow Tilt (or a slider on the Touch path), the phone SHALL buzz faster the nearer the pick is to the current pin's window and click on entering it, a pin SHALL set after the pick stays in its window for 400 milliseconds, pins SHALL set in order, and the Lock SHALL open when every pin is set.
2. THE **Cut wires** SHALL show 4 (easy) or 5 (normal) cut wires, each with its own colour and its own pattern, with the cut ends in a shuffled order on the left and numbered terminals on the right with no colour, WHEN the Player drags each wire to a terminal and submits THEN the Room SHALL accept the Attempt only when each wire is on the terminal that matches its place in the Sight (the fuse box seen earlier, top to bottom), and the phone SHALL buzz a snap when a wire connects and a short buzz when an Attempt is wrong.
3. THE **Clock time** SHALL show a clock face with the hands at 12:00 and the Player SHALL set the hands by dragging them or, with motion on, by turning the phone like a dial, in steps of five minutes with a tick buzz at each step, and WHEN the Player submits THEN the Room SHALL accept the Attempt only when the time equals the time on the stopped clock in the Sight.
4. EVERY Kind SHALL have an easy and a normal level that differ only in size (pins, wires, notes, pieces, letters, digits) and tolerance, the Room SHALL use easy under the Gentle preset and normal under Classic, and the two levels SHALL use the same input and the same rules.

### Requirement 4

**User Story:** As a Player, I want a safe to crack, a music box to answer, candles to put out in order and a room to compare, so that there are different kinds of remembering.

#### Acceptance Criteria

1. THE **Safe code** SHALL show a dial of the digits 0 to 9 where the Player turns to each digit of a code of 3 (easy) or 4 (normal) digits and presses Set, with a click at each digit and a thunk on Set, WHEN the Player has set every digit THEN the Room SHALL accept the Attempt only when the code equals the code on the plaque in the Sight, and with motion on the Player MAY turn the dial by twisting the phone.
2. THE **Music box** SHALL play a tune of 3 (easy) or 4 (normal) notes from five notes up to three times (each play starts with a button the Player presses), and WHEN the Player plays the tune back on five keys THEN the Room SHALL accept the Attempt only when the notes and their order are equal, with every note also lighting its key and buzzing once.
3. THE **Candle order** SHALL show 4 (easy) or 5 (normal) lit candles, show the order they must go out by letting each gutter once in turn (shown up to two times), and WHEN the Player snuffs the candles by tapping them in that order THEN the Room SHALL accept the Attempt, a wrong order SHALL relight every candle and count as a wrong Attempt.
4. THE **What moved** SHALL show in its Sight a shelf of 6 (easy) or 8 (normal) objects, and at the Lock the shelf SHALL fade to dark for 2 seconds and return with 2 (easy) or 3 (normal) objects changed (moved, swapped or missing), and WHEN the Player taps the changed objects and submits THEN the Room SHALL accept the Attempt only when the chosen set equals the changed set, and the phone SHALL rumble once during the dark.

### Requirement 5

**User Story:** As a Player, I want a torn photo, hidden words, a spirit board and an optional marble maze, so that the set is complete and a few of them use the phone as a tilting object.

#### Acceptance Criteria

1. THE **Torn photo** SHALL show in its Sight a picture drawn from simple shapes, and at the Lock the picture SHALL be torn into 4 (easy) or 6 (normal) pieces, shuffled and turned in 90 degree steps, the Player SHALL tap to turn and drag to place, the phone SHALL click when a piece fits, and the Room SHALL accept the Attempt when every piece is in its place and turned the right way.
2. THE **Hidden words** SHALL show a dark panel where a torch beam, moved by Tilt (or a finger on the Touch path), shows the letters of a word of 4 (easy) or 5 (normal) letters set left to right at different heights, the phone SHALL buzz when the beam crosses a letter, and the Room SHALL accept the Attempt when the Player taps the letters in reading order.
3. THE **Spirit board** SHALL show the 26 letters in three rows large enough for a thumb, a planchette and, under the board, a short clue of a few words that never contains the word and the number of letters, the Whisper SHALL say a word of 3 (easy) or 4 (normal) letters and then its clue and then the word again, up to twice, the planchette SHALL roll under Tilt (or move under a finger on the Touch path) and SHALL be drawn gently toward a letter it is nearly resting on, and the Player SHALL select the letter under the planchette by tapping anywhere on the board or by resting on it for 350 milliseconds (or by tapping a letter directly on the Touch path), with a tick when it reaches a letter and a thunk when one is chosen, and the Room SHALL accept the Attempt when the letters spell the word.
4. WHERE the optional **Marble maze** is built THEN it SHALL show one of five authored mazes with an orb that rolls under Tilt (or a finger drag), a 100 millisecond buzz and a bump sound on every wall hit, and a hole, and the Room SHALL accept the Attempt when the orb reaches the hole at a plausible time.

### Requirement 6

**User Story:** As a Player, I want to remember something from an earlier scene and use it later, so that exploring the whole house matters.

#### Acceptance Criteria

1. WHEN a human Player moves into a Zone they have not been in before, or starts a Turn in one, and that Zone holds a Sight THEN the Controller SHALL show the Sight once for 5 seconds (8 with Assist), let the Player close it earlier with a tap, and the seat SHALL record that it was shown, and no other seat SHALL be told.
2. THE Sight SHALL be a function of the seed, the Kind and its place only, and SHALL carry exactly the clue the Lock needs: the order of the wires, the time on the clock, the code, the shelf or the finished picture.
3. WHEN a Player opens a Lock whose Sight they never saw THEN the Controller SHALL show the same clue once at the Lock for 4 seconds (8 with Assist) before the Puzzle starts, with no other change, so that a missed Sight never blocks a Lock.
4. WHERE Assist is on (the Gentle preset turns it on) THEN the notebook SHALL keep a Sights page with every clue shown to that Player, and WHERE Assist is off THEN a clue SHALL never be shown again after it closes.
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

1. WHEN a Kind uses Tilt as its main input (Lock pick, Hidden words, Spirit board, Marble maze) on a device with a touch screen THEN the Controller SHALL turn Tilt on by default, asking for motion permission only inside the tap that starts the Lock (or from an explicit "Use tilt" control), SHALL leave Tilt on only where a motion sensor really answers, SHALL NOT ask for a Kind that does not use Tilt, SHALL keep it off once the Player turned it off, remember the answer on that device, and WHERE permission is denied or no sensor exists THEN it SHALL use the Touch path with no error and without a long wait.
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
3. EVERY control SHALL have a touch target of at least 48 CSS pixels, a wire, a candle, a piece or an object SHALL never be told apart by colour alone (each has a pattern or a shape), and every state SHALL have a text label for a screen reader.
4. WHEN the Player prefers reduced motion THEN the Controller SHALL turn off screen shake and beam sway, and SHALL leave the Player's own Tilt and buzz settings as they chose.
5. THE Controller SHALL offer Assist as a device setting (off by default, on under the Gentle preset), which keeps Sights in the notebook, lengthens Sights and Faded clues to 8 seconds and shows text for the Spirit board, and SHALL change no verdict of `verify`.

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
3. THE Puzzles SHALL use no third-party game code, picture or sound; the Cyber-Orb demo and its licence (CC BY-NC 4.0) SHALL be referenced as a design source only, and nothing from it SHALL be copied.
4. THE project SHALL record the phone checks in `docs/spikes/puzzles-<n>.md` and add the unverified assumptions of this spec to `.kiro/steering/tech.md`.
