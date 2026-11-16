# Voice Library tool: plan (draft, 2026-11-15)

Status: **built (2026-11-15): the banks as data for the Lodger, the Whisper and the Keeper (generated from `docs/story/`), `buildLibrary` and the key functions, the manifest (503 entries) and the offline check tool; the prerender tool with dry run, `--render` (one voice at a time), `--upload` and `--reel`; and **the whole Library (503 files) rendered locally**. All 527 files (the manifest has grown from 503 entries since the first render) were uploaded to R2 on 2026-11-16, each read back identical (see Upload below); the speak service does not read it yet.** The open decisions at the end are answered. It turns `ghost-voice` tasks 2.18, 2.19, 3.11 and 3.12 into steps. Requirements 1.8 and 1.9, Property 14, and the "Reuse and pre-generation" rules in `.kiro/specs/ghost-voice/design.md` are the source; where this plan adds something, it says so.

## What the Library is

Audio for every **spoken, scripted** line, rendered once ahead of time, kept under `speech/lib/v1/<hash>` with no expiry, and played with no ticket, no paid call and no quota (so the zero-quota Gallery path sounds like the real game). The key is made from the voice and the plain spoken text only: `canonicalSpeechKey(voice, text) = JSON.stringify([voice, normalise(text)])`, then SHA-256 hex (`ghost-voice` design, "Speech cache"). A Steering Tag is never in the key; the tag is a fixed function of the Speaker.

## What gets rendered, and what it costs

| Bank | Spoken kinds | Voices | Files | Characters sent | About |
|---|---|---|---|---|---|
| **The Lodger** (`docs/story/lodger-lines.md`, exists) | `stall` (5 lines), `confession` (6 lines) | Mark, Conrad, Arjun, Chloe, Eleanor, Victoria | 11 x 6 = **66** | 1,159 per voice with the tag, **6,954** in all | **$0.17** |
| **Single-player ghost** (`docs/story/ghost-lines.md`) | `reveal`, `echo`, `tease`, `hint`, `ambient`, `ending`, `refuse`, `meet`; the finite placeholders expanded | Pippa, Ronald | **352** (240 from the 10 `hint` lines, 24 each) | 35,057 | about $0.88 |
| **Party** (`docs/story/party-lines.md`) | the spoken kinds only: 85 texts (54 of the 139 lines are text only; 31 spoken lines are cut before their `{nick}` or `{zone}` sentence) | Pippa, Ronald | **85** | 8,317 | about $0.21 |
| **All** (measured by `pnpm prerender-voice`) | | | **503** (66 + 352 + 85) | **50,328** | **$1.26** |

- **Asides are never rendered.** The Lodger `aside` is text only (party-mode 7.8), so its 5 lines are left out. Rendering them in six voices would waste about 3,400 characters ($0.09). (An earlier note in the design counted 15 lines and 90 files; that was wrong and is corrected.)
- Price is $25 per million characters, counting the Steering Tag as sent. Billing of this third-party model on this account is still unverified (Spike 1.1).
- Each voice in the Library is the Suspect's own voice, so every Preset Suspect can speak every Lodger line; a made-up Suspect uses Mark or Chloe, so it needs nothing extra.

## What to build

| # | Piece | Where | Spec task |
|---|---|---|---|
| 1 | **Banks as data.** `docs/story/*.md` tables become typed banks. A small script turns the tables into `shared/src/voice/banks/*.ts`, committed, with a test that fails if the markdown and the TypeScript differ. The markdown stays the place a person edits. | `tools/build-banks.mjs` (new) | supports 2.18 |
| 2 | **`buildLibrary(banks)`**, pure: every `(voice, spoken text)` pair, spoken kinds only, the shared Lodger bank once per Lodger Voice, finite placeholders expanded, fixed order, no duplicate key. | `shared/src/voice/library.ts` | 2.18 |
| 3 | **Property test**: complete, free of player text, no Steering Tag or markup, no key collision across voices, and no key made because of a secret. | `shared/src/voice/library.prop.test.ts` | 2.19 (Property 14) |
| 4 | **Manifest**: keys and spoken texts, no audio. | `shared/fixtures/voice-library.json` | 3.11 |
| 5 | **Check tool** (offline, in the build): fails when a spoken text has no entry, an entry has no line, or a text holds a tag or markup. | `tools/check-voice-library.mjs` | 3.11 |
| 6 | **Prerender tool** (run by the owner before a deploy). See below. | `tools/prerender-voice.mjs` | 3.11 |
| 7 | **Read path**: the speak service reads the Library key, then the cache key, before any ticket. | `api/src/` speak service | 3.12 |

