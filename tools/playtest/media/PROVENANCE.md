# Footage provenance

The record for every clip in this folder. The rules are Requirement 18 of `.kiro/specs/puzzles`. A clip with no entry here does not ship.

A clip cut from a source file already described in a **Source record** points to it in its `Record` row, so the source is written down once. Every clip keeps its own shot, cut, size and flash check.

## Source record: Nosferatu (1922)

| | |
|---|---|
| Film | *Nosferatu, eine Symphonie des Grauens* (1922), director F. W. Murnau, 92 minute cut |
| Source | Wikimedia Commons, `File:Nosferatu (1922).webm`, the 360p transcode, fetched 2026-11-15 |
| What that file is | The 2006 Murnau Foundation restoration (tints from a Cinémathèque Française print; intertitles rebuilt by trickWILK). Commons marks it public domain. |
| Credited makers | Murnau (died 1931), Henrik Galeen (screenplay, died 1949), Hans Erdmann (music, died 1942) |
| Why it is free | EU and Luxembourg: a film runs 70 years from the death of the last of director, screenplay author, dialogue author and composer of music made for it (Directive 2006/116/EC, Art. 2(2)): 1949 + 70, so free since 2020. USA: published before 1931. |
| Open point | The restoration. The picture is old; the tints and the rebuilt intertitles are the restorers' work. Every clip uses the picture only (no intertitle, no sound) and is re-graded by the page, but a lawyer should look at it before the game is sold. |
| Checked | Credits and death years read on Wikipedia and Commons on 2026-11-15. No rights search, and no legal advice. |

## stair-shadow

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | Count Orlok's shadow climbing the stairs, 1:26:56 to 1:27:00. The Reel's Haunt 6 shot, and the clock shadow. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 4.2 s from 5215.9 s, scaled to 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2.2 s |
| Size | `.mp4` 77 KB, `.webm` 99 KB, `.jpg` 9 KB |
| Flash check | `node flash-check.mjs media/stair-shadow.mp4 media/stair-shadow.webm` on 2026-11-15: 75 frames, at most 0 flashes in any second (limit 3). A screen of whole-frame brightness, not a certificate. |

## reel-ship

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | The ship at sea (a model), 1:03:58 for 3.6 s. The Reel's shot for Haunt 0 to 2. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 3.6 s from 3838.2 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 1.6 s |
| Size | `.mp4` 63 KB, `.webm` 76 KB, `.jpg` 18 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 65 frames, at most 0 flashes in any second (limit 3). |

## reel-coffin

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | Orlok rising in his crate in the ship's hold, 1:04:22 for 4.6 s. The Reel's shot for the Haunt 3 Event. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 4.6 s from 3862.0 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2.1 s |
| Size | `.mp4` 66 KB, `.webm` 69 KB, `.jpg` 14 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 82 frames, at most 0 flashes in any second (limit 3). |

## reel-streets

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | An empty street of the town, 1:12:55 for 4.5 s (the shot ends before the town crier). The Reel's shot for Haunt 4 and 5. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 4.5 s from 4375.1 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2.0 s |
| Size | `.mp4` 108 KB, `.webm` 153 KB, `.jpg` 24 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 80 frames, at most 0 flashes in any second (limit 3). |

## reel-hand

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | The shadow of Orlok's hand on the stair rail and the door, 1:27:03 for 3.3 s. The Reel's shot for Haunt 7 and 8. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 3.3 s from 5223.0 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 1.4 s |
| Size | `.mp4` 54 KB, `.webm` 62 KB, `.jpg` 11 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 60 frames, at most 0 flashes in any second (limit 3). |

## reel-bed

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | Orlok leaning over the bed, 1:28:29 for 5.0 s. The Reel's shot for the Haunt 9 Event. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 5.0 s from 5309.0 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2.3 s |
| Size | `.mp4` 81 KB, `.webm` 69 KB, `.jpg` 9 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 89 frames, at most 0 flashes in any second (limit 3). |

