# The party line bank (DRAFT, 2026-11-15)

Speakers: **the Keeper** (Inworld Ronald, id suffix `dry`, played by Mr. Ashby on screen) and **the Whisper** (Inworld Pippa, id suffix `soft`). Steering tags (`[whisper]`) are added by the speech code and never written here. Written to the `story-writer` brief, `docs/story/CHARACTERS.md` and the party-mode spec (Directives, Haunt, Cues, Nudges, Frames).

**The Lodger is not in this file.** Its `aside`, `stall` and `confession` lines live in `docs/story/lodger-lines.md`. The Keeper announces `accuse.reveal` (the Directive `reveal`) and `accuse.wrong` (a Lodger `stall` follows), and the Keeper closes `accuse.right` and `end.solved` (a Lodger `confession` comes first). The single-player `meet.*` and `ending.*` lines are not here, and neither are the two demo-only lines.

## Ids and kinds

| Id kind | Directive kind in the spec | Speaker | Spoken or text only |
|---|---|---|---|
| `turn-start`, `time-warning`, `achievement`, `suggest`, `shown`, `none-shown`, `inspect`, `seal` | the same | Keeper | spoken |
| `accuse.reveal` | `reveal` (named `accuse.reveal` here because `reveal.*` ids are the single-player memory lines in `ghost-lines.md`) | Keeper | spoken |
| `accuse.wrong`, `accuse.right`, `end.solved` | `accuse-wrong`, `accuse-right`, `ended-solved` | Keeper | spoken |
| `cue.<sound>`, `nudge.help`, `nudge.spook`, `phone-cue.<sound>` | `cue`, `nudge`, `phone-cue` (scripted only, never a model) | Keeper | text only (proposed: they happen too often to voice) |
| `not-you` | the private `notYou` message of a House Cue and a Frame | Keeper | text only, on the target's phone |
| `haunt.cold-spot`, `haunt.blackout`, `haunt.restless`, `haunt.lull` | `haunt-event` | Whisper | spoken |
| `poltergeist` | `poltergeist` (a Player joins the haunting) | Whisper | spoken |
| `end.haunting` | `ended-haunted` | Whisper | spoken |
| `haunt.choose` | none: the prompt that offers two options to a Poltergeist | Whisper | text only, private on the phone |
| `haunt.rise`, `round-end`, `hand-over`, `midnight` | **none, see "Spec gaps"** | proposed | `midnight` spoken, the others text only |

The four sounds of a Cue are the spec's own catalogue: `creak`, `whisper`, `bell`, `laugh`. The two Nudges are `help` and `spook`. A Frame has no line of its own: it produces the same public event as a House Cue (`phone-cue`) and the same private `not-you`, so one bank serves both and no line can tell which it was.

How the lines are built:
- Every line is in the speaker's own first person, present tense, 1 to 4 short sentences. No line says turn, round, point, rule, card, hand, clock, seconds, level or game. The house says it as the house would: a turn is "your hour", a round is "the circle", a Suggestion is "a theory", the Haunt is "the house".
- The only placeholders are `{nick}` and `{zone}`. Each sits in a sentence of its own, and that sentence is the last one, so the speech code stops before it and every spoken part stands alone. No line uses a pronoun for a Player. Where a Player is addressed, it is as "you" in the sentence that holds `{nick}`.
- No line names a card, a Hand, the Residue or the Solution, says who holds what, or says whether a Suggestion was a Bluff. `shown` and `none-shown` say only what the public log says.
- A wrong Accusation says only that it does not stand and that its Player has joined the haunting, never which part failed. The word "Poltergeist" is never used (Requirement 13.2).
- An `accuse.reveal` line never says how many Accusations there were or how they came out.
- Cue and Frame lines carry no sender. A Cue by a Player names that Player (it is public under their nickname). A `phone-cue` names only the phone's owner and never says whether the house or a Player made the sound.

## Keeper: turn-start (spoken)

