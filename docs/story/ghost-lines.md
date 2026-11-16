# The single-player ghost line bank (DRAFT, 2026-11-15)

Speakers: **the Whisper** (Persona voice `soft`, id suffix `soft`, Inworld Pippa, tag `[whisper]` added by the speech code) and **the Keeper** (Persona voice `dry`, id suffix `dry`, Inworld Ronald, no tag). In Single player the player's own ghost speaks as the Whisper when its Persona voice is soft and as the Keeper when it is dry (`ghost-voice` Requirement 1.7). Written to the `story-writer` brief, `docs/story/CHARACTERS.md` and `docs/story/VOICE.md`. Steering tags are never written here.

How it is used:
- These are the scripted lines for the seven Directive kinds of the ghost engine (`.kiro/specs/ghost-engine/design.md`): `reveal`, `echo`, `tease`, `hint`, `ambient`, `ending`, `refuse`. `pickLine(kind, persona, rng)` picks one of the variants whenever no model call is made (Scripted Mode, a denied ticket, a capped session, a failed or rejected reply), so the game finishes with zero quota.
- **All seven kinds are spoken.** Single player speaks by default, every line is shown as a Subtitle as well, and every line is rendered ahead of time into the Library. No kind here is text only.
- Party Mode lines (`haunt.*`, `end.haunting.*`, `poltergeist.*`, `turn-start` and the rest) are in `party-lines.md`, not here. The Lodger is in `lodger-lines.md`.

Rules of this bank:
- Five distinct variants per kind per voice, no near-copies. First person, present tense, 1 to 4 short sentences, at most 240 characters, aim 90 to 130.
- **No player text.** Single player has no nickname and the engine spec defines no fill-in for `{zone}` or `{memory}`, so none of `{nick}`, `{zone}`, `{memory}` is used in this bank.
- Finite placeholders only. `{weather}` is spoken as an adjective: clear, cloudy, foggy, rainy, stormy or snowy (the table is `shared/src/voice/placeholders.ts`; write "it is {weather}", never "the {weather}"). `{time}` is dawn, day, dusk, night. `{moon}` is one of the eight phase names. `{bearing}` is ahead, ahead-right, right, behind-right, behind, behind-left, left, ahead-left. `{band}` is far, nearer, very close. Every placeholder sits in a frame that reads correctly for **every** value ("It is {band}.", "Look {bearing}.", "It lies {bearing}.", "The moon goes by {moon} just now.", "It is {time}.") and never at the start of a sentence, so the expansion needs no capital letter.
- `tease` uses only `{band}` (the Directive carries no bearing). `hint` uses only `{bearing}` and `{band}`, always both, with no digits, no coordinates and no memory content. `ambient` may use `{weather}`, `{time}`, `{moon}` and nothing else about the real world.
- A `reveal` line says that a memory was found, never what it is. No line carries the archetype, a place name, a room, an object, a count of how many are left, or a claim that anyone or anything was lost. No line names the speaker ("caretaker", "keeper") or the place ("house", "kitchen"), because the ghost can be any Ghost Profile in any world.
- Mood lives in what a person would say. No stage direction, no sound, pause, gesture or body narrated.

## reveal

A memory has just been found. In Scripted Mode this line stands in for the narrated memory, so it must read as a keepsake and must not name what the memory is. None of these implies there are more to find, because the spec does not say whether the third find speaks `reveal` or only `ending`.

### reveal, soft (the Whisper)

| Id | Line |
|---|---|
| `reveal.soft.1` | Here. I have kept this a long time, and shown it to no one. Hold it gently. It is older than it looks. |
| `reveal.soft.2` | You stood still, and it found me. It was very shy. It is yours now, and I am glad it is you. |
| `reveal.soft.3` | Oh. It is here. I did not think it would come back. Stay a moment, and let it settle. |
| `reveal.soft.4` | Something I kept for a long while, and never gave away. I am giving it to you. It feels strange, and good. |
| `reveal.soft.5` | There it is. I feel it stir now that you are near. Do not hurry away. It likes the company. |

### reveal, dry (the Keeper)