## end-dawn

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | Orlok at the window as the sun rises; at the end the window is empty, 1:29:55 for 5.4 s. The ending when the Detectives win. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 5.4 s from 5395.0 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2.4 s |
| Size | `.mp4` 102 KB, `.webm` 98 KB, `.jpg` 13 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 98 frames, at most 0 flashes in any second (limit 3). |

## end-house

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | Orlok waits in an archway while Ellen at the window hides her face (one cross-cut as the film made it), 1:25:53 for 8.9 s. The ending when the house wins. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 8.9 s from 5153.0 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 4.0 s |
| Size | `.mp4` 192 KB, `.webm` 221 KB, `.jpg` 10 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 160 frames, at most 0 flashes in any second (limit 3). |

## wander-harbour

| | |
|---|---|
| Record | Source record: Nosferatu (1922) |
| Shot | One unbroken run of the film, 1:01:48 to 1:03:27 (99.4 s), with no title card in it: a tree by a house, the ship at sea, the sea, the sails, a woman at a window sill (small and dim, no close-up), and the ship coming into the harbour. Wander's home movie, played when a memory is found. It is the longest run in the film without a title card or a close-up of a face; the next shot after it is a face at a window. |
| Picture only | No audio track (`-an`). No title card or intertitle. No music. |
| Cut by | `ffmpeg`, 99.4 s from 3708.1 s, 480 x 360, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 75 s (the harbour) |
| Size | `.mp4` 2.7 MB, `.webm` 3.9 MB, `.jpg` 11 KB |
| Flash check | `node flash-check.mjs` on 2026-11-15: 1787 frames, at most 1 flash in any second (limit 3). A screen of whole-frame brightness; there is no lightning or strobe in the scene. |

## AI clips: the eight scenes of `docs/story/ai-scene-prompts.md`

These are **not** cuts from a source film. Each one is a generated clip: MiniMax H3-Max, 768P, 15 s, two takes per scene, submitted 2026-11-15 through the Matrix connector (task ids and drive node ids are in the clip entries below). The scene list, the prompts and the rules they must satisfy are in `docs/story/ai-scene-prompts.md`.

The rules for public-domain footage (puzzles Requirement 18) do not cover AI clips. This section records what the file actually is, in the same shape as the entries above, and does not make a rights claim: MiniMax's terms for commercial use of output have not been read yet, and the clips must be labelled as AI-generated where the law asks for it.

**Every generated clip carries a platform watermark.** MiniMax burns "Generated by MiniMax AI" into the lower right of every frame. That is a caption, and the prompts forbid captions, so the stamp is removed from every clip before it is cut: `delogo` over the exact stamp rectangle, which interpolates from the surrounding pixels. No crop is used, so the full frame survives. The stamp sits at the same size in both aspect ratios, anchored to the lower right corner with a margin of about 14 px:

- 4:3 (1024 x 768 source): the stamp occupies x 585 to 1009, y 718 to 754.
- 3:4 (768 x 1024 source): the stamp occupies x 329 to 753, y 974 to 1010.

Because the removal is an interpolation, the corners carry a little smoothing. Watch the lower right corner of any clip before it ships.

**Sound.** These clips carry the model's own audio, not the project's sound library. The library's sounds (`web/public/sounds/`) still belong to the footage clips, and `SHOT_SOUND` in `js/scenes.js` is unchanged. If an AI clip is put into a Reel slot that already has a sound, the two will overlap: `ai-hand-door` carries its own three knocks, and the Reel's `hand` slot also plays `knock`.

**The prompts, exactly as submitted.** Each scene was submitted twice with the same prompt and the same settings. The prompt is the preamble for the scene's look, then the scene text from the document.

### Scene 1, "Hand at the door" (Haunt 7 and 8)

Prompt (both takes, verbatim):

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.

