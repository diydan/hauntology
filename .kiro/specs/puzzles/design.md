# Design Document

## Overview

A Puzzle is a small pure function plus a small screen. The pure part lives in `shared/src/puzzles/` and does everything that can be wrong: making a Lock from a seed, making its Sight, checking a Transcript, charging time, placing Locks in Zones, and the maths of Tilt, buzz, sound, light and breath. The screen part lives in `web/src/puzzles/` and only draws and listens. The phone sensors sit behind four small interfaces (motion, haptics, synth, breath) so that tests, the demo and a desktop browser can swap them.

Decisions:
- **The phone is an extra, never a requirement.** Every Kind has a touch path and every buzz and sound has a visual twin. A phone with no gyroscope, no vibration (iPhone), a muted speaker and no microphone plays the whole game.
- **A Puzzle changes no rule.** The generator does not receive the Solution, a Hand or a Residue position, so it cannot depend on them. A solved Lock calls the unchanged party-mode `inspect`; a failed one calls nothing.
- **Never a dead end.** A missed Sight becomes a Faded clue shown at the Lock. A Wander Lock can always be skipped. Plain Inspect is always there as an access setting.
- **Memory is the point of four Kinds.** A Sight is shown once, in a different place, and is not shown again unless Assist is on.
- **Fixed time steps, not event rates.** Tilt physics runs at 60 steps a second whatever the phone reports. (The Cyber-Orb demo adds raw tilt to velocity on every event, so a phone that reports twice as often rolls twice as fast.)
- **Cheapest first.** Build the sensor layer and three Kinds (Clock time, Cut wires, Lock pick) first, then the second set, then the third. Nothing in the third set is needed for the demo.

## Architecture

```
 phone  web/src/puzzles/                server  PartyRoom / PlaySession           shared/src/puzzles (pure)
 ---------------------------            -------------------------------           ---------------------------
 SightCard      <-- sight ------------  sightsOnEntry(seat, zone)  -------------> sightFor(seed, place)
 PuzzleHost     <-- puzzle_view ------  openLock(seat, zone, now)  -------------> makeLock(seed, kind, level)
   Kind screen                                                                    placePuzzles(seed, zones)
   Feel layer (motion, haptics,
   synth, breath)
 (player moves)  -- puzzle_attempt --->  submitAttempt(seat, transcript, now) --> verify(lock, transcript)
                 <-- puzzle_result ----  charge the Turn: lockCharge(...)
                 <-- inspect_result ---  party-mode inspect()  (private, only on a solved Lock)
```

Wander uses the same pure code through three thin routes on `PlaySession` (open, attempt, skip) and a gate in front of the `reveal` Directive.

### `shared/src/puzzles/` (pure; clock and rng injected)

`types.ts` (Kind, Level, PuzzleSetting, LockView, LockSecret, Sight, Transcript, schemas, errors), `rng.ts` (seeded generator), `kinds.ts` (the registry below), `words.ts` (the fixed word lists and the Spirit board clues), `make.ts` (`makeLock(seed, kind, level)` with one function per Kind), `sight.ts` (`sightFor`, `fadedFor`), `place.ts` (`placePuzzles`, `kindForDiscovery`), `verify.ts` (`verify`, `referenceSolve`), `charge.ts` (`lockCharge`, `plainInspectCharge`), `inspect.ts` (`openLock`, `submitAttempt`, `closeLock`: the Party reducers), `wander.ts` (`gateReveal`, `skipAvailable`, the Wander reducers), `settings.ts` (`presetSetting`, `capFor`), `motion.ts` (`smoothTilt`, `tiltForScreen`, `zeroTilt`, `tiltToPosition`, `dialFromGravity`), `tilt-ball.ts` (`stepBall`, `advanceBall`), `haptics.ts` (`PATTERNS`, `hotColdInterval`, `planHaptics`), `sound.ts` (`RECIPES`, `planSound`), `dim.ts` (`dimPlan`, `torchPlan`, `candlePlan`), `blow.ts` (`blowDetect`).

`shared/src/puzzles/` imports nothing from `web` or `api`, and no function calls `Date.now()` or `Math.random()`.

### `web/src/puzzles/`

`PuzzleHost.tsx` (the full-screen frame: timer ring, Attempts left, give up, the Touch path switch), `SightCard.tsx`, `kinds/<Kind>.tsx` (one screen each), `feel/haptics.ts` (`browserHaptics`), `feel/synth.ts` (`browserSynth`), `feel/motion.ts` (`browserMotion`), `feel/breath.ts` (`browserBreath`), `fakes.ts` (`FakeMotion`, `FakeHaptics`, `FakeSynth`, `FakeBreath`), `PuzzleSettings.tsx` (Master panel row, Wander switch, device settings), `SightsPage.tsx` (the notebook page, Assist only). **Spacing:** every screen uses one scale of 4, 8, 12 and 16 px (`--pz-space-1` to `--pz-space-4` in `puzzles.css`). A screen's blocks are one even stack 12 px apart (`.pz-stage > div`), the things that belong together sit 8 px apart (`.pz-field`, `.pz-twist`, rows and grids), and no block brings its own margin; `spacing.test.ts` keeps every gap, margin and padding on the scale. The four interfaces arrive through `PlatformKit.puzzleFeel`, so the shell, the tests and the demo swap them in one place.

