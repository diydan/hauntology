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