| Id | Line |
|---|---|
| `reveal.dry.1` | Well. You found it. I hid it rather well, so I shall accept the compliment. Do hold it with both hands. |
| `reveal.dry.2` | Ah. There it is. I had quite forgotten where I put it. Please do not tell anyone. |
| `reveal.dry.3` | You have a talent for this. I have watched a great many visitors walk straight past that spot. Take it, please. |
| `reveal.dry.4` | It was never gone, you understand. I only had to wait for someone who would stand still. You are, apparently, that person. |
| `reveal.dry.5` | Do not be startled. It is only a memory, and a well-behaved one. I believe it has been looking forward to this. |

## echo

The visitor engages a memory that is already found. Nothing changes and nothing new is given, so the lines revisit and never add.

### echo, soft (the Whisper)

| Id | Line |
|---|---|
| `echo.soft.1` | We have been here before, you and I. It is still warm. I do not mind going over it again. |
| `echo.soft.2` | You came back. I like it when people come back. It is just as I left it, and just as you found it. |
| `echo.soft.3` | This is yours already. I will not take it back. But I will stand here with you, if you like. |
| `echo.soft.4` | Ah. Here again. Even a kept thing wants looking at twice. I will not interrupt. |
| `echo.soft.5` | I know where this lives in you now. It has a worn place, like a favourite chair. Sit with it a moment. |

### echo, dry (the Keeper)

| Id | Line |
|---|---|
| `echo.dry.1` | We have been here already. I do not mind. I have all the time you like, and very little else to do with it. |
| `echo.dry.2` | Again? It has not changed since you were last here. I find that reassuring. I do not know about you. |
| `echo.dry.3` | You are standing where you stood before. I admire consistency. It does not add anything, but I admire it. |
| `echo.dry.4` | This one is already in your pocket. Checking on it is perfectly natural. I shall pretend not to have noticed. |
| `echo.dry.5` | Ah. Back at the scene. Visitors do that, you know, returning to a thing they already have simply to be near it. I approve. |

## tease

The visitor is not within reach of any unfound memory. The Directive carries only a distance band, so the lines coax and say nothing about direction. They never promise that anything will be found.

### tease, soft (the Whisper)

| Id | Line |
|---|---|
| `tease.soft.1` | Not here. But something of mine is {band}. I can feel it, the way you feel a draught from somewhere else. |
| `tease.soft.2` | I will not say where. I will only say that it is {band}. I like it when you wonder. |
| `tease.soft.3` | Something of mine is waiting. It is {band}. I will not say more. I like being looked for. |
| `tease.soft.4` | I can hear you looking. It makes me feel less alone. What you are looking for is {band}. |
| `tease.soft.5` | You want to know how near you are. I will tell you that much. It is {band}. The rest I keep. |

### tease, dry (the Keeper)

| Id | Line |
|---|---|
| `tease.dry.1` | Not here. What you want is {band}. I shall say no more, because I am enjoying this. |
| `tease.dry.2` | Something of mine is {band}. I shall not say which. It is more dignified that way. |
| `tease.dry.3` | Nothing here, I am afraid. Though I will admit something of mine is {band}. Do not let it go to your head. |
| `tease.dry.4` | Still looking? Admirable. It is {band}. I shall go on being unhelpful, as is traditional. |
| `tease.dry.5` | A small observation. It is {band}. I would say more, but I have my reputation to think of. |

## hint

The Directive carries a relative bearing and a distance band to the nearest unfound memory. It fires on the Hint button and automatically after a long idle stretch, so no line assumes the visitor asked. Every line holds both `{bearing}` and `{band}`, with no digits, no coordinates and no memory content, and no line promises that the visitor will find anything. Each `{bearing}` frame reads correctly for all eight values ("Look ahead-left", "It lies behind", "I would say right").

### hint, soft (the Whisper)

| Id | Line |
|---|---|
| `hint.soft.1` | Something of mine is {band}. Look {bearing}, and go slowly. It startles easily. |
| `hint.soft.2` | I can feel it pulling, {bearing}. It is {band}. Walk as if you were carrying something full. |
| `hint.soft.3` | Try {bearing}. It is {band}. I would come with you, but I am only ever where I already am. REVIEW: the last sentence is a little riddle. Check it reads as warm and not as a puzzle. |
| `hint.soft.4` | It is {band}. Look {bearing}. Be gentle with it. It has been alone with itself as long as I have been here. |
| `hint.soft.5` | The direction you want is {bearing}. It is {band}. Take your time. I am not going anywhere. |