### `api/src/do/` and routes

`PartyRoom` gains a `locks` record and a `seenSights` set per seat (see Data models). `PlaySession` gains `lockState`. Wander's three routes are thin: `POST /api/play/lock/open`, `POST /api/play/lock/attempt`, `POST /api/play/lock/skip`, each behind the origin and session-cookie checks and the one-attempt-a-second limit.

## Data models

```ts
export const KINDS = ['lockpick','wires','clock','safe','musicbox','candles','moved','photo','words','board','maze'] as const;
export type Kind = typeof KINDS[number];
export type Level = 'easy' | 'medium' | 'hard';
export type PuzzleSetting = 'off' | Level;
export const MEMORY_KINDS: readonly Kind[] = ['wires','clock','safe','moved','photo'];

// What the phone draws. Never holds the answer of a server-held Kind.
export type LockView = { lockId: string; kind: Kind; level: Level; capMs: number | null; attempts: 3 | null; spec: KindSpec };
// What only the server holds.
export type LockSecret = { answer: KindAnswer };
export type Lock = { lockId: string; where: { zone: string } | { discovery: number }; kind: Kind; level: Level; seed: number; sight: SightRef | null };
export type SightRef = { sightId: string; kind: Kind; place: { zone: string } | { discovery: number } };
export type Sight = { sightId: string; kind: Kind; payload: SightPayload; showMs: number };

export type Transcript =
  | { kind: 'lockpick'; sets: { pin: number; atDeg: number; atMs: number }[]; elapsedMs: number }
  | { kind: 'wires'; pairs: [wire: number, terminal: number][]; elapsedMs: number }
  | { kind: 'clock'; h: number; m: number; elapsedMs: number }
  | { kind: 'safe'; code: number[]; elapsedMs: number }
  | { kind: 'musicbox'; notes: number[]; elapsedMs: number }
  | { kind: 'candles'; order: number[]; elapsedMs: number }
  | { kind: 'moved'; changed: number[]; elapsedMs: number }
  | { kind: 'photo'; placed: { piece: number; slot: number; turns: number }[]; elapsedMs: number }
  | { kind: 'words'; letters: number[]; elapsedMs: number }
  | { kind: 'board'; letters: string; elapsedMs: number }
  | { kind: 'maze'; reachedAtMs: number; hits: number; elapsedMs: number };

export type Verdict = { ok: true } | { ok: false; code: 'wrong' | 'malformed' | 'too_big' | 'too_fast' };
export type LockOutcome = 'solved' | 'wrong' | 'failed';
export type CloseReason = 'attempts' | 'cap' | 'gave_up' | 'turn_ended';

export type PartyLocks = {
  placed: Lock[];                                              // one per Zone, fixed at the start
  open: Record<SeatId, { lockId: string; openedAt: number; attemptsUsed: number; lastAttemptAt: number | null } | null>;
  seen: Record<SeatId, string[]>;                             // sightIds shown to that seat
  plain: Record<SeatId, boolean>;                             // Plain Inspect on this seat
};
export type WanderLocks = { on: boolean; discovered: string[]; seen: string[]; open: { lockId: string; openedAt: number; wrong: number } | null };
```

`Transcript` is zod-validated and capped at 64 events or 4 KB (`too_big`). Transcripts, open Locks and `seen` are deleted with the Room or the Session.

### New error codes (`shared/src/errors.ts`)

`puzzle_disabled`, `puzzle_not_open`, `puzzle_already_open`, `puzzle_bad_transcript`, `puzzle_too_fast`, `puzzle_rate_limited`, `puzzle_attempts_spent`, `sight_unknown`.

## The ten Kinds, and one extra

| Kind | Memory | The clue or the tune | Touch path | Tilt | Buzz | Sound | Answer on phone | Min solve |
|---|---|---|---|---|---|---|---|---|
| `lockpick` | no | none | slider for the pick, hold button | pick position | hot and cold, click on a window, thunk on a pin | click, thunk | yes (windows) | 800 ms per pin |
| `wires` | **yes** | wire order, top to bottom (fuse box) | drag each wire | none | snap, buzz when wrong | snap, zap | no | 2500 ms |
| `clock` | **yes** | the time on a stopped clock | drag the hands | turn like a dial (optional) | tick every 5 min | tick | no | 1500 ms |
| `safe` | **yes** | the code on a plaque | drag the dial, press Set | twist the phone (optional) | click per digit, thunk on Set | click, thunk | no | 3000 ms |
| `musicbox` | no | the tune, played up to 3 times | five keys | none | one pulse per note | five synth notes | yes (tune) | 600 ms per note |
| `candles` | no | the order, shown up to 2 times | tap each candle | none | tick per gutter | breath-like noise | yes (order) | 2000 ms |
| `moved` | **yes** | the shelf before the dark | tap changed objects | none | one rumble in the dark | creak | yes (after shelf) | 3000 ms |
| `photo` | **yes** | the finished picture | tap to turn, drag to place | none | click on a fit | rustle | yes (picture) | 1000 ms per piece (4, 6 or 9 s) |
| `words` | no | none | drag the torch | torch aim | pulse on a letter | none | yes (letters) | 3000 ms |
| `board` | no | the word and a short clue, spoken up to 2 times | drag the planchette, tap letters | planchette rolls and is pulled to a letter; a tap picks it | tick per letter, thunk on choose | the Whisper, tick | no | 800 ms per letter |
| `maze`* | no | none | finger drag | orb rolls | bump on a wall (100 ms) | bump | yes (layout) | 4000 ms |

