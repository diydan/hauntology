# Narration and dialogue style (DRAFT, 2026-11-16)

The pictures stay black-and-white 1920s silent film (a stop-motion storybook look was tried for the AI video on 2026-11-16 and the owner rejected it). The storybook is in the **words**: gothic, tender, deadpan. This file is the voice sheet for **narration** (the Reel and Wander scenes) and for **dialogue** (the Keeper, the Whisper, the Lodger).

It describes the traits, not who they came from. No third-party name, character or phrase goes into the app, the repo, the video or the Devpost text.

## The mix

| Trait | Where it comes from | What it does in a line |
|---|---|---|
| A narrator who warns you, kindly | the gloomy children's storyteller | "I must warn you that..." The narrator is sorry, and honest, and still tells you. |
| Tender, crooked, gothic | the stop-motion fairy tale | The ghost is the lonely one. The dead things have manners and feelings. |
| Exact, formal, deadpan | the dollhouse comedy | Small things counted and named. Everyone is polite while the roof falls in. |

## Seven rules

1. **Say the awful thing plainly, and politely.** "The door opens only twice" beats "a terrifying noise".
2. **Be exact about small things.** Count them, name them: eleven steps, a finger of wax, a pair of gloves set down just so. Numbers are written as words (a line has no digit).
3. **One house-gloss at most per line.** Redefine a plain word the way the house uses it: "a quiet evening is one in which the door opens only twice". Never use a stock catch-phrase from any book.
4. **Warn, never trick.** The Keeper tells you what is coming and does not help. "I mention it as a kindness."
5. **Be tender about the ghost.** The Whisper is shy and sorry. She does not threaten. She is practising, waiting, hoping.
6. **Short, even sentences.** End on the small object (the kettle, the step, the garden), not on the scare.
7. **No gore, no death word, no mocking the ghost.** The checker (`validateGhostReply`) also bans news, crime and death.

The bank rules stay as they are (`party-lines.md`, `ghost-lines.md`): first person, present tense, one to four short sentences, under 240 characters, no digit, no pronoun for a Player, no past-tense helper word (was, were, had, did), `{nick}` only in the last sentence. The single-player bank never says "house".

## The two main voices

| | Keeper (Ronald, `dry`) | Whisper (Pippa, `soft`) |
|---|---|---|
| Does | Warns, counts, deadpans, closes. | Waits, apologises, notices the small thing. |
| Humour | the dry understatement | the shy, odd, gentle detail |
| Never | cruel, loud, a villain | flirty, bright, a threat |

The Lodger (Mark) stays nervous and plain. He is the one person who is not in on the joke.

## Chapter cards (idea, not built)

Each Reel shot may carry a storybook title card in our own words, one line, small and still: *Chapter the Third. In Which Nobody Opens the Door.* The card is text and also the text twin of the shot (puzzles Requirement 18).

## The twelve lines written to this sheet (in the banks, 2026-11-16)

Each passes `validateGhostReply` and the bank rules, checked by script. They are in `party-lines.md` or `ghost-lines.md` (so in the generated banks and in the Voice Library manifest).

### For the pictures (timed to the clip, see `ai-scene-prompts.md`)

The seven were rendered in Inworld (Pippa with `[whisper]`, speaking rate 0.9, temperature 1.0; Ronald, rate 0.9, temperature 0.7) for `narration-preview-4.mp4`.

| Id | Voice | Scene | Line |
|---|---|---|---|
| `scene.hand-door.soft.1` | Whisper | Hand at the door | That is me, at the door. I knock three times. Two seems timid, and four seems desperate. I shall wait here, and be very polite about it. |
| `scene.bed.soft.1` | Whisper | The empty bed | I sit on the edge of the bed, very lightly, so as not to wake anyone. The pillow keeps a small dent. Nobody is in it. I look anyway, out of habit. |
| `scene.lights-out.soft.1` | Whisper | The lights go out (the house wins) | One window, then the next, then the last. Three floors, and I put out each one myself. Do not mind the dark. You tried very nicely. |
| `scene.dawn-door.dry.1` | Keeper | Dawn at the door (detectives win) | The house is quiet, and I note that its lamp has kept watch all night. Now the morning comes, and the door opens to meet it. Mind the step on your way out. |
| `wander.chimes.soft.1` | Whisper | Wander, a sound memory | Do you hear that? A row of small bells, and not one in tune. I would not change a single one. |
| `wander.chair.soft.1` | Whisper | Wander, a person memory | The tea is still warm, and the coat is still on the chair. Somebody has only just stepped out. I keep the kettle patient, in case of a quick return. |
| `wander.letter.soft.1` | Whisper | Wander, a promise memory (clip held back) | A letter, folded in three. A pair of gloves, set down just so. The breeze lifts one corner and puts it back, very politely. It is not for me to read. |

The Wander lines set a mood and never say what the player's memory is. The card after the scene does that.

### For the bank (the same style on the ordinary moments)

| Id | Voice | Line |
|---|---|---|
| `turn-start.dry.6` | Keeper | It is your hour. I must warn you that the staircase has eleven steps, and the house has twelve opinions on the matter. Go on, {nick}. |
| `time-warning.dry.6` | Keeper | The candle has about a finger of wax left. I mention it as a kindness. The house, I regret to say, mentions nothing. |
| `accuse.wrong.dry.5` | Keeper | That does not stand, and it came with great confidence, which I consider the finest way to be wrong. You have joined the haunting. There is a chair for you, {nick}, and it is the cold one. |
| `haunt.blackout.soft.6` | Whisper | I am dimming the house, one lamp at a time. The dark is rather lonely, and it will be shy of you. Be kind to it. |
| `ambient.dry.6` | Keeper | It is {weather} out. By my reckoning, a quiet evening is one in which the door opens only twice. I treasure the few I get. |

## What the existing bank already does

Most of `party-lines.md` and `ghost-lines.md` is already close: dry, polite, patient. The lean-in is small: add the warning ("I must warn you"), add exact small things, add one house-gloss now and then. No line needs a rewrite. New lines are added beside the old ones, so the Voice Library keeps its five-per-kind floor.

## State (2026-11-16)

- All twelve lines are in the banks and the Voice Library list, and **rendered** into the local library (`.voice-library/`, git-ignored; Inworld, 17 files, $0.055). They are not uploaded to R2.
- The seven picture lines are on `/footage.html` as words at their moment: the hand, bed, house and dawn lines in the Reel and the endings, the chimes and chair lines in Wander.
- The dawn line is `scene.dawn-door.dry.1`, written for `ai-dawn-door-take3` (the Room's own `end.solved` lines follow the shot, and none of them is used over it).
- The Wander letter line (`wander.letter.soft.1`) is rendered but unused: its clip is held back (writing on the letter).
