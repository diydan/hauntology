# The Lodger line bank (DRAFT, 2026-11-15)

Speaker: **the Lodger** (Inworld voice per Suspect: Mark, Conrad, Arjun, Chloe, Eleanor or Victoria, see `docs/story/CHARACTERS.md`; tag `[speak nervously]` added by the speech code, never written here). One bank for all six Suspects, the same lines in every voice. Written to the `story-writer` brief and `docs/story/CHARACTERS.md`.

How it is used:
- `aside`: text only, shown when a Suspect is named in a Suggestion. Never spoken.
- `stall`: spoken aloud when a Suspect is accused.
- `confession`: spoken aloud at the reveal, only by the Suspect in the Solution, only after the Solution is public.

The Lodger gives no tell. Before the reveal, no `aside` or `stall` confirms or denies guilt, and none says which part of a wrong Accusation was wrong. Every line carries one stumble ("Well...", "I mean...") so no line sounds more nervous than the rest. No line has a placeholder.

## aside (text only)

| Id | Line |
|---|---|
| `lodger.aside.1` | Me? Well... I mean... I have been named in worse company. Do carry on. |
| `lodger.aside.2` | Oh, I see. Named. Well... that is flattering, in its way. Go on, I am listening. |
| `lodger.aside.3` | A mention! I mean... well... one does like to be thought of. Do not mind me. |
| `lodger.aside.4` | Ah. My name, said aloud. Well... I mean... it is a good name. Carry on. |
| `lodger.aside.5` | Hm? Oh. Well... I mean... I was only standing here, looking haunted. Do carry on. REVIEW: sounds like an alibi. It is the same for every Suspect, so it is not a tell, but check it. |

## stall (spoken)

| Id | Line |
|---|---|
| `lodger.stall.1` | Me? Well... I mean... I would say that, wouldn't I? Go on, then, say it slowly. I do... like a pause. |
| `lodger.stall.2` | Oh. Well... I mean... this is rather sudden. Let me just find my composure. There, go on. |
| `lodger.stall.3` | Is it me? It is, isn't it. Well... I mean... do get on with it. The suspense is unbearable. |
| `lodger.stall.4` | Well... I mean... I am not at all nervous. Look. My hands are quite steady. Mostly. |
| `lodger.stall.5` | Take your time. I mean... please do. Well... no, hurry. I cannot decide which I would prefer. |

## confession (spoken, at the reveal only)

| Id | Line |
|---|---|
| `lodger.confession.1` | Oh, very well... it was me. I would like it noted that I was... provoked. |
| `lodger.confession.2` | Yes. It was me. Well... I mean... the creaking was my best work. |
| `lodger.confession.3` | Oh, all right! It was me. I had prepared a longer speech. Well... I mean... it was rather good. |
| `lodger.confession.4` | It was me. There. I feel... lighter. Well... I mean... do not look at me like that. |
| `lodger.confession.5` | Fine, fine! It was me. I am rather glad it is over. Well... I mean... I was quite good at it. |
| `lodger.confession.6` | Right, then. It was me. Be honest, am I terribly easy to read? Well... honest, but kind, please. |

## Checked against the rules

Run on 2026-11-15 with a script: every line is at most 240 characters and at most 4 sentences (an ellipsis is not a sentence end), has a stumble ("..."), and has no digits, no brackets and none of `` ` `` `*` `#` `<` `>`. The `aside` and `stall` lines hold none of: guilty, innocent, confess, did it, not me, wasn't me, nothing to hide, I would never. The first draft had 5 lines over 4 sentences and one without a stumble; they were fixed.

## Marked REVIEW

- `lodger.confession.6`: **replaced on 2026-11-15.** The first version ("Is everyone ready? It was me. Now I leave a pause for the gasp. I mean... do make it a good one.") was a stage direction, and the voice read it aloud word for word (Dan heard it in the Mrs. Dunmore clip). Three replacements were written and heard in Victoria's voice; **Dan chose A**, now the line above. Not chosen: **B** "Goodness. It was me. Please do not think less of me. Or do... but do think of me often, and fondly." **C** "I would so like to blame someone else. I really do try. It was me. Well... I am a dreadful liar, apparently." Small point on A: it asks the players a question ("am I terribly easy to read?"), which is a slight cue to whoever speaks next; no clash with the Keeper's lines was found. The Mrs. Dunmore clip was remade with A (about $0.28).

- `lodger.aside.5`: "I was only standing here" sounds like an alibi.
- `lodger.stall.3`: "It is, isn't it" assumes the Suspect is the one named. That is true for a stall (they were accused), so it is fine, but check it reads right when the Accusation is later shown to be wrong.
- `lodger.stall.1`: the closest to the version you approved by ear ("Me? Well... I mean... I would say that, wouldn't I?"). I joined "Go on, then" and "say it slowly" with a comma to stay within 4 sentences, so the pause may sound a little different. Re-listen once the Library is rendered.

## Not done

- No audio has been rendered for this bank. Mark with `[speak nervously]` has been heard on the stall and confession samples only.
- The Library render (`tools/prerender-voice.mjs`) does not exist yet.