Min solve times are starting guesses. Spike puzzles 1.5 sets them.

**Level sizes** (easy / medium / hard): lockpick 3 / 4 / 5 pins and 14 / 10 / 8 degree windows; wires 4 / 5 / 6; clock steps of 15 / 5 / 1 minutes; safe 3 / 4 / 5 digits; musicbox 3 / 4 / 5 notes, 3 / 3 / 2 plays; candles 4 / 5 / 6, 2 / 2 / 1 shows; moved 6 / 8 / 9 objects, 2 / 3 / 4 changes, at most 1 / 1 / 2 missing, 2 / 2 / 1.5 s of dark; photo 2x2 / 3x2 / 3x3 pieces; words 4 / 5 / 6 letters; board 3 / 4 / 5 letters, 2 / 2 / 1 hearings; maze 9x11 / 9x13 / 9x15 (hard has one way through). Classic plays medium, Gentle easy; hard is a Master choice only.

**Wires** are told apart by colour and pattern (stripe, dots, zigzag, plain, check). The Sight shows the order; the terminals on the right are only numbered, so the colours must be remembered or read from the notebook.

**Clock time**: minutes are multiples of five; hours 1 to 12; the stopped clock in the Sight uses the same face as the Lock.

**Music box notes**: five notes, 392, 440, 523, 587 and 659 hertz (a pentatonic set, so any order sounds fine), triangle wave with a 400 millisecond decay.

**Words and the Spirit board** use two fixed lists in `words.ts` (24 words each, A to Z only, 3 to 5 letters, gentle: `ELM`, `OWL`, `FERN`, `MOON`, `LAMP`, `EMBER`, `QUILT`, no death or gore words, no real names). The 24 board words each get one Library line of the Whisper (`puzzle.board.<word>`) so they are rendered once, before a deploy, like every other scripted spoken line.

## How a Lock is made and checked

`makeLock(seed, kind, level)` is deterministic: the same three inputs give the same Lock and the same answer, and the function takes nothing else. Its seed is `hash(roomSeed, "lock", zoneId)` (Party) or `hash(sessionSeed, "lock", discoveryIndex)` (Wander).

`referenceSolve(lock)` is the touch-path solver used by the tests: it builds the Transcript a careful Player would send. `verify(lock, transcript, now)` returns a `Verdict`:
1. Reject anything that fails the schema (`malformed`) or is over 64 events or 4 KB (`too_big`).
2. Reject `elapsedMs` under the Kind's minimum solve time (`too_fast`).
3. Compare with the answer. For `lockpick` and `maze` compare only plausibility: pins in order, each `atDeg` inside the window, `atMs` increasing and at least 400 ms apart; for the maze, a reach time above the minimum and a hit count within bounds. Say so in the UI copy for nobody; say so in this document: in a same-room game a forged Transcript costs nothing but pride (`security-and-cost.md`).
4. Otherwise `wrong`.

`verify` never throws and gives no partial score.

### The Party flow

1. **Entering a Zone.** The Room checks `sightFor` for that Zone. If it holds a Sight and the seat has not `seen` it, the Room sends `sight {sightId, kind, payload, showMs}` to that seat only. The phone shows the card, a heartbeat buzz, and answers `sight_ack`; the Room adds the id to `seen` on the ack and resends on reconnect if there was none.
2. **Inspect.** The Player presses Inspect inside a Zone. With the setting off, or `plain[seat]`, the old path runs (`plain[seat]` charges the Cap). Otherwise `openLock` sends `puzzle_view` to that seat only. If the Lock needs a Sight the seat never saw, the view carries the Faded clue and `fadedMs`.
3. **Public line.** At open the Room adds one `inspect` line with the Zone, exactly as a plain Inspect does. Nothing is added at close, so a solved and a failed Lock look alike.
4. **Attempts.** `puzzle_attempt {lockId, transcript}` gets `puzzle_result {outcome, attemptsLeft}`. Three wrong, or the Cap, ends the Lock as `failed`. On `solved` the Room calls party-mode's `inspect()` and sends its private result as it always does.
5. **Charge.** `lockCharge(elapsedMs, capMs) = clamp(elapsedMs, 10000, capMs)`. A solved or failed Lock charges the same way. The Room moves the Turn deadline by the difference between the charge and the real time already spent (never past zero).
6. **Close.** A give-up, the Cap and the end of the Turn close the Lock `failed` and leave the Zone un-inspected.

### The Wander flow

