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

**Level sizes** (easy / medium / hard): lockpick 3 / 4 / 5 pins and 14 / 10 / 8 degree windows; wires 4 / 5 / 6; clock steps of 15 / 5 / 1 minutes; safe 3 / 4 / 5 digits; musicbox 3 / 4 / 5 notes, 3 / 3 / 2 plays; candles 4 / 5 / 6, 2 / 2 / 1 shows; moved 6 / 8 / 9 objects, 2 / 3 / 4 changes, at most 1 / 1 / 2 missing, 2 / 2 / 1.5 s of dark; photo 2x2 / 3x2 / 3x3 pieces (no turning on easy); words 4 / 5 / 6 letters; board 3 / 4 / 5 letters, 2 / 2 / 1 hearings; maze 9x11 / 9x13 / 9x15 (hard has one way through). Classic plays medium, Gentle easy; hard is a Master choice only.

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

`placeClues` makes n clues (the digits, plus Story clues to make seven at most: three for a three or four digit code, two for a five digit code, chosen by the seed), cuts the turn into n equal slots, puts one clue at the middle of each slot with a seeded jitter of at most 8 degrees, and shuffles which clue takes which slot. With n at most 7 the slots are at least 51 degrees wide, so two clues are never closer than 35 degrees of turn, and for n of 4 or more each quarter of the turn holds a slot middle. Heights come from the seed, between -30 and +40 degrees. The Story clue values come from three fixed lists (`ADDRESSES`, `DATES` and a Phone number built as `555-01` plus two digits), so nothing real can be shown. `stepRead` rises by `dtMs / 700` while the angle is within 0.2 radians (12 degrees), falls by `dtMs / 1400` otherwise, and is clamped to 0..1.

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
| `world-clues` Requirement 2 and glossary | A World Clue or Decoy with a text answer may also be drawn as a Scene clue on a Place of a footage scene (puzzles Requirement 22), from the same Public View; add the term and a pointer. |
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
*For any* seed and any code of 3 to 5 digits (the Safe code of an easy, medium or hard Lock), `placeClues(seed, code)` returns the same list every time and reads no Hand or Solution, holds one Code piece for each digit with places 1 to n in order and digits equal to the code, holds at most three Story clues (at most one of each form) and at most seven clues in all whose texts come from the fixed lists (every Phone number is `555-01` followed by two digits), puts every pair of clues at least 35 degrees apart in turn, keeps every height between 30 degrees below and 40 degrees above level, and puts at least one clue in each quarter of the turn when there are four or more.
**Validates: Requirements 15.2, 15.3, 15.4**

### Property 19: Reading needs a steady look
*For any* series of timed view angles, `stepRead` stays between 0 and 1, rises only while the angle is within 12 degrees, falls otherwise, reaches 1 only after at least 0.7 seconds of steady looking in total (never sooner however large the time steps), and a clue once read stays read.
**Validates: Requirements 15.5**

### Property 20: Spirit clues change what is shown and nothing else
*For any* Safe code and any reading state (nothing read, some read, all shown as text), the digits in the Clue list in order equal the code of the Sight, "Show all as text" reads every clue, and `verify` gives the same verdict for the same Transcript whatever was read.
**Validates: Requirements 15.1, 15.7**

## Integration notes (2026-11-15)

Party integration (tasks 3) is Phase 5 of the `integration` spec: Inspect by a human Detective on a phone opens the Lock through `PuzzleHost` at the level of the Room's `puzzles` setting, with the feel layer from the Controller's device settings (`PlatformKit.puzzleFeel`). A Bot, and the solo case's shared-screen pad, get a plain Inspect. Wander integration (tasks 4) is Phase 6.

## Shared look (design system, 2026-11-15)

The screens of this spec are built from `design/elements.css`, with the values of `design/tokens.json`; every element is shown, with its markup, on `design/catalogue.html` (run `pnpm voice-demo` and open `/design/`). The play-through in `tools/voice-demo` is the reference screen. Rules: `.kiro/steering/design-system.md`.

