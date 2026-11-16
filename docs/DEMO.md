# Demo video script (draft, 2026-11-15)

Status: **draft for Dan to change. The four new clips (N1 to N4) were made on 2026-11-15** and are in `docs/story/art/clips/` (not in git). Nothing else here is built into the product yet; it is the plan for the video that is recorded on Dec 2 to 3 (`docs/PLAN.md`, `docs/JOURNAL.md`). The beats come from `.kiro/steering/product.md`. The talking-avatar clips come from `docs/story/CHARACTERS.md`.

## Rules the video must follow

- **At most 3:00**, public on YouTube. The party clip is **at most 25 seconds**.
- **Ghost speech is visible as text in every shot** (a Subtitle in Newsreader serif; UI chrome in JetBrains Mono). Palette on screen: `--ink`, `--bone`, `--lantern`, `--ghost`.
- 1080p, readable on a phone.
- Premise is "who is haunting this place?": no murder, no death scene, no real people, no third-party names or art.
- Kiro usage is on screen at 2:30.

## Sound: the characters speak, nobody else does

No human voice-over. The story is told by on-screen captions (short, in Newsreader) and by the characters, whose lines are always shown as a Subtitle. This keeps the sound consistent with the product and keeps every spoken word inside the voice rules. If a voice-over is wanted anyway, it is an open decision below.

## Beat sheet

| Time | Screen | Caption (on screen) | Clip |
|---|---|---|---|
| 0:00 to 0:25 | **Hook.** A hand draws a kitchen on paper or a tablet in about 10 s; the sketch becomes a photo. | "Draw a room. Meet who lives there." | none |
| 0:25 to 0:40 | **Confirm gate.** The exact photo, the remaining quota, "Enter this place?" and a tap. | "Nothing is paid for until you say yes." | none |
| 0:40 to 0:55 | **Pre-baked generation montage.** The world assembles from the photo (sped up). | "One photo becomes a place you can walk through." | none |
| 0:55 to 1:20 | **Walk in.** First person through the kitchen; a pale figure appears at the window. | "The ghost of the place says hello." | `whisper-meet` (exists, trim to about 6 s) |
| 1:20 to 1:50 | **First memory.** The player follows a sound; the memory card appears: 1 of 3 found. | "Find three memories: a sound, a person, a promise." | **N1** Whisper, first memory (new) |
| 1:50 to 2:15 | **Party clip, 25 s at most** (replaces the second and third memory; see below). | "Same world, up to six phones." | Keeper and Whisper inserts |
| 2:15 to 2:30 | **Ending card.** The shareable card, with the ghost's last line. | "Every place keeps a story." | **N2** Whisper, farewell (new) |
| 2:30 to 2:55 | **Built with Kiro.** Specs, steering, the five hooks (the traceability hook firing), the spend-capped MCP server, a property test failing then passing. | "Specs. Steering. Hooks. MCP. Property tests." | none |
| 2:55 to 3:00 | **Title card.** "Hauntology", the URL. | "Hauntology" | none |

### The party clip (25 s)

| Seconds | Screen | Clip insert |
|---|---|---|
| 0 to 5 | Three phones scan the QR on the laptop; three nicknames appear. | Mr. Ashby, `ashby-welcome`, first 4 s ("Ah. A visitor.") |
| 5 to 10 | A phone scans a printed relic; the card appears in the notebook. | none |
| 10 to 15 | The pyramid ghost reacts to a Haunt Event (blackout); shot of the real pyramid if it exists, else the Host screen. | Whisper, `whisper-haunt-blackout`, first 4 s |
| 15 to 25 | The sealed Accusations are revealed. One is wrong: that Player's portrait fades from colour to black and white and they "join the haunting". | **N3** Mr. Ashby, the reveal (first 5 s), then **N4** Whisper, welcome to the haunting (3 s) |

This is tight. Each insert is trimmed to a few seconds, always with its Subtitle. If it does not fit, drop the relic scan to a 2 s cut.