## The prerender tool

**Built so far (2026-11-15): the dry run and the render step, for one voice at a time.** `pnpm prerender-voice [--voice Chloe] [--takes 2] [--budget-usd 0.05] [--list] [--out DIR]` plans and prices and writes nothing. `--render` (with `--voice`, `--budget-usd`, `$VOICE_RENDER_TOKEN` and ffmpeg) renders the missing files through the local Worker in `tools/voice-render/` (start it with the command in its `wrangler.jsonc`; the tool only talks to a loopback address). The rules are tested: one request at a time, no retries (a failure stops the run), the budget checked before every call and a call counted as spent before it is made, every clip checked (MP3 header, 0.8 s to 20 s, not silent) and a failed clip kept as `<file>.rejected`, and an existing file never overwritten. The folder is `./.voice-library/` (ignored by git) or `$VOICE_LIBRARY_DIR`; a file is `<hash>.take<n>.mp3`, and `report.json` lists what was rendered. The tool checks only that folder, not R2. **Reels (built):** `pnpm prerender-voice --reel (--voice Chloe | --all) [--no-labels]` makes `<folder>/reels/reel-<voice>.mp3` and a `.index.txt` (start time, line id and text of every line, so "stall three sounds wrong" can be found again). It speaks the voice name and a label before each line (macOS `say`; `--no-labels` skips it, and it falls back to none without `say`), brings every clip to the same loudness and leaves 0.9 s gaps. It reads the Library folder only: no network, no spend, never changes a Library file, and rebuilds the reel each time. Lines not rendered yet are listed, a bad file is left out and fails the run.

**Upload (built; run against real R2 on 2026-11-16, all 527 files are in):** `pnpm prerender-voice --upload (--voice Chloe | --all) [--bucket NAME] [--jurisdiction eu] [--yes]`. Without `--yes` it is a preview and makes no Wrangler call. With `--yes` it uses **your** Wrangler login (`wrangler r2 object put --remote --content-type audio/mpeg`), so no token is stored. A voice goes up whole or not at all. Before each file it re-checks the clip; it never overwrites (the same audio already there is skipped, different audio stops the run and prints the delete command for you to choose); it reads every upload back and compares SHA-256; one request at a time, no retries, stops at the first problem; `.voice-library/uploaded.json` records what went up. Take 1 only. It is tested against a fake Wrangler (17 tests). **Run for real on 2026-11-16:** all 527 files are in `hauntology-worlds` under `speech/lib/v1/`, each read back identical. The last run uploaded 0 and skipped 527 as "already there, identical", because an earlier run had already put them there. The bucket is in the default jurisdiction, so run the upload with **no** `--jurisdiction` flag: `--jurisdiction eu` looks in the EU namespace, where there is no such bucket, and stops at once. The ledger `.voice-library/uploaded.json` has 526 keys, one short (Pippa `poltergeist.soft.6`), although R2 holds that file identical. Running `--upload --all --yes` again is safe, because identical files are skipped; a new or reworded line needs a render first. The code is `tools/lib/prerender-plan.mjs`, `prerender-run.mjs` and `audio-check.mjs`, with 49 tests in `tools/test/`.

**Render results (2026-11-15):** the Lodger bank (66 files, about $0.145 counted: Mark first at $0.029, then the other five voices, each run capped at $0.04) and **the Whisper (Pippa): 209 files, 21,662 characters, about $0.5416 counted of a $0.60 budget**. Every file passed the checks.  A call took 2.6 to 6.1 s (Pippa's average was 3.7 s); clips run 6.0 to 11.9 s (Pippa's 6.2 to 11.4 s). **The Keeper (Ronald): 228 files, 21,712 characters, about $0.5428 counted of a $0.60 budget**, all passed, clips 3.3 to 9.6 s, 3.0 s a call on average. That is the whole Library: 503 files, about $1.26 counted, 503 requests with no error and no rate limit. The audio is only in the git-ignored `.voice-library/`; it is not uploaded. Reels have been sent for the Lodger voices and Pippa (46 minutes, 120 of her 209 clips being hint variants), not for Ronald. Whether the account was billed, and how much, is still unverified (Spike 1.1).