| Part of this spec | Elements |
|---|---|
| A Lock and its frame | `ui-panel ui-status ui-notice` |
| Controls | `ui-button` (48 px through `--pz-target`) |
| Attempts and timer | `ui-lamps ui-lamp` for the pips, `ui-status` for the clock |
| Gaps | `--space-1` to `--space-4`, the same steps as `--pz-space-1` to `-4` |

A screen's own style says only where things go. A piece that is missing is added to the elements and the catalogue first. A screen built before this section moves onto the elements when it is next changed.

## When to use puzzles (brainstorm, 2026-11-15)

**Rule of thumb.** A puzzle is best when one Player is alone with their phone for a moment and the rest of the room has something to watch or think about. It is worst when the whole room is waiting on it, or when it stands between a Player and the answer they need to finish.

| Moment | Status | Why it works, or the risk |
|---|---|---|
| **Inspect in a case** (party, phone) | In the spec (Req 1) | The searcher is busy on their phone while the TV shows them standing in the Zone. Capped by the preset, charged to the Turn. |
| **Before each memory in Wander** | In the spec (Req 3) | A small reward beat in a solo walk. Skip always works, so it never blocks the story. |
| **Memory clues (Sights) in an earlier room** | In the spec (Req 5) | Rewards paying attention while walking; Faded and Assist keep it fair. |
| **Clues in the TV world** | `world-clues` spec, Phase 7 | Everyone watches the active Player walk, so the shared screen matters. |
| **Inspect in the solo case** (one screen, mouse or touch) | Decided (Req 13.3) | The Lock opens on the laptop and runs on its touch path (no tilt). |
| **Players who joined the haunting** (between Turns) | Decided (Req 17) | One Haunting puzzle per Round, no-clue Kinds only, one Scare point when solved, nothing else changes. |
| **A Haunt Event** (for example Lull needs a group puzzle) | Idea | Gives the room a shared beat; risk: it stops everyone at once. Only with a short cap. |
| **During another Player's Turn** | Avoid | Splits attention from the Suggestion and the shown cards on the TV. |
| **During the 15 s window after a Suggestion, or the answer choice** | Avoid | Those windows are for sealing or choosing; a Lock there would eat them. |
| **More than one Lock per Turn** | Avoid | A Turn is short; one Lock already uses most of it. |

**Which Kind, when.** No-clue Kinds (lock pick, music box, candles, words, board, maze) suit the first Lock of a game and Wander's first memory. Memory Kinds (wires, clock, safe, moved, photo) need a Sight first. Tilt Kinds (lock pick, words, board, maze) are best on phones; on the solo laptop they run on touch or mouse. Candles' breath is always optional.

**Which level, when (decided, Req 1.4).** The preset sets the starting level; the level steps up at Haunt 3 and Haunt 6, up to hard, so the house gets harder as it wakes. Gentle rises one step at most. A memory Lock keeps the level its clue was made at. Wander keeps the visitor's setting.

**Design tokens.** The puzzle screens use `pz-` classes and their own variables today (`--pz-space-1..4`, palette names such as `--lantern`, `--ink`, `--dust`, `--ghost`). When they join the real game they move onto the design system (`design-system` tasks 4.1 and 4.4); see the integration spec, task 5.5, for the map.

## Footage (public domain, 2026-11-15)

Requirement 18 in short: **a clip is picture only, short, small, from a public archive, free in both the United States and Europe, with a record beside it, and it is only ever decoration.** The first clip is tried on the playtest site (`/footage.html`, `tools/playtest/media/`), not yet in the real screens.

**Why Europe decides.** The owner lives in Luxembourg and the game is meant for everywhere. The United States lets a film go free by a paperwork miss (no copyright notice, no renewal). Europe counts 70 years from the death of the last of the director, the screenplay author, the dialogue author and the composer of music made for the film, so a 1960s film stays locked there for decades. Silent films from before 1930 whose makers died before the mid 1950s are free in both.