`gateReveal(state, action)` sits between `step` and the `reveal` Directive. With `locks.on` false it is the identity function (Property 8). With it on and the visitor inside an unfound Anchor's radius, it opens that Anchor's Lock and withholds the reveal. When the Lock is solved or skipped it lets the original `reveal` through unchanged. `skipAvailable(elapsedMs, wrong)` is true from 20 seconds or two wrong Attempts. The Lock Kind for the first discovery is chosen from the Kinds with no Sight (`lockpick`, `musicbox`, `candles`, `words`, `board`, `maze`); later ones from any Kind, and a Memory Kind takes the Sight shown after the previous memory.

### Where Sights sit

`placePuzzles(seed, zones, setting)` shuffles the enabled Kinds with the seeded rng, gives each Zone one Lock (each Kind at most twice) and, for every Memory Kind at Zone `i`, puts its Sight in Zone `i + 1` (wrapping). Since every Zone is the next of exactly one Zone, a Zone holds at most one Sight. A Zone's Sight is the clue for the Lock one step behind it, so a Player learns it by walking on and then comes back, which is the "remember it from the last scene" idea.

## Spirit clues (an optional layer over Sights)

An optional layer, off by default, that shows a Sight as clues hanging in the air round the phone. It changes how a Sight is delivered and nothing else: the Safe code still needs the same code, `verify` is untouched, and a phone without the layer sees the plaque of 6.1.

**What it is.** The Player turns the phone (or drags) and sees a ring with a question mark where a clue hangs. Keeping the view on a ring for 0.7 seconds reads it. (The first mockup used a faint additive glow, which could not be seen over a camera picture, so the hint is a dark disc with a light ring and a question mark.) There are four forms:

| Form | Looks like | Example (made up) | Needed by a Lock? |
|---|---|---|---|
| Code piece | A glowing digit with dots for its place (2 of 4) | 7 | Yes: the Safe code |
| Address | Underlined chalk letters | 9 Marrow Lane | No (Story clue) |
| Phone number | Handwriting, with "call" above it | 555-0142 | No (Story clue) |
| Date | A torn calendar page | 12 March 1931 | No (Story clue) |

Story clues are flavour: they say something about the haunted place, and v1 gives them no Lock. Making a date, an address or a phone number the answer of a new Kind (a calendar, a street sign, a phone dial) is on the list below.

**Pure logic** (`shared/src/puzzles/clues.ts`, no clock or sensor inside):

```ts
type ClueForm = 'code' | 'address' | 'phone' | 'date';
interface SpiritClue { id: string; form: ClueForm; text: string; place?: number; of?: number; turn: number; height: number } // radians; turn 0 is ahead, positive is to the right
placeClues(seed: number, code: string): SpiritClue[]            // the ring, from the seed and the code only
stepRead(progress: number, angleRad: number, dtMs: number): number // 0..1; reads at 1
```

`placeClues` makes n clues (the digits, plus up to three Story clues), cuts the turn into n equal slots, puts one clue at the middle of each slot with a seeded jitter of at most 8 degrees, and shuffles which clue takes which slot. With n at most 7 the slots are at least 51 degrees wide, so two clues are never closer than 35 degrees of turn, and for n of 4 or more each quarter of the turn holds a slot middle. Heights come from the seed, between -30 and +40 degrees. The Story clue values come from three fixed lists (`ADDRESSES`, `DATES` and a Phone number built as `555-01` plus two digits), so nothing real can be shown. `stepRead` rises by `dtMs / 700` while the angle is within 0.2 radians (12 degrees), falls by `dtMs / 1400` otherwise, and is clamped to 0..1.

**The phone** (`web/src/puzzles/clues/`): `ClueRing.tsx` draws the clues as three.js sprites round the camera, turned by `DeviceOrientationEvent` (the same tilt of the feel layer, so the same permission tap and the same drag fallback) with `ClueList.tsx` beside it. It is a lazy chunk loaded only when the layer is on, uses the three.js the web app already has, and draws at most 30 frames a second. The optional camera backdrop is a `<video>` element under the three.js canvas, started with `getUserMedia({ video: { facingMode: 'environment' }, audio: false })` from the Player's tap on Camera, with a visible indicator and a stop control, and stopped when the ring closes or the page is hidden; no frame is ever read into a canvas, stored or sent. The Controller turns the Sight into the ring: the ring replaces the 5 seconds of a plain Sight, and the Faded clue at a Lock stays text.

**Reference.** A mockup of the ring (and of a private 3D board round it) is `tools/playtest/ar.html`, on the playtest site. It has the same four forms, the question-mark ring, the 0.7 second read, the arrow, the Clue list and "Show all as text", and its test `tools/playtest/test/ar.test.js` checks the Phone number is in the fiction range. It tracks the phone's turn only (three degrees of freedom): it does not pin a clue to a place in the room, so a clue can drift and the Player can press Place to centre the ring again. The mockup also offers the camera behind the picture, which this spec allows as an opt-in (15.10).

**Not in v1.** A clue split across two phones; Story clues as the answer of a Lock; clues pinned to the room with WebXR (Android only).

## The feel layer

