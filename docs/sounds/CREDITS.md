# Sound credits

One row per file in `web/public/sounds/`. `tools/check-sounds.mjs` fails the build on a file with no row here.

Four of the files are our own (synthesised); five come from CC0 sources (Kenney and Freesound). All nine are CC0, so none needs an attribution, but each is credited here. Every file was cut to length, made mono, levelled to -16 LUFS and encoded to AAC by `tools/sounds/encode-sounds.mjs`; a file that is a single strike or knock (peaky) was first driven into a soft clipper (the "drive" below) to reach -16 LUFS without clipping.

| File | Title and author | Source (link) | Licence | Changes made |
|---|---|---|---|---|
| `creak.m4a` | "Opening a creaking door", by Ryding (Freesound) | https://freesound.org/people/Ryding/sounds/125957/ | CC0 1.0 | From the site's high-quality preview (mp3): the loudest 2.9 s, a 4 ms fade in and a 100 ms fade out, mono. No drive. |
| `whisper.m4a` | "whisper", made by the Hauntology project (synthesised) | `tools/sounds/make-sounds.py`, function `whisper` | CC0 1.0, own work dedicated to the public domain | None beyond the common steps. |
| `bell.m4a` | `impactBell_heavy_000.ogg` from "Impact Sounds", by Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 (the pack's `License.txt`) | Mono, a 60 ms fade out. Drive 16 dB. |
| `laugh.m4a` | "laugh", made by the Hauntology project (synthesised, no recorded voice) | `tools/sounds/make-sounds.py`, function `laugh` | CC0 1.0, own work dedicated to the public domain | None beyond the common steps. |
| `wind.m4a` | "wind_howl2_stereo.wav", by swiftoid (Freesound) | https://freesound.org/people/swiftoid/sounds/117611/ | CC0 1.0 | From the site's high-quality preview (mp3): the 2.9 s that rise most, mono, a 100 ms fade out. No drive. |
| `rumble.m4a` | "rumble", made by the Hauntology project (synthesised) | `tools/sounds/make-sounds.py`, function `rumble` | CC0 1.0, own work dedicated to the public domain | None beyond the common steps. |
| `becoming.m4a` | "becoming", made by the Hauntology project (synthesised) | `tools/sounds/make-sounds.py`, function `becoming` | CC0 1.0, own work dedicated to the public domain | None beyond the common steps. |
| `knock.m4a` | "Door Knock - 42.wav", by Ligidium (Freesound) | https://freesound.org/people/Ligidium/sounds/193873/ | CC0 1.0 | From the site's high-quality preview (mp3): 1.6 s from 30 ms before the first knock, mono, a 100 ms fade out. Drive 12 dB. For the shadow hand at the door (the Reel at Haunt 7 and 8), starting 2.1 s into the shot. |
| `scrape.m4a` | "Wood Chest Slid.3.wav", by kforetek (Freesound) | https://freesound.org/people/kforetek/sounds/146805/ | CC0 1.0 | From the site's high-quality preview (mp3): the whole 2.6 s, mono, a 100 ms fade out. No drive. For the claw on the rim of the crate (the Reel at Haunt 3), starting 3.1 s into the shot. |