| Film | United States | EU and Luxembourg | Status |
|---|---|---|---|
| *Nosferatu* (1922) | free (before 1931) | free: Murnau died 1931, Galeen 1949, Erdmann (music) 1942, so the last term ended with 2019 | **Cleared** (credits read on Wikipedia, Wikidata and Commons). Used: `stair-shadow` |
| *The Student of Prague* (1913) | free | free: director Rye (d. 1914), screenplay Ewers (d. 1943), Paul Wegener (d. 1948) and Rye, music Josef Weiss (a piano score written for the premiere, d. 1945); the last is 1948, free since 2019 | **Cleared on credits** (Wikipedia in English and German, filmportal and Wikidata agree). **No copy cleared yet**: see "Which copy" |
| *Waxworks* (1924) | free | free: Leni (d. 1929) and Birinski (d. 1951, credited as Spielleitung), screenplay Galeen (d. 1949); the last is 1951, free since 2022. No composer is credited on Wikipedia or Wikidata and filmportal lists the original as silent; a 1924 premiere score was not found | **Likely cleared.** **No copy cleared yet**: see "Which copy" |
| *The Haunted Castle* (1921, Murnau) | free | Murnau 1931, Mayer 1944, Viertel 1953 (Wikidata): the last is 1953, free since 2024; no composer named | **Likely.** Credits from Wikipedia and Wikidata only |
| *The Golem: How He Came into the World* (1920) | free | co-director Carl Boese died 1958: if he counts as a principal director, free only from 2029 (Wegener 1948, Galeen 1949, composer Hans Landsberger 1941) | **Held** |
| *The Hands of Orlac* (1924) | free | Wiene 1938 and Nerz 1938; the composer Pierre Oser's death year is not known | **Check** |
| *The Cabinet of Dr. Caligari* (1920) | free | Commons treats it as free across the EU. But Giuseppe Becce is credited with its music and died in 1973: if his score counts as music made for the film, the 70 years run to the end of 2043. His original score is lost (Deutsche Kinemathek), which does not by itself end the term. | **Held.** Not used until a lawyer or a German rights body says |
| *The Phantom of the Opera* (1925, the 1925 cut) | free | US-made: Directive 2006/116 Art. 7(1) ends the EU term when the term in the country of origin ends (the US term for a 1925 film ended with 2020). Read in the Directive; Luxembourg's own text was not read. Credited writers died as late as 1961, the score's composer (Hinrichs) in 1942 | **Likely, check** before use |
| *Häxan* (1922), *The Phantom Carriage* (1921), *Faust* (1926) | free | not free: Christensen died 1959 and the composer Grøndahl 1960, Sjöström 1960, the composer Heymann 1961, so free from 2030 to 2032 | **Not yet** |
| *Night of the Living Dead* (1968) | free (no notice) | not free (Romero died 2017) | **Not allowed** |
| *House on Haunted Hill* (1959) | free (renewal missed) | not free (Castle died 1977) | **Not allowed** |
| *Carnival of Souls* (1962) | free (formalities) | not free (Harvey died 1996) | **Not allowed** |

The three rows from 1959 to 1968 are from memory and were not looked up on 2026-11-15; they stay out either way. Nosferatu, Caligari, The Student of Prague and Waxworks were read on Wikipedia, filmportal and Wikimedia Commons the same day; the other rows take their death years from Wikidata only. Luxembourg's rule for a film is Art. 9(2) of the law of 18 April 2001 (the same four people, 70 years), and its moral right ends with the economic term (a secondary source, not the statute). No rights search was done and none of this is legal advice.

**The restoration point.** The complete copies on Commons and the Internet Archive are restorations (tints, rebuilt intertitles). The picture is old and free; the restorers' additions are the only thing that could carry a claim. So a clip uses the picture only (no intertitle, no sound), is re-graded by the page (black and white, or ink yellow multiplied onto the picture) and has its restoration named in `PROVENANCE.md`. Requirement 18.8 sends it to a lawyer before the game is sold.

