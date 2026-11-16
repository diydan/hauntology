# Song catalogue: which song plays when

The 39 Stock Songs (game-songs Requirement 6). Lyrics, styles and voice lines live in `shared/src/songs/stock.ts`; the style rules in `.kiro/steering/house-style.md`. Every song shows its words as captions, and none carries a Player's name or a hidden fact.

Files (not in git yet; to be cut to about 45 s before they ship): the 14 with voices are in `~/Downloads/hauntology-songs/stock-voiced/`, the other 25 in `~/Downloads/hauntology-songs/stock/`. Each `.mp3` has a `.json` beside it with its exact prompt and lyrics.

## Background and moments

| Id | Title | Voice | When it plays |
|---|---|---|---|
| `title` | Welcome to the House | Deadpan baritone narrator | Home and the Gallery, quietly looping; stops when a case or Wander starts |
| `lobby` | Waiting in the Hall | Instrumental | The lobby while players join; the per-game opening replaces it once ready |
| `haunt-low` | The House Breathes | Instrumental | During play while the Haunt is 0 to 3 |
| `haunt-mid` | The House Stirs | Instrumental | During play while the Haunt is 4 to 6 |
| `haunt-high` | The House Will Not Sleep | Instrumental | During play while the Haunt is 7 or more |
| `sting-1`, `sting-2`, `sting-3` | Chapter End 1–3 | Instrumental, about 5 s | End of each Round (chapter), taking turns |

## Fallbacks (when the game's own song is not ready)

| Id | Title | Voice | When it plays |
|---|---|---|---|
| `fb-joined` | One More for the Walls | Thin sad female voice, child choir | A Player joins the haunting |
| `fb-wrong` | A Regrettable Guess | Deadpan baritone narrator | A wrong Accusation |
| `fb-becoming` | The Becoming | Lonely soprano | The Becoming |
| `fb-detectives` | The Case Is Closed | Deadpan baritone narrator | The ending, Detectives win (no Ballad ready) |
| `fb-house` | The Haunting Continues | Soprano, then a male whisper | The ending, the house wins (no Ballad ready) |

## Clue songs (quiet scenes only)

A relic or room song plays as a hint **only after the public log already shows that relic or room is not the answer**. Before that, it may play only as plain ambience in a quiet scene. Voice: a faraway choir humming, hushed.

| Ids | Songs |
|---|---|
| `relic-r1` … `relic-r6` | The Music box, Wax hand, Locket, Planchette, Silver key, Bell |
| `zone-long-hall` … `zone-garden-door` | The Long Hall, Cold Pantry, Nursery, Study, Back Stairs, Glasshouse, Cellar, Attic, Music Room, Old Kitchen, Library, Garden Door |

## Ghost themes

Play softly under a ghost's appearances (its card shown, its portrait on screen). Never tied to a hidden fact.

| Id | Ghost | Voice |
|---|---|---|
| `ghost-preset-1` | The Lamplighter | Old cracked male voice |
| `ghost-preset-2` | Widow Harrow | Thin trembling female voice |
| `ghost-preset-3` | The Drowned Choirboy | Choirboy, flat, as if underwater |
| `ghost-preset-4` | Old Tobias | Old cracked male voice, muttering |
| `ghost-preset-5` | The Bride in Grey | Thin sad young female voice |
| `ghost-preset-6` | Nurse Ottilie | Soft calm female voice, hollow |
| `ghost-preset-7` | The Stoker | Deep rough male voice |
| `ghost-preset-8` | Little Wren | Small child voice, whispered |

## Per-game songs (made fresh, not in this list)

| Song | When it is made | When it plays |
|---|---|---|
| Opening | While the lobby fills | When the case starts |
| Moment Songs (up to 3) | At the moment | The next calm point; the fallback above if not ready |
| Clue Songs (1–2) | During play | A quiet scene |
| Ballad | At the last Round or Haunt 8 | The ending screen, after the recap |

## Rules for every song

- Only one song at a time; never over speech, a Cue or a reveal.
- At most one Moment Song per Round and three per game.
- The Master can mute or skip; songs follow the Room's sound settings.
- The game never waits for a song.