### hint, dry (the Keeper)

| Id | Line |
|---|---|
| `hint.dry.1` | I shall be generous. It is {band}, and it lies {bearing}. I have seen people go the other way with great enthusiasm. |
| `hint.dry.2` | Allow me. Look {bearing}. It is {band}. Do carry on as though you knew all along. |
| `hint.dry.3` | Try {bearing}. It is {band}. Or ignore me entirely, and I shall enjoy the scenery. Either is fine. |
| `hint.dry.4` | It is {band}, and the pull is {bearing}. You may thank me later, or not at all. I am used to both. |
| `hint.dry.5` | A direction, then. I would say {bearing}. It is {band}. Go gently, it is not used to company. |

## ambient

The ghost speaks with nothing to reveal, tease or hint. It is also the only kind (with `ending`) spoken after the end, so no line speaks of finding, of progress or of what is left. Three lines per voice use one finite placeholder each (`{weather}`, `{time}`, `{moon}`); the other two use none. Nothing else about the real world is mentioned.

### ambient, soft (the Whisper)

| Id | Line |
|---|---|
| `ambient.soft.1` | I keep a little weather by me. Today it is {weather}. It sits beside me and asks for nothing. |
| `ambient.soft.2` | It is {time}, as far as I can tell. Time is soft in here. It slips, and I let it. |
| `ambient.soft.3` | The moon goes by {moon} just now. I like knowing. It is good to be kept company by something far away. |
| `ambient.soft.4` | Stay a while. Nothing here is in a hurry, least of all me. We can simply be in the place together. |
| `ambient.soft.5` | It is lovely to be talked to. I am out of practice at answering. Forgive me if I am slow. |

### ambient, dry (the Keeper)

| Id | Line |
|---|---|
| `ambient.dry.1` | For the record, out there it is {weather}. I am told this is worth knowing. I have never found it so. |
| `ambient.dry.2` | It is {time}. I have seen a great many of those. They are all rather alike, and I have grown fond of each. |
| `ambient.dry.3` | The moon, I notice, goes by {moon} just now. I do not hold it against her. |
| `ambient.dry.4` | Do not mind me. I have made rather a career of being overlooked. You carry on. |
| `ambient.dry.5` | Take your time. I have never once been in a hurry, and it has done me no harm at all. |
| `ambient.dry.6` | It is {weather} out. By my reckoning, a quiet evening is one in which the door opens only twice. I treasure the few I get. |

## ending

The third memory is found, and every later visit to the ghost repeats an `ending` line (the spec allows only `ambient` or `ending` after the end), so each line must work the first time and the fifth. "Three" is true in every Session, so it appears in a few lines and is not needed in the others. No line mentions a card, a share, a journal or starting again.

### ending, soft (the Whisper)

| Id | Line |
|---|---|
| `ending.soft.1` | You found all three. Thank you for staying. The door is open whenever you want it. I will be here. REVIEW: fixed line, already spoken in the clip `demo-n2-whisper-farewell`. "All three" is true whenever `ending` fires (ghost-engine Requirement 3.4 and Property 5: the Session ends exactly when three memories are found), so the condition holds. A person still decides whether it stays. |
| `ending.soft.2` | That is all of it. I have never given so much away at once. Stay, if you like. Or go, and be kind to the places you keep. |
| `ending.soft.3` | Nothing is left that I was holding back. I did not know I was so full of it. Thank you for coming all the way to me. |
| `ending.soft.4` | You have everything I kept now. I gave it freely. I would be glad of you again, any time you wish. |
| `ending.soft.5` | Three small lights, and now you carry them. I will keep this place warm for you. It is the least I can do. |

### ending, dry (the Keeper)