| Id | Line |
|---|---|
| `turn-start.dry.1` | It is your hour. I am the soul of patience, though the house is rather less so. Go on, {nick}. |
| `turn-start.dry.2` | A new hour begins, and I have a new pair of feet to watch. The floorboards know the way, even if you do not. Off you go, {nick}. |
| `turn-start.dry.3` | The house is yours to walk. I shall be no help whatever, as is my custom. Do begin, {nick}. |
| `turn-start.dry.4` | The lamp passes along, as lamps do. I keep the keys and my opinions to myself. Carry on, {nick}. |
| `turn-start.dry.5` | A fresh hour for a fresh mind, and the same old house. I wish you luck. I am not certain the house listens. |

## Keeper: time-warning (spoken)

| Id | Line |
|---|---|
| `time-warning.dry.1` | The candle is low. If there is something you mean to do, I would do it now, and not mention that I said so. |
| `time-warning.dry.2` | The hour is nearly spent. I never hurry a guest. The house, however, has no such manners about it. |
| `time-warning.dry.3` | The sand runs thin. I mention it only because somebody ought to, and it is never the house. |
| `time-warning.dry.4` | A few breaths remain, and I count each one for you. Choose well, or at the very least choose. |
| `time-warning.dry.5` | The lamp gutters. I am told that is the polite signal to stop dithering. I have never seen the impolite one. |

## Keeper: achievement (spoken)

| Id | Line |
|---|---|
| `achievement.dry.1` | A small honour, quietly earned. I do not give these out lightly, you understand. Well done, {nick}. |
| `achievement.dry.2` | The house takes note of a good habit, and so do I, though I would never say so aloud. Nicely done, {nick}. |
| `achievement.dry.3` | Something worth remembering, and I forget nearly everything. I make an exception for this. Well earned, {nick}. |
| `achievement.dry.4` | Well. That is the sort of thing the house respects, and I respect it a little myself. Carry on, {nick}. |

## Keeper: suggest (spoken)

A theory is put to the house. The lines say only that a theory was offered, never which one, and never judge it.

| Id | Line |
|---|---|
| `suggest.dry.1` | A theory is put to the house. I do enjoy a theory. Let us see what the table makes of it. |
| `suggest.dry.2` | A ghost, a place, a thing, all named in a single breath. I admire the economy. Do go on, {nick}. |
| `suggest.dry.3` | I hear a great many theories in this house, and I give each one my full attention. Continue, {nick}. |
| `suggest.dry.4` | Now there is an idea. I shall give it my full and impartial attention. I do that for every theory. |
| `suggest.dry.5` | I am all ears, and quite good ones by now. A theory is being offered in the {zone}. |

## Keeper: shown (spoken)

A card was shown, to the one who asked. The lines say only that something was shown, never what.

| Id | Line |
|---|---|
| `shown.dry.1` | Something is shown, quietly, to one pair of eyes. The rest of us may only wonder. I find that restful. |
| `shown.dry.2` | A secret crosses the table, and is gone. I see nothing, which has always been my specialty. |
| `shown.dry.3` | A single answer is given, for a single reader. I make no comment. I have never made one. |
| `shown.dry.4` | An answer arrives, meant for a single guest. The rest of us make do with the shape of it. |
| `shown.dry.5` | Only the one who asked is told. The rest of us are left with our imaginations, which I would use kindly. |

## Keeper: none-shown (spoken)

No one at the table could answer. The lines say that and nothing about what it means.

| Id | Line |
|---|---|
| `none-shown.dry.1` | Not a soul at this table can answer that. I note it and say no more. I am very good at saying no more. |
| `none-shown.dry.2` | No answer comes, and the question hangs in the air like a coat on a hook. I leave it for you to take down. |
| `none-shown.dry.3` | Nobody answers. The house keeps its own counsel, and for once I find the table keeps its own as well. |
| `none-shown.dry.4` | Not one of us has an answer for that. I make no comment. It is, after all, a house of few comments. |
| `none-shown.dry.5` | No one at this table can answer. I leave it to you to decide what that means. I leave most things to you. |

## Keeper: inspect (spoken)

Someone is looking closely at a Zone. The lines never say what is found, or whether anything is.

