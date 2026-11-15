# Hauntology implementation plan

Written 2026-11-14. Submission target **Thu Dec 3**. Hard deadline **Fri Dec 4, 14:00 PT**. Kiro credits must be requested by **Tue Dec 1, 12:00 PT**.

This plan orders the existing specs. It does not replace them. Task numbers refer to `.kiro/specs/<spec>/tasks.md`.

## Stack (decided)

| Layer | Choice |
|---|---|
| Web | Vite, React, three.js, `@sparkjsdev/spark`, `three-mesh-bvh` |
| API | Cloudflare Worker, Hono |
| State | Durable Objects: `SpendGuard`, `WorldJob`, `PlaySession`, `PartyRoom`, `PartyDirectory` |
| Blobs | R2 |
| AI | All on Cloudflare: Workers AI binding (`env.AI`) and Cloudflare Images, behind one `WorkersAiClient` in `api/src/guarded/workersai/` with `SpendGuard` tickets. No AWS. |
| World | World Labs Marble API |

AI models (all on Cloudflare):

| Job | Model | Variable |
|---|---|---|
| Sketch to photo, portraits | `flux-2-klein-9b` (fallback `flux-2-dev`) | `IMAGE_MODEL_ID` |
| Sprite cut-out | Cloudflare Images `segment=foreground` | none |
| Narration, place brief, photo moderation (image in) | `llama-4-scout-17b-16e-instruct` | `GHOST_MODEL_ID` |
| Moderation of free text (ghost detail, nicknames, Zone names) | `llama-guard-3-8b` | `GUARD_MODEL_ID` |
| Ghost voice (speech): three characters (Whisper = Pippa, Keeper = Ronald, Lodger = Mark, Conrad, Arjun, Chloe, Eleanor or Victoria by Suspect) | `inworld/tts-2`, fallback `@cf/deepgram/aura-2-en` (MeloTTS is retired on 2026-11-20 and not used) | `VOICE_TTS_MODEL_ID`, `VOICE_TTS_FALLBACK_MODEL_ID` |
| Listening and the Stitch word check | `openai/whisper-large-v3-turbo` | `VOICE_STT_MODEL_ID` |
| Real weather, hour and moon | Open-Meteo (not Workers AI) | `WEATHER_BASE_URL`, `CONDITIONS_ENABLED` |

Model IDs are unverified. Spike A confirms the exact strings and input shapes before any code depends on them.

## Spec status

Done on 2026-11-14: the Bedrock and Nova wording is gone from every spec, steering file and doc. `grep -ri bedrock .kiro/specs` finds nothing.

Still open:

- **Web shell spec** (`.kiro/specs/haunwallker`): requirements, design and `tasks.md` (57 tasks) are written. Groups 1, 2, 4, 5 and 6 (shared pure logic with Properties 1 to 11, fakes and demo mode, the shell infrastructure: API client, quota store, router, error boundaries, live region, offline banner, security headers, logger, lint rules and tokens, the Home and Gallery screens, and Play and the Ending with a stand-in Viewer; only live mode, 6.7, is left) are done; group 3 has its routes (3.1) and the access contract suite (3.2) done, and 3.3 waits for the real routes. The Screens of groups 7 to 9 are stand-ins. It also owns `world-pipeline` tasks 10.1 to 10.4 (photo picker, sketch pad, confirm screen, progress screen).
- **Amendment E, AI part** (applied 2026-11-14): all AI runs on Cloudflare. Llama 4 Scout does text and vision (narration, place brief, photo moderation), Llama Guard 3 checks free text, FLUX.2 klein 9B makes images (FLUX.2 dev is the fallback), Cloudflare Images `segment=foreground` cuts out sprites. `AIClient` is now `WorkersAiClient` in `api/src/guarded/workersai/`. New vars `GUARD_MODEL_ID` and `IMAGE_MODEL_ID`. Applied to steering, the spend-guard hook, the guarded-ai power, world-pipeline, ghost-creator, ghost-engine, the party-mode tasks and these docs. Spike A verifies every model id and number before code depends on it. No shell code changed.
- **Master amendment** (applied 2026-11-14; it replaces Amendments E, F, G and H and assumes A to D): seven specs, 287 criteria and 124 properties as the amendment states, then 125 after the balance changes below. New specs `conditions` (23 and 11) and `ghost-voice` (24 and 12). `party-mode` is 108 and 54 (Requirements 12 to 20, rewritten 11 and 12), `world-viewer` 31 and 12 (`setAtmosphere`, tilt to look). Amendment C was not in the repo and was rebuilt from E's summary; the master amendment then settled the open parts: Cues are creak, whisper, bell and laugh as sound files, Poltergeists can also Nudge and gain Resolve, Spike numbers are 1.5 to 1.9. I added two things on my own, open to review: at most one Spook in any four consecutive Turns (one per Round alone gives 40% of Turns Spooked at two Players in the worst case), and the 16-or-guardian tick in the Stitch question. Not decided and chosen by me: Bots never Nudge, Cue, Frame or Rattle; the hour strike is on by default; `CONDITIONS_ENABLED` defaults to true. Not applied: the landing page (not in this repo). `shared/src/errors.ts` gets the party codes in party task 2.71, and the shell's `QuotaSnapshot` gains `stt` and `live`.
- **Balance changes** (section 9 of the master amendment, applied on your go-ahead, 2026-11-14; **superseded in part by the Multiplayer rules amendment below**: the default Haunt maximum is back to 10 and the "tipping Player" rule and its Property 54 are gone, replaced by no winner for a wrong guess; the Quick preset and the Nudge counters stand): the default Haunt maximum is 8 (options 8, 10, 12) and a Quick preset adds 45 s Turns and a maximum of 8 (11.1, 12.5); the Player whose wrong Accusation or lost Turn takes the Haunt to its maximum is not named a winner with the haunting, with Property 54 (6.5); accepted Nudges are counted for haunting Players and for everyone else, shown on the ending screen, and Spike 1.5 decides about separate Nudge tokens from them (12.4; the amendment called it 12.7, but Requirement 12 has five criteria, so I put it in 12.4 and the criteria total stays 287). Choices I made, open to review: when the tipping Player is the only Poltergeist the haunting still wins and the winners list is empty; the rule covers only the Haunt-maximum ending, not the "every Player is a Poltergeist" ending; a preset sets only the fields it names, so choosing Classic after Quick does not put 60 s back.
- **Multiplayer rules amendment** (also lettered E, applied 2026-11-14; the master amendment's own Amendment E is the earlier one, so call this one by its date): party-mode Requirements 4.4, 5.1, 6.1 to 6.6, 9.2, 11.1 to 11.5, 12.5 and 13.2 follow its text, with sealed Accusations revealed together at the end of the Round (correct ones share the win), a wrong guess never wins (the house wins and no player does), a first player that rotates, the answering player choosing which card to show (10 s, default a card already shown), Eavesdrop learning one named card that was not shown, Cold Spot blocking Suggestions only, a notebook grid with optional auto-crosses, Bots that reason from the public log (Standard seals when certain, Gentle at 50%), and a Most Haunting award for players who joined the haunting. Classic is 60 s and Haunt maximum 10, Gentle 90 s and 12, Quick 45 s and 8. party-mode is now 112 criteria and 58 properties (Property 54 is replaced; 55 to 58 are new), and the seven specs total 291 criteria and 129 properties before D1 below. Its section 10 decisions are taken at their defaults: D1 Single player stays a memory walk (the landing page's promise of "work out by whom" is not met by it; making it the one-screen game with Bots is the amendment's recommendation and is not specced), D2 a wrong accuser is not shown the Solution, D3 wins are shared with a First Detective title, D4 no Ghost mode, D5 prints wait. **Where I went beyond the text, open to review:** (1) 5.1 keeps the old spawn-point clause that the amendment's wording drops; (2) 12.5 keeps the rule that no Cue, Nudge or Frame calls a model; (3) 4.6 now allows Inspect under a Cold Spot (the amendment's E8, which names only 11.2); (4) 11.5 adds each Player's Hand size to the Public View, because the rules call it public and the Bots use it; (5) 13.2 is a new criterion, since Requirement 13 had only one, and 11.6 is new too; (6) the Turn Clock stays paused for the answer and for the 15 s after it, and when that window ends the Turn ends with no Haunt rise (the amendment does not say); (7) a Haunt Event fires at once when a lost Turn reaches 3, 6 or 9, and at Round end for the reveal and Round rises; (8) `scarePoints` takes the Frame and Rattle reveal list as well as the log, because senders are secret until the end; (9) a First Detective tie shares the title; (10) the Stitch rule "never during an Accusation" now reads "never during the end-of-Round reveal"; (11) the amendment's task numbers 2.99 to 2.103, 4.17, 8.x and 9.27 already existed, so the new tasks are 2.107 to 2.111, 4.22, 8.14 and 9.23. The balance numbers in the amendment come from perfect note-takers, so playtest before fixing the Haunt maximum and the presets; the landing page's table demo still uses the old rules and is not in this repo.
- **Single player as the one-screen game (D1, applied 2026-11-14)**: the memory walk is now called **Wander**, and "Single player" in the specs means Wander. Playing alone is **Play a case**: an ordinary Party Room on one screen with the visitor as Master and two to five Bots, with no phone and no account (party-mode 9.5, 9.6, `soloSetup`, Property 59, tasks 2.112, 2.113 and 8.15). The shell gets Requirement 13 (Haunt offers "Play a case" and "Wander", a setup card, a Case Screen at `/case/:worldId`, `flags.partyEnabled`) and a new group 12 of tasks, built on 2026-11-14 (see the next bullet). Choices of mine, open to review: the name "Play a case" and the preset label "Relaxed" for Gentle; the default is Classic with two Standard Bots, which the amendment recommends for one laptop but which Bots usually win in five to six Rounds, so a first-time solo visitor may prefer Relaxed; Nudges, Frames, Rattle, the light bar, Stitch and the Spirit lens are absent in a solo case because they need a second human; spoken narration is off by default; a reload ends the case and nothing is restored; the visitor's own created ghost is not added as a Suspect. The criteria and properties of the seven engine specs are now 293 and 130, and the shell spec has 77 criteria.
- **Shell group 12, Play a case (built 2026-11-14)**: the `case` route (`/case/:worldId`, guarded like Haunt, no ghost needed), `flags.partyEnabled` (`PARTY_ENABLED` through `GET /api/session` and `FakeApi`), `PlayChoice` ("Play a case" and "Wander" with their lines), the setup card, the Case Screen with Exit, "Play again", Home and Gallery and the scripted indicator, and Play renamed Wander. The party Host page does not exist yet, so the Case Screen mounts a **Host seam** (`mountHost`, `HostToShell` messages) with a stand-in, the way Play mounts the Viewer; party task 8.15 plugs the real page in. Shell tests: shared 231, api 36, web 299; the new code was mutation-checked. **Choices of mine, open to review:** (1) Haunt is still a stand-in (group 9), so it hosts `PlayChoice` once `GET /api/worlds/:id` says `ready`; (2) "Wander" is off with the reason "Choose a ghost first." until a ghost is chosen, because the Play route needs one, while a case needs none (task 9.2's "when a ghost is chosen, offer both" and Requirement 13.1's "when a world is ready" disagree, and this follows 13.1); (3) the Host is told the sky the visitor chose on Haunt, when there is one; (4) Exit goes back to Haunt (the setup), and Home and Gallery are offered at the ending; (5) a Host that cannot load or make a Room is treated as a refusal, not an error screen; (6) a too-small place stays off for the visit, any other refusal is shown once and the case is offered again the next time Haunt opens (otherwise a "no room free, try in a minute" would disable the action until a reload); (7) the Home premise now reads "Draw or photograph any place. Wander it and meet whoever is still there, or solve it as a case." and there is a fourth fact about a case; (8) `App` accepts an optional `memory` so tests can start a visit with something in it.
- **Shell group 9, the Haunt screen (built 2026-11-15)**: the Stage display (`HauntController`, `StagePanel`), the ghost choice with a Creator seam and a stand-in Creator, the optional "Set the sky" card, "Delete my place" on Haunt, Play and the Ending, and the resume test. New: `ShellApi.ghostPresets`, `PlatformKit.loadCreator`, `locate`, `now` and `scheduler`, `router.clearPlace`, six demo preset sprites under `web/public/demo/ghosts/`. Tests: shared 248, api 36, web 358; the new code was mutation-checked. **Choices of mine, open to review:** (1) the 15-minute "taking long" count starts when Haunt opens, because `GET /api/worlds/:id` gives no start time, so a reload starts it again (adding `createdAt` to the world status would fix it); (2) the shell expects `GET /api/ghosts/presets` to return `[{id, name, spriteUrl}]`, while the `ghost-creator` design returns whole profiles, so one of them needs a small flattening, and the contract suite (task 3.3) should pin it; (3) the Creator is a seam with one message, `chosen`, on the assumption that it stores the profile with the API under the world, which the ghost-creator and ghost-engine specs should state; (4) "Try again" on a failed place goes to the Confirm Gate, because `ShellApi` has no retry call, and lands on Create when no image is picked; (5) the visitor's own place is told apart from a Gallery place by the public Gallery list, and "Delete my place" is not shown until that list is known; (6) a reload on a failed place goes to the Gallery, because `resumeTarget` sends a failed world Home and the guard then refuses its address (noticed, not changed); (7) "Delete my place" leaves for Home before it forgets the place, so the Play screen can release the Viewer first; (8) `PlayMemory.suggestedDay` is read by the sky card and set by the photo picker, which is task 7.1.
- **Shell group 7, Create (built 2026-11-15)**: the photo picker, the Sketch Pad, the candidates and the hand-off to the Confirm Gate (`CreateController`, `PhotoPicker`, `SketchPad`, `Candidates`), the pure rules in `shared/src/app/photo.ts` and `sketch-pad.ts`, and two seams (`PhotoKit`, `SketchSurface`) in the platform kit. It also lands `readCaptureDate` (`shared/src/conditions/exif.ts`, with its Property 9 test) and `timeOfDay`, which belong to the `conditions` spec (tasks 2.12 and 2.13, now ticked), because the picker needs them and nothing else had built them. **Choices of mine, open to review:** (1) `validateUpload` is not built, so the picker checks type, size and pixels with its own `photoFileError` and `photoSizeError`; the server still decides; (2) the re-encode is always a JPEG (a see-through PNG is laid on white), tried at 0.92, 0.8 and 0.65 until it is within 10 MB; (3) a photo is shown and not sent until the visitor presses "Use this photo", so choosing a file uploads nothing; (4) a caption is optional but, if there is one, must be 3 to 200 characters, which is `world-pipeline` 2.3 read as "when given"; (5) the pad keeps 50 undo steps, and clear is a step that can be undone; (6) the capture date is read only from a JPEG, from its first 64 KB; (7) a rate limit on a render or an upload holds the controls for the advised time; (8) the page title and heading stay "Make a place". `readCaptureDate`'s mutation run left three equivalent mutants (the length check, the truncated-segment check and the 16-bit bounds check), each backed by another guard that gives the same result.
- **Shell group 8, the Confirm Gate (built 2026-11-15)**: `ConfirmController` over the unchanged `confirmReduce`, the Confirm screen, the Turnstile seam with a real loader and a demo stand-in, and demo placeholder pictures. Tests: shared 288, api 36, web 498; the new code was mutation-checked. **Choices of mine, open to review:** (1) the Turnstile site key comes from the quote (`QuoteResult.turnstileSiteKey`), because no spec says where the browser gets it; the `world-pipeline` quote route must return it when it asks for a check, and the contract suite (task 3.3) should pin it; the alternative is a build-time `VITE_` variable, which can disagree with the Worker's secret; (2) "Pick another place" goes to the Gallery and "Back" to Create, which is how I read "Create or Gallery" in 3.6; (3) "Enter this place" is also off when the quote itself says no place is left, so a visitor is not offered an action that cannot work; (4) after a place is made the quota is asked for again, so Home shows the new count; (5) the picked image stays after a world is made, so a failed place can "Try again" from the Gate; (6) the page policy was left as it is (`script-src` and `frame-src` for Cloudflare only when Turnstile is configured); whether the widget also needs `connect-src` or `style-src` is unverified and belongs to a spike with a real site key; (7) the demo gets a placeholder drawing for the pictures it makes up (`/demo/uploads`, `/demo/candidates`, `/demo/worlds`), served by a development-only Vite plugin, so Create, Confirm and Haunt show a picture and not a broken one. The mutation run left two equivalent mutants: the `created` half of "buttons are off while a place is made" (that state is left at once, so no one sees it), and the `live` check before a Turnstile widget is drawn (a widget that arrives after the Screen has gone finds its container gone, which the other check catches).
- **Shell group 10, tests and manual checks (2026-11-15)**: 10.1 and 10.2 are done; 10.3 and 10.4 are only partly done. **Done:** a matrix test of all nine Screens, main and failure path, with focus and announcements (`web/src/app/screens/screens.test.tsx`), which found that Play and the Ending showed a failure without saying it aloud (fixed); a bundle test that builds the shell for production and reads it (`web/checks/bundle.test.mjs`, run by `pnpm test`), which found that the demo assets were shipped to any output folder but `dist` (fixed in `web/vite.config.ts`); the contrast check, recorded in `docs/spikes/shell.md`. **Written, not run:** the Playwright smoke run (`web/playwright.config.ts`, `web/e2e/zero-quota.spec.ts`), because `@playwright/test` is not a dependency and adding one needs the owner's say; the `wrangler dev` half waits for task 3.3. **Needs a person:** the keyboard-only run, the 320 px check, the iOS Safari pad check and the screen-reader pass, written out as steps in `docs/spikes/shell.md`. **Noticed, not mine:** another session added puzzle error codes to `shared/src/errors.ts`, so the shell's `errors-copy` tests failed until that session adds their copy.
- **Choices the spec writers made, for you to review** (each is marked in the spec itself):
  - `world-pipeline` Spike 1.1 (me): not run, because it needs a World API key and credits (the key on this machine is for the Atlas CLI, a different product). The documentation says what the asset fields are, that the pose can come from `semantics_metadata`, that overage is allowed (so keep the prepaid balance small and rely on `SpendGuard`), and that a world can be deleted upstream. For you to decide: send the photo inline and delete the upstream world after ingest, so the photo's copy goes too. See `docs/spikes/1.1.md`.
  - `world-pipeline` 7.3 and 3.14 (me): the manifest's pose comes from the service's documented frame and scale (half turn about x, `metric_scale_factor`, floor at minus `ground_plane_offset`, spawn 1.6 m above it; a placeholder when it reports nothing), read from the documentation and not yet seen in a viewer; one file is refused above 150 MB; a refused optional file is left out but a rate-limited or failing one makes the job retry the whole ingest; `world.json` is written last; file names are made from role, level and format. All three splat levels are copied (`full_res` last). The reading of the service is written (`HttpWorldLabs`) from the documentation and not confirmed by a run (Spike 1.1). Marked on 3.14 and 7.3 in the spec.
  - `world-pipeline` 5.1 and 3.2 to 3.4 (me): uploads strip metadata by removing whole segments or chunks, never re-encoding, so the pixels are exactly what was sent (JPEG: every APPn but three tiny ones, and comments, wherever they are; PNG: all but the chunks the picture and its colour need; WebP: EXIF, XMP and unknown chunks); an animated WebP is refused; a side over 8192 px answers `upload_too_large`; a request may be 16 MiB in all though one photo may be 10 MB (Worker memory); the route exists only where a world can be made and not while worlds are closed; there is no per-visitor upload limit yet, so a Cloudflare rate-limiting rule on `POST /api/uploads` is the stop-gap; and a stored photo is refused by the Quote until the Place Brief check (5.4) marks it safe, so 5.4 is needed before an upload can make a world. Marked on 5.1 and 3.2 in the spec.
  - `world-pipeline` 7.1 (me): the job starts at once and works on alarms; the wait after a rate limit or a fault doubles from 20 s to 120 s; a client error fails the job and a 402 also closes worlds; deleting a world whose job has not asked the service for anything gives the unit back, otherwise the unit stays spent (the service may have charged); the name sent upstream is the world's id; the real World Labs adapter (`api/src/guarded/worldlabs-http.ts`) is written from the documented shapes and tested over the documentation's examples, not confirmed by a run (Spike 1.1); a start that times out or fails with a 5xx is retried and may be charged twice (the service has no idempotency key); the Worker uses it only when `WLT_API_KEY` is set and every setting about the service is acceptable (a model not on the list, or a base that is not the real host or loopback, turns world making off rather than guess), so with no key nothing changes: `/start` answers 503, create says `world_gen_disabled` and Home shows worlds closed; wiring it found that the job passed the image store's lookup type (always octet-stream) to the service, now the stored type; a real run waits for your key (Spike 1.1) and for uploads (5.1), since nothing stores a Place Image yet. Marked on 7.1 and 6.1 in the spec.
  - `world-pipeline` 4.1 (me): the per-address daily cap is off unless `<METER>_IP_DAY_CAP` is set (the design names it and gives no variable); a day is a UTC day; a unit counts against its Session for 8 days after its last reserve and committed units are never given back; the kill switch stops worlds only; the object uses its own clock; a settled ticket is remembered 48 hours; the room scope from the `ghost-voice` design is not built. Marked on 4.1 in the spec.
  - `world-pipeline` 6.1 (me): a world's id is an HMAC of the Session id, the picture's key and an attempt number, so a repeat request finds its world; dedup is per Session (a world is private to its Session); a token that started a failed world returns it and a new Quote tries again, up to 8 times; `GET /api/images/:id` is the picture's address; a world cannot be made until the job starter (7.1) exists. Marked on 3.10 and 6.1 in the spec. `wrangler` 4.162.0 wants `@cloudflare/workers-types` ^5; the repo is on 4.20241218.0 and was not changed.
  - `conditions`: temperature bands at 0, 10, 20 and 28 degrees; wind bands at 12 and 29 km/h; particle caps 1200, 400 at low quality and 120 under reduced motion; dawn 5 to 7, day 8 to 17, dusk 18 to 20, night 21 to 4; city search limited to one a second and 30 an hour per session; the "at most 12 ambient loops" is read as six weather classes by day or night; the narrator names a star through a fixed scripted line, not the model prompt; the star catalogue licence is unconfirmed (avoid share-alike lists).
  - `ghost-voice`: day caps `VOICE_TTS_DAY_CAP=1500` and `VOICE_STT_DAY_CAP=750` are not in the amendment (the old `TTS_DAY_CAP` and half of it); **confirmed by the owner on 2026-11-14**; the `live` meter counts 10-second slices (30 a session, 180 a day); a line over 240 characters is spoken only to its last sentence end that fits, and the subtitle shows all of it; a cache hit takes no ticket and is not one of the 40; the word check must hear exactly the asked word; the ten starter Stitch templates are the writer's, **reviewed and kept by the owner on 2026-11-14**; Stitch is on in config by default and the Master switch is off, so use `VOICE_STITCH_ENABLED=false` for a public launch until you have taken advice; clips travel on the seat's own WebSocket and never touch a route, R2, KV or a log; multiplayer audio plays on the Host only.
  - Me: the hour strike is on by default, a stitched line does not count toward the 20 spoken lines, Bots never Nudge, Cue, Frame or Rattle, and the shell reads two voice flags (`voiceEnabled`, `liveEnabled`) from `GET /api/session`.
- **TTS**: superseded by the `ghost-voice` spec (Inworld TTS 2 with Aura-2 English as the fallback, three Speakers, and the `tts`, `stt` and `live` meters). The characters and voice picks are in `docs/story/CHARACTERS.md`.
- **Party contributions**: party requirement 3 now has Photo Prompts (three offered, up to three skips, framed in the world). The earlier relic-sketch idea (a hidden personal photo that is deleted after generation) overlaps it and is not decided.
- **Security gaps** from the reviews: play-session ownership, sketch-select ownership, own-world read and delete ownership (the shell design assumes it, see "World access" in `.kiro/specs/haunwallker/design.md`). The contract suite for it is written (`api/src/contract/world-access.ts`, shell task 3.2). **Since 2026-11-15** own-world read, asset and delete ownership is enforced in `api/src/routes/worlds.ts` and the suite passes against it over an in-memory store (shell task 3.3, in part); play-session ownership waits for `ghost-engine` 5, sketch-select ownership for `world-pipeline` 5.3, and the suite passes on `wrangler dev` with real local R2 and a real Durable Object (`api/dev/check-worker.ts`); it has not run on a deployed Worker. Also open: the `errors.ts` code list that does not match the `world-pipeline` design.

## Phases

### Phase 0: Foundation (Nov 14 to 16)
- Commit the staged repo. Push to a new GitHub repo, public, MIT.
- Finish scaffold: `api/` (Hono, `wrangler.jsonc` with DO, R2, `AI` bindings), `web/` (Vite React), shared lint and test config. (world-pipeline 2)
- Install the World Labs MCP (world-pipeline 0). Already usable from the CLI.
- **Exit:** `pnpm test`, `pnpm typecheck` and `node tools/check-traceability.mjs` all pass on an empty-but-wired repo. `wrangler dev` serves `/health`.

### Phase 1: Spikes (Nov 16 to 19), run in parallel where possible
| Spike | Question | Fallback if it fails |
|---|---|---|
| A. Workers AI and Images | Do model IDs and input shapes match? Does `flux-2-klein-9b` turn a 512 px sketch into a photo World Labs can build from? Does Scout return the brief and verdict as clean JSON? Is Llama Guard accurate on short text? Does `segment=foreground` cut out a sprite from a Worker? What is the cost per call in neurons? | `flux-2-dev` for images; else upload-only (sketch becomes a stretch feature) |
| B. Voice and weather | Is Inworld TTS 2 under 5 s for a line on a deployed Worker, and how is it billed on this account? Does Whisper take a short clip? Does Open-Meteo answer from a Worker? (ghost-voice 1.1, conditions 1.1) | Aura-2 English, the browser voice, then subtitles; the default sky |
| C. World Labs | Response fields, asset expiry, orientation, scale (world-pipeline 1.1) | Adapter per what is real |
| D. Splat in browser | Spark renders a real world on a phone at usable FPS (world-viewer 1) | Pano fallback |
| E. Party transport | DO WebSocket latency, six phones at 30 Hz (party 1.1) | Lower rate, coalesce input |

Party spikes 1.2 (iOS and Android controls, QR), 1.3 (pyramid), 1.4 (phone sound) and 1.5 (balance) wait until Phase 4.

**Gallery worlds (Nov 18 to 21).** Generate the six Gallery worlds right after Spike C, through the dev MCP (`worldlabs-dev`) and the `ingest-gallery` script (world-pipeline 9.1). This needs only the Spike C adapter and the spend-capped MCP. It does not need `SpendGuard`, the routes or `WorldJob`. Budget about $18. Nov 21 is the hard date because credits must be spent before the Dec 1 request. Hand-tune the manifests (orientation, scale, spawn, anchors) later, when the viewer runs.

- **Exit:** each spike has `docs/spikes/<id>.md` and recorded fixtures in `shared/fixtures/`. `tech.md` unverified list is updated.

### Phase 2: Single-player core (Nov 17 to 27)
This is the product. Party mode cannot ship without it.

1. **Pure logic with property tests** (all in `shared/`): world-pipeline 3, world-viewer 2, ghost-creator 1, ghost-engine 2.
2. **`SpendGuard`** (world-pipeline 4). Everything paid depends on it. Add the `tts`, `stt` and `live` meters here.
3. **Routes**: upload, sketch, brief, confirm gate (world-pipeline 5, 6). Add the ownership checks from the review.
4. **`WorldJob`** (world-pipeline 7).
5. **Tune Gallery manifests** (orientation, scale, spawn, anchors) once the viewer renders them. The worlds themselves are generated in Phase 1.
6. **Viewer** (world-viewer 3 to 6): loader, controls, collision, haunt layer, HUD.
7. **Ghost creator** (ghost-creator 2 to 4) and **engine** (ghost-engine 3 to 6): `PlaySession`, narrator, chat, journal.
8. **Ghost voice wiring** (ghost-voice 1 to 4): speech on narration lines, text always shown; the sky dome (conditions) is cheap and goes in early.
9. **Web shell** (`.kiro/specs/haunwallker`): routing, error boundaries, confirm gate UI, sketch pad.

- **Exit (Nov 27):** a visitor opens the deployed URL, picks a Gallery world, designs a ghost, walks, talks, finds three memories, and sees the memory card. Zero paid calls needed.

### Phase 3: Deploy and credits (Nov 28 to Dec 1)
- Deploy preview to Cloudflare Pages and Workers. Set secrets with `wrangler secret put`.
- **Request Kiro credits before Dec 1, 12:00 PT.** Do it Nov 28, not Dec 1.
- Phone performance pass (world-viewer 7).
- Accessibility and safety pass (world-viewer 8).
- Write-up sections 1 to 4 drafted with real evidence.

### Phase 4: Party mode (Nov 24 to Dec 2, overlapping)
Follow the cut line in `docs/PLAN.md`. Each layer must work before the next starts.

| Layer | Tasks | Target date |
|---|---|---|
| 1. Core: rooms and the Master, join, pad, deal and Residue, turns, Inspect, suggest, accuse, the Haunt, Poltergeists, Bots, scripted lines | party 2, 4, 6 to 9, 12 | Nov 30 |
| 2. Contributions: relic sketch, photo, Zone name, Suspect | party 5, 9.8 | Dec 1 |
| 3. Display: pyramid page | party 10 | Dec 2 |
| 4. Print kit: relics, QR plates, holder | party 3, 11 | runs as a parallel hardware track: designed Nov 18, printed Nov 19 to 21 (2 days), tested Nov 22. See `docs/JOURNAL.md` |
| 5. Waiting play: Cues, Nudges, phone sound, Frames | party 2.59 to 2.71, 4.14 to 4.16, 8.11, 9.14 to 9.16; spikes 1.5 and 1.6 | Dec 2, only if layer 1 is done |
| 6. Phone extras, cheapest first: the sky dome (conditions), the Spirit lens, the light bar, tilt to look (world-viewer 8), then Rattle and the Becoming, then Stitch | conditions; party 2.72 to 2.105, 4.17 to 4.21, 8.12, 8.13, 9.17 to 9.21, 13; spikes 1.7 to 1.9 | only after the Nov 27 gate and only if layers 1 and 5 are done |

If Phase 2 is not done by Nov 27, **pause party mode** and finish Phase 2 first. Solo with Bots (layer 1) is enough to demo.

### Phase 5: Ship (Dec 2 to 3)
- Dec 2: feature freeze at noon. Bug fixes only after that.
- Dec 2: record the demo video, under 3:00, beats from `steering/product.md`.
- Dec 2: finish the Kiro write-up, `docs/ATTRIBUTION.md`, README disclosure.
- Dec 3: submit on Devpost. Dec 4 is buffer only.

## Critical path

```
scaffold -> spike C -> Gallery worlds (Nov 21)
         -> spike A,C -> SpendGuard -> routes -> WorldJob
         -> viewer -> engine + chat -> shell -> deploy -> credits (Dec 1)
```

The Gallery date (Nov 21) and the credits date (Dec 1) are the only ones the contest sets. Everything else can slip a day.

## Cut order

If a date slips, cut from the top of this list first. Each item can go without breaking the ones below it.

1. Enhance (world-pipeline 11)
2. Ghost live mode (ghost-voice 6)
3. Stitch (party 18, ghost-voice 5)
4. Rattle and the Becoming extras (party 19, 2.94 to 2.101)
5. Spirit lens and light bar (party 16, 17)
6. Party Frames, House Cues and phone sound (party 2.67 to 2.70, 4.16, 9.14)
7. Party Cues and Nudges (party 2.59 to 2.62, 4.14, 4.15, 8.11, 9.16)
8. Party Resolve and Eavesdrop (party 2.55, 2.56, 4.13, 9.11 Eavesdrop part); Nudges spend Resolve, so they go first
9. Party spoken narration (party 8.8) and the ghost voice in Multiplayer; written narration stays
10. Real-world conditions beyond the default sky: weather, Memory Day, stars (conditions); the default sky stays
11. Print kit parts beyond the QR plates and one relic (party 3.6 standee, holder)
12. Display page and pyramid (party 10)
13. The ghost's spoken voice in Wander (subtitles and typing stay)
14. Party contributions: Suspect, photo, Zone name (party 5, 9.8)
15. Sketch to photo (upload and Gallery stay)
16. Party Mode as a whole, solo cases included (Wander with the Gallery stays)

In Party Mode the Haunt, Residue and Poltergeists are core and stay until Party Mode itself is cut.

Never cut: SpendGuard and the confirm gate, the Gallery path, scripted ghost lines, the content notice and Exit control, property tests for spend and privacy.

Decide at the Nov 27 gate. If Phase 2 is not done, cut items 1 to 9 at once and pause Party Mode. Build order for the extras, cheapest first: the sky dome, the Spirit lens, the light bar and tilt to look; Rattle before Stitch.

## Definition of done per task
- Tests green. A task with failing tests is not done.
- Property tests carry the `**Property N**` and `**Validates:**` lines the traceability tool reads.
- Every paid call goes through `api/src/guarded/` with a `SpendTicket`.
- Conventional commit with the task id, for example `feat(pipeline): 4.1 spend guard reserve`.

## Evidence for the write-up (collect as you go, into `docs/evidence/`)
- Traceability hook firing on a spec edit without a task
- One property test that failed, the shrunk counter-example, and the fix
- Spend-guard audit hook catching an unguarded call
- The token-planting leakage test (party Property 8)
- Spike docs, including the ones that failed
- Photos of the pyramid and printed relics, if built

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| FLUX.2 sketch quality is poor | Photo upload is the main path. Sketch is a bonus. Decide at Spike A |
| World Labs output differs from assumptions | Spike C, adapter layer, recorded fixtures |
| Credits or spend run out | Gallery, caps, kill switch, request by Nov 28 |
| Party mode eats the schedule | Cut line, and the Nov 27 gate |
| Splats too slow on phones | LOD, adaptive quality, pano fallback |
| The ghost voice is too slow or odd | Subtitles always show. Audio is optional and falls back to the browser voice |
| Write-up left to the end | Evidence folder from day one, sections 1 to 4 by Dec 1 |
| Personal photos from players | Deleted right after generation, never shown, counters only in logs |

## Open decisions
1. How Inworld TTS 2 is billed on this account and whether it is fast enough on a deployed Worker; if not, Aura-2 English is the default (ghost-voice Spike 1.1 decides). The three voices were chosen by ear on 2026-11-14 and 2026-11-15.
2. Whether `flux-2-klein-9b` or `flux-2-dev` is the image model default (Spike A decides)
3. Domain name and trademark check for "Hauntology"
4. Eligibility: Luxembourg residency confirmed by you. A written Devpost answer would still be safer
