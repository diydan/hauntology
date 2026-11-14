# Narrator voices (DRAFT, 2026-11-14)

Status: **sample only.** One line per cell. The real banks need at least 5 lines per kind per voice (`ghost-engine` requirement 2.4). Written by following the `story-writer` brief in `.kiro/agents/story-writer.md`.

Tone: **eerie, never gory.** The steering rule is gentle, wistful, strange and warm. Fear comes from calm and from what is left unsaid.

## The voices

`soft` and `dry` are the two Creator voices (`Traits['voice']`). `formal` is a sample only. `childlike` was dropped on purpose: it is the most worn horror habit, and the hardest voice to get right in text to speech.

| Voice | Who it is | How it sounds |
|---|---|---|
| `soft` | A whisper that is a little too close. | Slow, short, kind. The kindness is the scary part. |
| `dry` | Patient, deadpan, long past being alarmed. | Understated. Gets laughs in a demo and still chills. |
| `formal` | An old, courteous caretaker of the house. | Grave and polite. Says terrible things as good manners. |

The text to speech voice for each comes from the fixed list in `ghost-voice` (`voiceFor`). Spike B picks the actual voices. Nothing here depends on that choice.

## Same five moments, three voices

Placeholders used: `{weather}`, `{time}`, `{bearing}`, `{band}`, `{nick}`.

| Id | `soft` | `dry` | `formal` |
|---|---|---|---|
| `meet` | `meet.soft.1` Hello. I was waiting. I did not mind. I am very good at waiting. | `meet.dry.1` Ah. A visitor. I would offer tea, but you can see my difficulty. | `meet.formal.1` Good evening. You find me, as ever, at home. Pray do not disturb the dust; it has been here longer than I. |
| `ambient` | `ambient.soft.1` The {weather} makes the glass hum. I like it when it is {time}. Everything leans closer. | `ambient.dry.1` {weather} again. I have watched a great deal of {weather}. I recommend it to nobody. | `ambient.formal.1` The {weather} has returned, as it does at {time}. I take it as a courtesy. |
| `hint` | `hint.soft.1` Something of mine is {band}, to the {bearing}. Go slowly. It is shy. | `hint.dry.1` Warmer, if you must know. It is {band}, to the {bearing}. I would not dawdle. | `hint.formal.1` I observe a thing of mine, {band}, to the {bearing}. I should attend to it, were I you. |
| `haunt.blackout` | `haunt.blackout.soft.1` Shh. I am putting the light out for a moment. Keep your hands where I can hear them. | `haunt.blackout.dry.1` I have turned the lights off. It is not personal. I simply work better in the dark. | `haunt.blackout.formal.1` Forgive the dark. It is the house's custom, and I am bound to observe it. |
| `accuse.wrong` | `accuse.wrong.soft.1` {nick} has named the wrong one. That is all right. Stay. I would like the company. | `accuse.wrong.dry.1` {nick} was wrong, with great confidence. I admire that. Do join the haunting; we are short-handed. | `accuse.wrong.formal.1` Alas, {nick}. The accusation does not stand. You are most welcome among us regardless. |
| `end.haunting` | `end.haunting.soft.1` It is quiet now. Nobody found me in time. Stay a little longer, all of you. The door can wait. | `end.haunting.dry.1` Well. That is that. I shall keep my secrets, and you may keep the memory of how close you were. | `end.haunting.formal.1` The hour is spent, and the matter is closed. I thank you for the visit. Do mind the stairs on your way out. |

## Checked against the rules

Each line is 1 to 4 short sentences, under 240 characters, first person, present tense, with no digits, no markup, no URLs and no banned phrases. No line names a card, a Hand, the Residue or the Solution, or says anything about a Bluff. No line assumes the place was lost or that anyone died. Nicknames appear only as `{nick}`, with no pronouns.

## Marked REVIEW

- `haunt.blackout.soft.1`: "Keep your hands where I can hear them" reads as an order to the player. Check that it feels eerie and not threatening.
- `end.haunting.soft.1`: "The door can wait" is the darkest line here. Check it stays inside the gentle rule.

## Decision

Chosen on 2026-11-14: **`soft` and `dry`.** `soft` is for fear and `dry` is for charm. Each voice costs about 100 authored lines (7 kinds times 5 lines, plus the party lines).

`formal` stays as a sample only. It is not authored further unless the decision changes.

## Applied to the specs (2026-11-14)

The Creator now offers two voices, because `ghost-engine` needs at least 5 persona-flavoured lines per Directive kind for every voice.

| File | Change |
|---|---|
| `.kiro/specs/ghost-creator/requirements.md` | Requirement 1: voice (two: soft or dry) |
| `.kiro/specs/ghost-creator/design.md` | `Traits['voice']` is `'soft' \| 'dry'` |
| `.kiro/specs/ghost-voice/design.md` | `PersonaVoice` is `'soft' \| 'dry'` |
| `.kiro/specs/ghost-voice/tasks.md` | Spike 1.1 picks two text to speech voices, not four |
| `.kiro/specs/ghost-engine/tasks.md` | Spike 4.1 runs two personas (soft/wistful, dry/stern) |

To bring `formal` or `childlike` back, change those four places and author their lines.