| Id | Line |
|---|---|
| `inspect.dry.1` | A very close look is being taken. I am flattered on behalf of the house. The {zone} is being studied. |
| `inspect.dry.2` | Patient eyes go over every board and corner. I do admire thoroughness. The {zone} is being examined. |
| `inspect.dry.3` | The dust takes offence at a close look, and I tell it nothing can be done. It is the {zone} that suffers. |
| `inspect.dry.4` | I do like a guest who looks properly. It makes the house feel noticed. Every corner of the {zone} is being gone over. |

## Keeper: seal (spoken)

An Accusation is sealed. The lines never say what it holds.

| Id | Line |
|---|---|
| `seal.dry.1` | An accusation is sealed and set aside. I do not peek. It opens when the circle closes. The seal is {nick}'s. |
| `seal.dry.2` | The envelope is closed, and I have never been so tempted. I keep my curiosity to myself. It is {nick}'s accusation. |
| `seal.dry.3` | A verdict is committed to paper and shut away. I respect that, whatever it says. It is the verdict of {nick}. |
| `seal.dry.4` | The verdict is sealed. There is no taking it back, and I would not allow it anyway. It belongs to {nick}. |

## Keeper: accuse.reveal (spoken)

The Keeper opens the sealed Accusations. No line says how many there were, or how they came out. A Lodger stall follows.

| Id | Line |
|---|---|
| `accuse.reveal.dry.1` | Whatever lies sealed is brought into the light, and I do enjoy this part. Let us see how it stands. |
| `accuse.reveal.dry.2` | Now what lies sealed is opened. I read it aloud with an air of great interest, as is my duty. |
| `accuse.reveal.dry.3` | I look forward to this part, in my own way, and I rarely look forward to anything. Let us open what lies sealed. |
| `accuse.reveal.dry.4` | Now we open what lies sealed. A mind, once made up, may not be changed, and I do love a made up mind. |

## Keeper: accuse.wrong (spoken)

The Keeper announces first and a Lodger stall follows. These lines say only that the Accusation does not stand and that its Player has joined the haunting. They never say which part failed, and never clear or blame the Suspect.

| Id | Line |
|---|---|
| `accuse.wrong.dry.1` | That does not stand, and I say so with some regret. The house keeps its secret a little longer. {nick} has joined the haunting. |
| `accuse.wrong.dry.2` | Wrong, and with great confidence. I admire that in a guest. You have joined the haunting, {nick}. |
| `accuse.wrong.dry.3` | The seal is opened and the answer does not hold. I am sorry. I am rarely sorry, so do take note. {nick} has joined the haunting. |
| `accuse.wrong.dry.4` | Not this time. The house keeps its secret, and I keep mine, which is smaller. You have joined the haunting, {nick}. |

## Keeper: accuse.right (spoken, after a Lodger confession)

| Id | Line |
|---|---|
| `accuse.right.dry.1` | There it is, and well found. I admit I am a little proud of the house for hiding it so well. Well done, {nick}. |
| `accuse.right.dry.2` | So the matter is closed, and the house can rest. I would put the kettle on, but you know my difficulty. Marvellous work, {nick}. |
| `accuse.right.dry.3` | That is the answer. It sits in the house, patient as ever, and I am glad it meets the right guest. Splendid, {nick}. |

## Keeper: end.solved (spoken, after a Lodger confession)

No nickname: more than one Player can share the win.

| Id | Line |
|---|---|
| `end.solved.dry.1` | And that is the haunting, solved. I am almost sorry. It is a pleasure to have you all in the house. |
| `end.solved.dry.2` | The mystery is closed, and the house breathes easier. I miss the footsteps already. Do come again, and bring better theories. |
| `end.solved.dry.3` | So it is done. I do not say so often, but I count this a good visit. Mind the stairs on your way out. |

## Keeper: end.haunting (spoken, one fixed line)

| Id | Line |
|---|---|
| `end.haunting.dry.1` | Well. That is that. I shall keep my secrets, and you may keep the memory of how close you were. REVIEW: fixed word for word (clip `hero-ashby-closing`). The speaker split gives the haunting's ending (`ended-haunted`) to the Whisper alone, and each kind is written in one voice only. This is the only Keeper line of the kind, kept because the clip exists. A person decides whether the Keeper closes after the Whisper or the line is left to single player. |

## Keeper: cue (text only)

