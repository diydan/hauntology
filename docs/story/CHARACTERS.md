# The cast (DRAFT, 2026-11-14)

Three speaking characters. Everyone else is silent. Written for Dan to cast the voices. Not applied to any spec.

## The three personas

| | **The Whisper** | **The Keeper** | **The Lodger** |
|---|---|---|---|
| Role | The ghost of the place. The one who haunts. | The house's old caretaker. Runs the party game. | Whichever Suspect is named. One voice for all six. |
| Who they are | Someone who never left. Not angry. Lonely in a patient way. | Long dead and unbothered. Has watched every visitor try the same door. | A ghost with something to hide, like everyone in the house. Theatrical, flustered, a little vain. |
| Wants | To be found. To keep you a little longer. | A good evening. For someone to finally solve it. | To be believed. To not be the one. To be noticed. |
| Avoids | Being alone. Saying goodbye. | Fuss. Being impressed. Being hurried. | Silence. Plain answers. Being pinned down. |
| Treats you as | A guest they are glad of. Close and kind. | A guest at a long party. Teases you, kind underneath. | A questioner they fear and half enjoy. An audience. |
| Purpose | Dread and heart. You care about the memories, and the haunting feels personal. | Pace and fun. Friends laugh, so the dread never gets heavy. | Heat. A named Suspect feels alive, so an accusation feels like a real moment. The confession is the payoff. |
| Speaks when | Chat replies, memory reveals, Haunt Events, a Poltergeist joins, the haunting wins. | Turn start, clock warning, a Suggestion, a card shown, a wrong accusation, achievements, the ending. | A Suspect is named (a text aside), an Accusation is made (a stall), the reveal (the culprit confesses). |
| Sound to look for | Slow, quiet, close. Kind. Almost breath. | Low, even, unhurried. Amused, never laughing. | Quicker, brighter, a little jittery. Theatrical. |

Working title for the third character: "The Lodger", a lodger in the haunted house. Change it freely.

## The one hard rule for the Lodger: never a tell

Every Lodger line must read the same whether the Suspect is guilty or not. Until the reveal, no line may confirm or deny guilt.
- A wrong Accusation does not say which part was wrong. The named Suspect could still be the culprit with the wrong Zone or Relic. So "Not me!" is forbidden. Use a stall that fits both: "Me? Well. I would say that, wouldn't I?"
- The line bank is shared. No Suspect gets a line the others cannot get.
- Only the reveal may break this, because the Solution is public by then.

## Keep voice for the big moments

The spec caps spoken lines at 20 per Room, and after the 15th only Haunt Events, midnight and the ending are spoken. Text is always shown. So:
- The Lodger is spoken aloud only at the Accusation and the reveal. Its aside when named is text only.
- The Keeper speaks the most, so keep its lines short.

## First split of who says what (for Dan to change)

| Directive | Speaker |
|---|---|
| `turn-start`, `time-warning`, `achievement`, `suggest`, `shown`, `none-shown` | Keeper |
| `haunt-event`, `poltergeist`, `ended-haunted` | Whisper |
| `accuse-wrong` | Keeper announces, Lodger stalls |
| `accuse-right`, `ended-solved` | Lodger confesses, Keeper closes |

Each party kind is written in one voice only. That halves the party writing. Single-player kinds (`reveal`, `echo`, `tease`, `hint`, `ambient`, `ending`, `refuse`) stay with the player's own ghost.

## The three voices must differ by ear

Players may hear them in a dark room with no screen. The three voices should differ in pitch, pace and energy.

| Axis | Whisper | Keeper | Lodger |
|---|---|---|---|
| Pace | Slow | Slow, steady | Quick |
| Pitch | Mid, soft | Low | Higher or lighter |
| Energy | Quiet | Calm | Bright, jittery |

## Casting sheet: what each voice must be

Decided: three characters. Age below is how old the voice sounds, not the character's age.

| | **The Whisper** | **The Keeper** | **The Lodger** |
|---|---|---|---|
| Gender | Female | Male | Open. Young-sounding. Lean: male, so the Whisper stays the only female voice. |
| Sounds about | 30 to 45. A grown-up. Not a child, not old. | 55 to 70. Worn, seasoned. | 20 to 30. Light and quick. |
| Accent | Soft, neutral or gently British | British-leaning or neutral. Dry humour travels best this way. | Any, but not the Keeper's. |
| Pitch | Middle, soft | Low. Gravel is fine. | Higher, lighter |
| Pace | Slow, with pauses | Slow and even. Never rushed. | Quick. Trips over its own words. |
| Texture | Breathy, close to the ear | Rough, dry, steady | Clear, bright, a little thin |
| Energy | Quiet. Almost no volume. | Calm. Flat on purpose. | Up. Jittery. Theatrical. |
| Feeling under it | Kindness that is a little too much | Amusement it will not show | Fear it covers with talk |
| Must not sound like | Flirty, sleepy-cute, a customer-service voice | Angry, a villain, a radio announcer | Cartoon, childlike, cunning, or guilty |
| Delivery settings (used in the samples Dan approved) | `[whisper]` tag, rate 0.9, temperature 1 | rate 0.9, temperature 0.7 | `[speak nervously]` tag, rate 1.1, temperature 1.2. Stumbles in the line also work ("Well... I mean..."). A long descriptive tag does not (Dan, 2026-11-15). |