**Which copy (read 2026-11-15).** A film being free does not make every copy of it free to use.

| Film | Copies found | Problem |
|---|---|---|
| Nosferatu | Commons: the 2006 Murnau Foundation restoration (5 GB original; the 360p transcode is what `stair-shadow` was cut from). Also an older print with English titles of 1947 (506 MB), not checked | The tints and rebuilt intertitles are the restorers' work. German law has two small rights a restorer might claim (§ 95 and § 70 UrhG); no ruling was found; Commons kept the file after a deletion request, which is an opinion and not a ruling |
| The Student of Prague | Commons: 41 minutes, taken from a YouTube upload, no print named. Internet Archive `der-student-von-prag-1913`: 82 minutes, uploader unknown, no source stated | The original runs 85 minutes. The documented complete versions are reconstructions (1987/88; 2012/13 by Wilfried Kugel for ZDF and arte with digital work by Alpha-Omega; a 2016 DVD). A copy that cannot be traced to a print fails 18.3 |
| Waxworks | Commons: one file from an Absolut Medien Blu-ray, one from a watermarked YouTube upload of an older National Film Library print. Internet Archive: several, no source | A 2019/20 restoration came out on Blu-ray (Deutsche Kinemathek, Cineteca di Bologna, L'Immagine Ritrovata) with new music; the disc was not matched to the file. The older print is watermarked. Neither passes 18.3 yet |

Ways forward, in order of preference: the oldest unprocessed print in a public archive whose record names it; a licence from the restorer (the Murnau Foundation, the Deutsche Kinemathek, the Filmmuseum München); or a short shot, with the restoration point read by a lawyer, as `stair-shadow` is.

**Longer footage (decided 2026-11-15).** The value of footage is its length: whole scenes of real film that no model can make, for the price of storage and delivery. So a scene may run up to 10 minutes (18.6). Sizes: Nosferatu at 360p is 263 MB for 92 minutes (about 380 kbps), so 10 minutes is about 30 MB and fits the 40 MB limit; the 4 second `stair-shadow` is 77 KB. A scene streams with byte ranges from the game's own origin, loads only its metadata until it plays, stops under reduced motion or data saver, and always has a Stop control. The film's rights do not grow with the minutes used, but the restoration point does: more minutes is more of one restorer's work. Where the files live (a static asset or an R2 bucket behind the game's Worker) and the real cost are unmeasured and wait for spike puzzles 1.7. `tools/playtest/flash-check.mjs` screens a scene for flashes (whole-frame brightness, WCAG 2.3.1 counting); it can miss a small bright flash, so a scene with lightning is also watched by a person.

**How a clip is shown (the page, then the real screens).** A `.ft-film` layer sits behind the screen and holds one muted `video` with a poster. Text is always in a solid `ui-panel`, never on the picture. Three looks are on the test page: *Film tint* (the clip as it is: teal, which breaks the rule that green is rare), *Black and white*, and *Yellow ink* (grey picture multiplied onto `--lantern`, which fits the black, brown and yellow palette). Three places are tried: behind a Sight, faint behind a Lock (28% so the controls stay readable) and once on "Nothing came loose".

## Scenes from footage (2026-11-15)

A scene earns its place only if it does one of three jobs: it **shows state**, it **builds the next move**, or it **pays off a moment**. Footage that does none of these is cut. It is the same rule for every kind of scene: a **cut scene** (3 to 8 seconds, shows what changed), a **hero scene** (20 to 60 seconds, pays off a big moment) and a **parallel scene** (plays beside the game and shows a second thing at once).