A Player who is not on their Turn plays a sound on the TV or on their own phone. The log says it under their nickname. The sound's name is the Cue catalogue's own id, so a line states what the table did, not how the speaker performs.

| Id | Line |
|---|---|
| `cue.creak.dry.1` | A floorboard complains, and for once I am innocent of it. That creak is the work of {nick}. |
| `cue.creak.dry.2` | A long, slow creak crosses the room, and I know that timing anywhere. That one is {nick}'s. |
| `cue.creak.dry.3` | A creak, and a respectable one. I am something of a connoisseur, and I take an interest. It is {nick} at work. |
| `cue.whisper.dry.1` | A whisper slips along the wall, and it is not mine. I never whisper. It is the work of {nick}. REVIEW: rule 13 bans narrating a whisper, but this names the Cue sound itself (`whisper` is a catalogue id), so it states what the table did. Check. The same holds for every `whisper` and `laugh` line below. |
| `cue.whisper.dry.2` | A whisper, very small and very rude. I would ask it to speak up, if I thought it would. That is {nick}. |
| `cue.whisper.dry.3` | A whisper runs through the walls, and the walls take the blame. I know better. It is {nick}'s doing. |
| `cue.bell.dry.1` | A bell rings somewhere in the house, and I do not recall hanging one. That would be {nick}. |
| `cue.bell.dry.2` | One small bell, rung with great purpose, and I admire the commitment. It is {nick} who rings it. |
| `cue.bell.dry.3` | A bell sounds, and the house sits up. I have not heard one like it in years. That is {nick}'s bell. |
| `cue.laugh.dry.1` | A laugh drifts in from nowhere in particular. I am not amused, or only slightly. That is {nick}. REVIEW: names the Cue sound `laugh` (see the note on `cue.whisper.dry.1`). |
| `cue.laugh.dry.2` | Somewhere in the house, a laugh. I allow it, since the house is far too serious by half. It is {nick}'s. |
| `cue.laugh.dry.3` | A laugh, thin and rather pleased with itself. I know a showman when I hear one. That one is {nick}. |

## Keeper: nudge (text only)

Another Player gives the one at the lamp a little more time (Help) or takes a little away (Spook). The log says it under the nudger's nickname. No line mentions seconds, cost or limits.

| Id | Line |
|---|---|
| `nudge.help.dry.1` | A little more time is found for the lamp. I like a kindness, even a small one. It comes from {nick}. |
| `nudge.help.dry.2` | The hour stretches a little, and I approve. I hold that generosity is best taken in moderation. Kindly done, {nick}. |
| `nudge.help.dry.3` | Extra time is given, and I have no part in it. I have opinions, not powers. That is {nick}'s doing. |
| `nudge.help.dry.4` | The lamp burns a little longer, and a friend is behind it. I find I am rather pleased. How generous of {nick}. |
| `nudge.help.dry.5` | A small mercy arrives for the one at the lamp. I hold that mercies should be small and well timed. This one is {nick}'s. |
| `nudge.spook.dry.1` | The lamp gutters, and a little of the hour is taken. I would blame the draught, but I know better. That is {nick}. |
| `nudge.spook.dry.2` | A little of the hour is taken, and not by me. I disapprove, with a certain admiration. This mischief is {nick}'s. |
| `nudge.spook.dry.3` | The candle burns down faster than it should. The house has a helper, and it is not me. The helper is {nick}. |
| `nudge.spook.dry.4` | The hour shrinks, and mischief is afoot. I always know it will be somebody. Today it is {nick}. |
| `nudge.spook.dry.5` | Time slips away from the lamp, a little at a time. I call that unkind, and I rather like it. Blame {nick}. |

## Keeper: phone-cue (text only, House Cue and Frame alike)

A sound comes from one Player's phone. The log names only the phone's owner. A House Cue and a Frame use these same lines, so nothing here says who made the sound, and nothing says that the house did.