**Growth (2026-11-16):** seven new party variants in the storybook tone (`docs/story/TONE.md`) took the banks from 503 to 510 entries. They are for the big moments only: three more, for the frequent moments (`turn-start`, `time-warning`), were rendered and then taken out again, so their three audio files in `.voice-library/` are not in the manifest. The seven were rendered on their own through a second local Worker on its own port, with a manifest filtered to those lines (the tool has no per-line filter); about $0.039 was spent in all, counting the three taken out and one reworded line rendered twice. The narration-style work adds more lines that are not rendered yet: 7 for Pippa and 10 for Ronald, about $0.055. With them the manifest holds 527 entries, and the tests that pin the totals say 527 files, 60,093 characters and about $1.50.

**Growth (2026-11-16, evening):** five new Whisper lines for the footage scenes (`scene.ship`, `scene.crate`, `scene.street`, `scene.mirror`, `wander.departure`) and a new last sentence for `scene.lights-out` took the banks to 532 entries; the tests that pin the totals say 532 files, 60,471 characters and about $1.51. The six were rendered on their own, about $0.016 with one reworded line. They went up to R2 on 2026-11-16 (6 uploaded and read back, identical), so all 532 files are in.

**Default is a dry run.** It prints a table (voice, files missing, characters, estimated cost) and stops. Nothing is spent until the owner adds `--render` and a budget.

| Flag | What it does |
|---|---|
| `--dry-run` (default) | List the missing keys, the count and the estimated cost. |
| `--render --budget-usd 0.25` | Render the missing keys. Stop before the estimate passes the budget. A budget is required. |
| `--voice Chloe` | Only one voice. |
| `--takes 2` | Render two takes per line so the owner can pick (see "Takes"). Costs twice as much. |
| `--reel` | Build a listening reel per voice (spoken name, then each line, same loudness), so the owner can hear all of it. **Built.** |
| `--upload` | Upload approved files to R2. Never overwrites an existing key. |

**How it renders.** Two ways were considered:

| Way | Good | Bad |
|---|---|---|
| **A. Admin route** on the deployed Worker | Uses the real guarded `speak` wrapper and R2 binding directly | Adds a deployed route and an owner secret to guard |
| **B. Local Worker with the AI binding, called by the Node tool** | No new deployed surface and no token to handle; **the AI binding worked this way for all the samples and clips made in this session** | Needs the guarded wrapper to be callable outside the deployed Worker; real R2 writes need `wrangler dev --remote` or a separate `wrangler r2 object put` (not tried) |

**Recommended: B.** Render to a local folder first (not committed), check and listen, then upload with `wrangler r2 object put`, which uses the owner's login and needs no token in a file. A tiny Worker entry imports the guarded `speak` wrapper with a manual budget in place of `SpendGuard`.