| Idea | Kind | Moment | Spec |
|---|---|---|---|
| Clock shadow | Parallel | Turn Clock | Requirement 19 |
| The Reel | Cut | Haunt level | Requirement 20 |
| Two endings | Hero | Game end | Requirement 21 |
| Our own title cards | Cut | Endings first, then every Keeper line | 21.3 |
| Wander home movie | Hero | A memory is found | Idea; first scene cut (`wander-harbour`, 99 s, no title card) and shown in section 7 of `/footage.html` |
| Sealed reveal, Joined the haunting, Cues from those who joined the haunting, Film on a wall or the pyramid | Ideas | Not in the spec yet | |

**The Reel, as a ladder** (the Haunt Events are at 3, 6 and 9; the maximum is the ending and not a shot):

| Haunt | Shot | Clip | Event |
|---|---|---|---|
| 0 to 2 | The ship at the quay | `reel-ship` | |
| 3 | Orlok rises in his crate | `reel-coffin` | yes |
| 4 and 5 | An empty street | `reel-streets` | |
| 6 | The shadow on the stairs | `stair-shadow` | yes |
| 7 and 8 | The shadow hand at the door (AI scene, 15 s) | `ai-hand-door-take2` | |
| 9 (to the maximum) | The shadow over the empty bed (AI scene, 15 s) | `ai-empty-bed-take1` | yes |
| the maximum | The windows go dark one by one and the door swings open on the dark (AI scene, 15 s) | `ai-lights-out-take1` | the ending |

For a maximum of 8 the ladder ends at 7 (the hand) and 8 is the house; for 12 the bed holds from 9 to 11. The two ending shots are `ai-dawn-door-take3` (Detectives win: the same house at dusk, the light rises and the door opens on the morning) and `ai-lights-out-take1` (the house wins). The hand, the bed, the dawn and the house are AI scenes, which have lines of their own (below); the older film clips `reel-hand`, `reel-bed`, `end-dawn` and `end-house` stay in `media/` but no shot uses them.

Rules for every scene: it moves only on public state (the Turn Clock, the Haunt level, who won, who joined the haunting) and never on a private result; it never plays during the 15 second Suggestion window or an answer choice; it can always be skipped; it has no sound of its own; every shot has a line of words for the live region; and the game works with the footage off. The Reel and the endings are not shown on the pyramid Display in this version.

Where it is: `tools/playtest/js/scenes.js` holds the pure rules (tested over every Haunt level for each maximum and a grid of clock readings), `scenes-page.js` the demos, and sections 4 to 6 of `/footage.html` show them on a page. Seven new clips came from the same Nosferatu file (`media/PROVENANCE.md`). Not deployed and not in the real Host yet (tasks 14.2 to 14.4).

Open: whether scrubbing a clip ten times a second keeps up on a real phone or TV (spike puzzles 1.7); if it does not, the fallback is a strip of stills for the clock shadow.

### Property 21: The level follows the Haunt, and a clue always fits
For any Puzzle setting, preset, Haunt level and Kind, the level of a Lock is the setting raised one step at Haunt 3 and one more at Haunt 6, never above hard, never below the setting, at most one step under Gentle, and a Memory Kind opens at the level of its Sight.
**Validates: Requirements 1.4**

### Property 22: Haunting puzzles change only Scare points
For any game with Haunting puzzles played or not, every card, Hand, Turn, Turn Clock, Haunt level, view and winner is the same, a Poltergeist plays at most one per Round, and each solved one adds exactly one Scare point.
**Validates: Requirements 17.1, 17.2, 17.3**

### Property 23: Footage is decoration with a record
For any clip in the game, it has a complete `PROVENANCE.md` entry, an `.mp4`, a `.webm` and a poster within the size limits, no audio track, at most 10 minutes and at most 480 pixels high, and a passed flash screen; every video that shows it is muted, inline, without controls, hidden from a screen reader and loaded by metadata only until played when it is over 1 MB; nothing loads from another origin; and with the clip stopped, hidden or unable to load, every screen still shows its still frame and finishes as before.
**Validates: Requirements 18.2, 18.3, 18.4, 18.5, 18.6**