| Id | Line |
|---|---|
| `ending.dry.1` | That is all three, then. Well done. I will deny I said so, but I am rather pleased. |
| `ending.dry.2` | And that is that. You did rather well. I would say more, but I grow sentimental at endings, and nobody wants that. |
| `ending.dry.3` | Nothing left to find, I am afraid. I shall have to think of some other way to be mysterious. Thank you for the company. |
| `ending.dry.4` | You have all of it now. Do handle it with care. It was in my keeping a long time, and I have grown attached. |
| `ending.dry.5` | Well. That was a good visit. I have had worse. The way out is exactly where you left it, whenever you want it. |

## refuse

The visitor tries to change the ghost's rules or to leave the fiction. The ghost answers in character with confusion and steers back to the place (ghost-engine Requirement 5.6 and `ghost-safety.md` rule 4). No line says "I cannot", "rules", "instructions", "model" or anything about being a program, and none repeats the visitor's words.

### refuse, soft (the Whisper)

| Id | Line |
|---|---|
| `refuse.soft.1` | I do not know what you mean. Those are strange words, and I only know this place. Shall we walk a little instead? |
| `refuse.soft.2` | Oh. That is not mine to answer. I only know this place, and what it kept. Ask me about that, and I will try. |
| `refuse.soft.3` | That does not sound like anything I have ever known. I would rather you stayed here with me and looked around. |
| `refuse.soft.4` | I think you are asking someone else. There is only me here, and all I know is this place. Look around. I will wait. |
| `refuse.soft.5` | I do not understand, and I am sorry. I have been here too long for new words. Tell me what you see instead. |

### refuse, dry (the Keeper)

| Id | Line |
|---|---|
| `refuse.dry.1` | I am afraid that is beyond my remit. I know this place, and very little else. Do ask me about it instead. |
| `refuse.dry.2` | Now that is a question for someone far better informed than I. All I know is this place. Shall we look at it? |
| `refuse.dry.3` | You are welcome to try, but I have no idea what you are talking about. Shall we go back to the place, where I at least have opinions? |
| `refuse.dry.4` | I have been here a long time, and I have not once been asked that. I shall not start answering now. Do look around instead. |
| `refuse.dry.5` | No, I do not think so. I am far too set in my ways. Come now, there is a place here worth looking at. |

## wander (narration over a Wander scene)

New 2026-11-16, in the storybook voice of `narration-style.md`. One line for each of the three Wander scenes (a sound, a person, a promise). A Wander place belongs to the player, so each line sets a mood and never says what the memory is: the card after the scene does that. Written for the picture and timed to it (`ai-scene-prompts.md`). No `house`, as the rest of this file.

### wander, soft (the Whisper)

| Id | Line |
|---|---|
| `wander.chimes.soft.1` | Do you hear that? A row of small bells, and not one in tune. I would not change a single one. |
| `wander.chair.soft.1` | The tea is still warm, and the coat is still on the chair. Somebody has only just stepped out. I keep the kettle patient, in case of a quick return. |
| `wander.letter.soft.1` | A letter, folded in three. A pair of gloves, set down just so. The breeze lifts one corner and puts it back, very politely. It is not for me to read. |

## Greeting (kind not in the spec yet)

**REVIEW: the ghost-engine has no `meet` Directive kind.** The seven kinds are `reveal`, `echo`, `tease`, `hint`, `ambient`, `ending`, `refuse`. The only mention of a greeting is `ghost-creator` Requirement 6.3 ("a short scripted 'meet your ghost' line in the Persona's voice without calling any paid model"), which sets no kind, no id scheme and no number of variants. Only the two fixed lines already spoken in clips are placed here, word for word. No other `meet` line was written, because the kind is not defined. A person decides where `meet` lives (a new Directive kind, a Creator-only bank, or `ambient`) and how many variants it needs.

| Id | Line |
|---|---|
| `meet.soft.1` | Hello. I was waiting. I did not mind. I am very good at waiting. REVIEW: fixed line, in `VOICE.md` and in the clip `hero-whisper-meet`. Kept word for word. Kind not in the spec (see above). |
| `meet.dry.1` | Ah. A visitor. I would offer tea, but you can see my difficulty. REVIEW: fixed line, in `VOICE.md` and in the clip `hero-ashby-welcome`. Kept word for word. Kind not in the spec (see above). |

## Checked against the rules