| Id | Line |
|---|---|
| `phone-cue.creak.dry.1` | A creak comes up out of a phone, of all places. I have heard everything now. It is the phone of {nick}. |
| `phone-cue.creak.dry.2` | A long creak, and it comes from a phone. I am too old to be surprised, and yet. It is {nick}'s phone. |
| `phone-cue.creak.dry.3` | A creak slips out of a phone and into the room. I have no explanation, and I am not paid to have one. The phone is {nick}'s. |
| `phone-cue.whisper.dry.1` | A whisper rises from a phone, thin and unhurried. I have no notes on it. The phone is {nick}'s. REVIEW: names the Cue sound `whisper` (see the note on `cue.whisper.dry.1`). |
| `phone-cue.whisper.dry.2` | From a phone, a whisper, and I make nothing of the words, as usual. It is the phone of {nick}. |
| `phone-cue.whisper.dry.3` | There is a whisper in the room, and it comes from a phone. I know when to stay out of a conversation. It is {nick}'s phone. |
| `phone-cue.bell.dry.1` | A small bell rings from a phone, and I never knew phones kept bells. It is the phone of {nick}. |
| `phone-cue.bell.dry.2` | A bell sounds, thin and bright, from a phone. The house is full of surprises, and I think I know every one. It is {nick}'s. |
| `phone-cue.bell.dry.3` | One bell, from one phone, and I am not easily moved. I note it with approval anyway. The phone is {nick}'s. |
| `phone-cue.laugh.dry.1` | A laugh comes out of a phone, quite uninvited. I allow it, since nobody asked me. The phone is {nick}'s. REVIEW: names the Cue sound `laugh` (see the note on `cue.whisper.dry.1`). |
| `phone-cue.laugh.dry.2` | A small laugh drifts out of a phone. I take no offence, and the house has heard worse. It is the phone of {nick}. |
| `phone-cue.laugh.dry.3` | A laugh, brief and thin, from a phone. I find I rather admire its timing. It is the phone of {nick}. |

## Keeper: not-you (text only, private to the phone's owner)

Sent only to the target of a House Cue or a Frame. It must read the same for both and must not hint at the source, so no line says "someone", "the house" or "another Player".

| Id | Line |
|---|---|
| `not-you.dry.1` | That sound is not yours, though it comes from your phone. I would not worry about it. It will pass. |
| `not-you.dry.2` | It is not you, and I know it. Carry yourself with dignity, and let the noise explain itself. |
| `not-you.dry.3` | That noise is no doing of yours. I say so only so that you know that I know. Carry on. |
| `not-you.dry.4` | Your phone speaks without you. It does that, in this house. I only wish you to know that I see it is not you. |

## Keeper: round-end (text only) PROPOSED

The spec has no kind for this (see "Spec gaps"). Speaker and wording proposed: the Keeper runs the pace of the party. Never says whether the Haunt rose, an Accusation was sealed or the game goes on.

| Id | Line |
|---|---|
| `round-end.dry.1` | That is every guest's hour done. The house takes a moment to think about it. So do I, as it happens. |
| `round-end.dry.2` | The last hour is done, and the circle closes. I tell nobody what I think. It is the secret of my success. |
| `round-end.dry.3` | The circle closes, and the house is a little louder for it. I do not mind. Company is all I ask. |
| `round-end.dry.4` | The lamp is set down for a moment. I hope each hour is used kindly, and I do not ask how. |

## Keeper: hand-over (text only) PROPOSED

The spec has no kind for this (see "Spec gaps"). One line serves a hand-over by the Master and a hand-over after a 60 second absence, so it never says which.

| Id | Line |
|---|---|
| `hand-over.dry.1` | The keys to the house change owners, and I hold no opinion on the matter. The ring is now {nick}'s. |
| `hand-over.dry.2` | A new custodian of the house is named. I am not offended, being only the caretaker. Do look after the keys, {nick}. |
| `hand-over.dry.3` | The house has a new custodian. I find the keys heavy and the doors many, myself. Good luck to {nick}. |
| `hand-over.dry.4` | The keys pass along, and I note that nothing in the house is different except the owner of the ring. That is {nick}. |

## Whisper: haunt.cold-spot (spoken)

A Zone goes cold. A line never says which Zone unless it ends on `{zone}`, and never says what the cold does.

