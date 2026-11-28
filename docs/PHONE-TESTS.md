# Phone and people tests: what is left to run

Written 2026-11-28. Every task below is open in `.kiro/specs/*/tasks.md` for one reason: it needs a real device, a real table or real people, and headless Chrome cannot stand in for it. Everything a computer can check is already checked.

Grouped into five sessions by what you need in the room. Each task names its spec task (so you can tick it), what to do, and where to write the result. Send me the notes or the copied reports after a session and I will write the spike doc, tune the numbers the task names, and tick the boxes.

Use the playtest site (`tools/playtest/`, `node tools/playtest/serve.mjs`) for the lab pages named below. Record raw numbers, not impressions: "3 of 10", "42 ms", "warm after 12 min".

## Session 1: one iPhone and one Android phone (about 2 hours, one person)

Do each item on both phones, Safari and the installed home-screen app for the iPhone, Chrome for Android.

| Task | What to do | Write to |
|---|---|---|
| party-mode 1.2 | Two-thumb multitouch stick; orientation permission flow; vibration; install to home screen; wake lock; camera QR scan; scan a printed one-colour QR plate and a two-colour one. On a laptop and a TV browser: `speechSynthesis` voices, wake lock. | `docs/spikes/party-1.2.md` |
| party-mode 1.6 | One tap at join unlocks audio for the game? iOS silent switch? Sound with dimmed screen or background tab? Loudness. Delay and spread of one sound sent to six phones. | `docs/spikes/party-1.6.md` |
| party-mode 1.7 | Gyro drift for the Spirit lens; motion permission; battery; light bar on an OLED and an LCD phone; clock offset between phones (are 500 ms and 150 ms right?). | `docs/spikes/party-1.7.md` |
| party-mode 1.8 | How often a table bump looks like a shake; the strength threshold and "three swings in 1.5 s"; the iOS motion permission flow; the hold-to-rattle button with no sensors. | `docs/spikes/party-1.8.md` |
| puzzles 1.1 | `navigator.vibrate` present? How exact are the eight patterns? Does toggling `<input type="checkbox" switch>` from script tick on iPhone (Safari 17.4 or later)? Battery cost of six seconds of buzz. Decide: ticks or visual twin for iPhone. | `docs/spikes/puzzles-1.1.md` |
| puzzles 1.2 | iPhone `requestPermission()` prompt (how long it lasts, what a denial looks like); real `deviceorientation` rate; drift over 30 s; `tiltForScreen` in portrait and landscape; `dialFromGravity` held upright and flat. Pick the tilt range and dead zone. | `docs/spikes/puzzles-1.2.md` |
| puzzles 1.3 | Web Audio on iPhone with the ringer on silent; tap-to-note delay; are the five notes, click and thunk clear at 0.5 gain; wording for the "phone on silent" hint. | `docs/spikes/puzzles-1.3.md` |
| puzzles 1.4 | Echo cancellation and auto gain off; record loudness numbers (not audio) for a breath, a word, a cough, wind and a table knock. Find a threshold plus a 300 ms rule that counts only the breath. If none works, tell me and the microphone path is cut. | `docs/spikes/puzzles-1.4.md` |
| puzzles 1.6 | `tools/playtest/ar.html`: tilt only, on the stand-in and with the camera behind. Clue drift over 30 s; do people find a clue behind them; time for the ring of seven; are 12 degrees and 0.7 s right; is the arrow wanted after 3 s; camera in the installed app; warmth. | `docs/spikes/puzzles-1.6.md` |
| puzzles 13.3 | Footage clip on a phone: starts muted by itself and stays inline? Loops without a flash? Smooth on mobile data? Which look reads best (tint, black and white, yellow ink)? Lock readable over it? | `docs/spikes/puzzles-1.7.md` |
| spirit-table 1.2 | `tools/playtest/ar.html`, with and without camera: drift over 30 s, is Place enough, comfortable size and distance, thumb targets, battery and warmth over 20 min at 30 fps, the camera prompt in the installed app. | `docs/spikes/spirit-table-1.md` |
| ghost-voice 4.7 (device half) | Recording and playback on a real iPhone and Android; then a screen-reader pass (VoiceOver, TalkBack) that a spoken line is announced once. | `docs/spikes/ghost-voice-4.7.md` |
| haunwallker 10.4 | Keyboard-only run of the whole flow; 320 px width; iOS Safari scroll and zoom inside the pad; screen-reader pass on Haunt and Play. | `docs/spikes/shell.md` |
| world-viewer 1 and 10 | Frame rate of the `full` LOD on a phone; and load one world in a browser with WebGL2 off to see the PanoFallback. | `docs/spikes/2.1.md` |
| knock-door 7.1 | In a real Gallery world, put the door box across a doorway (once Gallery worlds exist, or any real world) and walk into it at speed: stops cleanly, slides, snags or steps through? | `docs/spikes/knock-door-7.md` |

## Session 2: two phones on a table, plus a laptop or TV (about 2 hours, 2 to 3 people)