A hallway at night: a banister with thin posts, a bare wall, a closed panelled door at the right with a small blank brass plate, a small brass lantern burning on a hall table, soft lamplight. Fixed camera. Only a huge shadow of a stooped figure on the wall; no body, no face. 0-6 s: the shadow glides along the wall and its long-fingered hand creeps along the rail; the lantern flame leans toward the door. 6-9 s: the fingertips reach the door frame. 9-12 s: three slow knocks, the shadow hand rapping the door panel, the door shivering. 12-15 s: the hand stays pressed to the door, then slides down it. Sound: a quiet house at night, one slow floor creak, three clear knocks on wood at about 9 s, 10 s and 10.5 s, then silence.
```

#### ai-hand-door-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 1, "Hand at the door" (Haunt 7 and 8). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank brass plate on the door |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 420 KB, `.webm` 348 KB, `.jpg` 21 KB |
| Flash check | `node flash-check.mjs media/ai-hand-door-take1.mp4 media/ai-hand-door-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463775298961696, drive node 463778399404117, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-hand-door-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 1, "Hand at the door" (Haunt 7 and 8). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank brass plate on the door |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 409 KB, `.webm` 364 KB, `.jpg` 19 KB |
| Flash check | `node flash-check.mjs media/ai-hand-door-take2.mp4 media/ai-hand-door-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463775373570400, drive node 463777555693748, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 2, "The empty bed" (Haunt 9 Event)

Prompt (both takes, verbatim):

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.

A small bedroom at night: an iron bed with white linen, a dent in the pillow, net curtains moving at a window with a misted pane, a small brass lantern burning on the nightstand, nobody in the bed. Very slow push-in. 0-5 s: still; the lantern flame bends toward the bed. 5-10 s: the mattress edge sinks as if someone sat down; the sheet pulls tight; a stooped shadow grows on the wall. 10-13 s: the shadow leans over the empty pillow; the lantern gutters. 13-15 s: the lantern burns very low; dark. Sound: wind at the window, bed springs creaking at 6 s, one slow exhale at 11 s.
```

#### ai-empty-bed-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 2, "The empty bed" (Haunt 9 Event). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the misted window pane |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 521 KB, `.webm` 492 KB, `.jpg` 29 KB |
| Flash check | `node flash-check.mjs media/ai-empty-bed-take1.mp4 media/ai-empty-bed-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463777430831309, drive node 463778273165721, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-empty-bed-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 2, "The empty bed" (Haunt 9 Event). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the misted window pane |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 482 KB, `.webm` 442 KB, `.jpg` 27 KB |
| Flash check | `node flash-check.mjs media/ai-empty-bed-take2.mp4 media/ai-empty-bed-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463772936335673, drive node 463778010902757, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 3, "The lights go out" (the house wins)

Prompt (both takes, verbatim):

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.

A tall old house at night seen from the garden: a lit window on each of three floors, a wet gravel path, bare trees, a front door with a small blank plaque beside it and a small brass lantern burning on the doorstep. 0-3 s: every window warm. 3-11 s: the lights go out one by one from the top floor down, each with a faint flicker. 11-13 s: the last window goes dark; the front door swings slowly open on black. 13-15 s: the lantern on the doorstep goes out; the open door, the dark house, still. Sound: wind in bare trees, a faint glass chime as each light dies, a slow door-hinge creak at 12 s, then silence.
```

#### ai-lights-out-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 3, "The lights go out" (the house wins). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank plaque beside the front door |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 417 KB, `.webm` 374 KB, `.jpg` 37 KB |
| Flash check | `node flash-check.mjs media/ai-lights-out-take1.mp4 media/ai-lights-out-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463777026564371, drive node 463778480443606, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-lights-out-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 3, "The lights go out" (the house wins). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank plaque beside the front door |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 387 KB, `.webm` 350 KB, `.jpg` 35 KB |
| Flash check | `node flash-check.mjs media/ai-lights-out-take2.mp4 media/ai-lights-out-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463773219119475, drive node 463778480443615, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 4, "Dawn in the parlour" (the Detectives win)

Prompt (both takes, verbatim):

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.

A parlour at first light: dust in a low sunbeam, an armchair, a table with an open book of blank pages, a teacup and a small brass lantern burnt down to its last flame, a tall window. 0-5 s: a pale thin mist hangs in the room like breath on glass. 5-11 s: it drifts to the open window and thins to nothing in the sunbeam; the lantern flame goes out; a chair rocks once and stops. 11-15 s: bright morning in the empty room, curtains stirring, a thin line of smoke rising from the lantern, dust settling. Sound: birds, one distant church bell at about 10 s, a soft sigh of wind, then quiet.
```

