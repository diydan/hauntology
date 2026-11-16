# AI scene prompts: the scenes the public-domain footage does not cover

Written 2026-11-15. A working document for generating the missing scenes with MiniMax H3. Nothing here has been generated yet.

## Where this fits

The real footage (Nosferatu 1922, Frankenstein 1910) covers Haunt 0 to 2 (the mountain road), the Haunt 3 Event (the mirror), Haunt 4 and 5 (the empty town square) and Wander (the harbour). Everything below fills the rest. All footage in the game is **black and white**.

| Slot | Scene | Length | Sound |
|---|---|---|---|
| Haunt 7 and 8 | 1. Hand at the door | 15 s | knock |
| Haunt 9 Event | 2. The empty bed | 15 s | creak (optional) |
| The house wins | 3. The lights go out | 15 s | wind, door creak (optional) |
| Detectives win | 4. Dawn in the parlour | 15 s | bell (optional) |
| Haunt 6 and the Turn Clock | 5. The stair shadow (optional) | 15 s | none |
| Wander, a sound memory | 6. The wind chimes | 15 s | chimes |
| Wander, a person memory | 7. The empty chair | 15 s | none needed |
| Wander, a promise memory | 8. The letter | 15 s | none needed |

Scenes 1 to 4 are needed. Scene 5 is optional (the real 4.2 s stair clip already scrubs). Scenes 6 to 8 are optional and generic: a Wander place belongs to the player, so these only set a mood.

## Settings (all scenes)

- Model `MiniMax-H3`, `duration` 15, `resolution` 768P while testing (2K for keepers), `ratio` `4:3` for scenes 1 to 5 and `3:4` for the Wander scenes 6 to 8.
- Price per second, from MiniMax's pricing page: H3 768P $0.08, H3 2K $0.13, H3-Lite 768P $0.04. One 15 s take is $1.20 on H3 768P and $0.60 on Lite.
- Cost of the four needed scenes: $4.80 for one take each. All eight: $9.60. Plan on two takes for each.
- H3 is not in Treg (it lists Hailuo 2.3 and 02 only), so these run on MiniMax's own API (`POST https://api.minimax.io/v2/video_generation`, a pay-as-you-go key) or in the Hailuo app.
- Whether H3 makes sound with the picture is not stated on MiniMax's own pages (third-party pages say it does). Test one clip with `ffprobe`. Our nine CC0 sounds are the fallback.

