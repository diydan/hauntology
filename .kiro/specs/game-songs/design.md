# Design Document

## Overview

A pure module `shared/src/songs/` decides when to ask for a song, what it may sing and when it plays; the Room server runs the call through a guarded adapter (`api/src/guarded/songs/`), the same pattern as Workers AI and World Labs. The Engine is not changed: songs read its public log and add nothing to its state.

```
Engine public log -> songs/plan.ts (Moment? Ballad due? Clue scene?) -> lyrics.ts (Lyric Facts only)
  -> spend guard (meter "song") -> Song Service adapter -> R2 (deleted with the Room) -> Song Slot -> Host plays + captions
                                \-> refused or late -> Stock Song
```

## Components

| Part | Job |
|---|---|
| `songs/plan.ts` | `songRequests(log, settings, sent)`: which songs to ask for now; the per-Round and per-game limits |
| `songs/lyrics.ts` | `lyricFacts(publicView, consent)` and `writeLyrics(kind, facts, seed)`: scripted templates, no model call needed |
| `songs/clues.ts` | `clueHint(publicLog, seed)`: a fair hint from public facts only |
| `songs/slots.ts` | `nextSlot(state)`: the next calm point; never over speech, a Cue or a reveal |
| `guarded/songs/mureka.ts` | the call to the Song Service: lyrics and style in, an audio file out; time limit and retry once |
| Stock Songs | `web/public/sounds/songs/` with their captions, made once by the owner |

Lyrics come from templates filled with Lyric Facts, so the words are known and checked before any call; the service only sings them.

## Correctness Properties

### Property 1: Songs sing only public facts

*For any* game and any song asked for, every name, Zone, Relic and Suspect in its lyrics is in the Lyric Facts at that time; the Solution appears only in the Ballad; no card from any Hand appears; a nickname appears only with that Player's consent.

**Validates: Requirements 1.1, 2.2, 3.1**

### Property 2: Clue hints are fair and fixed

*For any* public log and seed, `clueHint` names only a Zone searched and found empty or a Relic nobody has shown, never a Residue placement or the Solution, and gives the same hint for the same log and seed.

**Validates: Requirements 2.2, 2.3**

### Property 3: Songs change no rule and never wait

*For any* game played with the Songs setting off, stock only or on, and any song readiness, the Solution, the Hands, the Turn order, the clock deadlines and the winners are the same, and at most one Moment Song per Round and three per game are asked for.

**Validates: Requirements 1.3, 1.4, 4.3**

## Testing

Property tests with fast-check for Properties 1 to 3. Example tests: the Ballad asked for at the last Round or Haunt 8 (1.2), the spend guard refusal and the stock fallback (3.2), what is sent to the service (3.3), captions and the log line (4.1), the Master's controls (4.2), Clue Songs only in empty scenes (2.1). A spike tries Mureka's time to make a song and its price before any wiring.
