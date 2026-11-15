# Voice Library tool: plan (draft, 2026-11-15)

Status: **plan for Dan to change; nothing here is built.** It turns `ghost-voice` tasks 2.18, 2.19, 3.11 and 3.12 into steps, with the Lodger's six voices as the first thing to render. Requirements 1.8 and 1.9, Property 14, and the "Reuse and pre-generation" rules in `.kiro/specs/ghost-voice/design.md` are the source; where this plan adds something, it says so.

## What the Library is

Audio for every **spoken, scripted** line, rendered once ahead of time, kept under `speech/lib/v1/<hash>` with no expiry, and played with no ticket, no paid call and no quota (so the zero-quota Gallery path sounds like the real game). The key is made from the voice and the plain spoken text only: `canonicalSpeechKey(voice, text) = JSON.stringify([voice, normalise(text)])`, then SHA-256 hex (`ghost-voice` design, "Speech cache"). A Steering Tag is never in the key; the tag is a fixed function of the Speaker.

## What gets rendered, and what it costs

| Bank | Spoken kinds | Voices | Files | Characters sent | About |
|---|---|---|---|---|---|
| **The Lodger** (`docs/story/lodger-lines.md`, exists) | `stall` (5 lines), `confession` (6 lines) | Mark, Conrad, Arjun, Chloe, Eleanor, Victoria | 11 x 6 = **66** | 1,159 per voice with the tag, **6,954** in all | **$0.17** |
| The Whisper and the Keeper (`ghost-lines.md`, `party-lines.md`, **not written yet**) | many, with the finite placeholders expanded | Pippa, Ronald | about 300 lines | about 27,000 (the design's estimate, not measured) | about $0.70 |
| **All** | | | | | **about $0.90** |

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

**Default is a dry run.** It prints a table (voice, files missing, characters, estimated cost) and stops. Nothing is spent until the owner adds `--render` and a budget.

| Flag | What it does |
|---|---|
| `--dry-run` (default) | List the missing keys, the count and the estimated cost. |
| `--render --budget-usd 0.25` | Render the missing keys. Stop before the estimate passes the budget. A budget is required. |
| `--voice Chloe` | Only one voice. |
| `--takes 2` | Render two takes per line so the owner can pick (see "Takes"). Costs twice as much. |
| `--reel` | Build a listening reel per voice (spoken name, then each line, same loudness), so the owner can hear all of it. |
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
- **Checks on every file:** not empty, a valid MP3 header, a length between 0.8 s and 12 s (the longest Lodger line is about 10 s), not silent. A failed file is not uploaded.
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
- **Real R2 from `wrangler dev`** was not tried; the plan allows a plain upload step instead.
- **The bucket.** `api/wrangler.jsonc` has one R2 bucket, `hauntology-worlds` (binding `BUCKET`), with an hourly cron that deletes uploads past 24 hours and worlds past 7 days. The speech keys use the prefixes `speech/v1/` (30 days) and `speech/lib/v1/` (never). **Confirm the cron only touches its own prefixes**, or use a separate speech bucket.
- **The Aura-2 fallback is not pre-rendered.** A Library miss falls through to the cache, then a paid call.
- **Clip audio is not Library audio.** The 17 avatar clips were made from separate renders, so they sound slightly different from the Library files. Only matters if the product ever plays a clip with Library sound.
- **Losing R2** costs a re-render, about $0.90 for everything. Keep the tool and the manifest in git, and the audio only in R2.

## Decisions for Dan

1. **Bucket:** reuse `hauntology-worlds` with the `speech/` prefix (matches the spec), or make a separate `hauntology-speech` bucket (cleaner lifecycle rules)? I lean to the separate bucket if the world cron is blunt, otherwise the shared one.
2. **Banks as data:** is the markdown the source of truth with generated TypeScript (my proposal), or should the TypeScript be the source?
3. **Takes:** one take per line (cheaper, faster) or two and pick by ear?
4. **Render way:** B (local Worker) as recommended, or A (admin route)?
5. **Who renders:** you run `--render` yourself with your login (the spec says the owner runs it), or I run it for you inside this setup?
