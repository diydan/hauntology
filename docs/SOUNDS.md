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

## Format

- Mono `.m4a`, at most 50 KB each and 350 KB for all seven.
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

The seven files in `web/public/sounds/` are our own: `tools/sounds/make-sounds.py` computes them from noise, sine waves and filters (needs `python3` and `numpy`; the same seeds give the same sounds), and `node tools/sounds/encode-sounds.mjs <wav folder> web/public/sounds` levels them to -16 LUFS in two passes and encodes them. They are dedicated to the public domain (CC0 1.0). They were judged by spectrogram and by the numbers, not by ear: **listen to them**, and to replace one, drop a better file in with a row in `docs/sounds/CREDITS.md` and run `pnpm check-sounds`.

## Optional

Quiet ambient loops for the TV, one per weather and up to 12 (conditions task 4.3). They are not needed for the game.