**Safety and cost rules:**
- **No automatic retries.** A retry is charged again. A failure stops the run and says which key failed; starting again skips what is done.
- **Idempotent and ordered.** Fixed order, so a stop resumes cleanly. A key that exists is never overwritten.
- **One request at a time** to begin with. Inworld's rate limits are unknown.
- **Download at once.** Inworld returns a temporary signed link; the audio is saved immediately.
- **Checks on every file:** not empty, a valid MP3 header, a length between 0.8 s and 20 s (Mark's longest Lodger line is 11.9 s; the Whisper speaks slower), not silent. A failed file is not uploaded.
- **Report:** `{key, voice, bytes, durationMs}` written to a local file, not committed. The audio itself is never committed (spec).

**Takes.** The Lodger settings (temperature 1.2) give a different delivery on every render. One take per line is the default. With `--takes 2` the owner listens and writes the winners into `picks.json` before upload. The cost doubles: about $0.35 for the whole Lodger bank.

## Order of work

My effort guesses, not measured. The deadline is Dec 4, and the Library is needed before the Dec 3 deploy and for the Gallery path.

| Step | What | Rough effort |
|---|---|---|
| 1 | Banks to data (`build-banks`), `library.ts`, the property test | half a day |
| 2 | Manifest and the check tool | 2 hours |
| 3 | Prerender tool in dry-run, and the local Worker entry | half a day |
| 4 | **Pilot: render only the Lodger bank** (66 files, $0.17), listen to the reels, upload | 2 hours |
| 5 | The pilot answers Spike 1.1: real cost, billing, rate limits and latency | with step 4 |
| 6 | Read path in the speak service (3.12) | half a day |
| 7 | Render the Whisper and Keeper banks once the story-writer has written them | after the banks exist |

The pilot comes first because the Lodger bank is the only one that exists, and it tests everything on 66 files for 17 cents.

## Risks and unknowns

- **Billing and rate limits** of `inworld/tts-2` on this account are unverified (Spike 1.1).
- **`[speak nervously]`** is proven on Mark and heard on the other five; the deployed Worker is not tested.
- **The bucket exists, in the default jurisdiction, and the owner accepted that (2026-11-16).** On 2026-11-15 a read-only check (`wrangler r2 bucket info hauntology-worlds`) found no bucket. `hauntology-worlds` was then created on 2026-11-16 at about 10:09 UTC with no location hint and no jurisdiction, so it is **not** an EU bucket. The Worker binding in `api/wrangler.jsonc` has no `jurisdiction`, which matches it, and the Library is uploaded to it. A location hint (`--location weur`) or a jurisdiction (`--jurisdiction eu`) cannot be added to an existing bucket; moving later means a new bucket and a copy of every object. This bucket also holds user uploads and selfies, so the selfie EU review is a separate question that this choice did not answer.
- **The bucket.** Settled: the Library shares `hauntology-worlds`. The hourly cron only touches `uploads/`, `candidates/`, `worlds/` and `sprites/` (checked), so `speech/` is safe from it. Still open: nothing expires the 30-day cache yet (see Decisions).
- **The Aura-2 fallback is not pre-rendered.** A Library miss falls through to the cache, then a paid call.
- **Clip audio is not Library audio.** The 17 avatar clips were made from separate renders, so they sound slightly different from the Library files. Only matters if the product ever plays a clip with Library sound.
- **Losing R2** costs a re-render, about $1.26 for everything. Keep the tool and the manifest in git, and the audio only in R2.

## Decisions (answered 2026-11-15; change any of them and the plan follows)

| # | Question | Answer | Why |
|---|---|---|---|
| 1 | **Bucket** | **Reuse `hauntology-worlds`**, prefix `speech/lib/v1/` for the Library | Checked in `api/src/worlds/`: the hourly cron lists and deletes only `uploads/`, `candidates/`, `worlds/` and `sprites/`, and `removeObjects` drops any key outside those four. It never touches `speech/`. A second bucket would add a binding and a deploy step for nothing |
| 2 | **Banks as data** | **Markdown is the source**, generated TypeScript (already built) | A person edits the tables; `pnpm check-voice-library` fails if the two differ |
| 3 | **Takes** | **One take.** Re-roll a rejected line by deleting its file and running again | 66 clips is about 11 minutes of listening, 132 is 22. A re-roll of one line costs about $0.003, so two takes everywhere buys little |
| 4 | **Render way** | **B, the local Worker**, then upload with `wrangler r2 object put --remote --content-type audio/mpeg` | No new deployed route and no token to guard. It is how every sample and clip in this project was made. Always pass `--remote`: without it the file may go to the local copy of R2, not the real bucket |
| 5 | **Who renders** | **I render to the local folder** with a $0.25 budget; **you run the upload** | Rendering costs 17 cents and stays on this machine. The upload changes the shared bucket, so it is yours, with your login (the spec says the owner runs it) |

**Two jobs this answer creates (not built):**
- **Expire the speech cache, not the Library.** The cron does not expire `speech/v1/` (the 30-day cache). Add one R2 lifecycle rule on that prefix only: `wrangler r2 bucket lifecycle add hauntology-worlds speech-cache speech/v1/ --expire-days 30`. A rule with no prefix would delete the Library, so the prefix is not optional. Optional extra: `wrangler r2 bucket lock add hauntology-worlds --name speech-library --prefix speech/lib/ --retention-indefinite` makes the Library impossible to delete or overwrite by mistake.
- **A test that the cleanup never removes a `speech/` key**, added with the read path (task 3.12).

## Hearing it in play: the play-through demo (built 2026-11-15)

The real game cannot play the ghost's voice yet: the ghost engine, the party game and the speak service are not built. `pnpm voice-demo` starts a stand-alone page (`http://127.0.0.1:8780`, this machine only, read-only, no model, no spend) that plays the **real Library audio** with the **real character art** in the order a game would say it, so the voices can be judged in context:
- **Who:** the Whisper (Pippa), Mr. Ashby the Keeper (Ronald) and the six Suspects (the Lodger, each in their own voice). Whoever speaks is on screen as a still portrait (`docs/story/art/cutouts/color-<id>-head.webp`) with a glow; the Keeper's and the Suspects' lines are voiced too now that the whole Library is rendered.
- **Lip-synced clips:** the 17 talking-head clips (`docs/story/art/clips/`) play instead of the still on the lines they were made for (nine bank lines, the six confessions, each only for its own Suspect and line, and two made for the demo video only), with their own audio, a separate render that sounds slightly different from the Library. A checkbox turns them off. Every other line, about 500 of them, has no video (a clip is about $0.25 each); it shows the still.
- **Sessions:** a Wander with the Whisper or with the Keeper as the ghost; a party round where the haunting wins (a Suspect stalls, a wrong Accusation, the player joins the haunting, midnight); a party round that is solved (the Suspect confesses in a clip, the Keeper closes). Buttons play one line of each kind in the current context (weather, time, moon, direction, distance, player, room, Suspect).
- A line with a name in it is cut where the speech code cuts it: the spoken part plays, and the sentence with the name appears in italics, "shown, never spoken". A blackout darkens the screen. A combination with no audio is reported as a hole, never hidden.
- **Layout (phone first):** the stage first (HUD, round portrait, nameplate, dialogue), a transport bar that stays in reach (Back, Pause, Next, Stop, Sound, Director), a scene strip with "Up next", and the Director (stories, moments, the world, settings) as a bottom sheet on a phone and a side panel from 900 px. A title card carries the content notice ("Quiet, dim, may flicker") and is the click that unlocks the sound; it says "Loading the Library…", stays disabled until it is ready, and says so if it fails. Every control is at least 44 px; Space, the arrow keys, R, M and Esc work; one polite live region announces each line and what the HUD did ("Memory 1 of 3 found", "The Haunt rises to 3 of 10. A Haunt Event fires at 3"); all motion stops under `prefers-reduced-motion`. The words appear as they are spoken, and a line can be said again (R).
- **HUD:** only what the rules give: three memory lamps; a compass and three distance bars for a hint; the Haunt with its maximum of 10 and marks at the Event levels 3, 6 and 9; the players, whose hour it is, and who has joined the haunting. A change pulses once.
- **Look:** the demo is built from the design system (`design/`, spec `.kiro/specs/design-system/`): its colours, sizes, gaps, corners and times are tokens in `design/tokens.json`, and every piece of it is a shared `ui-` element in `design/elements.css`; its own style says only where things go. Every element and token is on one page, `/design/` (run `pnpm voice-demo`), and the demo is the visual reference for every later screen. The scheme: a black page, dark brown panels in four steps of depth (page, panel, raised, hovered) and a leather brown for strong lines. **Yellow is the main colour** (the title, the one solid main button, the sliders, the focus ring, the HUD, the Keeper, the edge of a story card); **green is a rare accent** (the Whisper's light, glow and name, and the tick box); cream for text and for a Suspect. The stage is lit by whoever speaks, in their colour. The portrait, the still and the clip are all round. The browser's own scrollbars and menus are dark (`color-scheme`). **Fonts** are self-hosted in `design/fonts/` (no third-party request), as `.kiro/steering/visual-style.md` asks: IBM Plex Mono for the interface and Newsreader for what the ghost says (both SIL OFL 1.1, from `@fontsource`, checked against the npm registry's sha512). Black, cream, yellow (`--lantern`), green (`--ghost`), grey (`--dust`) and red (`--alarm`) keep the steering values; the browns and the quiet-text grey `--ash` (the steering `--dust` is under the 4.5 to 1 the steering file asks for, so it is for shapes only) are now in the token file and the steering file too.
- **Safety:** it serves audio only by a hash the manifest names, a portrait only by character id and a clip only by a name in a fixed list of 17; GET and HEAD only; 127.0.0.1 only. The art and the clips are not in git, so on another machine the demo shows an orb and plays audio only. 55 tests cover the logic against the real Library, the HUD, the accessibility rules, the wiring of the script to the page, and the server's rules (the look is tested in `tools/test/design-tokens.test.mjs` and `design-system.test.mjs`, 36 more); the page itself was driven in a headless browser (stills, clips, switching mid-line, no errors), which found two bugs the tests could not.