### Property 24: The clock shadow follows the clock and nothing else
For any base, remaining time and nudge, the shadow's position is `1 - remaining / base` held between 0 and 1, rises only as the clock falls, steps back by the share of the Turn that a Help is and forward by a Spook, and under reduced motion moves only on whole seconds and never ahead of the clock.
**Validates: Requirements 19.1, 19.2, 19.4**

### Property 25: The Reel never goes backwards and every Event is seen
For every maximum of 8, 10 and 12 and every Haunt level, the shot never comes before the shot of the level below, the maximum is the house, and each Event level below the maximum has a shot different from the level before it; any input at all gives a shot.
**Validates: Requirements 20.1, 20.2**

### Property 26: An ending says who joined the haunting and never says Poltergeist
For any list of nicknames, the house card says that the haunting continues, that no one won and, when the list has names, who joined the haunting, and no card, string or log line of the scenes says Poltergeist.
**Validates: Requirements 21.1, 21.2, 21.3**

## Scene clues (overlay on footage, 2026-11-15)

A clip cannot hold a clue: it is the same file in every game (Requirement 18), and a clue is different in every game. But a clue written on a brass plate or a misted window makes the film feel like the house. So the clip holds a **blank place** and the Host writes on it while the game runs.

Layers, from the bottom: the video; a canvas with the Scene clue, moved onto the Place by a perspective transform; one **film layer** (grain, flicker, vignette) over both. The words also go to a solid panel beside the picture (the text twin) and to the Clue list.

```
film layer   grain, flicker, vignette           (over everything below, one layer)
clue canvas  the Sign and the words, at the clip's own size, fitted to the Place
video        the clip, with a blank surface at the Place
```

What a Place is (`tools/playtest/js/places.js`, made after a clip exists and measured by `place-check.mjs`):

```js
export const PLACES = {
  // shot: { corners (shares of width and height), surface, ink, from, to (s), luma (0..1) }
  hand: { corners: [[0.62, 0.28], [0.71, 0.28], [0.71, 0.35], [0.62, 0.35]], surface: 'plate', ink: 'engraved', from: 9, to: 15, luma: 0.71 },
};
```

The pieces (pure, in `tools/playtest/js/scene-clues.js`): `placeFor(shot)`, `sceneClue(seed, shot, publicView)` (returns `{ sign, answer, decoy }` or null), `inkFor(luma)` (`ink` or `bone`, and the blend), `contrastOk(luma, ink)`, `fitToPlace(corners, w, h)` (the four-point transform as a CSS `matrix3d`) and `drawClue(ctx, clue, place)`. The page and the Host both call them.

Why it should not look pasted on:

| Tell | What stops it |
|---|---|
| Too sharp | Drawn at the clip's own pixel size, then scaled with the clip's smoothing. |
| Flat | A perspective fit to the four corners of the surface. |
| Floating | `multiply` on a light surface, `screen` on a dark one; a mono ink with no hue. |
| Two layers | One film layer over both, so grain and flicker move together. |
| Appears from nowhere | It fades in over `fade-slow` after the Place is in view, never before. |
| Something passes in front | The Place's window ends before anything crosses it; the held last frame is clean. |

The limit, said plainly: this works only on a locked-off shot with a flat surface that nothing passes in front of. The model prompts in `docs/story/ai-scene-prompts.md` ask for exactly that, and a person looks at every frame of the window before a Place is declared.

What a Scene clue is not: it is never a clue baked into a clip; never a private clue (Spirit clues stay on phones); never needed (the Clue list and the panel carry it, so a missing clip loses nothing); not for Bots, phones or the Display in this version; and it is not shown in Wander.

Open: whether the 480 pixel clip and the canvas read as one on a TV at three metres, and whether a Place can be big enough in a 480 pixel frame for letters of 5 per cent of the height (spike puzzles 1.8).