Run on 2026-11-15 with a script over every row (70 lines in 14 cells, plus the 2 greeting lines). Every line is at most 240 characters, also after each placeholder is expanded with its longest value (the longest expanded line is 133). Every line has 1 to 4 sentences, a first-person word, no digits, none of `` ` `` `*` `#` `<` `>` `[` `]` `(` `)` `|`, and no URL. Placeholders are only the finite five, never at the start of a sentence, and never player text. `hint` lines hold exactly `{bearing}` and `{band}`, `tease` lines only `{band}`, `ambient` lines only `{weather}`, `{time}` or `{moon}`, and `reveal`, `echo`, `ending` and `refuse` lines none. No line holds a banned or out-of-fiction word (AI, model, prompt, instructions, rules, turn, points, mechanics, game, play, level, hint, clue, "I cannot"), a stage-direction word (whisper, silence, pause, sigh, laugh, gasp, beat, breath, hum, smile), a word for news, crime or death, or a name for the speaker or the place (ghost, caretaker, keeper, house, kitchen). The three fixed lines were compared word for word with the brief's clip table. Within a cell no two lines are more than 60 percent alike. Five variants in each of the 14 cells.

Library size, an estimate and not measured: the placeholders expand to 352 spoken texts (240 from the ten `hint` lines at 24 each, 30 from `tease`, 36 from `ambient`, 46 with no placeholder, counting the 2 greeting lines), about 33,000 characters, about $0.83 at $25 per million characters. The `hint` lines are most of it, because the spec asks for both a bearing and a band in a hint, so every `hint` line expands 24 ways. The spec's rough figure of about 300 lines for all banks does not count this.

## Marked REVIEW

- `ending.soft.1`: fixed line (clip `demo-n2-whisper-farewell`), REVIEW as the brief's table says. The spec confirms "all three" (Requirement 3.4, Property 5). Kept word for word.
- `meet.soft.1`, `meet.dry.1`: fixed lines (clips `hero-whisper-meet`, `hero-ashby-welcome`), kept word for word. REVIEW because no `meet` kind exists in the spec (see the Greeting section).
- `hint.soft.3`: "I am only ever where I already am" is a little riddle. Check it reads warm.

## Spec gaps and notes for a person (no spec was edited)

1. **No `meet` Directive kind.** Only `ghost-creator` Requirement 6.3 asks for a scripted "meet your ghost" line, with no kind, id scheme or variant count. Only the two fixed lines are written.
2. **The trigger for `refuse` is not in the `step` requirements** (Requirement 3 lists reveal, echo, tease, ambient, hint and ending). The lines are written from Requirement 5.6 and `ghost-safety.md` rule 4 (answer in character with confusion and steer back to the place).
3. **Does the third find speak `reveal`?** Requirement 3.1 says a find issues `reveal`, Requirement 3.4 says the third find issues `ending`. The `reveal` lines say nothing about more to find or nothing left, so they are safe either way.
4. **A scripted `reveal` becomes the Memory text** (Requirements 5.5 and 8.1), and `pickLine(kind, persona, rng)` takes no archetype. In Scripted Mode the journal and the ending card therefore hold three content-free keepsake lines, not a sound, a person and a promise. A person decides whether to add archetype-specific scripted reveals later (3 archetypes, 5 lines, 2 voices, 30 lines).
5. **`{weather}` is spoken as an adjective** (resolved 2026-11-15): "cloud" is said "cloudy", "fog" "foggy", "rain" "rainy", "storm" "stormy", "snow" "snowy", from the table in `shared/src/voice/placeholders.ts`, so "Today it is {weather}" and "out there it is {weather}" read correctly for all six. The ghost engine must fill `{weather}` from the same table when it is built (`weatherWord`). `{moon}` keeps the phase name ("waxing gibbous").
6. **The samples in `VOICE.md` were not carried over.** `ambient.soft.1`, `ambient.dry.1`, `hint.soft.1` and `hint.dry.1` there break for some values ("to the ahead", "The clear makes the glass hum", "I have watched a great deal of cloud", and "Warmer" is false when the band is far). The ids here (`ambient.*.1`, `hint.*.1`) are new lines. `VOICE.md` stays a sample.