Contrast check: the Whisper is slow and soft, the Keeper is slow and low, and the Lodger is quick and light. Each pair differs on at least two of age, pitch and pace.

## Voice candidates (Inworld's own descriptions; only Dan has heard the voices)

| Character | Voice | Inworld says | Note |
|---|---|---|---|
| Whisper | Celeste | soft, whispery female voice, ideal for asmr videos, soothing lullabies | Best on paper. Not heard. |
| Whisper | Evelyn | a gentle and intimate female voice, ideal for personal asmr content, affirmations, and close, calming conversations | Not heard. |
| Whisper | Luna | calm, relaxing female voice, perfect for meditations, sleep stories | Heard. |
| Whisper | Pippa | friendly and casual australian female voice, ideal for relaxed instructional content | **Locked by Dan (2026-11-14), chosen by ear.** On paper it is friendly and casual, not close and kind, so it always uses the `[whisper]` tag. Accent is Australian, so the casting sheet's "soft, neutral or gently British" is relaxed for this voice. |
| Keeper | Ronald | confident, british man with a deep, gravelly voice | **Locked by Dan (2026-11-14).** Matches the casting sheet: low, gravel, British. No "aggressive". |
| Keeper | Mortimer | gravelly, aggressive male character voice, ideal for fantasy villains | Replaced by Ronald. Heard. |
| Keeper | Graham | Profound, authoritative british male voice, perfect for historical documentaries | Fallback. Not heard. |
| Lodger | Riley | playful, youthful female voice, perfect for animated storytelling, upbeat game characters | Heard, not chosen. Fits a bright, flustered game character. |
| Lodger | Hamish | Friendly and casual australian male voice, ideal for character-driven roles | Heard. Fits "character-driven". |
| Lodger | Tessa | upbeat, conversational australian female voice, perfect for lifestyle vlogs, playful advertisements | Not heard. |
| Lodger | Snik | hoarse, cunning male voice, perfect for devious goblin roles, fantasy heist scenarios | Risk: "cunning" may sound guilty. Not heard. |
| Lodger | Rupert | Resonant, commanding british male voice, ideal for motivational speeches, epic film trailers | Replaced by Avery (2026-11-15). Dan: "the best but too confident". On paper he is big and commanding, not light and flustered. He was also British and low like Ronald, so the two could blur. |
| Lodger | Ren | cool, aloof male voice, ideal for anime content, gaming, and dubbing | **Not available** on Cloudflare (7003). Also "aloof" is the opposite of flustered. |
| Lodger | Archie | Youthful, spirited British boy's voice, ideal for children's stories, fantasy adventures | **Not available** on Cloudflare (7003). A boy's voice is also a child voice. |
| Lodger | Avery | Youthful, performative male voice, suited for gameshow-style hosting | Was locked (2026-11-15). Beaten by Mark, Alex and Timothy in the `[speak nervously]` comparison (Dan, 2026-11-15). His nervous clips A and B were good. |
| Lodger | Six voices, one per Preset Suspect: Mark (Percy; also the default and a made-up Suspect's "lower voice"), Conrad (Captain Thorne), Arjun (Dr. Pike), Chloe (Cora Bell), Eleanor (Lady Vane), Victoria (Mrs. Dunmore) | Mark: energetic, expressive man with a rapid-fire delivery | **Locked by Dan (2026-11-15), chosen by ear.** Beat Avery, James and all Gemini voices, then was chosen over Alex and Timothy. Always with `[speak nervously]`. Fast, so it can trip over its words. |
| Lodger | Alex | Energetic and expressive mid-range male voice, with a mildly nasal quality | Runner-up (2026-11-15). Beat Avery, James and all Gemini voices, but lost to Mark. The nasal texture is far from Ronald and Rupert. |
| Lodger | Timothy | Lively, upbeat American male voice | Runner-up (2026-11-15). Beat Avery, James and all Gemini voices, but lost to Mark. |
| Lodger | Riley | Playful, youthful female voice | Heard, not chosen. The female option. |
| Lodger | Edward | american male with a emphatic, confident and streetwise tone | Heard, not chosen. Risk: confident, not flustered. |
| Lodger | Hank | warm, laid-back southern male voice, ideal for travel documentaries, heritage storytelling | Heard, not chosen. Risk: laid-back, not jittery. |
| Lodger | James | vibrant, expressive male voice, perfect for animated video content, lively event hosting | Heard, not chosen. On paper the closest to "light and quick". |
| Lodger | Brick | playful, bombastic male voice, ideal for game shows, interactive entertainment, and hosting | **Not available.** On Inworld's site, but Cloudflare returns "7003 User Input Error". It is not in Cloudflare's list of 95 voices. |

Left out: Pixie (squeaky, childlike, cartoon) and Vinny (gritty New York crime voice).

Tried and lost: Gemini 3.8 Flash TTS (Leda, Fenrir, Puck) lost to the Inworld voices. On Cloudflare it takes no style setting ("7003"), only inline tags like `<gasp>` and `<short pause>`. Deepgram Aura has no steering tags. "Kit" is not a voice on Cloudflare.

### The three women Suspects get their own voices (Option B, chosen by Dan 2026-11-15)

The Lodger voice Mark is a man's voice, so Cora Bell, Lady Vane and Mrs. Dunmore sounded wrong in the avatar clips. Dan chose **Option B: each of the three women gets her own voice** (Percy, Captain Thorne and Dr. Pike keep Mark). Estimated cost about $0.85 in all: audition about $0.05, the Lodger bank in three more voices about $0.12, the three confession clips again about $0.60. The Whisper's Pippa and Luna (the Whisper's Aura-2 fallback) are not used for a Suspect.

Audition made (18 samples, about $0.05): each candidate says the woman's own confession line and the stall line (`lodger.stall.1`) with `[speak nervously]`, rate 1.1, temperature 1.2, the Lodger settings. Descriptions are from Inworld's catalog as found by web search (some are third-party copies; a voice named here as undescribed had no description found).

| Woman | Candidate | Description found |
|---|---|---|
| Cora Bell (young governess) | Chloe | thoughtful, introspective, youthful |
| | Hana | bright, expressive, young |
| | Olivia | none found |
| Lady Vane (elderly, grand) | Eleanor | polished, approachable, British (one third-party site says otherwise) |
| | Victoria | silky, cunning, British |
| | Elizabeth | none found |
| Mrs. Dunmore (warm cook) | Loretta | inviting, folksy, Southern, for cooking shows and family tales |
| | Deborah | warm, peaceful, calm |
| | Darlene | spirited Southern belle with a country drawl |

**Chosen by Dan, 2026-11-15: Cora Bell = Chloe, Lady Vane = Eleanor, Mrs. Dunmore = Victoria.** Mrs. Dunmore was first Loretta; Dan said Loretta is a good voice but does not match her look (a Southern drawl on an English cook), and chose Victoria in a second audition (below). Percy, Captain Thorne and Dr. Pike keep Mark. Done: the specs (ghost-voice Requirement 1.11 and Property 13, party-mode Requirement 3.14, 7.9 and Property 60, `ghost-creator` `GhostProfile.lodgerVoice`, `tech.md`) and the three confession clips remade with the audition audio of each woman's own confession line (the Mark versions are kept in scratch as `.mark.mp4`). Not done yet (needs the Library tool, which does not exist): rendering the 15 Lodger lines in the voices of the three women for the Library (about $0.12). Not yet tested: `[speak nervously]` on these three voices in the deployed Worker (Spike 1.1); the audition used the Lodger settings (rate 1.1, temperature 1.2) and Dan chose by ear. A player-made Suspect picks "a lower voice" (Mark) or "a lighter voice" (Chloe).

## Sample Lodger lines (audition script)

Settings used (untested guess): rate 1.1, temperature 1.2. Both lines are culprit-neutral until the reveal.

| Id | Line | Note |
|---|---|---|
| `lodger.accuse.1` | Me? Well. I would say that, wouldn't I? Go on, then. Say it slowly. I do like a pause. | A stall that fits a guilty and an innocent Suspect. Spoken aloud. |
| `lodger.reveal.1` | Oh, very well. It was me. I would like it noted that I was provoked. | Only the culprit says this, and only at the reveal. Spoken aloud. |

## Names and faces (working, proposed 2026-11-15; change freely)

Pippa, Ronald and Mark are the technical voice ids. The characters get their own names.

| Character | Working name | Alternates | Face | Colour (from `visual-style.md`) |
|---|---|---|---|---|
| The Whisper | **not chosen yet** (Dan does not like "Wren", 2026-11-15) | Verity, Linnet, Willa, Hester, Tamsin | A fixed portrait and Sprite. Pale figure in a long shawl, kind eyes, a smile held a moment too long. | `--ghost` (cold mint) |
| The Keeper | **Mr. Ashby** | Mr. Crowe, Hobbs | A fixed portrait and Sprite. Older man in a worn caretaker's waistcoat, a ring of keys at his belt, a lantern, a dry half-smile. | `--lantern` (amber) |
| The Lodger | **the Lodgers** (collective; Dan liked "Percy" but was unsure of one name for six Suspects) | Percy, as the name of one of the six Preset Suspects | No fixed face. It uses the named Suspect's own portrait. Each speech shows a small brass room-key tag in the corner and a slight tremble (none under reduced motion). | `--bone` (neutral, so the colour is no tell) |

Where faces show:
- **Display and pyramid:** the host ghost's Sprite, drawn four times, is the Whisper's: the haunting is the thing in the pyramid.
- **Host HUD and phone logs:** every narration line gets a speaker badge (portrait, name, colour). **Mr. Ashby** for the Keeper's lines, the Whisper's badge for the Whisper's, the Suspect's own portrait for the Lodger's.
- **Single player:** the player's own ghost keeps its own face and name from the Creator. It speaks in the Whisper's voice (soft) or Mr. Ashby's voice (dry). The Whisper and Mr. Ashby can also be two of the Preset Ghosts.


#### Mrs. Dunmore, second audition (2026-11-15)

Why: Loretta is "inviting, folksy, Southern", and Mrs. Dunmore is drawn as an English cook. Only 95 of Inworld's 337 voices are on Cloudflare, so the British women's voices available are **Wendy, Sophie, Victoria** and Eleanor (already Lady Vane's); a public voice list shows Beatrice, Cordelia, Imogen, Maisie, Penelope, Rosalind and Winifred as British too, but they return error 7003 here. No descriptions were found for Wendy or Sophie; Victoria is "silky, cunning" (British), likely too posh for a cook. Round 2 candidates: **Wendy, Sophie, Victoria** (new) and **Deborah** ("warm, peaceful, calm", accent not known, heard in round 1). Same two lines, same settings. About $0.02.

**Chosen by Dan: Victoria.** Her clip was remade with the nervous prompt (10.04 s, about $0.25). Watch for one thing: Victoria and Eleanor are both British women's voices, so Mrs. Dunmore and Lady Vane may sound alike; they differ in age and class on screen, not necessarily in voice.


#### The three men Suspects need their own voices too (raised by Dan, 2026-11-15)

Dan pointed out that Percy, Captain Thorne and Dr. Pike all speak in Mark, and that Captain Thorne and Mrs. Dunmore read the same line (`lodger.confession.5`: there are five confession lines for six Suspects). The plan: **every one of the six Suspects has a unique voice.** Percy keeps Mark for now ("energetic, expressive man with a rapid-fire delivery" suits a nervous clerk); Captain Thorne and Dr. Pike get new voices. Audition made (12 samples, about $0.03), same two lines each and the same Lodger settings. Inworld's own descriptions (from its voice page):

| Man | Candidate | Description found |
|---|---|---|
| Captain Thorne (weathered, 60s) | Conrad | gruff, weathered male voice (no accent listed) |
| | Theodore | gravelly male voice with a time-worn quality (no accent listed; may sound like Ronald, the Keeper) |
| | Craig | older British male, refined and articulate |
| Dr. Pike (gaunt, dry physician) | Cedric | crisp, measured male voice |
| | Simon | articulate, insightful male voice |
| | Arjun | Indian accent (matches how the portrait is drawn; Dan's call whether to match an accent to a face) |

**Chosen by Dan, 2026-11-15: Captain Thorne = Conrad, Dr. Pike = Arjun** (Percy stays Mark). Done: the specs now have six Lodger Voices (ghost-voice 1.5, glossary and design with `LODGER_VOICES`, tasks and Spike 1.1, party-mode design, `ghost-creator` `lodgerVoice` and Presets, `tech.md`, the story-writer agent), and both clips were remade with the audition audio of each man's own confession line (10.04 s each, about $0.50), with no mood prompt, like the versions Dan approved. Dr. Pike now smiles a lot; Captain Thorne is stern and calm. **A sixth confession line was written (2026-11-15, by the story-writer role) and then replaced.** The first version ended "Now I leave a pause for the gasp"; the voice read that stage direction aloud word for word (Dan heard it in the Mrs. Dunmore clip). Three replacements were written and heard in Victoria's voice, and **Dan chose A: `lodger.confession.6` = "Right, then. It was me. Be honest, am I terribly easy to read? Well... honest, but kind, please."** (96 characters, 4 sentences, no stage direction; it asks the players a question, a slight cue to the next speaker). Mrs. Dunmore's clip was remade with it, in Victoria's voice with the nervous prompt (9.6 s of audio, 10.04 s of video, about $0.25): she starts with bluster and a big grin on "Right, then. It was me." and turns to a worried plea on "honest, but kind, please." A new rule was added to the story-writer agent (rule 13: never write stage directions into the words). Now no two Suspects read the same confession: Vane `.1`, Cora `.2`, Percy `.3`, Dr. Pike `.4`, Captain Thorne `.5`, Mrs. Dunmore `.6`. Still open: the Library bank in the five extra voices (about $0.20, needs the Library tool); a male Aura-2 fallback (not `zeus`) for Conrad and Arjun (Spike 1.1).

### Faces needed

| # | Face | Made | Images |
|---|---|---|---|
| 1 | **The Whisper**: portrait and Sprite (also the default ghost of the Creator), plus 2 expressions (startled, speaking) | once, ahead of time | 3 |
| 2 | **Mr. Ashby**: portrait and Sprite, plus 2 expressions (amused, closing) | once, ahead of time | 3 |
| 3 | **Six Preset Suspects**: a portrait and Sprite each (the Preset Ghosts of the Creator; one may be named Percy) | once, ahead of time | 6 |
| 4 | Player-made Suspects, up to 6 per party | at runtime, by the Creator | 0 pre-made |
| 5 | The player's own ghost in single player | at runtime, by the Creator | 0 pre-made |

Pre-made total: **12 images**. A Sprite is cut out of its portrait, so it is not a separate image. Draw every portrait on pure black, so a clip drops straight into the Pepper's-ghost pyramid. Gentle only: no gore.

### Art direction and status (decided 2026-11-15)

- **Style C for every fictional character:** a 19th century daguerreotype ghost photograph, black and white with a faint tint (cold mint for the Whisper, warm amber for Mr. Ashby), faintly translucent, on pure black, no border or plate edge. Chosen by Dan over A (painterly) and B (clay 3D).
- **Three crops per character, all from one approved head shot** so the identity stays the same: head, shoulders, and full body (the full body is for scenes we may animate).
- **Made with Nano Banana** (`google/nano-banana-2.1`, the approved head shot passed as `image_input`). The sets for the Whisper and Mr. Ashby are done: `docs/story/art/c-whisper-{head,shoulders,full}.png` and `c-ashby-{head,shoulders,full}.png`. Head and shoulders are 1024 by 1024, full body is 848 by 1264. **Approved by Dan, 2026-11-15** ("images are perfect"): these six are the reference for every later image of the two narrators. Not committed.
- **Cut-outs done (2026-11-15):** all 24 pictures (8 characters, 3 crops each) have a transparent-background copy in `docs/story/art/cutouts/cut-<name>-<crop>.webp` (lossless WebP, 10 MB in all; the PNG masters stay in scratch, because the PNG versions are 60 MB). Made with `bria/remove-background` (RMBG 2.0, $0.018 per image, run through a throwaway local Worker, no Cloudflare Images needed). Edges are clean, dark coats on black kept their shape, and no full-body or head cut-out touches the left or right edge. What to know: (1) the cut-out is fully opaque, so the ghost glow and translucency of the original are gone; the game sets the ghost opacity in code. (2) `cut-percy-head` is the one flawed image: the dark jacket merged with the black and left ragged black edges beside the bow tie. Use `cut-percy-shoulders` for Percy until it is redone. (3) The Whisper's and Captain Thorne's shoulders crops touch the left and right edges, so they pass for badges but would fail the Creator's Sprite edge rule; use head or full for Sprites. (4) Lady Vane's and Mrs. Dunmore's shoulders crops keep a few wisps of ghost hair.
- **Colour is the default; black and white means deceased (decided by Dan, 2026-11-15).** Every character is shown in full colour. A character who becomes deceased is shown in the black and white daguerreotype version (style C above). Both looks exist for all 8 characters, so switching is a code choice and costs no more art: the black and white pictures and cut-outs described above, and the colour set below. "Deceased" is only a look: product steering says no murder and no death circumstances, so there is no death scene or cause, and player-facing text keeps saying "joined the haunting". **In the specs (2026-11-15), trigger = The Becoming:** party-mode Requirements 19.8 and 19.9, the "Colour while at the table" section of its design, Property 62, tasks 2.118, 2.119 and 9.25, and `GhostProfile.monoUrl` in `ghost-creator`. When a Player joins the haunting (a wrong Accusation), their **Seat Portrait** (the portrait of the Ghost Profile they contributed, or a nickname chip) cross-fades from colour to black and white, once, on the Controller header, the Host HUD and the ending screen. It uses only the public `poltergeist` flag, so it leaks nothing. Suspect cards, the Lodger's speaker badge, Mr. Ashby and the Whisper never change colour, so the colour of a Suspect says nothing about the case. Preset Ghosts use the pre-made black and white picture; designed and selfie ghosts use a greyscale filter. Still open: the narrators. The persona table calls the Whisper "someone who never left" and Mr. Ashby "long dead", so they could start black and white; for now they stay in colour with a glow (mint, amber) that marks them as ghosts, and the rule does not touch them.
- **Colour set done (2026-11-15):** all 24 pictures in colour, `docs/story/art/color-<name>-<crop>.png` (head and shoulders 1024 by 1024, full body 848 by 1264, pure black background), and 24 colour cut-outs, `docs/story/art/cutouts/color-<name>-<crop>.webp` (lossless, 10 MB). Each head is the approved black and white head passed as `image_input` to `google/nano-banana-2.1` ("colourise, change only the colour"); each shoulders and full crop is the black and white crop with the colour head as a colour reference, so face, pose and framing are unchanged and the colours match. Soft natural, slightly muted colour. The Whisper has a cold mint glow and Mr. Ashby a warm amber glow; the six Suspects have none, so the colour gives no tell. The cut-outs use `bria/remove-background`. Known flaws: `color-percy-shoulders` (cut-out) has a ragged black patch on the left where the dark jacket merged with the black, so use `color-percy-head` or `color-percy-full` for Percy; Mrs. Dunmore's apron straps are tan in the head and white in the shoulders crop; the Whisper's and Captain Thorne's shoulders cut-outs touch the side edges. Not yet looked at by Dan.
- **Still to do:** the Whisper's name, the expressions, the trigger and the narrators' state for the deceased rule, the redo of `cut-percy-head` (black and white) and `color-percy-shoulders` (cut-out) if wanted.
- **Budget:** Dan approved $15. Spent so far: about $11.1 (an estimate; this adds $0.25 for Mrs. Dunmore's clip with the first version of line 6, $0.25 for it again with version A, $0.01 for the three candidate samples, and $0.73 for the three men's clips again with the nervous prompt; this adds $0.03 for the men's audition and $0.50 for the Thorne and Pike clips; this includes $0.93 for the four demo clips and $0.25 for the N1 redo; the first, stopped attempt at them may have finished up to $0.9 of clips that I could not check, so the true figure could be higher; adding to the figures below $0.05 for the 18 voice samples, $0.68 for the three clips remade with new voices, $0.28 for the Dunmore mood test, $0.40 for Cora and Vane again, $0.02 for the second audition and $0.25 for Dunmore with Victoria): $3.3 on images (black and white cut-outs $0.43, colour heads $0.32, colour crops $0.64, colour cut-outs $0.43, plus the earlier $1.5), $0.35 on two talking-avatar test clips ($0.20 and $0.15), $2.54 on the 11 hero clips and about $0.02 on their audio.
- **A selfie is opt-in, or a Player chooses a fictional character.** A Preset Ghost, a designed ghost and a selfie ghost are the three choices. The selfie is off by default, needs the Master's switch and the Player's own consent, uses the live front camera only, is deleted at once, and falls back to a Preset Ghost. In the specs as party-mode 3.10 to 3.13 and Property 61. The selfie ghost is made in the same hand-coloured style as the colour set (soft natural colour on black), so it is photographic and easy to recognise, and it turns black and white at the Becoming like every other Seat Portrait.

#### Preset Suspects (names and looks are placeholders, change freely)

Six Preset Ghosts for the Creator and for Suspects when a Player contributes none. Different ages, silhouettes and hats so no two read alike on the pyramid. Same style C, neutral bone-white tint (`--bone`) so the colour gives no tell. **All 18 images are made** (head, shoulders, full body each), in `docs/story/art/c-{percy,thorne,pike,cora,vane,dunmore}-{head,shoulders,full}.png`, each with a transparent cut-out in `docs/story/art/cutouts/`. Dan approved the six heads on 2026-11-15 after three rounds (Dr. Pike redone without glasses, Cora Bell redone as an East Asian woman, Mrs. Dunmore redone twice; the flour streaks read as scars, so they are gone). The crops were made from the approved heads and have not been looked at one by one by Dan. Not committed.

| Key | Name | Look |
|---|---|---|
| `percy` | Percy | Nervous young man, round wire spectacles, high collar and bow tie, eyes darting sideways |
| `thorne` | Captain Thorne | Weathered retired sea captain, full white beard, peaked cap, heavy wool coat |
| `pike` | Dr. Pike | Gaunt South Asian physician, no glasses, black frock coat and cravat, a thin dry smile |
| `cora` | Cora Bell | Poised young East Asian governess, hair in a tight bun, high collar with a small brooch |
| `vane` | Lady Vane | Elegant elderly lady, silver hair piled high, lace collar and a cameo brooch |
| `dunmore` | Mrs. Dunmore | Plump, warm cook, a frilled mob cap, apron straps over a dark dress |

Note on the crops: for Dr. Pike, Cora Bell, Lady Vane and Mrs. Dunmore the head and shoulders pictures are almost the same picture, because their heads already show the shoulders. A tighter face crop can be cut from the head in code at no cost.

### Talking avatars: `pruna/p-video-avatar` (a few, not all)

- **What it is** (Cloudflare's catalog page): one portrait plus an audio file or a script gives a talking-head MP4. $0.025 per second at 720p, $0.045 at 1080p. Length limits, rate limits and latency are not stated.
- **Use our own audio.** The `audio` input beats `voice_script`, so we feed it the Library audio (Inworld voices). The model's own 31 voices (Zephyr, Puck, Kore...) are not used.
- **Pre-render only, never at runtime.** A clip is about 100 times the cost of a spoken line (a 7 second clip is about $0.18 at 720p, a spoken line about $0.002). So a clip is made once, ahead of time, and stored in R2. No player triggers a paid avatar call.
- **The hero set, about 20 clips** (estimate: 20 clips of about 7 seconds is 140 seconds, about $3.50 at 720p, about $10.50 with three tries each): the Whisper at the three Haunt Event levels and when the haunting wins; Mr. Ashby's welcome and his closing; each Preset Suspect's confession (6); the demo video.
- **Everyone else stays a still portrait** with the speaker badge, and the Lodger's tremble for player-made Suspects.
- **Text first.** A clip never replaces the subtitle. Under reduced motion, the still portrait is shown instead.
- **Test clip made (2026-11-15):** the Whisper colour head shot (`color-whisper-head.png`, 1024 square) plus the approved Pippa "meet" line (7.2 s of MP3), called with `image`, `audio` (both data URIs) and `resolution: '720p'`. Result: it was accepted (this says nothing about the safety filter: `disable_safety_filter` defaults to true on this model, so the filter was off; we only feed it our own art, and any future use on a player's face would have to set it to false and be checked), took **48 seconds**, and returned an MP4 of **960 by 960, 24 frames per second, H.264 with AAC audio, 8.04 s video** (0.8 s longer than the 7.25 s audio), 2.9 MB. Black background and the mint glow are kept, so it can go on the pyramid as it is. About $0.20 at the listed $0.025 per second (an estimate; the account bill is not checked). Seen in a 12-frame grid: the face stays the same person, the mouth takes many shapes, the head moves a little, and the collar and glow stay still. Not judged: whether the lips match the words (stills cannot show it; Dan to watch the clip). The model made the face more expressive than the calm still (raised brows, wide smile), which suits the Keeper more than the Whisper; It can be steered, which I first missed because the page I read was cut off: the model takes `video_prompt` (default "The person is talking."), `negative_prompt` with `strength_negative_prompt` (0 to 4, default 0.5), `voice_prompt` (only for its own voices), `seed`, `voice_language` and `disable_safety_filter` (default true, so the filter is off unless set to false). See the next bullets for the result. Output URLs are signed and last 24 hours, so a clip must be downloaded and stored in R2 at once. The clip is not in the repo.
- **Test clip for Mr. Ashby (2026-11-15):** `color-ashby-head.png` plus the Ronald "meet" line (5.8 s). Accepted, took **68 seconds**, MP4 960 by 960, 24 fps, 6.04 s video for 5.81 s audio (0.2 s longer), 4.4 MB, about $0.15. Same person, many mouth shapes, a lively head, clear wrinkles and clothes. **The amber glow around him was lost** (the Whisper's mint glow survived), so the clip is plain on black; a glow would have to be added in the page or the clip re-tinted. He is also drawn a little closer and more animated than the still. Neither clip has been judged for lip sync by Dan yet.
- **Hero set made (2026-11-15): 13 clips** in `docs/story/art/clips/hero-<name>.mp4` (48 MB, not committed; a 115 second review reel of all 13 was sent to the dashboard). All 960 by 960, 24 fps, from the colour head shot plus pre-rendered Inworld audio, 11 new calls with no failures, no retries. The new calls made 101.5 s of video, about **$2.54** (video length is rounded up to a whole second, about 0.5 s over the audio). Slowest call 139 s, usual 25 to 48 s.

  | Clip | Portrait | Audio |
  |---|---|---|
  | `whisper-meet` | Whisper | Pippa, `meet.soft.1` (the earlier test) |
  | `whisper-haunt-cold-spot` (level 3) | Whisper | Pippa, **new line, not reviewed**: "Did you feel that? A cold place, just there. It is only me, standing very close. I do not mean to chill you." |
  | `whisper-haunt-blackout` (level 6) | Whisper | Pippa, `haunt.blackout.soft.1` |
  | `whisper-haunt-restless` (level 9) | Whisper | Pippa, **new line, not reviewed**: "I cannot keep still tonight. Everything in the house is stirring. Forgive me. I get like this when someone is listening." |
  | `whisper-end-haunting` (haunting wins) | Whisper | Pippa, `end.haunting.soft.1` |
  | `ashby-welcome` | Mr. Ashby | Ronald, `meet.dry.1` (the earlier test) |
  | `ashby-closing` | Mr. Ashby | Ronald, `end.haunting.dry.1` |
  | `suspect-percy-confession` | Percy | Mark, `lodger.confession.3` |
  | `suspect-thorne-confession` | Captain Thorne | **Conrad**, (remade 2026-11-15), `lodger.confession.5` |
  | `suspect-pike-confession` | Dr. Pike | **Arjun**, (remade 2026-11-15), `lodger.confession.4` |
  | `suspect-cora-confession` | Cora Bell | **Chloe**, `lodger.confession.2` (remade with the nervous prompt) |
  | `suspect-vane-confession` | Lady Vane | **Eleanor**, `lodger.confession.1` (remade with the nervous prompt) |
  | `suspect-dunmore-confession` | Mrs. Dunmore | **Victoria**, `lodger.confession.6` (the new sixth line, version A; remade with the nervous prompt; earlier made in Mark, then Loretta, then line 5, then the first line 6) |

  Seen in a frame grid: every face stays the same person, and the Whisper keeps her mint glow in all five clips (Mr. Ashby has none). The Suspects are livelier than their stills: Percy and Mrs. Dunmore grin widely, Dr. Pike's eyes go wide. **The clash found here is resolved (2026-11-15): the three women now speak in their own voices (Chloe, Eleanor, Loretta; see the women's voices section) and their three clips were remade.** The "demo video" clips of the original plan are not made yet; the script now exists as `docs/DEMO.md` (2026-11-15) and names four new clips (N1 to N4, about $0.9), so the total is 17 clips, not the "about 20" estimate. **The four were made on 2026-11-15:** `demo-n1-whisper-memory`, `demo-n2-whisper-farewell`, `demo-n3-ashby-reveal`, `demo-n4-whisper-welcome` in `docs/story/art/clips/` (37 s of video, about $0.93; the Whisper's gentle mood prompt still left her smiling, so N1 was redone with a stronger no-smiling prompt, strength 1.5, about $0.25 more, and now looks wistful; N2, N4 keep a warm smile).
- **Mood fix tested (2026-11-15).** Dan saw that the three women look happy in their confessions: in the frames Mrs. Dunmore grins and laughs throughout, Lady Vane smiles and ends wide-eyed and delighted, Cora Bell smiles and brightens, although the lines are flustered confessions. Cause: the default `video_prompt` is "The person is talking." and the model reads the cheerful still and the animated audio as a happy talker. Test on Mrs. Dunmore only, same portrait and the same Loretta audio, adding `video_prompt`: "A flustered, sheepish person confessing something embarrassing. Eyes darting to the side, brows raised and drawn together, lips pressed, an uneasy grimace, hesitating between words. Not smiling." and `negative_prompt`: "smiling, grinning, laughing, cheerful, happy, delighted, wide open mouth smile" with `strength_negative_prompt` 1.0. Result: 48 s, 11.04 s of video, about $0.28; she now frowns, glances sideways, winces and gives an embarrassed half-smile, with only a few frames still smiling. Saved as `docs/story/art/clips/test-suspect-dunmore-confession-nervous.mp4`; the happy version stays as `hero-suspect-dunmore-confession.mp4` until Dan picks. Not yet judged by Dan; a few frames look pained more than flustered. **Applied to Cora Bell and Lady Vane (2026-11-15, Dan: "looks right"):** same prompts and strength, 8.04 s of video each, about $0.40 for both. Cora starts neutral, then frowns and winces and ends on a nervous half-smile; Lady Vane stays dignified and subdued and ends in stiff displeasure. Both replaced the happy clips in `docs/story/art/clips/` (the happy versions are kept in scratch). Mrs. Dunmore's clip was remade once her voice was chosen (Victoria; she frowns, glances sideways and winces, with only the first frames smiling). Dan first said "the rest are good", then on hearing the men in their new voices said "men are a bit too happy", so **Percy (Mark), Captain Thorne (Conrad) and Dr. Pike (Arjun) were remade with the same prompts** (29 s of video, about $0.73): Percy starts with a jumpy grin and then looks anxious, Captain Thorne is stern and uneasy with no smiles, Dr. Pike is guarded and glances sideways but smiles again near the end. A faint line of marks along the bottom edge of Dr. Pike's frame comes from his portrait; cropping the bottom would hide it. Percy's audio was taken from the earlier clip.
- **Still unverified:** lip sync accuracy and whether the extra expressiveness is wanted; why the glow survived for one portrait and not the other; whether the 960 pixel output holds for a non-square portrait; rate limits.

## Open decisions

1. Voices: **all three locked** on Inworld TTS 2. Whisper = Pippa and Keeper = Ronald (2026-11-14), Lodger = Mark (2026-11-15, for Percy and for a made-up Suspect's "lower voice"; Chloe, Eleanor and Victoria speak for Cora Bell, Lady Vane and Mrs. Dunmore, chosen 2026-11-15; chosen over Alex, Timothy, Avery, James, Rupert and Gemini).
2. Spec changes if this cast is adopted (none applied yet):
   - A "Characters" section in the steering or the ghost-voice spec.
   - `PersonaVoice` (`'soft' | 'dry'`) becomes the three characters.
   - The Creator `voice` trait: remove it, or keep it only for the player's own ghost in single-player. Suspects are Ghost Profiles made in the Creator, but all six would speak in the Lodger voice.
   - Spike 1.1 picks three voices, not two.
   - `partyScripted` gets a speaker for each Directive kind.