```ts
export type Tilt = { x: number; y: number };                  // degrees, neutral at the zero tap
export interface Motion { request(): Promise<'granted' | 'denied' | 'unsupported'>; subscribe(cb: (t: Tilt) => void): () => void; zero(): void }
export interface Haptics { available: boolean; play(name: HapticName): void; hotCold(distanceDeg: number, windowDeg: number): void; stop(): void }
export interface Synth { unlock(): Promise<void>; play(name: SoundName): void; note(index: 0 | 1 | 2 | 3 | 4): void; stop(): void }
export interface Breath { request(): Promise<'granted' | 'denied' | 'unsupported'>; subscribe(cb: (level: number) => void): () => void; stop(): void }
export type PuzzleFeel = { motion: Motion; haptics: Haptics; synth: Synth; breath: Breath };
```

### Motion (the gyroscope)

**Default on.** On a phone with a touch screen, Tilt turns on by itself for the four Kinds that steer with it, and the permission request rides on the tap that starts the Lock (an iPhone only shows its prompt for a direct tap). A phone with no sensor answers `unsupported` within 1.5 seconds and plays by touch. A Player who turns Tilt off keeps it off on that device. (Playtest 2026-11-15: asking for a separate "Use tilt" tap on every puzzle was tedious.)


`browserMotion.request()` calls `DeviceOrientationEvent.requestPermission()` from the "Tilt" tap where that function exists (iPhone) and treats a phone without it as granted; no sensor gives `unsupported`. The listener reads `beta` and `gamma` (not `alpha`, which depends on the compass) at most 30 times a second, and stops when the page is hidden or the Lock closes.

