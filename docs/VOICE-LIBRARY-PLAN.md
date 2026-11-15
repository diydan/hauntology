# Voice Library tool: plan (draft, 2026-11-15)

Status: **built (2026-11-15): the banks as data for the Lodger, the Whisper and the Keeper (generated from `docs/story/`), `buildLibrary` and the key functions, the manifest (503 entries) and the offline check tool; the prerender tool with dry run, `--render` (one voice at a time), `--upload` and `--reel`; the Lodger bank (66 files) and the Whisper (209 files) rendered. The Keeper's 228 files are not rendered, and nothing is uploaded or read back by the speak service yet.** The open decisions at the end are answered. It turns `ghost-voice` tasks 2.18, 2.19, 3.11 and 3.12 into steps. Requirements 1.8 and 1.9, Property 14, and the "Reuse and pre-generation" rules in `.kiro/specs/ghost-voice/design.md` are the source; where this plan adds something, it says so.

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

**Upload (built, not yet run against real R2):** `pnpm prerender-voice --upload (--voice Chloe | --all) [--bucket NAME] [--jurisdiction eu] [--yes]`. Without `--yes` it is a preview and makes no Wrangler call. With `--yes` it uses **your** Wrangler login (`wrangler r2 object put --remote --content-type audio/mpeg`), so no token is stored. A voice goes up whole or not at all. Before each file it re-checks the clip; it never overwrites (the same audio already there is skipped, different audio stops the run and prints the delete command for you to choose); it reads every upload back and compares SHA-256; one request at a time, no retries, stops at the first problem; `.voice-library/uploaded.json` records what went up. Take 1 only. It is tested against a fake Wrangler (17 tests); I did **not** run it against your account. The code is `tools/lib/prerender-plan.mjs`, `prerender-run.mjs` and `audio-check.mjs`, with 49 tests in `tools/test/`.

**Render results (2026-11-15):** the Lodger bank (66 files, about $0.145 counted: Mark first at $0.029, then the other five voices, each run capped at $0.04) and **the Whisper (Pippa): 209 files, 21,662 characters, about $0.5416 counted of a $0.60 budget**. Every file passed the checks. 275 requests in all, one at a time, with no error and no rate limit. A call took 2.6 to 6.1 s (Pippa's average was 3.7 s); clips run 6.0 to 11.9 s (Pippa's 6.2 to 11.4 s). The Keeper (Ronald, 228 files, about $0.54) is not rendered. The audio is only in the git-ignored `.voice-library/`; it is not uploaded, and only the Lodger and Pippa reels have been sent for listening (Pippa's is 46 minutes, 120 of its 209 clips being hint variants). Whether the account was billed, and how much, is still unverified (Spike 1.1).

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
- **The bucket does not exist yet.** A read-only check on 2026-11-15 (`wrangler r2 bucket info hauntology-worlds`) answered `The specified bucket does not exist. [code: 10006]`, and it is not in the bucket list. `--upload` stops there and prints the create command. **Choose the location before creating it, because neither can be changed afterwards:** a location hint (`--location weur`) or a jurisdiction (`--jurisdiction eu`, which keeps objects in the EU; the Worker binding in `api/wrangler.jsonc` then needs `"jurisdiction": "eu"` and every upload call needs `--jurisdiction eu`). This bucket will also hold user uploads and selfies, so it is the same question as the selfie EU review.
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

The real game cannot play the ghost's voice yet: the ghost engine, the party game and the speak service are not built. `pnpm voice-demo` starts a stand-alone page (`http://127.0.0.1:8780`, this machine only, read-only, no model, no spend) that plays the **real Library audio** in the order a game would say it, so the voice can be judged in context:
- **Wander:** meet, the weather, a tease, hints in a chosen direction and distance, memories found, an echo, an odd question, the ending. Weather, time, moon, bearing and distance can be set, and the matching file is played.
- **Party round:** the Whisper's Haunt Events (a blackout darkens the screen), a player joining the haunting, midnight and the haunting winning, with the Keeper's lines shown as text between them (Ronald is not rendered yet).
- A line with a name in it is cut where the speech code cuts it: the spoken part plays, and the sentence with the name appears in italics, "shown, never spoken".
- Buttons play one line of each kind; "play a whole session" runs a scripted one with a pause you can set. 18 tests cover the logic against the real Library and the server's rules; the page itself was driven in a headless browser (audio played and ended, no errors).
- A combination with no audio is reported as a hole and never hidden. It reads `.voice-library/` (the audio is never committed).
