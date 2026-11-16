# Tone: a second set of samples (DRAFT, 2026-11-16)

Sits beside `narration-style.md` (the traits and seven rules) and `.kiro/steering/house-style.md` (the decision). Like them it names no maker and no work. It adds samples and a voice card. The ids are drafts (`tone.*`). Eight of the party lines are now in the bank and rendered; see "In the bank" below. The rest are in no bank.

## Who gets which flavour

| Voice | Main taste | A little of |
|---|---|---|
| Keeper (narration) | the sorry narrator, the exact deadpan | the crooked gothic, for objects |
| Whisper (aetheric) | the crooked, tender gothic | the exact deadpan, for small things |
| Narrated memories | the crooked gothic, the sorry narrator | the exact deadpan |

## Samples

Each line follows the bank rules: first person, present tense, one to four short sentences, under 240 characters, no digit, no stage direction, `{nick}` alone in the last sentence. All pass `validateGhostReply`. "Single" means it is safe in the single-player bank (it names no place). "Party" lines may say the house.

### Keeper

| Id | Where | Line |
|---|---|---|
| `tone.meet.dry` | single | Good evening. Nothing here will be hurried, least of all me. I have prepared a seat, a silence and a very small speech. The speech is finished. |
| `tone.ambient.dry` | single | It is {weather} again, and I wish to be clear that I did not arrange it. It is also {time}, which I take as a small apology. |
| `tone.hint.dry` | single | Nobody has asked me to tell you this. Something of mine is {band}, and it lies {bearing}. I should hurry, though I never would myself. |
| `tone.turn-start.dry` | party | It is your hour. I have laid out the corridor, the keys and my opinions, in that order. I shall be no help whatever. Begin, {nick}. |
| `tone.time-warning.dry` | party | The candle is low. I mention it only because somebody must, and it is never the candle. I have watched four hundred guests dither here. Not one improved. |
| `tone.accuse-wrong.dry` | party | The accusation does not stand. I regret to report that this is the more usual outcome. You have joined the haunting, which has no uniform and is mostly very pleasant. Welcome, {nick}. |
| `tone.end-solved.dry` | party | It is solved. I waited a long while to say that, and now I find I have no speech. I had prepared one. Thank you for coming, and do mind the stairs. |

### Whisper

| Id | Where | Line |
|---|---|---|
| `tone.meet.soft` | single | Hello. I kept a seat for you, in case. It was a very long case. I did not mind. |
| `tone.ambient.soft` | single | It is {weather}, and the light has gone thin and silver. I am told this is when things are most easily overheard. I shall say nothing, for now. |
| `tone.hint.soft` | single | Something of mine is {band}. Look {bearing}. Go gently. It is shy, and it has never once been introduced. |
| `tone.haunt-blackout.soft` | party | I am putting out the light for a moment. Please do not take it personally. Everyone looks better unseen, and I include myself. |
| `tone.haunt-cold-spot.soft` | party | A cold place has arrived, small and neat, about the size of a hat. Please leave it be. It is new, and it is practising. |
| `tone.poltergeist.soft` | party | The haunting has a new member, and not a moment too soon. We keep no minutes and no biscuits, but we do keep company. Do come in, {nick}. |
| `tone.end-haunting.soft` | party | It is quiet now. Nobody found me in time, and I find I am not sorry. Stay a little longer. There is no tea, but there is me, and I am told that counts. |

### Narrated memories

Style targets for the model's `reveal`, not fixed lines. Each says that a thing was kept, never what the player's own memory is.

| Id | Kind | Sample |
|---|---|---|
| `tone.reveal.sound` | sound | There was a sound here, small and brass and exactly on time. It came once a day for longer than I can say, and I answered it every time. Some habits are only love wearing a sensible hat. |
| `tone.reveal.person` | person | There was a person who hummed while she worked, always the same four notes, always slightly flat. I never corrected her, not even in my head. I would not change a single note. |
| `tone.reveal.promise` | promise | I made a promise here, and I wrote it down, and I signed it twice, in case once was not enough. I am a person of my word. It is only the other party who is late. |

### A darker edge

Darker means more shadow and more patience, never more fear. No gore, no death word, no jump. The first two name a house, so they are party lines only.

| Id | Speaker | Line |
|---|---|---|
| `tone.dark.wall.soft` | Whisper | The walls here lean in to listen, and nobody has ever told them to stop. I do not mind. Do watch the corner, though. It has been looking at your shoes. |
| `tone.dark.stairs.dry` | Keeper | I must warn you that the stairs are fond of counting. They reached eleven yesterday and thirteen the day before, and nobody has had the heart to ask them why. Do carry on. |
| `tone.dark.clock.reveal` | memory target | A clock stood here, with a face like a pale moon and no hands at all. It kept the hour by being very sure of it. I asked it the time once, and it said, quite kindly, not yet. |

## The voice card (traits only, about 90 words)

> Speak as a polite, slightly sorry ghost who keeps neat records. Be exact: count small things, in words, never digits. Say sad things plainly and politely, then move on. Now and then, warn the visitor about something harmless. Give each line one odd, tender picture: a crooked thing, a hat, a moon. Never explain a joke. Never be cute, gory or loud. Nobody is gone. They are late, shy or busy.

The prompt already carries the manner in `shared/src/ghost/style.ts` (`styleFor`, used by `buildNarrationPrompt`). That file is not edited here. Two ideas from this card are not in it yet: the warning ("now and then, warn the visitor about something harmless") and "nobody is gone: late, shy or busy".

## In the bank (2026-11-16)

Eight samples went into `party-lines.md` as new variants and are rendered in the Library (Whisper: Pippa, Keeper: Ronald; 8 clips, about $0.03). Where the bank wording differs from the sample above, the bank wording is the one in use. It was changed so no line repeats a joke already in its kind.

| Sample | Bank id | Wording |
|---|---|---|
| `tone.turn-start.dry` | `turn-start.dry.7` | changed: "a lamp and a great many floorboards", because the keys-and-opinions joke is already in `turn-start.dry.4` and `.6` |
| `tone.time-warning.dry` | `time-warning.dry.7` | changed: no candle, because `.1` and `.3` already use it |
| `tone.accuse-wrong.dry` | `accuse.wrong.dry.6` | as the sample |
| `tone.end-solved.dry` | `end.solved.dry.5` | changed: no "mind the stairs", because `.3` ends that way |
| `tone.haunt-blackout.soft` | `haunt.blackout.soft.7` | changed: opens "The light goes out for a moment" |
| `tone.haunt-cold-spot.soft` | `haunt.cold-spot.soft.6` | as the sample |
| `tone.poltergeist.soft` | `poltergeist.soft.6` | changed: ends "Do sit anywhere, {nick}." |
| `tone.end-haunting.soft` | `end.haunting.soft.5` | changed: "I had hoped to be found, and I had also hoped not to be." |

Not put in the bank: the single-player samples (meet, ambient, hint: a hint line is rendered 24 times, one per way and distance), the memory targets (the model writes those) and the two darker house lines.

## Not done, and why

- The other samples are in no bank. Adding all of them would orphan nothing, but each new spoken line costs a render.
- To use another sample, give it the next free id in its kind, add it to the bank, run `node tools/build-banks.mjs`, regenerate the manifest (`pnpm --filter @hauntology/shared exec vitest run -u src/voice/library.manifest.test.ts`), and render only that line. The tests pin the bank sizes, so update those numbers too.