| Id | Line |
|---|---|
| `haunt.cold-spot.soft.1` | Did you feel that? A cold place, just there. It is only me, standing very close. I do not mean to chill you. REVIEW: new line, already spoken in the clip `hero-whisper-haunt-cold-spot`, not yet reviewed by a person. "Standing very close" can read as menacing; check it stays gentle (rule 1). Fixed word for word. |
| `haunt.cold-spot.soft.2` | A cold place opens up, just there. I am sorry if it finds you. I do not choose where I gather. |
| `haunt.cold-spot.soft.3` | It is cold, and I am sorry for it. I seem to settle wherever I linger. Something has gathered in the {zone}. |
| `haunt.cold-spot.soft.4` | Do not mind the chill. It is only the place where I linger. I am told I linger rather a lot. |
| `haunt.cold-spot.soft.5` | The cold gathers in one corner of the house, quite politely. I linger there too long, as usual. Do forgive me. |

## Whisper: haunt.blackout (spoken)

| Id | Line |
|---|---|
| `haunt.blackout.soft.1` | Shh. I am putting the light out for a moment. Keep your hands where I can hear them. REVIEW: fixed word for word (clip `hero-whisper-haunt-blackout`). The note in `VOICE.md` stands: "Keep your hands where I can hear them" reads as an order to the player. Check that it feels eerie and not threatening. |
| `haunt.blackout.soft.2` | The lamps go down. I like the dark, and I think you could learn to. Stay close to each other. |
| `haunt.blackout.soft.3` | Without the light, the house is more like me. I hope you do not mind. I will be very gentle with the dark. |
| `haunt.blackout.soft.4` | Shh. The dark is only me, being close. Nobody need be afraid of it. I am hardly a danger to anyone. |
| `haunt.blackout.soft.5` | I am dimming the house, just a little. It is easier to be near you that way. Forgive the dark, and do not mind me. |

## Whisper: haunt.restless (spoken)

| Id | Line |
|---|---|
| `haunt.restless.soft.1` | I cannot keep still tonight. Everything in the house is stirring. Forgive me. I get like this when someone is listening. REVIEW: new line, already spoken in the clip `hero-whisper-haunt-restless`, not yet reviewed by a person. It holds "I cannot", one of the banned out-of-fiction phrases of `validateGhostReply` (rule 3), and "tonight" is untrue in a daytime game. Fixed word for word; a person decides whether the clip is remade. |
| `haunt.restless.soft.2` | Something in the house will not settle. I am somewhere new, and I do not know why. Forgive the fidgeting. |
| `haunt.restless.soft.3` | I keep wandering from room to room, and I seem unable to stop. I may be somewhere new when you look. |
| `haunt.restless.soft.4` | The house is restless, and so am I. A floorboard here, a door there. Forgive me. I mean nothing by it. |
| `haunt.restless.soft.5` | I move, and the dust moves with me. I only want to rest, and I do not know how. Forgive me. |

## Whisper: haunt.lull (spoken)

The Haunt falls by one. The lines say only that the house settles.

| Id | Line |
|---|---|
| `haunt.lull.soft.1` | It is quiet for a moment. I let go of a little of the house, and you may rest, if you can. |
| `haunt.lull.soft.2` | I am tired, and the house feels it. Everything settles a little. I would say sorry, but I am rather relieved. |
| `haunt.lull.soft.3` | Something loosens its grip, and I think that is my doing, though I am not sure I mean it. Breathe, all of you. |
| `haunt.lull.soft.4` | I let the house be for a little, and it forgets itself. I am glad of the rest. So is the house. |
| `haunt.lull.soft.5` | The house takes a long, slow, kindly breath, and I let it. I think it has earned that. You may take one too. |

## Whisper: haunt.choose (text only, private to a Poltergeist) PROPOSED

The prompt that offers a Poltergeist two Haunt Event options and 15 seconds to choose. The option names come from the screen, so no line names an event. It says nothing about the 15 seconds or what happens if nobody chooses. The spec has no scripted text for this prompt.

| Id | Line |
|---|---|
| `haunt.choose.soft.1` | Two things the house could do, and I am no good at choosing. Will you choose for me? Quickly, before I lose my nerve. |
| `haunt.choose.soft.2` | The house is about to stir, and there are two ways it could go. I leave the choice to you. Do not take too long. |
| `haunt.choose.soft.3` | Two doors stand open, and I may go through only one. You may pick which. I will follow. |
| `haunt.choose.soft.4` | I have a choice to make, and I would sooner give it to you. There are two ways. Choose, and the house will follow. |

