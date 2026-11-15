# Requirements Document

## Introduction

The ghost can speak, and in Single player it can listen. The voice is a layer on top of the text game and never a replacement for it: every spoken line is also shown as text, nothing is ever only audio, and the whole game can be finished with no sound, no microphone and zero quota. In Single player the ghost speaks by default, and the visitor can hold a button and talk to it. In Multiplayer the ghost speaks only when the Master turns speaking on, within a small limit per room, and, only if a player says yes for themselves, it can whisper a rare line cut from short words that player recorded (Stitch) and reveal whose voice it was at the end. Live conversation without a button is a stretch feature. All speech and listening is Workers AI behind the one guarded client and needs a SpendTicket, the ghost never clones or imitates a voice, and no recording is kept longer than the rules below say. Live mode is first in the cut order and Stitch is second. The party-mode spec (Requirement 18) owns how Stitch sits in a room (the Master switch, the question at join, playing at events, the reveal); this spec owns the voice rules. The ghost engine owns every line the ghost says and its validation; this spec reuses them and forks nothing.

## Glossary

- **Voice**: the pure logic in `shared/src/voice/`, the services in `api/src/voice/` and `api/src/guarded/workersai/`, and the speak and listen controls in the Play screen and on the Host.
- **Single player**: in this spec, Wander, the memory walk (see the web shell spec). A solo case (one human with Bots on one screen) is a Party Room and follows the Multiplayer rules for voice: spoken narration off by default, at most 20 spoken lines per room.
- **Spoken Line**: a line the ghost says that passed `validateGhostReply` (ghost engine) and is handed to speech as at most 240 characters.
- **Subtitle**: the full text of a line, shown in a polite live region whether or not the line is spoken.
- **Speaker**: one of the three characters that speak: the **Whisper** (the ghost of the place, Inworld voice Pippa), the **Keeper** (the house's caretaker, Inworld voice Ronald) and the **Lodger** (any Suspect). The Whisper and the Keeper each have one fixed voice. The Lodger has four **Lodger Voices**, one per Suspect (see Requirement 1.11): Mark, Chloe, Eleanor and Victoria. Their personas are in `docs/story/CHARACTERS.md`.
- **Lodger Voice**: one of the four Inworld voices the Lodger speaks with: **Mark**, **Chloe**, **Eleanor** and **Victoria**. A Suspect has exactly one, set when its Ghost Profile is made. The Preset Suspects have Percy, Captain Thorne and Dr. Pike on Mark, Cora Bell on Chloe, Lady Vane on Eleanor and Mrs. Dunmore on Victoria.
- **Steering Tag**: a short bracketed cue at the start of the spoken text that tells Inworld how to deliver it: `[whisper]` for the Whisper and `[speak nervously]` for the Lodger. The Keeper has none. A Steering Tag is never shown and never sent to any other step.
- **Library**: audio for every scripted line, rendered once ahead of time with the Speaker's voice and kept with no expiry. A Library file is public content (the lines are in the repo) and holds no player text and no secret.
- **Fallback Chain**: the order of ways to say a line: Library audio, cached audio, Inworld TTS 2, Deepgram Aura-2 English, the browser's own voice, and last the Subtitle alone.
- **Speaking Switch**: the on or off choice for speaking, held by the visitor in Single player and by the Master in Multiplayer.
- **Single player / Multiplayer**: the one-visitor game (`PlaySession`) and the Party Mode game (`PartyRoom`).
- **Master, Host, Haunt Event, Round, Accusation**: as defined by the party-mode spec.
- **Midnight Line**: the line the ghost speaks when the Host strikes twelve (party-mode Requirement 15). **Ending Line**: the line spoken when a game ends.
- **Talk Button**: the button the visitor holds to talk to the ghost. **Transcript**: the text Whisper returns for a recording.
- **Live Mode**: the stretch feature in which the visitor talks and the ghost answers without a held button.
- **SpendTicket, Meter**: the reservation from `SpendGuard.reserve` that every paid call needs, and a counter with its own caps. This spec uses `tts` (speech), `stt` (listening and Word Checks) and `live` (Live Mode).
- **Stitch**: a rare whispered line cut from short clips of one player's own voice, played on the Host and revealed at the end.
- **Word Bank**: the fixed list of at most 12 harmless words a player records for Stitch. **Template**: a fixed order of Word Bank words that makes one stitched line.
- **Clip**: one recording of one Word Bank word, at most 2 seconds long. **Word Check**: the speech-to-text pass that must hear the asked word before a Clip is kept.
- **Stitch Consent**: a player's own answer to the Stitch question, recorded as a seat, a yes or no, and a yes or no for the age tick.
- **Reveal**: the list, shown only in the ending, of every stitched line and whose voice it was.

## Requirements

### Requirement 1

**User Story:** As a visitor, I want the ghost to say its lines out loud in a steady voice, so that the place feels inhabited, and I want to lose nothing when sound is unavailable.

#### Acceptance Criteria

1. WHEN the ghost has a line to say and speaking is on THEN the Voice SHALL speak it with Inworld TTS 2 (`inworld/tts-2`, through the Workers AI binding) in the voice of the line's Speaker, falling back to Deepgram Aura-2 English (`@cf/deepgram/aura-2-en`) if Inworld fails, and SHALL speak only text that passed `validateGhostReply` and is at most 240 characters, cutting a longer line at the last sentence end that fits and not speaking a line that has no sentence end that fits.
2. WHEN a line is spoken, or would have been spoken, THEN the Web app SHALL show its full text as a Subtitle in a polite live region no later than the moment its audio starts, so that speech is never the only signal.
3. IF the speech call fails, a cap or the kill switch refuses it, or no audio is ready within 5 seconds of the request THEN the Voice SHALL fall back to the browser's own voice where one exists and otherwise to the Subtitle alone, and SHALL show no error screen.
4. WHEN speech audio has been made THEN the Voice SHALL keep it in R2 for 30 days under a key made only from the voice and the text, and SHALL serve a copy younger than 30 days without a new speech call.
5. THE Voice SHALL speak English only in this version, SHALL choose every voice from a fixed list of exactly six preset voices (Pippa for the Whisper, Ronald for the Keeper, and Mark, Chloe, Eleanor and Victoria for the Lodger), and SHALL never clone, imitate or condition on any person's voice.
6. WHEN Inworld speaks a line THEN the Voice SHALL put the Speaker's Steering Tag, if it has one, at the start of the spoken text only, SHALL never show a Steering Tag in the Subtitle, a log line, the cache key or any other step of the Fallback Chain, and SHALL send the same tag on every line of that Speaker, so that a Speaker never sounds different for a reason the line does not carry.
7. THE Voice SHALL speak every line as one of the three Speakers: in Single player the ghost speaks as the Whisper when its Persona voice is soft and as the Keeper when it is dry, and in Party Mode each narration kind has one fixed Speaker set by the party-mode spec, with every Suspect speaking as the Lodger in its own Lodger Voice (Requirement 1.11).
8. WHEN a line is scripted (not made by a model) THEN the Voice SHALL speak it from a **Library** file, audio rendered ahead of time for the line's Speaker (for the Lodger, in each of the four Lodger Voices) and kept under a key made only from the voice and the text with no 30-day expiry, SHALL need no ticket, no paid call and no quota for it, SHALL still speak it when a cap or the kill switch stops paid speech, and SHALL use the rest of the Fallback Chain only when its Library file is missing.
9. WHEN a line will be played whatever happens to the game's secrets THEN the Voice MAY prepare its audio ahead of time, by fetching Library or cached audio (never by a paid call) or, for a line already approved for play, by starting its synthesis the moment it is approved, SHALL share one upstream call between requests for the same key made at the same time, and SHALL never prepare, request or cache any audio because of a secret: the Solution, a Hand, or whether an Accusation is right.
10. THE spoken part of every line SHALL contain no nickname, Zone name or other text a Player supplied: a sentence that contains such text SHALL stay in the Subtitle and SHALL NOT be spoken or sent to any speech model.
11. WHEN the Speaker is the Lodger THEN the Voice SHALL use the Lodger Voice of that Suspect's Ghost Profile, fixed when the Profile is made (a Preset Ghost has its own; a designed or selfie Suspect has the one its Player chose, Mark for a lower voice or Chloe for a lighter one, and Mark when the Player chose nothing), SHALL choose it from the Suspect's own Profile and from nothing else, never from the Solution, a Hand, the Residue, the turn, a guilt flag or the line, so that a voice never tells who is guilty, and SHALL give every Lodger Voice the same shared bank of lines, the same Steering Tag, rate and temperature, and the same Fallback Chain.

### Requirement 2

**User Story:** As a visitor, I want the ghost's voice on when I am alone, and as a Master, I want the table quiet unless I ask for it, so that the ghost never talks over a game.

#### Acceptance Criteria

1. WHEN a Single-player game starts THEN the Voice SHALL have speaking on until the visitor switches it off.
2. WHEN a Multiplayer room is created THEN the Voice SHALL have speaking off until the Master switches it on.
3. WHILE speaking is on in a Multiplayer room THEN the Voice SHALL speak at most 20 lines in that room and, after the 15th spoken line, SHALL speak only Haunt Event lines, the Midnight Line and the Ending Line.
4. WHEN the visitor (Single player) or the Master (Multiplayer) switches speaking on or off THEN the Voice SHALL apply it from the next line at the latest, SHALL stop a line that is being spoken when it is switched off, and SHALL accept the switch from no one else.

### Requirement 3

**User Story:** As a visitor, I want to talk to the ghost out loud, so that I can play without typing, and I want the recording to vanish the moment it has been read.

#### Acceptance Criteria

1. WHERE the game is Single player THEN the Web app SHALL offer a Talk Button, and WHERE the game is Multiplayer THEN it SHALL offer none and SHALL open no microphone except to record a Stitch Clip for a player who said yes.
2. WHEN the visitor holds the Talk Button THEN the Web app SHALL record for up to 8 seconds, SHALL stop at release or at 8 seconds, and SHALL show a clear microphone indicator for as long as the microphone is open.
3. WHEN a recording is sent THEN the Voice SHALL transcribe it with Whisper large-v3-turbo, SHALL delete the audio at once whether or not the transcription worked, and SHALL keep neither the audio nor the Transcript in its own storage or logs.
4. WHEN a Transcript arrives THEN the Engine SHALL treat it exactly like typed text: the same 200-character cap, control-character stripping, moderation, rate limit (one turn per 1.5 seconds) and parser.

### Requirement 4

**User Story:** As the operator, I want speech and listening capped and switchable, so that cost is bounded and the demo never dies.

#### Acceptance Criteria

1. WHEN the Voice is about to make a Workers AI speech or listening call THEN it SHALL first obtain a granted SpendTicket (`tts` for speech, `stt` for listening and Word Checks) and SHALL make no call without one, with default caps of 40 spoken lines and 20 heard clips per session.
2. IF a cap is reached or the kill switch is on THEN the Voice SHALL make no further call, and the Web app SHALL fall back to Subtitles and typing with no error screen.
3. FROM any state with every voice Meter at zero or the kill switch on, THE Voice SHALL leave the visitor able to finish the whole game by reading and typing, because the Voice changes no game state.

### Requirement 5

**User Story:** As a player in a party game, I want the ghost to whisper a line made from my own recorded words only if I choose it, so that the haunting feels personal, and as a parent or guardian, I want a child's voice never kept or used without a yes.

#### Acceptance Criteria

1. THE Voice SHALL offer Stitch in Multiplayer only, SHALL let it change no game rule, and SHALL build every stitched line only from fixed Templates made of the words of a Word Bank of at most 12 harmless words, using one Clip per word of at most 2 seconds, so that a stitched line can contain nothing else.
2. WHEN a player records a word THEN the Voice SHALL run a Word Check and SHALL keep the Clip only if speech-to-text hears the asked word and no other word, with at most two retries per word, and SHALL make at most 30 Word Checks per player and 120 per room.
3. THE Voice SHALL keep Stitch off by default, and WHEN the Master turns it on THEN each player SHALL be asked on their own phone and only that player's own yes SHALL count, the Master SHALL be unable to say yes for anyone, the question SHALL say in plain words that the Clips are deleted when the game ends and that a parent or guardian should say yes for a child, the question SHALL include a tick "I am 16 or older, or a parent or guardian is saying yes for me" that is stored only as a yes or no with no age stored or checked, and leaving the room SHALL delete the player's Clips at once.
4. THE Voice SHALL play a stitched line only at a Haunt Event or at midnight, at most one a Round and two a game, never in the first 60 seconds of a game or during an Accusation, and never from the same player twice running, and SHALL play it on the Host with a Subtitle, SHALL put only "a voice whispered" in the log, and SHALL reveal whose voice it was only at the end.
5. THE Voice SHALL keep Clips only inside the game, in the room's own storage, SHALL send them to no model except the Word Check, and SHALL delete them when the game ends or 6 hours after they were recorded, whichever comes first.

### Requirement 6

**User Story:** As a visitor, I want to simply talk and have the ghost answer, so that it feels like a conversation, and as the operator, I want it short, capped and easy to stop.

#### Acceptance Criteria

1. WHEN the visitor starts Live Mode in Single player THEN the Web app SHALL show a clear microphone indicator and a stop button for as long as it listens, and SHALL stop listening after 10 seconds of silence, when the visitor presses stop, or when the page is hidden.
2. WHEN Live Mode runs THEN the Voice SHALL charge it to the `live` Meter, at most 5 minutes a session and 30 minutes a day, and on reaching a cap, a refused ticket or any other problem SHALL fall back to hold-to-talk with no error screen.
3. WHEN the ghost answers in Live Mode THEN the Voice SHALL check every sentence of the reply with `validateGhostReply` before it is spoken, and SHALL store no audio.