## The four new clips (made 2026-11-15)

Each is a 960 by 960 talking head from the colour head shot, with pre-rendered Inworld audio, made once. Lines follow `docs/story/VOICE.md` (1 to 4 short sentences, under 240 characters, first person, present tense, no player text). **All four lines are new and not reviewed.** Files: `demo-n1-whisper-memory.mp4` (10 s), `demo-n2-whisper-farewell.mp4` (9 s), `demo-n3-ashby-reveal.mp4` (10 s), `demo-n4-whisper-welcome.mp4` (8 s); 37 s of video in all, about $0.93.

| Id | Who | Voice | Line | About |
|---|---|---|---|---|
| **N1** | The Whisper | Pippa, `[whisper]` | "Do you hear that? A kettle, just before it sings. I used to count the seconds. I am still counting." | 9 s, $0.23 |
| **N2** | The Whisper | Pippa, `[whisper]` | "You found all three. Thank you for staying. The door is open whenever you want it. I will be here." | 10 s, $0.25 |
| **N3** | Mr. Ashby | Ronald | "Three accusations, sealed and sworn. I do enjoy this part. Shall we see who was brave, and who was merely loud?" | 9 s, $0.23 |
| **N4** | The Whisper | Pippa, `[whisper]` | "Welcome. You are one of us now. It is quieter on this side, and I am glad of the company." | 8 s, $0.20 |

**Result:** Mr. Ashby (N3) looks right, dry and wry. The Whisper clips are calmer than the first ones but she still smiles a lot (her still has "a smile held a moment too long"). N2 and N4 suit a warm smile. **N1 was redone (2026-11-15, 10 s, about $0.25)** because a wide grin did not fit "I am still counting": video prompt "A gentle, wistful ghost speaking softly and sadly. A faraway look, slow blinks, a calm sorrowful face, lips relaxed and soft. Not smiling.", negative prompt "smiling, grinning, showing teeth, laughing, wide eyes, raised eyebrows, exaggerated expression" at strength 1.5. The new N1 has a soft closed mouth, slow blinks and a faraway look, with a few frames of slight smile. Use this prompt for any other Whisper line that should be sad. Spent so far: about $9.3 of the $15.

**Mood prompts** (the model takes `video_prompt` and `negative_prompt`; the default makes people look happy):
- The Whisper: video prompt "A gentle, wistful ghost speaking softly and kindly. Calm, slow blinks, a small sad smile." Negative prompt "grinning, laughing, wide eyes, raised eyebrows, exaggerated expression", strength 1.0.
- Mr. Ashby (N3): video prompt "A dry, amused old caretaker. One eyebrow slightly raised, a patient half-smile, unhurried." Same negative prompt.

## Using the clips in the edit

- A clip is black behind the face, so in the editor use **Screen blend** over the world footage: the black disappears and the mint or amber glow stays.
- Place it bottom right at about a third of the frame height, or full height in the party clip. Keep the Subtitle in the world frame, not on the clip.
- Under the clip, duck the music by about 10 dB while the character speaks.
- Reuse: `whisper-meet`, `whisper-haunt-blackout` and `ashby-welcome` are already made. The six Suspect confessions are not used in this cut; keep one in reserve if there is time (`suspect-percy-confession`, "Oh, all right! It was me...").

## Open decisions

1. **Voice-over or captions only?** The script is written for captions only.
2. **Are the avatar clips only for the video, or also played in the product (on the Host)?** They are not in any spec yet. Playing them in the product would need R2 storage, a new Host element, a reduced-motion rule and a Subtitle rule. The video does not need that.
3. **The Whisper's face is more expressive than her still.** The mood prompt above should calm it; one test is enough to check.
4. **Is the real pyramid ready by Dec 2?** If not, the party clip uses the Host screen only.
5. **Which memory is shown?** The script shows the first (a sound) and cuts the other two, as the beat sheet says.