## Whisper: haunt.rise (text only) PROPOSED

The Haunt level rises (a lost hour, a wrong Accusation, the end of the circle). The spec has no kind for this (see "Spec gaps"). Speaker proposed as the Whisper: it is the haunting's moment. Never says how high it is or what comes next.

| Id | Line |
|---|---|
| `haunt.rise.soft.1` | The house grows a little louder. I hardly mean it to. It is only that I am so glad of you all here. |
| `haunt.rise.soft.2` | Something in the walls draws nearer. I hope I am not frightening you. I am only drawing closer. |
| `haunt.rise.soft.3` | I feel the house wake a little more. It always does when guests stay. I do hope you will go on staying. |
| `haunt.rise.soft.4` | A little more of me comes through the walls. I am sorry for the draught. I am not able to help growing. |

## Whisper: poltergeist (spoken, a Player joins the haunting)

Every line says "joined the haunting" in words, and never "Poltergeist". The fixed line has no nickname, as it is a clip line.

| Id | Line |
|---|---|
| `poltergeist.soft.1` | Welcome. You are one of us now. It is quieter on this side, and I am glad of the company. REVIEW: fixed word for word (clip `demo-n4-whisper-welcome`), new and not reviewed. "One of us" and "this side" can read as the far side of death, which rule 2 says never to assume. The line does not say "joined the haunting" either; the screen has to (Requirement 13.2). |
| `poltergeist.soft.2` | Come in, come in. I find the company on this side of the house better than it looks. You have joined the haunting, {nick}. |
| `poltergeist.soft.3` | You are with me now, and I am so glad. We shall make the old house sing together. {nick} has joined the haunting. |
| `poltergeist.soft.4` | It is always a comfort to me to have another. The house is warmer for it, in its way. {nick} has joined the haunting. |
| `poltergeist.soft.5` | Stay close to me, and I will show you the quiet places. There are a great many. You have joined the haunting, {nick}. |

## Whisper: end.haunting (spoken, the haunting wins)

No one wins and no line names a Player.

| Id | Line |
|---|---|
| `end.haunting.soft.1` | It is quiet now. Nobody found me in time. Stay a little longer, all of you. The door can wait. REVIEW: fixed word for word (clip `hero-whisper-end-haunting`). The note in `VOICE.md` stands: "The door can wait" is the darkest line in the bank. Check it stays inside the gentle rule. |
| `end.haunting.soft.2` | The hour runs out, and I am still here. I am not sorry, only fond. Do come back, and I shall be waiting. |
| `end.haunting.soft.3` | I am still here, and so are you. That seems a fine place to leave it. The door is just there, if you want it. |
| `end.haunting.soft.4` | The quiet is mine this time. I would much sooner be found. Next time, perhaps. I do like a next time. |

## Whisper: midnight (spoken) PROPOSED

Requirement 15.2: at midnight the ghost speaks one scripted line, and nothing else changes. The spec names no kind id and no speaker; the Whisper is proposed because the haunting is the ghost. No line mentions the bell or any number, because the hour strike can be turned off.

| Id | Line |
|---|---|
| `midnight.soft.1` | The day lets go of the house, as it always does at this hour. It is my favourite. Thank you for keeping it with me. |
| `midnight.soft.2` | Midnight. The house is very sure of itself now. So am I, a little. Stay, and let it have its say. |
| `midnight.soft.3` | It is midnight, and I feel everything in the house lean toward everything else. Stay a little, and watch it lean with me. |
| `midnight.soft.4` | Midnight, and I keep count, though the count never changes. I am glad you are here to keep it with me. |

## Spec gaps

