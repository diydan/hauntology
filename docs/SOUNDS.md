# Sound files: the sourcing brief

The game plays seven short clips. **It works without any of them**: a phone flashes and vibrates and the TV shows the log line instead. So the devs build first, and you drop the files in later. This brief is party-mode Requirement 20 (`.kiro/specs/party-mode`).

## The seven clips

| File | Where it plays | Max length | Should sound like |
|---|---|---|---|
| `creak` | Cues, Frames, House Cues, Rattle level 1 | 3 s | one slow floorboard or hinge creak, dry |
| `whisper` | Cues, Frames, House Cues | 3 s | breathy, no words |
| `bell` | Cues, Frames, House Cues, the hour strike | 3 s | one small bell that rings out |
| `laugh` | Cues, Frames, House Cues | 3 s | thin, distant, eerie, no words; spooky, not cruel |
| `wind` | Rattle level 2 | 3 s | a rising gust with some mid frequencies |
| `rumble` | Rattle level 3 | 3 s | a low tremble with energy from 150 to 800 Hz, because phone speakers have no bass |
| `becoming` | when a player joins the haunting | 4 s | a swell, one hit, a fade. Drama from shape, not volume |

## Puzzle sounds need no file

The puzzle sounds (clicks, notes, the thunk, the creak of a door) are synthesised on the phone by `web/src/puzzles/feel/synth.ts` from the recipes in `shared/src/puzzles/sound.ts`, so none is a file here. Each has a visual twin, and sound plays only where the Player has sound on (puzzles Requirement 10). The one spoken exception is the Spirit board word, which is a line of the Whisper in the Voice Library (puzzles task 8.3).

## Two more, for the footage scenes

The footage has no sound of its own (puzzles Requirement 18.4), so two scene shots get a sound from us (puzzles Requirement 20.6). Same rules, same folder, and the game works without them.

| File | Where it plays | Max length | Should sound like |
|---|---|---|---|
| `knock` | the Reel at Haunt 7 and 8 (the shadow hand at the door) | 3 s | a knock on a door, a few knocks, not a random thud |
| `scrape` | the Reel at Haunt 3 (a claw on the rim of the crate) | 3 s | wood dragged over wood, gripping and then letting go |

## Format

- Mono `.m4a`, at most 50 KB each and 350 KB for all nine.
- Levelled to about -16 LUFS. Nothing clips.
- Put the files in `web/public/sounds/` named exactly as in the table (`creak.m4a`, and so on).

## What to avoid

- No words and no real person's voice.
- Nothing from a film, a game or a song.
- The licence must allow a public web app and the submission video. CC0 or a purchased commercial licence is easiest.
- Credit every file in `docs/sounds/CREDITS.md`. `tools/check-sounds.mjs` fails the build on a file with no credit, over a size limit, or in the wrong format.

## Where to look

Search words for CC0 and commercial libraries: "floorboard creak", "door hinge creak slow", "breathy whisper no words", "small bell single strike", "distant eerie laugh", "wind gust rising", "low rumble tremble", "horror swell stinger". Check each licence page, not just the site.

## Convert command

With `ffmpeg` installed, from a source file `in.wav` (this makes mono, levels to about -16 LUFS, and encodes AAC in `.m4a`):

```
ffmpeg -i in.wav -ac 1 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 64k creak.m4a
```

Check the size (`ls -l`). If a file is over 50 KB, lower the bitrate (`-b:a 48k`) or trim the tail.

## How the current files were made (2026-11-15)

Four of the nine files in `web/public/sounds/` are our own: `tools/sounds/make-sounds.py` computes whisper, laugh, rumble and becoming from noise, sine waves and filters (needs `python3` and `numpy`; the same seeds give the same sounds; the synthesised creak, bell and wind it also makes are kept as fallbacks, and `--extras` makes a knock and a scrape). Five are CC0 recordings picked by ear from two listening reels: the creak (Ryding, Freesound), the bell (Kenney, Impact Sounds), the wind (swiftoid, Freesound), the knock (Ligidium, Freesound) and the scrape (kforetek, Freesound). Each is credited, with its link and what was done to it, in `docs/sounds/CREDITS.md`.

`node tools/sounds/encode-sounds.mjs <wav folder> <dest>` (or `--one in.wav out.m4a`) levels a clip to -16 LUFS in two passes and encodes it. A single strike or knock cannot reach -16 LUFS at the same peak (a lone knock sits near -26), so such a clip is driven 4 to 20 dB into a soft clipper, the lightest drive that lands within 1 LU; a steady clip is not touched. If AAC would overshoot and clip when decoded, the clip is band-limited at 11 kHz, held under 0.8 and encoded with more bits. The bell (drive 16 dB) and the knock (12 dB) are thicker than their sources for that reason. To replace a sound, drop a better file in with a row in `docs/sounds/CREDITS.md` and run `pnpm check-sounds`.

## Optional

Quiet ambient loops for the TV, one per weather and up to 12 (conditions task 4.3). They are not needed for the game.