#### ai-parlour-dawn-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 4, "Dawn in the parlour" (the Detectives win). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank page of the open book |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 432 KB, `.webm` 360 KB, `.jpg` 21 KB |
| Flash check | `node flash-check.mjs media/ai-parlour-dawn-take1.mp4 media/ai-parlour-dawn-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463773989515500, drive node 463778480443622, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-parlour-dawn-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 4, "Dawn in the parlour" (the Detectives win). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | the blank page of the open book |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 452 KB, `.webm` 383 KB, `.jpg` 23 KB |
| Flash check | `node flash-check.mjs media/ai-parlour-dawn-take2.mp4 media/ai-parlour-dawn-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463772950438202, drive node 463777555693757, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 5, "The stair shadow" (Haunt 6 and the Turn Clock)

Prompt (both takes, verbatim):

```
Live-action 35mm black-and-white silent film from the 1920s: true monochrome, no colour, fine grain, soft gate flicker, dark rounded vignette. Locked-off camera, no cuts unless stated. Mood: gentle dread and melancholy, never gore. The haunting figure is only ever a tall silhouette or a shadow: no face, no close-up. No text, letters, numbers, signs, captions, logos, watermarks or modern objects. Sound: only natural sounds of the place. No music, no voices, no screams.

A bare dark wall and a wooden staircase rising from bottom left to a landing at top right, thin banister posts, a small brass lantern on a step near the top. Fixed camera, no cuts, no camera movement, no light changes. A huge tall thin shadow of a stooped figure enters at the foot of the stairs and climbs at one slow, steady, constant speed the whole way, reaching the landing at exactly 15 s, its long fingers trailing the banister. Nothing else moves. No sound.
```

#### ai-stair-shadow-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 5, "The stair shadow" (Haunt 6 and the Turn Clock). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (this clip is scrubbed by the clock) |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 451 KB, `.webm` 419 KB, `.jpg` 25 KB |
| Flash check | `node flash-check.mjs media/ai-stair-shadow-take1.mp4 media/ai-stair-shadow-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463777810931915, drive node 463778399404129, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-stair-shadow-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 5, "The stair shadow" (Haunt 6 and the Turn Clock). Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (this clip is scrubbed by the clock) |
| Model | MiniMax-H3-Max, 1024 x 768 source (4:3), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 582, y 715, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 640 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 435 KB, `.webm` 396 KB, `.jpg` 24 KB |
| Flash check | `node flash-check.mjs media/ai-stair-shadow-take2.mp4 media/ai-stair-shadow-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463778832929090, drive node 463779077144768, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 6, "The wind chimes" (Wander, a sound memory)

Prompt (both takes, verbatim):

```
16mm black-and-white home movie, handheld, light leaks, soft focus, fine grain. No faces, no people, no text, letters or numbers, no modern objects. Sound: only natural sounds of the place. No music, no voices.

A porch in summer light: a row of small metal wind chimes hanging from the beam, a wooden rail, a garden beyond, long grass. 0-6 s: still air; the chimes hang motionless in sun. 6-12 s: a breeze arrives and the chimes begin to sway and ring softly. 12-15 s: the breeze drops and the last chime trembles to stillness; sun flares in the lens. Sound: soft metal chimes, summer insects, a far lawnmower.
```

#### wander-chimes-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 6, "The wind chimes" (Wander, a sound memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 538 KB, `.webm` 616 KB, `.jpg` 31 KB |
| Flash check | `node flash-check.mjs media/wander-chimes-take1.mp4 media/wander-chimes-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463772047933756, drive node 463779077144780, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### wander-chimes-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 6, "The wind chimes" (Wander, a sound memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 486 KB, `.webm` 519 KB, `.jpg` 24 KB |
| Flash check | `node flash-check.mjs media/wander-chimes-take2.mp4 media/wander-chimes-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463777031954708, drive node 463778273165747, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 7, "The empty chair" (Wander, a person memory)