Needs the app running on a reachable address (laptop on the same Wi-Fi, or a deployed Worker). Use the real Room, not the fakes.

| Task | What to do | Write to |
|---|---|---|
| party-mode 1.1 | Host plus six simulated phones sending `input` at 30 Hz: p50 and p95 latency on the same network and on a phone hotspot; whether hibernation drops sockets. | `docs/spikes/party-1.1.md` |
| integration 5.6 | Two phones and a laptop play a party game with at least one puzzle solved on Inspect. | note under the task |
| puzzles 6.6 | The first three Kinds in a Party Room on one Android and one iPhone, and in Wander. | `docs/spikes/puzzles-1.5.md` |
| puzzles 17.4 | Two people shake within two seconds? Does the buzz by distance feel right? How often does a pocket or a walk count as a shake? | `docs/spikes/puzzles-1.10.md` |
| knock-door 8.1, 9.2, 10 | The manual pass on the lab with two phones and the TV: doors appear and shut on the TV, every lock opens by touch alone. | `docs/spikes/knock-door-10.md` |
| puzzles 14.8, 14.12, 15.11 | On a phone and a TV: scrubbing a clip ten times a second keeps up (iPhone Safari most of all)? Is the Reel readable across the room? Does each line fall on its picture? Scene clues at three metres: ask five people 1 to 5 how well the clue reads as part of the scene and where they looked first. | `docs/spikes/puzzles-1.7.md` (scenes), `puzzles-1.8.md` |

## Session 3: a game night (3 to 6 people, about 3 hours)

| Task | What to do | Write to |
|---|---|---|
| party-mode 1.4 | Play the base rules with Bots and two or three people: the Haunt's speed, Poltergeists, thin hands at six Players. Tune the Haunt maximum, thresholds, Resolve cap and Inspect time. | `docs/spikes/party-1.4.md` |
| party-mode 1.5 | Three real games on Classic, one Gentle, one Quick. Count: Spooked Turns, average seconds removed, Turn timeouts, how fast the Haunt rises, Eavesdrop use, Cues per Player, the two Nudge counters. Run `node tools/balance.mjs` first. | `docs/spikes/party-1.5.md` |
| puzzles 1.5 | Five people play every built Kind at both levels. Record solve times, wrong Attempts, give-ups, how often the Cap ends a Lock. Set the Cap per preset (25 s, 40 s, 20 s). Is a 60 s Classic Turn still fun with a Lock? | `docs/spikes/puzzles-1.5.md` |
| puzzles 16.4 and party-mode 1.10 | Secret knock on three phones and two tables (wood, glass, stone) with `tools/playtest/knock.html`: can five people open easy, medium and hard in three tries? How often is a knock unheard or a bump counted? Is it fun? | `docs/spikes/puzzles-1.9.md`, `party-10.md` |
| party-mode 14 | One full party game with three Bots and one embedded-pad player (scripted mode), one with real phones and the model, one with a Display and printed relics. Record a short clip of each. | note under the task |
| integration 4.5 | One person plays a solo case, Case screen to ending, on a laptop with no phone and zero quota. | note under the task |
| errands 3.2 | One evening with Errands on: note any object people could not find or felt unsafe with. | note under the task |

## Session 4: five consenting people (about 1 hour)

| Task | What to do | Write to |
|---|---|---|
| ghost-voice 1.2 | At least five people, one iPhone and one Android, recording only with consent and deleting afterwards: how often Whisper rejects a clean one-second word, per Word Bank word and per phone; retries needed; clip size per codec; how joined clips sound; do the starter Templates read as gentle. | `docs/spikes/ghost-voice-1.2.md` |

## Session 5: special hardware

| Task | What you need | Write to |
|---|---|---|
| party-mode 1.3 | Clear plastic cut as the pyramid, a spare phone or tablet running a four-view page. Decide tops in or out, mirror or not, footprint calibration, minimum brightness. Photograph it. | `docs/spikes/party-1.3.md` |
| party-mode 1.9 | The seven sound files, once they exist: bass through a phone speaker, volume, size limits, and the game with every file removed. (They need sourcing first: `docs/SOUNDS.md`.) | `docs/spikes/party-1.9.md` |

## Needs your keys or a deployed Worker (not a device)

| Task | What it needs |
|---|---|
| conditions 1.1 | A throwaway deployed Worker calling Open-Meteo (the local run is done). |
| ghost-voice 1.1 and 1.3 | A small manual budget on the guarded wrappers, and a deployed Worker for the live transport. |
| game-songs 1.1 and 5.2 | The song service account. |
| world-pipeline 1.2 and 1.3 | Workers AI from a deployed Worker, and the Enhance A/B test. |

## After a session

1. Fill the spike doc named above, or send me your notes.
2. Say what the numbers should become (or let me propose them from your results).
3. I update the design numbers, write the doc, and tick the task with the date and what was run.

A test that comes out badly is still a closed task. Several of these can end in "cut it" (the microphone breath puzzle, live voice mode, knocking), and that is a result worth having.