## Paste this first, before every prompt

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.
```

For the Wander scenes (6 to 8) use this instead:

```
16mm black-and-white home movie, handheld, light leaks, soft focus, fine grain. No faces, no people, no text, letters or numbers, no modern objects. Sound: only natural sounds of the place. No music, no voices.
```

## Three rules for every scene

1. **One recurring object: the Keeper's small brass lantern.** It is in every scene of 1 to 4. It is lit while the house holds and goes out as the haunting wins, so it tells the story without any words. It is not one of the six Signs (moon, key, eye, hand, star, bell), so it can never be read as a clue.
2. **No clue in the picture.** No digit, street name, phone number, date or Sign. Real clues are different in every game, so they cannot be in a video, and footage shows only public state (puzzles Requirement 18).
3. **A blank place for an overlay.** Each scene has one plain surface with no marks (a brass plate, a misted window pane, a blank page). If a World Clue is ever drawn over the video at play time, it lands there and looks like part of the scene. See the last section.

## 1. Hand at the door (Haunt 7 and 8)

Overlay place: the blank brass plate on the door.

```
A hallway at night: a banister with thin posts, a bare wall, a closed panelled door at the right with a small blank brass plate, a small brass lantern burning on a hall table, soft lamplight. Fixed camera. Only a huge shadow of a stooped figure on the wall; no body, no face. 0-6 s: the shadow glides along the wall and its long-fingered hand creeps along the rail; the lantern flame leans toward the door. 6-9 s: the fingertips reach the door frame. 9-12 s: three slow knocks, the shadow hand rapping the door panel, the door shivering. 12-15 s: the hand stays pressed to the door, then slides down it. Sound: a quiet house at night, one slow floor creak, three clear knocks on wood at about 9 s, 10 s and 10.5 s, then silence.
```

Our `knock` sound is the fallback. Start it at the moment the fingertips reach the door (about 9 s here).

## 2. The empty bed (Haunt 9 Event)

Overlay place: the misted window pane (writing in the condensation).

```
A small bedroom at night: an iron bed with white linen, a dent in the pillow, net curtains moving at a window with a misted pane, a small brass lantern burning on the nightstand, nobody in the bed. Very slow push-in. 0-5 s: still; the lantern flame bends toward the bed. 5-10 s: the mattress edge sinks as if someone sat down; the sheet pulls tight; a stooped shadow grows on the wall. 10-13 s: the shadow leans over the empty pillow; the lantern gutters. 13-15 s: the lantern burns very low; dark. Sound: wind at the window, bed springs creaking at 6 s, one slow exhale at 11 s.
```

## 3. The lights go out (the house wins)

Overlay place: the blank plaque beside the front door.

```
A tall old house at night seen from the garden: a lit window on each of three floors, a wet gravel path, bare trees, a front door with a small blank plaque beside it and a small brass lantern burning on the doorstep. 0-3 s: every window warm. 3-11 s: the lights go out one by one from the top floor down, each with a faint flicker. 11-13 s: the last window goes dark; the front door swings slowly open on black. 13-15 s: the lantern on the doorstep goes out; the open door, the dark house, still. Sound: wind in bare trees, a faint glass chime as each light dies, a slow door-hinge creak at 12 s, then silence.
```

The card after it is ours: "The haunting continues."

## 4. Dawn in the parlour (detectives win)

Overlay place: the blank page of an open book on the table.

```
A parlour at first light: dust in a low sunbeam, an armchair, a table with an open book of blank pages, a teacup and a small brass lantern burnt down to its last flame, a tall window. 0-5 s: a pale thin mist hangs in the room like breath on glass. 5-11 s: it drifts to the open window and thins to nothing in the sunbeam; the lantern flame goes out; a chair rocks once and stops. 11-15 s: bright morning in the empty room, curtains stirring, a thin line of smoke rising from the lantern, dust settling. Sound: birds, one distant church bell at about 10 s, a soft sigh of wind, then quiet.
```

The card after it is ours: "The night is over." Our `bell` sound is the fallback.

## 5. The stair shadow (optional, Haunt 6 and the Turn Clock)

This clip is scrubbed by the clock, so it needs one steady speed and no cuts. Generate two or three takes and keep the steadiest. The real 4.2 s clip works if none is steady enough.

```
A bare dark wall and a wooden staircase rising from bottom left to a landing at top right, thin banister posts, a small brass lantern on a step near the top. Fixed camera, no cuts, no camera movement, no light changes. A huge tall thin shadow of a stooped figure enters at the foot of the stairs and climbs at one slow, steady, constant speed the whole way, reaching the landing at exactly 15 s, its long fingers trailing the banister. Nothing else moves. No sound.
```

## 6. The wind chimes (Wander, a sound memory, 3:4)

Overlay place: none (Wander has its own card).

```
A porch in summer light: a row of small metal wind chimes hanging from the beam, a wooden rail, a garden beyond, long grass. 0-6 s: still air; the chimes hang motionless in sun. 6-12 s: a breeze arrives and the chimes begin to sway and ring softly. 12-15 s: the breeze drops and the last chime trembles to stillness; sun flares in the lens. Sound: soft metal chimes, summer insects, a far lawnmower.
```

## 7. The empty chair (Wander, a person memory, 3:4)

```
A bright kitchen at morning: a wooden chair pulled out from a scrubbed table, a coat hanging on its back, a cup of tea still steaming, a window with a garden beyond. 0-6 s: steam rises from the cup in the sunlight. 6-12 s: the coat sways a little as if someone had just stood up; the camera drifts closer. 12-15 s: the coat settles; the steam thins. Sound: a kettle ticking as it cools, a quiet room, gulls far away.
```

## 8. The letter (Wander, a promise memory, 3:4)

```
A windowsill table in afternoon light: a folded letter with no legible writing, a pair of gloves, a small dish, net curtains moving. 0-6 s: light moves slowly across the letter. 6-12 s: a breeze lifts the corner of the letter and lets it fall; the camera drifts closer. 12-15 s: the curtain passes across the frame and the light fades to dusk. Sound: breeze, a distant church bell once, quiet.
```

## After a take comes back

1. Check it: no face, no text, no flashing, one steady speed (scene 5), the blank place really is blank, the lantern is in the right state.
2. Convert to black and white if it came back with any colour, cut it to 480 px high, and run `tools/playtest/flash-check.mjs`.
3. Record it in `tools/playtest/media/PROVENANCE.md` as an AI clip: model, date, the exact prompt, the take number, the price and the generation terms. The rules for public-domain footage (puzzles Requirement 18) do not cover AI clips yet.
4. Read MiniMax's terms for commercial use of output, and label the clips as AI-generated where the law asks for it.

## Putting a clue on a blank place at play time

The picture never holds a clue. If the game ever shows a World Clue (public to the whole table, drawn from the seed) over a scene, draw it in the viewer, not in the file:

- Draw it on a small canvas laid over the video's blank place, with the same softness as the 480 px video, never sharper.
- Use a handwriting or engraved font, a multiply blend, and a little ink bleed, so it sits in the surface.
- Apply the grain, flicker and vignette over the video and the canvas together, in one last layer, so the seam disappears.
- The camera is locked off, so the place never moves. Reveal the clue slowly, like writing in condensation, with no flashing.
- A clue seen only on the picture must also be in the Clue list as text, and its meaning must never rest on colour alone.