Prompt (both takes, verbatim):

```
16mm black-and-white home movie, handheld, light leaks, soft focus, fine grain. No faces, no people, no text, letters or numbers, no modern objects. Sound: only natural sounds of the place. No music, no voices.

A bright kitchen at morning: a wooden chair pulled out from a scrubbed table, a coat hanging on its back, a cup of tea still steaming, a window with a garden beyond. 0-6 s: steam rises from the cup in the sunlight. 6-12 s: the coat sways a little as if someone had just stood up; the camera drifts closer. 12-15 s: the coat settles; the steam thins. Sound: a kettle ticking as it cools, a quiet room, gulls far away.
```

#### wander-chair-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 7, "The empty chair" (Wander, a person memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 416 KB, `.webm` 396 KB, `.jpg` 20 KB |
| Flash check | `node flash-check.mjs media/wander-chair-take1.mp4 media/wander-chair-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463777287414096, drive node 463778273165749, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### wander-chair-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 7, "The empty chair" (Wander, a person memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 434 KB, `.webm` 418 KB, `.jpg` 22 KB |
| Flash check | `node flash-check.mjs media/wander-chair-take2.mp4 media/wander-chair-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463776070226207, drive node 463778480443631, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### Scene 8, "The letter" (Wander, a promise memory)

Prompt (both takes, verbatim):

```
16mm black-and-white home movie, handheld, light leaks, soft focus, fine grain. No faces, no people, no text, letters or numbers, no modern objects. Sound: only natural sounds of the place. No music, no voices.

A windowsill table in afternoon light: a folded letter with no legible writing, a pair of gloves, a small dish, net curtains moving. 0-6 s: light moves slowly across the letter. 6-12 s: a breeze lifts the corner of the letter and lets it fall; the camera drifts closer. 12-15 s: the curtain passes across the frame and the light fades to dusk. Sound: breeze, a distant church bell once, quiet.
```