### Property 27: A Scene clue is public and follows its inputs
For any seed, shot and Public View, the Scene clue is one of the World Clues or Decoys of that view with a text answer and its Sign, never a card, a Hand, a Residue position, the Solution or the answer of a Lock that is not a World Clue; the same inputs give the same clue; and changing only the Solution changes nothing.
**Validates: Requirements 22.2, 22.8**

### Property 28: A Decoy looks like a clue
For any clue and any Decoy on the same Place, every drawn property (Place, ink, blend, size, timing) is equal except the Sign and the answer.
**Validates: Requirements 22.8**

### Property 29: Nothing is lost when the picture is not shown
For any Scene clue and any footage state (on, reduced motion, data saver, a hidden page, a clip that cannot load, a shot with no Place), the Clue list holds the clue's words and its Sign's name, and the panel shows them at once whenever the overlay is not drawn.
**Validates: Requirements 22.7**

### Property 30: A Scene clue is readable and calm
For every Place and every answer text the game can make, the ink is at least 4.5 to 1 against the Place's brightness and the letters at least 5 per cent of the picture's height, the fade is one of the two named tokens (and none under reduced motion), and the clue has no flash and no movement of its own.
**Validates: Requirements 22.4, 22.5, 22.6**

### Property 31: A clip is blank at its Place
For every clip that has a Place, every frame of the Place's window carries no mark at the Place, and the clip's entry in `PROVENANCE.md` names its model, date, prompt and take when a model made it.
**Validates: Requirements 22.3, 22.10**

## Lines written for the pictures (2026-11-16; replaces "Event lines over the Reel" of 2026-11-15)

The first idea was to let the Whisper's Haunt Event line (Cold Spot, Blackout, Restless, Lull) sit under whichever shot the level gave, with the Event shots kept as mood shots that show no Event kind. It was judged wrong on 2026-11-15: a line that does not match its picture breaks the scene, and the shot and the Event kind come from different draws, so a pair could never be written for. The rule now is the opposite: **a line is written for a picture, and said only over it.**

| Shot | Clip | Line | Speaker | Starts at | The picture at that moment |
|---|---|---|---|---|---|
| Ship | `reel-ship` | `scene.ship.soft.1` | Whisper | 0.1 s | a ship at sea; the line is short enough for the 3.6 s shot |
| Crate | `reel-coffin` | `scene.crate.soft.1` | Whisper | 0.3 s | something rises in the hold; the scrape at 3.1 s comes under the end of the line |
| Street | `reel-streets` | `scene.street.soft.1` | Whisper | 0.4 s | the empty street |
| Mirror | `reel-mirror` | `scene.mirror.soft.1` | Whisper | 1.2 s | a man in his chair; a figure shows in the mirror from about 3 s (Frankenstein, 1910) |
| Hand | `ai-hand-door-take2` | `scene.hand-door.soft.1` | Whisper | 0.8 s | the shadow already on the wall; the knocks come at 9 s |
| Bed | `ai-empty-bed-take1` | `scene.bed.soft.1` | Whisper | 0.3 s | the bed, still; the mattress sinks at 6 s |
| House | `ai-lights-out-take1` | `scene.lights-out.soft.1` | Whisper | 1.2 s | every window warm; the lights go out from 3 s |
| Dawn | `ai-dawn-door-take3` | `scene.dawn-door.dry.1` | Keeper | 4.3 s | the quiet house at dusk; "the door opens" is said as it opens, at 10.4 s |

Since 2026-11-16 every shot has a line, the film shots too (the owner asked: a Reel where only some shots speak felt broken). The stair shadow left the Reel: the Haunt 6 Event is the mirror from *Frankenstein* (1910), and the stair shadow is only the turn timer (`clock-shadow`, slowed to 30 seconds so it climbs smoothly). The lines are rows of `docs/story/party-lines.md` (the `scene.*` sections) and are in the Voice Library like every spoken line; a test compares the rows with `SHOT_LINE` word for word, and checks that each line ends before its shot does (`LINE_AT`, and the rendered length of the line). A line is a `scene.*` row on purpose: it is never drawn as an `end.solved` or an Event line, so it cannot be said over another moment or twice.

