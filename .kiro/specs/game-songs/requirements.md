# Requirements Document

## Introduction

Game songs are short songs made for one game, about what really happened in it, from a song service (Mureka is the first choice). A **Moment Song** plays after a key moment (a Player joins the haunting, a wrong Accusation, the Becoming, the win). A **Ballad** plays at the ending and sings the whole case. A **Clue Song** plays in a quiet scene with no Player in it and carries a small, fair hint in its words. Songs are decoration and a soft hint: they never change the Solution, a Hand, a Turn or who can win, and the game never waits for one.

## Glossary

- **Song Service**: the outside service that makes a song from lyrics and a style (Mureka first), reached only through a guarded call.
- **Moment**: a public event that may earn a Moment Song: joined the haunting, a wrong Accusation, the Becoming, a shared win, the house wins.
- **Lyric Facts**: the public facts a song may sing: seat names (or role names), Zone names, the public log, the Haunt level, and, at the ending only, the Solution.
- **Song Slot**: a calm point where a song may play: between Turns, at a Round end, in a quiet scene, or the ending screen.
- **Stock Song**: a song made in advance, with no Player in it, used when no game song is ready.
- **Songs setting**: a Room setting (off, stock only, on), set by the Master; off by default.
- Other terms (Room, Master, Player, Bot, Turn, Round, Haunt, Becoming, Accusation, Solution, Hand, public log, ending recap, Cue, spend guard) are as in `party-mode`, `ghost-voice` and `world-pipeline`.

## Requirements

### Requirement 1

**User Story:** As a Player, I want a song about what just happened to us, so that the game feels made for our table.

#### Acceptance Criteria

1. WHERE the Songs setting is on and a Moment happens THEN the Room SHALL ask for a Moment Song built only from Lyric Facts, and SHALL play it at the next Song Slot, never over a Turn's speech, a Cue or a reveal.
2. THE Room SHALL ask for the Ballad when the game reaches its last Round or the Haunt reaches 8, so that it is ready for the ending, and SHALL play it on the ending screen after the recap.
3. THE Room SHALL play at most one Moment Song per Round and at most three per game, besides the Ballad.
4. WHEN a song is not ready at its Song Slot THEN the Room SHALL play a Stock Song or nothing, and SHALL never pause or slow the game for a song.

### Requirement 2

**User Story:** As a Player, I want songs in quiet scenes to carry a small hint, so that listening is worth it, and I want the hint to be fair.

#### Acceptance Criteria

1. WHERE the Songs setting is on THEN a Clue Song SHALL play only in a scene with no active Player in it (the attract loop, a Round end, Wander between cases), and SHALL be heard by every Player at once.
2. A Clue Song SHALL hint only at a fact every Player could learn from the public log or the world (a Zone that was searched and found empty, a Relic no one has shown), and SHALL never hint at a card in any Player's Hand, a Residue placement or the Solution.
3. THE Room SHALL choose each Clue Song's hint deterministically from the Room seed and the public log, so that the same game gives the same hint.

### Requirement 3

**User Story:** As a Player, I want my name used only if I agree, and the game to stay cheap, so that songs are safe and never a surprise bill.

#### Acceptance Criteria

1. THE Room SHALL send a Player's nickname to the Song Service only WHEN that Player turned on "Sing my name" on their own device; otherwise the song SHALL use their role name (the Lodger, the Detective in seat 3).
2. EVERY call to the Song Service SHALL pass the spend guard, with its own meter and a cap per Room and per day, and SHALL be refused, with the Stock Song used instead, when the cap is reached or the kill switch is off.
3. THE Room SHALL send the Song Service only the lyrics and a style, never a photo, a voice recording or a Room token, and SHALL delete every made song with the Room.

### Requirement 4

**User Story:** As a Player who cannot hear the songs, I want their words on screen, so that I miss nothing, including the hint.

#### Acceptance Criteria

1. EVERY song SHALL show its words as captions in a polite live region while it plays, and a Clue Song's hint line SHALL also go into the public log.
2. THE Master SHALL be able to mute songs, skip a song and set the Songs setting; songs SHALL obey the Room's sound settings and phone sound consent.
3. Songs SHALL change no rule: the Solution, every Hand, the Turn order, the clock and the winners SHALL be the same with the Songs setting on, stock only or off.