#### wander-letter-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 8, "The letter" (Wander, a promise memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 1 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 518 KB, `.webm` 552 KB, `.jpg` 18 KB |
| Flash check | `node flash-check.mjs media/wander-letter-take1.mp4 media/wander-letter-take1.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463773230555443, drive node 463779077144784, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### wander-letter-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | Scene 8, "The letter" (Wander, a promise memory). A Wander mood clip: a Wander place belongs to the player, so this only sets a mood. Slot for the Reel or the ending is not wired up yet; the clip is a take, not a replacement. |
| Overlay place | none (Wander has its own card) |
| Model | MiniMax-H3-Max, 768 x 1024 source (3:4), 768P, 15 s. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured, not just present: the `ai-hand-door` envelope is quiet to about -57 dB and steps up to about -40 dB at the knocks; `wander-chimes` rises from about -68 dB as the breeze arrives; `ai-stair-shadow` is silence, as the scene asks. |
| Picture | Black and white already (measured saturation 0.3 to 1.3 of 255), so no desaturation was needed. The platform stamp was removed with `delogo` at x 326, y 971, 431 x 43; the frame was not cropped. |
| Cut by | `ffmpeg`, 15.1 s, scaled to 360 x 480, H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 551 KB, `.webm` 574 KB, `.jpg` 23 KB |
| Flash check | `node flash-check.mjs media/wander-letter-take2.mp4 media/wander-letter-take2.webm` on 2026-11-15: 362 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Task 463773612093686, drive node 463778273165756, generated 2026-11-15. |
| Price | Billed by the service against the M Plan weekly limit, or against account credits where the plan does not cover it. The amount is the service's to calculate and is not recorded here. For scale only, the price table in `docs/story/ai-scene-prompts.md` lists H3 768P at $0.08 a second, $1.20 for a 15 s take, and does not list H3-Max at all. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

### What the takes got wrong

**`wander-letter` (both takes) fails the "no text" rule.** The letter carries visible cursive handwriting across the page. It is illegible at 480 px, but it is writing, and a World Clue drawn beside it would look like part of the same page, which is exactly what Rule 2 forbids. The scene needs a re-roll with the letter described as a closed, unfolded, unmarked sheet, or with the page itself out of frame.

**The overlay surfaces are small.** The blank brass plate in `ai-hand-door` is about 35 x 25 px at 480 p and the blank plaque in `ai-lights-out` about 40 x 20 px. A clue written on them at play time will be cramped. The blank page of the open book in `ai-parlour-dawn` is the only generous one, and the book is on the armchair seat rather than on the table.

**The timed sound events are approximate.** The envelope shows the bed of wind and the loud events, but not each cue at the second the document asks for: `ai-lights-out` stays flat at about -37 dB with no obvious chime steps, and `ai-parlour-dawn` shows no bell at 10 s. The `ai-hand-door` knocks land at about 7 s rather than 9 s, so `SOUND_AT.knock` would need to move if that clip is ever used.

**The wind arc is flatter than written.** In every take the sails, curtains and mist move at a more even pace than the three-phase build the document describes. Treat the clips as a steady atmosphere rather than a timed sequence.


### Scene 4, "Dawn at the door" (the detectives win; replaces the parlour)

Not in `docs/story/ai-scene-prompts.md` yet. It replaces scene 4, "Dawn in the parlour", because the parlour takes show no event: mist leaves a room and a chair rocks once. This scene mirrors "The lights go out": the light comes back, the lamps go out one by one as morning takes over, the front door opens and the mist drifts out.

#### ai-dawn-door-take1

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | "Dawn at the door" (the detectives win). Slot for the ending is not wired up yet; the clip is a take, not a replacement. **Superseded on 2026-11-16 by take 3, the only take that starts from the lights-out house (the shot uses take 3).** |
| Overlay place | None declared yet: the brief did not set aside a blank surface. |
| Model | MiniMax. The model name, tier and task id were lost with the generating session. 1280 x 720 source (16:9), 15 s. The brief asked for the first frame of `ai-lights-out-take1`, but the house in this clip is a different one (two storeys, a chimney), so that frame was probably not used. |
| Take | 1 of 1 so far. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured: about -36.0 LUFS, peak -16.6 dBFS, very quiet. Not checked by ear. |
| Picture | Black and white already (measured saturation 0.5 on average, 0.66 at most, of 255), so no desaturation was needed. No platform stamp was visible in the lower right corner or along the bottom edge (looked at on frames at 7 s and 12 s), so no `delogo` was applied and the frame was not cropped. The original file is kept, untracked, at `tools/playtest/media/source/ai-dawn-door-take1-original.mp4`. |
| Cut by | `ffmpeg`, 15.0 s, scaled to 854 x 480 (16:9, its own shape), H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 535 KB, `.webm` 503 KB, `.jpg` 21 KB |
| Flash check | `node flash-check.mjs media/ai-dawn-door-take1.mp4 media/ai-dawn-door-take1.webm` on 2026-11-16: 360 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Saved by the owner on 2026-11-16 as `ai-dawn-door-take1.mp4`. The generating session was lost, so there is no task id. |
| Prompt | The from-scratch brief given to the owner on 2026-11-16: the black-and-white style line, then "Continue from the first frame: the same stone house at night ..." with the 0-4, 4-10, 10-13 and 13-15 s timeline. The text actually submitted was not captured. |
| Price | Not recorded. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-dawn-door-take2

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | "Dawn at the door" (the detectives win), the second take. Slot for the ending is not wired up yet; the clip is a take, not a replacement. **Superseded on 2026-11-16 by take 3, the only take that starts from the lights-out house (the shot uses take 3).** |
| Overlay place | None declared yet: the brief did not set aside a blank surface. |
| Model | MiniMax. The model name, tier and task id were lost with the generating session. 1280 x 720 source (16:9), 15 s. Seen from the front: a symmetrical two-storey stone house with a central gable. It is not the house of take 1 (angled, with a chimney) and not the house of `ai-lights-out`, so the first frame of that scene was probably not used. |
| Take | 2 of 2. |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured: about -35.2 LUFS, peak -9.9 dBFS. Not checked by ear. |
| Picture | Black and white already (measured saturation 0.53 on average, 0.71 at most, of 255), so no desaturation was needed. No platform stamp was visible in the lower right corner (looked at on a frame at 12 s), so no `delogo` was applied and the frame was not cropped. The original file is kept, untracked, at `tools/playtest/media/source/ai-dawn-door-take2-original.mp4`. |
| Cut by | `ffmpeg`, 15.0 s, scaled to 854 x 480 (16:9, its own shape), H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 658 KB, `.webm` 618 KB, `.jpg` 22 KB |
| Flash check | `node flash-check.mjs media/ai-dawn-door-take2.mp4 media/ai-dawn-door-take2.webm` on 2026-11-16: 360 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Saved by the owner on 2026-11-16 as `ai-dawn-door-take2.mp4`. The generating session was lost, so there is no task id. |
| Prompt | The same from-scratch brief as take 1. The text actually submitted was not captured. |
| Price | Not recorded. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |

#### ai-dawn-door-take3

| | |
|---|---|
| Record | AI clip. Generated, not filmed and not cut from a film. |
| Scene | "Dawn at the door" (the detectives win). **The take the shot uses.** It starts from the house of `ai-lights-out-take1` (the same three dormers, the doorway with a pediment, the plaque at the right of the door, the two bare trees and the lantern on the doorstep), seen closer and wider, which the first two takes did not. Slot for the ending is not wired up yet: see the puzzles spec, Requirement 21. |
| Overlay place | None: the title card follows the shot. |
| Model | MiniMax, made by the owner with the lights-out first frame. The model name, tier and task id were not given. 1280 x 720 source (16:9), 15.0 s. |
| Take | 3 of 3 (takes 1 and 2 are superseded). |
| Sound | The model's own native audio track, kept: AAC in `.mp4`, Opus in `.webm`. Measured after the cut: about -32.8 LUFS, peak -16.8 dBFS, very quiet. A latch or creak at about 10.1 s and the door opening at 10.5 to 10.9 s. Not checked by ear. A loud click at 0.04 to 0.11 s of the source was cut away (see Picture). |
| Picture | Black and white already (measured saturation 0.4 on average, 2.9 at most, of 255), and desaturated with `hue=s=0` anyway. No platform stamp seen. **The first frame of the source is a single odd frame** (an open, lit door with mist), then the clip runs from a closed door with its lantern: the first 4 frames (0.1667 s) and the first 0.1667 s of sound were cut away. The beats after the cut: dusk and a quiet house 0 to 9.8 s, the light rises from 9 s, the door opens on warm light from 10.4 s and is fully lit at 11.6 s, mist at the foot of the door to the end. The original is kept, untracked, at `tools/playtest/media/source/ai-dawn-door-take3-original.mp4`. |
| Cut by | `ffmpeg`, 14.83 s, scaled to 854 x 480 (16:9, its own shape), H.264 (main, crf 29) and VP9 (crf 37); poster frame at 2 s |
| Size | `.mp4` 389 KB, `.webm` 303 KB, `.jpg` 34 KB |
| Flash check | `node flash-check.mjs media/ai-dawn-door-take3.mp4 media/ai-dawn-door-take3.webm` on 2026-11-16: 356 frames, at most 0 flashes in any second (limit 3). |
| Where it came from | Saved by the owner on 2026-11-16 as `Stone_house_morning_transition_e2ae209f.mp4` (first in the Downloads folder, which the assistant cannot read; then in `media/`), renamed to take 3. |
| Prompt | Not captured: the owner made it. It continues from the first frame of `ai-lights-out-take1` and follows the dawn beats of `docs/story/ai-scene-prompts.md` scene 4. |
| Price | Not recorded. |
| Terms | MiniMax's terms for commercial use of generated output have not been read. Read them before the game is sold, and label the clip as AI-generated where the law asks for it. |