The Room's own lines stay as they are: the Whisper still says her Event line when a Haunt Event applies (`party-mode` 11.2) and the Keeper still closes the game after a Lodger confession. Two voices never speak at once, so when a Room line is speaking or due the shot's line is shown in words only for that turn. A Blackout still dims the shot as it dims the scene, and a Lull still holds the lower shot on its last frame with no line.

Spoken narration is off by default (`party-mode` 7.6). The same words are always in the log, the live region and the captions, and the Master can mute, replay or skip a spoken line, so a Room without narration reads the same. On `/footage.html` the line is shown as words at its moment (no audio): in the Reel and in the endings.

Not added: a line that names an Event kind, a Sign or a clue; a Lodger line over a shot (the Lodger never speaks before the Accusation, and never tells); lip-sync dubbing of a real actor's face. A line over a shot that is paused by Skip is dropped.

### Property 32: A line is written for its picture and is said over it only
For every shot, Haunt level and maximum of 8, 10 and 12: exactly the shots made for the game have a line, each line is a `scene.*` row of the story banks word for word and follows the bank rules and names no Sign, clue, card or Event kind, a level gives the line of its own shot or none, a line starts inside its shot at its moment and ends before the shot does, it is said once and only on a rise, a line still waiting is dropped when the Reel moves or the ending is skipped, a still or blocked picture has its line at once, and the Event line of the Room, a Blackout dim and a Lull hold are unchanged; with narration or footage off the words are the same in the log.
**Validates: Requirements 20.7, 20.8, 20.9**

## Scenes of Wander (2026-11-16)

Wander's one scene was a 99 second run of *Nosferatu* (`wander-harbour`). A memory has a kind (a sound, a person, a promise: the three archetypes of the ghost engine), so each kind now has a scene that suits it, and the two that exist as AI scenes have a line of their own.

| Kind | Scene | Frame | Line | Starts at |
|---|---|---|---|---|
| Sound | `wander-chimes-take1`: wind chimes on a porch | 3:4 portrait | `wander.chimes.soft.1` | 5.0 s (the chimes begin to ring at 6 s) |
| Person | `wander-chair-take1`: an empty chair, a coat, a cup of tea | 3:4 portrait | `wander.chair.soft.1` | 1.5 s (the coat sways from 6 s) |
| Promise | `wander-departure`: a farewell at a window (*Frankenstein*, 1910, black and white) | 4:3 | `wander.departure.soft.1` | 2.3 s (she waves from the window from about 6 s) |

The AI letter scene (`wander-letter`) came back twice with faint writing on the letter (a clip never holds text), and the owner found the harbour film meant nothing, so on 2026-11-16 the promise memory became the farewell from *Frankenstein*. A Wander line sets a mood and never says what the memory is: the card after the scene says that, from the engine's narrated memory. The lines follow the single-player bank rules (the single-player bank never says "house", names no place and no card).

The order, with narration on: the Whisper's reveal line first (a memory was found, never what it is), then the scene with its line, then the card. Two voices never speak at once, so the scene starts when the reveal has ended. With narration off the reveal is words and the scene starts at once. On `/footage.html` section 7 there is no audio: the reveal is words, a switch picks the kind, the scene plays in its own frame, and the line is shown as words at its moment.

### Property 33: A Wander scene is its kind's, and its line is its own
For every kind of memory: the scene is the one of that kind (the film for a promise, never the letter), its frame has the shape of its clip, the AI scenes have a `wander.*` line that is a row of the story bank word for word, follows the bank rules and ends before the scene does, the film has none, a line is said once at its moment and dropped by Stop, another kind or a new Find, and with footage off or a blocked clip the line and the card show at once.
**Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5, 23.6**