Pure helpers: `smoothTilt(prev, raw, 0.2)`, a 2 degree dead zone, `tiltForScreen(raw, screenAngle)` (swaps and flips the two axes for 90, 180 and 270 degrees), `zeroTilt(zero, raw)`, a clamp to plus or minus 45 degrees, `tiltToPosition(x, range)` (linear, clamped), and `dialFromGravity(ax, ay, az)` (the turn about the screen's own axis from the gravity vector, so twisting the phone like a dial works held upright; it gives nothing when the phone lies flat; Spike puzzles 1.2 checks it).

`stepBall(state, tilt, dt)` and `advanceBall(state, tiltAt, elapsedMs, carry)` run the pick-and-planchette-and-orb physics in 1/60 second steps: acceleration proportional to tilt, a little friction, a speed cap and a 0.3 bounce off walls (the same feel as the demo). `advanceBall` keeps the leftover time as `carry`, so splitting the same elapsed time into any frames gives the same state.

### Haptics (vibration)

| Name | Pattern (ms) | Used for |
|---|---|---|
| `tick` | 10 | clock step, board letter crossed, candle gutter |
| `click` | 18 | pin window entered, safe digit, piece fits |
| `thunk` | 45 | pin set, Set pressed, letter chosen |
| `snap` | 20, 25, 20 | wire connected |
| `buzz` | 60, 40, 60 | wrong Attempt, wrong wire |
| `bump` | 100 | maze wall (the demo's value) |
| `rumble` | 200, 100, 200, 100, 200, 100, 200 | the dark in What moved (once per Attempt, 1.1 s) |
| `heartbeat` | 50, 110, 50 | a Sight appears |

`hotColdInterval(distanceDeg, windowDeg)` returns a pulse interval from 800 ms (far, 40 degrees or more) down to 250 ms (inside the window), never longer as the pick gets nearer. `planHaptics(events, caps)` drops any event that would pass four pulses in a second or six seconds in one Attempt, and drops a second rumble.

`browserHaptics` uses `navigator.vibrate` where it exists (Android Chrome). iPhone Safari does not offer it. Whether the `switch` form of `<input type="checkbox">` (Safari 17.4 and later) gives a usable tick from script is the question of Spike puzzles 1.1; until it says yes, an iPhone gets the visual twin: a 120 millisecond glow and, for `rumble`, a slow dim, both within `dimPlan`.

### Sound

`RECIPES` are data: `tick` (4 ms band-passed noise at 3 kHz), `click` (8 ms noise and a 1.8 kHz blip), `thunk` (a 140 to 70 Hz drop with a 400 to 800 Hz knock, because phone speakers have no bass), `snap` (25 ms low-passed noise), `zap` (a sawtooth sweep from 900 to 300 Hz in 120 ms), `bump` (a 220 Hz sine for 80 ms and noise), `rustle` (150 ms band-passed noise), `creak` (a slow saw at 180 Hz with a wobble), `gutter` (a breath-like noise fade), and the five notes. `planSound(events, consent, voices)` returns nothing without consent and never more than four voices.

The Spirit board's spoken word goes through the ghost-voice Library (the Whisper, 24 lines, prerendered, browser voice as fallback). A phone on silent may play nothing, so the Puzzle says so once, in text.

**Playtest findings on the Spirit board (2026-11-15, real phones).** The browser's own voice was not clear, and a low pitch made it worse, so the word needs the prerendered Whisper line, and the fallback picks the clearest English voice at a normal pitch, never a novelty voice. Every word also has a short clue (`BOARD_CLUES`, never containing the word), spoken after the word and shown under the board, which fixes unclear words such as `URN` and `FIR` and keeps the Puzzle playable with no sound. Steering by Tilt and then resting on each letter was tedious, so: the letters are in three rows with a larger target, a letter pulls a slow planchette in, a tap anywhere picks the letter under it, and the rest time is 350 ms. The 24 Library lines should therefore carry the word, the clue and the word again.

### Breath (the microphone)

Only the Candle order. A tap on "Blow to snuff" asks for the microphone with echo cancellation and automatic gain off, opens an analyser and reads one loudness number per frame. `blowDetect(levels, baseline)` is true only after the level stays above `max(0.08, 3 * baseline)` for 300 milliseconds. No buffer is kept beyond a frame and `MediaRecorder` is not imported in `web/src/puzzles/` (a source-level test). The microphone indicator and a stop button show while it listens. The touch path (tap a candle) gives the same Transcript.

### Light

`dimPlan` (What moved: 2 seconds dark, fading in and out), `torchPlan` (Hidden words: the beam's soft edge) and `candlePlan` (Candle order: gutter fades) return luminance steps that change at most twice a second, never exceed 90 percent of white and never strobe. With reduced motion they return a single still frame.

## Lessons from the Cyber-Orb demo

Read for ideas; nothing is copied (CC BY-NC 4.0, and it needs Phaser 2.2.2, a 568 KB script).

| The demo does | We do |
|---|---|
| Adds `gamma` and half of `beta` to the ball's velocity on every `deviceorientation` event. | Fixed 1/60 second steps, smoothing, a dead zone, a clamp and a zero tap. The result no longer depends on the phone's report rate (Property 13). |
| Asks for no permission. | Asks from a tap on iPhone, and falls back to touch on denial (8.1). |
| `vibrate(100)` on every wall hit, behind `"vibrate" in navigator`. | The same idea, as the `bump` pattern, inside a plan with caps and a visual twin. iPhone has none. |
| `bounce.m4a` on a hit. | Synthesised, so no file, no licence and no size. |
| `alert()` when a level is done. | A card in our own UI. |
| A fixed 320 by 480 portrait stage. | Portrait first, correct in landscape through the screen-angle correction. |
| Hand-authored levels in an array. | Seeded generators with a reference solver, plus five hand-authored mazes checked solvable by search. |

## Changes this spec needs in other specs (not made here)

| Where | Change |
|---|---|
| `party-mode` Requirement 14.1 (sound) and `steering/party-mode.md` | A Player's own Puzzle sounds are interface sounds and do not count toward the three per phone per Round. **Decided by the owner on 2026-11-15 and applied to both files.** The same consent applies; the sounds stay on the Player's own phone; `soundPlan` in `party-mode` keeps counting only Cues, House Cues, Frames and Rattles (the Becoming is already exempt in 19.6). |
| `party-mode` Inspect (Requirement 4.6, `residue.ts`) | Keep `inspect()` as is; call it from `submitAttempt` on a solved Lock; add `inspectLine` to the public log at Lock open. |
| `party-mode` presets and Master panel | Add the Puzzle setting (Classic medium, Gentle easy, Quick off; hard by Master choice) and the Plain Inspect and Assist device settings. |
| `party-mode` Public View | Carry `puzzleSetting` only. |
| `ghost-engine` | `gateReveal` in front of the `reveal` Directive; `WanderLocks` in the Session. |
| `ghost-voice` | 24 Library lines for the Whisper's board words (`check-voice-library.mjs` will ask for them). |
| `haunwallker` | The Locks switch on the Play start screen; `puzzleFeel` in `PlatformKit`. |
| Camera for Spirit clues | **Decided by the owner on 2026-11-15: the camera is allowed in the real game, as an opt-in backdrop of the Clue ring (15.10).** The party-mode Spirit lens keeps "neither the camera nor markers" (16.4): this decision does not change it. `steering/product.md` puts VR/WebXR out of scope; a flat camera backdrop that tracks nothing is neither, so it needs no change. **Done 2026-11-15:** `shared/src/app/csp.ts` set `Permissions-Policy: camera=()`, which blocked the camera on any page that received it (the party-mode selfie and QR scan need it too); it now says `camera=(self)`, with `csp.test.ts` and `security-headers.test.ts` updated. Check where the app's pages are served, in case a host sets its own header. |
| `tech.md` | Unverified assumptions 19 to 24 below; `PUZZLES_ENABLED`. |
| `structure.md` | The `puzzles/` folders. |
| `docs/SOUNDS.md` | Say that Puzzle sounds are synthesised and need no file. |

## Unverified assumptions (each retired by a spike)

19. Vibration: Android Chrome buzzes; iPhone Safari has no `navigator.vibrate`; whether the Safari 17.4 `switch` checkbox gives a usable tick from script, how fast, and in an installed web app (Spike puzzles 1.1).
20. Motion: the iPhone permission prompt and how long the answer lasts; the real report rate; drift; whether `tiltForScreen` is right in both layouts; whether `dialFromGravity` has no gimbal problem held upright (Spike puzzles 1.2).
21. Audio: whether Web Audio is silenced by the iPhone ringer switch, the delay from tap to note, and how five notes and a thunk sound through a phone speaker (Spike puzzles 1.3).
22. Breath: whether a breath on the microphone can be told from speech and from wind, with echo cancellation and gain control off, on both platforms (Spike puzzles 1.4).
23. Balance: solve times for each Kind, the Cap, three Attempts, the minimum solve times, and whether Locks make a 60 second Classic Turn too short (Spike puzzles 1.5).
24. Look to read: whether a phone turned by tilt alone keeps a clue in the same place over 30 seconds (drift, worst on iPhone), whether Players find a clue behind them, whether 12 degrees and 0.7 seconds feel right, how long the whole ring takes, and whether the rear camera backdrop works in the installed web app on iPhone and what it costs in battery and heat (Spike puzzles 1.6).

## Left out on purpose

- Digits anchored in the 3D Viewer world: they need Viewer anchors. The Safe code shows its code as a Sight instead, and the optional Spirit clues (Requirement 15) hang it round the phone with no anchor.
- Story clues as the answer of a Lock, two-phone clues and WebXR pinning: see Spirit clues above.
- Torn-photo pieces from different rooms: v1 shows the whole picture in one Sight.
- Ghost comments on a Lock: they would add Directives to `ghost-engine`. The Lock screens use UI text.
- Two-phone puzzles (one reads, one acts): a good second version.
- Best-time tables and any account.
- Bots solving or failing Locks: they run a plain Inspect.
- Native haptics: native apps are a non-goal.

## Error handling

- A phone with no sensor, no vibration, a muted speaker or a denied permission is not an error: it takes the touch path and the visual twins.
- A bad or oversized Transcript returns `puzzle_bad_transcript` or `puzzle_too_fast`, counts as a wrong Attempt, and is never logged.
- `puzzle_rate_limited` when two Attempts come within a second.
- A Lock for a closed seat, a Zone the Player is not in, or a Player with a Lock already open returns `puzzle_not_open` or `puzzle_already_open`.
- `PUZZLES_ENABLED=false` returns `puzzle_disabled` and the old Inspect runs.

## Testing strategy

- Property tests in `shared/src/puzzles/`, seeded, at least 100 runs, with generators in `*.arb.ts` (seeds, Kinds, levels, Zones, tilt traces, event lists).
- The reference solver is the oracle for solvability; mutation tests break `verify`, `lockCharge`, `placePuzzles` and `planHaptics` on purpose and the tests must fail.
- A differential test runs the party-mode `inspect()` and the Puzzle path side by side (Property 6), and runs `step` with Locks off against the same `step` without the spec (Property 8).
- Durable Object tests use the in-memory storage fake and fast-check command sequences (open, attempt, wrong, give up, reconnect, Turn end, pause) against a model; the model carries `seen` and checks the Public View and other seats' views for Sights.
- Web tests use the four fakes. A source-level check fails the build if `web/src/puzzles/` imports `MediaRecorder`, or if any `shared/src/puzzles/` file imports `web`, `api`, `party/solution` or a Hand.
- The five mazes are checked solvable by breadth-first search in a unit test.
- Word lists are checked: 24 each, A to Z, right lengths, none on a banned list.
- The Spirit clue placement and reading are pure and property-tested (Properties 18 to 20); a mutation pass breaks `placeClues` and `stepRead` on purpose.
- No test touches a sensor or the network.

## Correctness Properties

### Property 1: Generation is deterministic and never reads the Solution
*For any* seed, Kind and level, two calls to `makeLock` return equal Locks and answers, `sightFor` and `fadedFor` are equal on repeat, the function signatures accept no Solution, Hand or Residue, and rebuilding a Lock for a reconnecting seat gives the same Lock as before.
**Validates: Requirements 1.5, 6.2, 13.2**

### Property 2: Every generated Lock is solvable by the touch path
*For any* seed, Kind and level, `referenceSolve` builds a Transcript from touch events only (no tilt, sound, buzz or breath) that `verify` accepts, within the Kind's minimum solve time and the Cap.
**Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 12.1**

### Property 3: Checking accepts only the answer and never throws
*For any* Lock and any Transcript, including random events, wrong kinds, non-finite numbers, more than 64 events, over 4 KB or faster than the minimum solve time, `verify` returns a Verdict without throwing, returns `ok` only when the Transcript equals the answer (or is plausible, for `lockpick` and `maze`), and any single change to a correct Transcript makes it fail.
**Validates: Requirements 7.2, 7.5**

### Property 4: A Sight and its Faded twin show the same clue
*For any* seed and Memory Kind, `fadedFor` returns the same clue as `sightFor` with a shorter time, only Memory Kinds have a Sight, and the clue always contains exactly the data the Lock's answer needs.
**Validates: Requirements 6.2, 6.3**

### Property 5: Locks are placed one per Zone with a valid Sight source
*For any* seed, Zone count from 2 to 12 and enabled Kinds, `placePuzzles` returns exactly one Lock per Zone, no Kind more than twice, every Memory Kind's Sight in a Zone other than its own, at most one Sight in any Zone, and `kindForDiscovery(0)` is never a Memory Kind.
**Validates: Requirements 1.5, 2.4**

### Property 6: A solved Lock gives what a plain Inspect gives, and a failed one gives nothing
*For any* Room state, Player and Zone, a solved Lock's private result equals the party-mode `inspect()` result for the same state, a failed Lock returns no card and no "none there" line and leaves the Zone un-inspected, and in both cases the Hands, the Residue, the Solution, the Haunt, Resolve and Bonus Seconds are unchanged.
**Validates: Requirements 1.2, 1.3, 7.4**

### Property 7: The time charged stays between ten seconds and the Cap
*For any* elapsed time and Cap, `lockCharge` is at least 10 seconds, at most the Cap, equals the elapsed time inside that range, and is the same for a solved and a failed Lock, and a Plain Inspect charges exactly the Cap.
**Validates: Requirements 1.2, 1.3, 1.7**

### Property 8: With the setting off, nothing changes
*For any* Room or Session state and action, with the Puzzle setting off (or `PUZZLES_ENABLED` false) the Party Inspect and the Wander `step` return the same results, events and stored state as a build without this spec.
**Validates: Requirements 1.1, 2.1**

### Property 9: A memory is always reachable
*For any* Wander Session with Locks on and any sequence of Attempts, wrong answers and waits, the Skip is available by 20 seconds or two wrong Attempts, and solving or skipping always ends in the same `reveal` Directive and memory text as without Locks.
**Validates: Requirements 2.2, 2.3**

### Property 10: Sights stay private and survive a reconnect
*For any* command sequence of moves, Turns, reconnects and Lock opens, no Public View, public log entry, recap, narrator prompt or other seat's Private View contains a Sight, its place or the fact that it was seen, each Sight is shown to a seat at most once, and after a reconnect the seat's `seen` set is unchanged.
**Validates: Requirements 6.1, 6.5, 6.6, 13.2**

### Property 11: Three wrong Attempts end a Lock and say nothing more
*For any* Lock and any sequence of wrong Transcripts, the third wrong Attempt closes the Lock `failed`, the Attempts left count down 3, 2, 1, no result carries a count of right parts, and a fourth Attempt finds no open Lock (`puzzle_not_open`; `puzzle_attempts_spent` is kept for a Lock that still shows three used).
**Validates: Requirements 1.3, 7.3**

### Property 12: Tilt maths is total, bounded and rotation-correct
*For any* raw orientation, including NaN and infinities, and any screen angle of 0, 90, 180 or 270, `tiltForScreen`, `smoothTilt` and `zeroTilt` return finite values, the dead zone and the clamp hold (zero inside 2 degrees, never beyond 45), a tilt of the phone and the same tilt after a turn of the screen by one quarter give the same on-screen direction, and `tiltToPosition` is monotone.
**Validates: Requirements 8.2**

### Property 13: Physics does not depend on the event rate
*For any* tilt signal that is constant on each 1/60 second step and any way of splitting the same elapsed time into frames, `advanceBall` over the pieces (carrying the leftover time) equals `advanceBall` over the whole, and the ball never leaves the walls.
**Validates: Requirements 8.3**

### Property 14: Vibration plans respect the limits
*For any* list of timed haptic events, `planHaptics` returns pulses of at most 400 milliseconds, at most four in any second, at most six seconds in total for an Attempt and at most one rumble, `hotColdInterval` stays between 250 and 800 milliseconds and never gets longer as the distance shrinks, and `planHaptics` returns nothing when vibration is off.
**Validates: Requirements 9.2, 9.3**

### Property 15: Sound plans respect consent and limits
*For any* list of timed sound events, `planSound` returns nothing without consent, never more than four voices at once, a master gain of at most 0.5 and notes of at least 300 hertz, and never a sound addressed to another seat or the Host.
**Validates: Requirements 10.2, 10.4**

### Property 16: Light plans respect the photosensitivity limits
*For any* Kind and any reduced-motion flag, `dimPlan`, `torchPlan` and `candlePlan` have at most two brightness changes in any one second, a peak below full white, fades only, and are a single still step when reduced motion is on.
**Validates: Requirements 12.2**

### Property 17: A breath needs sustained loudness
*For any* series of timed loudness numbers, `blowDetect` is true only when some run above the threshold lasts at least 300 milliseconds, is false for any run shorter than that however loud, and is false for an empty or non-finite series.
**Validates: Requirements 11.4**

### Property 18: Clue rings are deterministic, spread out and made up
*For any* seed and any code of 3 or 4 digits, `placeClues(seed, code)` returns the same list every time and reads no Hand or Solution, holds one Code piece for each digit with places 1 to n in order and digits equal to the code, holds at most three Story clues (at most one of each form) whose texts come from the fixed lists (every Phone number is `555-01` followed by two digits), puts every pair of clues at least 35 degrees apart in turn, keeps every height between 30 degrees below and 40 degrees above level, and puts at least one clue in each quarter of the turn when there are four or more.
**Validates: Requirements 15.2, 15.3, 15.4**

### Property 19: Reading needs a steady look
*For any* series of timed view angles, `stepRead` stays between 0 and 1, rises only while the angle is within 12 degrees, falls otherwise, reaches 1 only after at least 0.7 seconds of steady looking in total (never sooner however large the time steps), and a clue once read stays read.
**Validates: Requirements 15.5**

### Property 20: Spirit clues change what is shown and nothing else
*For any* Safe code and any reading state (nothing read, some read, all shown as text), the digits in the Clue list in order equal the code of the Sight, "Show all as text" reads every clue, and `verify` gives the same verdict for the same Transcript whatever was read.
**Validates: Requirements 15.1, 15.7**