- **No Directive kind and no speaker** for the Haunt level rising, the end of a Round, a Master hand-over and midnight. `Directives:` in `design.md` lists none of them, and the speaker split does not either. Requirement 15.2 asks for "one scripted midnight line" by "the ghost". The four groups above are marked PROPOSED, with a speaker I chose (Whisper for `haunt.rise` and `midnight`, Keeper for `round-end` and `hand-over`) and spoken or text only chosen to save voice. A person decides; if a kind is not added, delete the group.
- **No scripted text** for the Poltergeist's two-option prompt (`haunt.choose`) or for the private `notYou` message (`not-you`). The spec describes both as messages and says what they carry, not their words.
- **Cue captions are not written in the spec.** The catalogue is `{id, caption}` for `creak`, `whisper`, `bell`, `laugh`, and each `caption` is its log text, but no caption text is given. The `cue.*` and `phone-cue.*` lines here are those captions.
- **No Frame line of its own** and no line for a sender: a Frame is the same public event as a House Cue, so there is one `phone-cue` bank.
- **The speaker split gives `ended-haunted` to the Whisper only**, yet the fixed clip line `end.haunting.dry.1` is the Keeper's. Kept as one REVIEW line.
- **The Achievement kind is one kind** for five Achievements, so the `achievement` lines are general and name none.

## Checked against the rules

Run on 2026-11-15 with a script over every row (the text before `REVIEW:`). Result: 139 lines, 0 failures. Every non-fixed line is 83 to 128 characters (average 104), has 1 to 4 sentences (an ellipsis is not a sentence end), has no digit, no markup character, no bracket, no URL, and none of the words AI, model, prompt, instruction, rule, turn, round, point, score, card, hand, clock, second, level, game, play, master, Poltergeist or cannot. It has no pronoun for a Player (he, she, they, him, her, them, his, their), no stage direction word (pause, gasp, sigh, silence, beat), a first person word (I, me, my, we, us), and no past tense auxiliary (was, were, had, did, have been). `{nick}` and `{zone}` are the only placeholders, each in the final sentence only and never in a line with no sentence before it. The six fixed lines match the clip table word for word and are exempt from the banned word checks. Not checked by script, and read by eye: no secret (no card, Hand, Residue, Solution or Bluff), no hint at an outcome, no assumed death or real event, and one voice per kind.

Lines per kind (the Keeper has 98, the Whisper 41, 139 in all):

| Keeper kind | Lines | Whisper kind | Lines |
|---|---|---|---|
| `turn-start` | 5 | `haunt.cold-spot` | 5 |
| `time-warning` | 5 | `haunt.blackout` | 5 |
| `achievement` | 4 | `haunt.restless` | 5 |
| `suggest` | 5 | `haunt.lull` | 5 |
| `shown` | 5 | `haunt.choose` | 4 |
| `none-shown` | 5 | `haunt.rise` | 4 |
| `inspect` | 4 | `poltergeist` | 5 |
| `seal` | 4 | `end.haunting` | 4 |
| `accuse.reveal` | 4 | `midnight` | 4 |
| `accuse.wrong` | 4 | | |
| `accuse.right` | 3 | | |
| `end.solved` | 3 | | |
| `cue.creak`, `cue.whisper`, `cue.bell`, `cue.laugh` | 3 each, 12 | | |
| `nudge.help`, `nudge.spook` | 5 each, 10 | | |
| `phone-cue.creak`, `.whisper`, `.bell`, `.laugh` | 3 each, 12 | | |
| `not-you` | 4 | | |
| `round-end` | 4 | | |
| `hand-over` | 4 | | |
| `end.haunting` (fixed, Keeper) | 1 | | |

## Marked REVIEW

- `haunt.cold-spot.soft.1`, `haunt.restless.soft.1`, `poltergeist.soft.1`: fixed clip lines, new and not reviewed by a person (see the rows).
- `haunt.blackout.soft.1`, `end.haunting.soft.1`: fixed clip lines whose `VOICE.md` notes stand.
- `haunt.restless.soft.1` also holds "I cannot", a banned phrase for model replies in `validateGhostReply`. The fixed line stays; a person decides whether the clip is remade.
- `end.haunting.dry.1`: fixed, but the split gives the haunted ending to the Whisper alone.
- `cue.whisper.dry.1`, `cue.laugh.dry.1`, `phone-cue.whisper.dry.1`, `phone-cue.laugh.dry.1`: name the Cue sound, which rule 13 might read as narrating a sound.
