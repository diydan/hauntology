# Hauntology daily journal

Day-by-day task list, Sat Nov 14 to Fri Dec 4. Tick a box when its test is green or its file exists. Write one or two lines under **Log** at the end of each day: what shipped, what broke, what you cut. Those lines are raw material for `docs/KIRO_WRITEUP.md`.

Task ids like `party 3.2` mean `.kiro/specs/<spec>/tasks.md`. Strategy and risks are in `docs/IMPLEMENTATION.md`.

## Fixed dates

All times are Luxembourg time (CET). The contest uses Pacific time, nine hours behind.

| Date | What | Local time |
|---|---|---|
| Sat Nov 21 | Gallery worlds generated (plan date, so credits are spent before the request) | all day |
| Mon Nov 30 | Last day to start a reprint and still have it by Dec 2 (2-day print) | evening |
| Tue Dec 1 | Last time to request Kiro credits, 12:00 PT | **21:00 CET** |
| Wed Dec 2 | Feature freeze | 12:00 |
| Thu Dec 3 | Submit | morning |
| Fri Dec 4 | Hard deadline, 14:00 PT | **23:00 CET** |

## The print track (runs beside the code)

Printing needs 2 days, and the QR plates and the pyramid test need real objects. So the design work is pulled early and printing runs while you code.

```
Nov 16-18  QR plate code, relic models, build-print check
Nov 19 pm  start print batch 1
Nov 20-21  printing (2 days). You code.
Nov 22     collect, scan test on iPhone and Android, pyramid test
Nov 22-24  reprint window, if a part failed (another 2 days)
```

If batch 1 passes on Nov 22, you do not print again. Do not start any new print after Nov 30.

## Day by day

### Sat Nov 14 (today) Foundation
- [ ] Commit the staged repo. Create the GitHub repo (public, MIT). Push to a new branch.
- [ ] Confirm your World Labs **Marble** key works for `worlds:generate`. The Atlas key you used earlier may be a different product. Check the spend limit.
- [ ] Finish scaffold: `api/` (Hono, `wrangler.jsonc` with DO, R2 and `AI` bindings), `web/` (Vite, React). world-pipeline 2.
- [ ] `pnpm install`, then `pnpm test`, `pnpm typecheck` and `node tools/check-traceability.mjs` all run.

Done when: all three commands run clean on the empty repo.

Log:

### Sun Nov 15 Specs match the stack
- [x] Replace Bedrock and Nova with Workers AI in world-pipeline, ghost-creator, ghost-engine and party-mode specs. Also `README.md`, `docs/PLAN.md`, `docs/SUBMISSION.md`.
- [x] Amendment E, AI part: all AI on Cloudflare (Llama 4 Scout, Llama Guard 3, FLUX.2 klein 9B, Cloudflare Images); `AIClient` renamed `WorkersAiClient`; steering, hook, power, specs and docs updated.
- [x] Amendment E, party part (phone sound, Frames, balance limits), with Amendment C rebuilt from E's summary: party requirements 12 to 14, Properties 31 to 36, Spikes 1.4 and 1.5, new tasks. Review the rebuilt parts of C.
- [x] Master amendment applied: `conditions` and `ghost-voice` specs, party Requirements 12 to 20, world-viewer `setAtmosphere` and tilt to look. 287 criteria, 125 properties. TTS is now the `ghost-voice` spec.
- [x] Balance changes from section 9 applied: default Haunt maximum 8 and a Quick preset, no win for the Player who tips the Haunt (Property 54), Nudge counters for haunting Players and everyone else. 287 criteria, 125 properties.
- [x] Multiplayer rules amendment applied to party-mode: sealed Accusations, a wrong guess never wins, a rotating first player, the answer choice, a stronger Eavesdrop, a notebook grid, Bots on botMind, Most Haunting. 291 criteria, 129 properties.
- [x] D1 specced: Single player becomes "Play a case" (a solo Party Room with Bots on one screen) and the memory walk is renamed Wander. Shell Requirement 13 and group 12, party-mode 9.5 and 9.6 and Property 59. 293 criteria, 130 properties across the seven engine specs.
- [x] Shell group 12 built: the `case` route and `partyEnabled` flag, "Play a case" and "Wander" on Haunt, the setup card, the Case Screen on a Host seam with a stand-in Host, Play renamed Wander. Tests: shared 231, api 36, web 299.
- [x] ghost-engine 2, 3.2 and 5 built, so a reader can play a shared place: the pure engine (`shared/src/ghost/`, scripted words, no model), `PlaySession` and `PlayIndex` Durable Objects, and `POST /api/play/start`, `POST /api/play/:id/turn`, `GET /api/play/:id`, `POST /api/play/:id/reset` through the same access rule as the world routes (a game belongs to the Session that started it; a world that is unshared or deleted ends a reader's game at once; deleting a place deletes its games). The world access contract now runs its play checks on the real routes, and live, and the share-link contract checks a reader may play only while the link is on. Played to the ending on `wrangler dev` with the real objects. 75 deliberate breakages all caught (six gaps found by the first run, fixed). Tests: shared 1000, api 683. Not built: the model narrator, the conditions snapshot, the voice line id.
- [x] Checkpoints ticked: design-system 4 and 6, and world-pipeline 12. Fixed what the checkpoint found: the six transport tools were 40 px wide at 320 px (the bar now wraps, with a 44 px minimum), red text in the dialogue was 4.23 to 1 (a warning there is now text-coloured with a red edge), and a type error in `shared/src/party/server.test.ts`. Two new design tests, 11 deliberate breakages all caught. The Director's label spilling past its button at 360 to 390 px fixed too (a tool starts from its label's width; the bar's side padding 8 to 4 px): checked at twelve widths, 13 breakages all caught. Deployed `/design/` to mtest.hauntology.app as an overlay on what was live (version dc72785a; rollback ed9b2617), so `/puzzles/` stayed and the unreleased footage did not go out. A person still has to open it on a phone. All tests pass (shared 891, api 641, web 923, tools 249) and the type check is clean. The real phone was not done (it needs a deploy); the emulated phone at six sizes passed.
- [x] world-pipeline 13 done (Shared look, 13.1 to 13.4): the Create, Confirm and progress screens were already on the design elements (design-system 4.2 and 4.3); an audit and a browser check at 390 and 1280 px (17 states each: targets, one yellow button, contrast, focus ring, reduced motion) found the demo Turnstile stand-in still using the retired `button` class, and the Confirm Gate's places-left line and Back buttons not as Requirement 12.3 says. Fixed, with tests; the design test now reads `.ts` files too. Requirement 12.3 and the design table now name the elements the screens really use. 11 deliberate breakages, all caught.
- [x] world-pipeline 3.1 done (and phase 3 ticked): `shared/src/world/responses.ts` gives the one import for `WorldManifestSchema`, `QuoteSchema`, `QuotaSchema` and `JobStatusSchema`; the status now has a progress label (Requirement 7.3) taken from the Haunt screen's words; the stable error codes are pinned by a test. 22 deliberate breakages, 21 caught (the other cannot matter). Checkpoint 12 run and NOT ticked: two puzzle tests (tilt starts by itself) and one party type error fail, none in this spec's files.
- [x] world-pipeline 2 done and phases 4, 6 and 7 ticked: the Worker now serves the web app (`assets` over `web/dist`, the single-page fallback, Worker first; `servePage` keeps `/api` and `/admin` for the API, answers only `GET` and `HEAD`, puts the page's Content-Security-Policy on every page, and turns a missing file into a 404). Running the production app on `wrangler dev` found that the shell asks for `GET /api/quota`, which did not exist, so the app could not open: built (world-pipeline 5.7). Run it with `pnpm dev:app`. A share link opened cold now opens the app. Checked in a headless Chromium at 390 and 1280 px; 20 deliberate breakages all caught. Not deployed.
- [x] haunwallker 14 done (Share a place): Requirement 15 and design added first; then the `shared` route and flow field, `ShellApi.shareWorld` (fake and real), the clipboard and origin seams, the Share card on Haunt, the `/shared/:worldId` screen, Delete and Share hidden for a place opened by a link. Looked at in a headless Chromium at 390 and 1280 px (`?demo=1`): it works; one flaw found and fixed: the owner who opened their own link was told "Someone shared this place with you" (and, with the link off, was taken for a visitor), so the status now says `shared` (true or false) to the owner only and the screen has words for the owner. Tests: shared 842, web 843, api 603; mutation-checked (14 more changes, all caught). The Worker does not serve the web app yet.
- [x] world-pipeline 9.2 done: `GET /api/gallery` (the shell's `GalleryItem` array, public, no key or quota) and opt-in share links (`POST` / `DELETE /api/worlds/:id/share`; a reader with the id reads a shared ready world, only the owner changes or deletes it, off ends it). The share-link contract (`checkWorldSharing`) runs on the real routes and on `wrangler dev`; mutation-checked. The world id is 128 bits (corrected from a comment that said 132). Shell Share button and the play route for readers are still to do.
- [x] world-pipeline 8.2 done: the logging policy (`shared/src/log.ts`, `api/src/log.ts`): a closed list of events and fields, only ids, codes, counters and yes/no pass, the rest is dropped and counted; `tools/test/no-direct-logging.test.mjs` fails any other `console`; wired into an unhandled error (also fixes Hono printing the whole error and a thrown string reaching the runtime), the cron run, the operator's switch and each job step. Mutation-checked.
- [x] world-pipeline 9.1 script built (the six worlds are not made, they need your credits): `node tools/ingest-gallery/ingest.mjs --plan plan.json [--stage DIR | --upload [--remote --yes]]` checks a plan and its files, builds each Gallery `world.json` with the same `buildManifest` the real ingest uses (run from plain Node through a small resolve hook), and writes or uploads `gallery/<id>/...` (never overwrites without `--overwrite`, reads every upload back, manifest last). The manifest gained an optional `attribution`. Tested over real files and a fake `wrangler`, mutation-checked, and run end to end against a local bucket and `wrangler dev`. No paid call, no network call of its own.
- [x] world-pipeline 5.2 done: one `WorkersAiClient` makes every Workers AI and Images adapter from the Worker's bindings and model ids (each off when its binding or id is missing), and each paid call has a guarded door that needs a Ticket for its meter. New: Scout text for the ghost (`generateText`, `llm`), Llama Guard 3 for free text (`moderateText`, `llm`; only a clean `safe` passes, anything unreadable fails closed) and background removal (`cutOutForeground`, `image`; a result that kept under 1% or over 99% of the picture is refused). The pure readers are in `shared/src/world/` with property tests; the `guarded-only` test now also covers the Images binding. Not called for real (Spike 1.2, prepared in `docs/spikes/1.2.md`); no route uses the three new adapters yet.
- [x] world-pipeline 5.3 done with 3.5 to 3.7 and Properties 3 and 4: `POST /api/sketch/render` reads the sketch's PNG on the server, refuses a blank page before any call, reserves an image unit, asks the image model twice with the sketch as the reference, strips and keeps two candidates for their owner; `POST /api/sketch/select` makes the chosen one a Place Image that then goes through the check like an upload. Run on wrangler dev with real R2, the real inflater and stand-in models: sketch to ready world. No real model call yet, and the AI binding is left for you to add.
- [x] world-pipeline 4.4 done: the operator can close and open new world creation on a running Worker with `tools/worldgen-switch.mjs <worker> status|close|open`, through `GET /admin/status` and `POST /admin/kill`, which exist only when the `ADMIN_TOKEN` secret is set. Run on wrangler dev against the real SpendGuard object. Nothing is set or deployed: you choose the token.
- [x] world-pipeline 5.4 done: `POST /api/places/brief` asks a vision model for a short brief and a safety verdict (guarded call, `llm` meter, fail closed), deletes an unsafe photo, and stores the brief with a safe one so the Quote accepts it. Run on wrangler dev with real R2 and a stand-in model: upload, check, Quote, world ready with the brief in its manifest. No real model call yet, and the AI binding is left for you to add.
- [x] world-pipeline 5.1 done with 3.2 to 3.4 and Properties 1 and 2: `POST /api/uploads` takes one to four photos, checks type, magic bytes, size and sides, strips EXIF, XMP, comments and other metadata without touching the pixels (JPEG, PNG, WebP), and keeps each privately under a random id for its owner. Run on wrangler dev with real R2. A stored photo is not yet usable: the Quote refuses it until the Place Brief check (5.4) passes. No per-visitor upload limit yet.
- [x] world-pipeline 6.1 done and the adapter wired into the Worker: with `WLT_API_KEY` set the Worker passes a job starter and builds the job from the real adapter, ingest and a strict SpendGuard; without it (or with a bad model or base) world making stays off and Home shows worlds closed. Ran the real job, adapter and ingest on wrangler dev against a local stand-in of the World API (nothing paid): the key went to the API paths only, R2 held exactly the bytes served, 422 and 402 failed as designed. Fixed a bug found on the way (the picture's content type). No key set, nothing deployed.
- [x] world-pipeline 7.1 and 7.3 done: the real World Labs adapter (`HttpWorldLabs`: start, poll, read the finished world, download each file) written from the documented shapes and tested over the documentation's examples, with the pose now read from the service's frame and scale metadata. Not confirmed by a real run, and not yet wired into the Worker, so no world is made and nothing is spent.
- [x] world-pipeline Spike 1.1 prepared, not run (no World API key): the documentation read into docs/spikes/1.1.md, steering updated, and a runner with a spend cap and scrubbed fixtures written and tested against a local fake. The run itself needs your key and credits.
- [x] world-pipeline 7.3 started and 3.14 to 3.16 done: buildManifest with Properties 11 and 12, and the WorldIngestor that copies a finished world into R2 and writes world.json last, run against real R2 on wrangler dev. Reading the service itself waits for Spike 1.1.
- [x] world-pipeline 7.1 started and 7.2 done: the job state machine (3.12, 3.13 with Property 9), the WorldJob generate-and-poll on alarms with guarded calls and a starter, run on the real Durable Object alarm in wrangler dev. The real World Labs adapter waits for Spike 1.1; until then the Worker makes no world.
- [x] world-pipeline 4.1 to 4.3 built: the SpendGuard Durable Object (ledger in shared, fail-closed client, alarm, kill switch wired to the Home flags), with the two property tests; run on wrangler dev with the real object. 4.4 is partly done (the upstream 402 is 7.2).
- [x] wrangler added to api (4.162.0, with your OK); the world routes and cron cleanup ran on wrangler dev with real local R2 and a real WorldJob (found and fixed a Set-Cookie on public cacheable assets). world-pipeline 6.1 started: the Quote, create and image routes, Confirm Token and dedup key with their property tests; SpendGuard and the job starter are still ports, so the real Worker will not create a world yet.
- [x] World routes built for world-pipeline 7.4 and 8.1 (over a store port), then the R2 and WorldJob store, the Worker entry with its cron and a first wrangler.jsonc (tested over fakes; wrangler not installed, so nothing ran on wrangler dev): `GET /api/worlds/:id`, its assets with ranges, `DELETE`, `cleanupExpired` and `expiredKeys`; shell task 3.3 passes for them, play checks wait for ghost-engine 5.
- [x] Shell group 10 partly done: a test of every Screen's focus and announcements, and a production-build test. The browser smoke run is written but not run, and the manual checks wait for a person with a phone. See docs/spikes/shell.md.
- [x] Shell group 8 built: the Confirm Gate (quote, picture, places left, Enter this place), rejection and retry, and Turnstile behind a seam. Only the Gate starts a world.
- [x] Shell group 7 built: the photo picker (with the capture date for the sky), the Sketch Pad, the candidates and the hand-off to the Confirm Gate. `readCaptureDate` landed for the conditions spec.
- [x] Shell group 9 built: the Haunt screen with the Stage display, the ghost choice (Creator seam, Preset Ghosts), the sky card and "Delete my place". Tests: shared 248, api 36, web 358.
- [x] Party Photo Prompts are specced (party requirement 3.6 to 3.9, Property 30).
- [ ] Decide whether to keep the hidden-photo relic-sketch idea. If yes, spec it with the photo deleted right after generation. If no, drop it.
- [ ] Close the ownership gaps: `POST /api/play/start`, `GET /api/play/:id`, `POST /api/sketch/select`.
- [ ] Web shell spec (`.kiro/specs/haunwallker`): requirements and design are done. Write `tasks.md`.
- [ ] Run `node tools/check-traceability.mjs` until it passes.

Done when: the traceability check passes and `grep -ri bedrock .kiro/specs` finds nothing.

Log:

### Mon Nov 16 Build the dev MCP, run the first spikes
- [ ] Build `tools/worldlabs-mcp` (world-pipeline 0). Spend cap, ledger, fixture recording.
- [ ] **Spike A, Workers AI and Images** (the `WorkersAiClient` call shapes). Confirm model ids and inputs for `flux-2-klein-9b` (fallback `flux-2-dev`), `llama-4-scout`, `llama-guard-3-8b`, Cloudflare Images `segment=foreground` and `inworld/tts-2`. Try one sketch to photo and one cut-out. Record the cost per call in neurons and confirm klein 9B's zero data retention before any sketch is sent. Write `docs/spikes/A.md`.
- [ ] **Spike C, World Labs.** Generate one real world. Record the response as a fixture. Write `docs/spikes/C.md`. This costs about $1.2.
- [ ] Update the "Unverified assumptions" list in `tech.md`.

Done when: two spike docs and at least one fixture are in the repo.

Log:

### Tue Nov 17 Spikes, then pure logic starts
- [ ] **Spike D, splat on a phone.** Render the Spike C world in three.js + Spark on your phone. Note FPS. world-viewer 1.
- [ ] **Spike B, voice and weather** (ghost-voice 1.1, conditions 1.1). Time a spoken line (under 5 s?), try Whisper on a short clip, call Open-Meteo from a Worker. Write `docs/spikes/ghost-voice-1.1.md` and `docs/spikes/conditions-1.1.md`.
- [ ] Pure logic, world-pipeline 3: errors, caps, quote, world key, upload rules. Property tests with them.
- [ ] Pin the QR encoder and decoder libraries (party 1.2, desk part).

Done when: spikes B and D written, world-pipeline 3 half done with tests green.

Log:

### Wed Nov 18 Print kit design (the print clock starts tomorrow)
- [ ] `shared/src/print/`: `writeStl`, `checkMesh`, `qrPlateMesh`, `rasterTop`, `pyramidTrapezoid` with property tests (party 3.1 to 3.5).
- [ ] Six relic models in `print/scad/` (music box, wax hand, locket, planchette, silver key, bell), each with a token base. party 11.1.
- [ ] Parametric pyramid holder. party 11.2.
- [ ] `tools/build-print.mjs`. party 11.3.
- [ ] Print the test plan: one QR plate with 1.2 mm modules, and one two-colour version if your printer can.

Done when: `node tools/build-print.mjs --check` passes on all STLs.

Log:

### Thu Nov 19 Start printing
- [ ] Generate STLs for the six relics, six QR plates and the pyramid holder. Slice them.
- [ ] **Start print batch 1 this evening.** Order: QR plates first (they decide the scan test), then relics, then holder.
- [ ] Code: `SpendGuard` Durable Object (world-pipeline 4). Add the `tts` meter.
- [ ] Pick six Gallery images. Note the licence of each for `docs/ATTRIBUTION.md`.

Done when: printer is running and SpendGuard tests are green.

Log:

### Fri Nov 20 Printing day 1
- [ ] Routes: upload, sketch, brief (world-pipeline 5), with the ownership checks.
- [ ] `WorkersAiClient` in `api/src/guarded/workersai/` with ticket enforcement and scripted fallbacks.
- [ ] Write the `ingest-gallery` script (world-pipeline 9.1). Dry-run it on the Spike C world.
- [ ] Check the print once. Do not stop it.

Done when: routes pass with a fake AI and the Gallery script runs end to end on one world.

Log:

### Sat Nov 21 Printing day 2 + Gallery worlds (hard date)
- [ ] **Generate the six Gallery worlds.** About $7.5. Start as early as Nov 18, once Spike C and the `ingest-gallery` script work, and finish today. Check each in the viewer.
- [ ] Write `docs/ATTRIBUTION.md`.
- [ ] Start `WorldJob` (world-pipeline 7). Alarm-driven poll, ingest to R2.

Done when: six worlds are in R2 and open in the viewer. If one is bad, regenerate it today.

Log:

### Sun Nov 22 Test the prints
- [ ] Collect the prints. Check with `checkMesh` numbers: fit, no warp.
- [ ] **Party spike 1.2:** scan every QR plate on a real iPhone (Safari) and Android (Chrome). Note the failures.
- [ ] **Party spike 1.3:** put a clear pyramid on a spare screen. Decide tops in or out, mirror or not. Take photos for the write-up.
- [ ] **Party spike 1.4:** phone sound on a real iPhone and Android: one-tap unlock, sound with a dim screen, six phones at once, Restless at 400 ms steps, the flash fallback. Write `docs/spikes/party-1.4.md`.
- [ ] If any plate fails, fix the model and **start the reprint now** (ready Nov 24).
- [ ] Finish `WorldJob` and the confirm gate (world-pipeline 6, 7).

Done when: `docs/spikes/party-1.2.md` and `party-1.3.md` exist, and every relic has a pass or a reprint queued.

Log:

### Mon Nov 23 Viewer
- [ ] Loader and fallbacks (world-viewer 3).
- [ ] Controls and collision (world-viewer 4).
- [ ] Party pure logic starts: room code, nickname, seating, `authorize`, input (party 2.1 to 2.10).

Done when: you can walk a Gallery world with collision on your laptop.

Log:

### Tue Nov 24 Haunt layer, HUD, party rules
- [ ] Haunt layer and HUD (world-viewer 5, 6).
- [ ] Party pure logic: pool, deal, views, zones (party 2.11 to 2.22). The leakage fuzz test (Property 8) is the one to get right.
- [ ] Reprint finished? Run the scan test again.

Done when: Property 8 passes.

Log:

### Wed Nov 25 Ghost creator, turns and clock
- [ ] Ghost creator logic, presets and API (ghost-creator 1 to 3).
- [ ] Party: turns, budgets, achievements, `clockStatus`, `nextWake` (party 2.23 to 2.28).

Done when: ghost creator route works with a fake AI, and Property 13 passes.

Log:

### Thu Nov 26 Ghost engine, suggestions
- [ ] Ghost engine: pure logic, `PlaySession`, narrator (ghost-engine 2 to 4). Wire the ghost voice to the lines (ghost-voice 1 to 4). Text is always shown.
- [ ] Party: suggest, accuse, relic token, bots, Master, Residue and Inspect, the Haunt, Poltergeists (party 2.29 to 2.42 and 2.47 to 2.54). Resolve and Eavesdrop (2.55, 2.56) only if time allows.

Done when: a scripted single-player game runs through the engine with no model.

Log:

### Fri Nov 27 Single-player gate
- [ ] Engine routes and web chat and journal (ghost-engine 5, 6).
- [ ] Web shell, ghost creator UI (ghost-creator 4).
- [ ] **Gate:** a visitor opens a Gallery world, designs a ghost, walks, talks, finds three memories and sees the memory card, with zero paid calls.
- [ ] If the gate fails, **stop party work on Saturday** and finish single-player first.

Done when: the gate passes. Record a clip.

Log:

### Sat Nov 28 Deploy and credits
- [ ] Deploy preview. `wrangler secret put` for each secret.
- [ ] **Request Kiro credits today.** Do not wait for Dec 1.
- [ ] Party: `PartyRoom` and `PartyDirectory` Durable Objects (party 4.1 to 4.12; 4.13 Resolve and Eavesdrop is the first thing to cut).

Done when: the app loads on a phone over the public URL, and the credit request is sent.

Log:

### Sun Nov 29 Party Host and Controller
- [ ] Party routes (party 7).
- [ ] Host page: lobby with QR, HUD, remote input, solo with Bots (party 8).
- [ ] Controller: join, pad and panel, stick, hand and notebook (party 9.1 to 9.7).
- [ ] If layer 1 is done: **party spike 1.5** (balance simulation and three real games), then Cues, Nudges, phone sound and Frames (party 2.59 to 2.71, 4.14 to 4.16, 8.11, 9.14 to 9.16). Cut Frames and phone sound first.

Done when: one laptop plus one phone can play a Bot game to the end.

Log:

### Mon Nov 30 Contributions, phone polish
- [ ] Contributions: relic sketch, personal photo, Zone name, Suspect (party 5, 9.8).
- [ ] Phone performance pass (world-viewer 7).
- [ ] **Last chance to start a reprint.** Anything not printing by tonight will not be ready.

Done when: two phones join, each makes a contribution, and the game starts.

Log:

### Tue Dec 1 Display, accessibility, write-up (credits deadline 21:00 CET)
- [ ] Confirm the credit request was received. Fix it before 21:00 CET if not.
- [ ] Display page (party 10).
- [ ] Accessibility and safety pass (world-viewer 8, party Req 2.6).
- [ ] Write-up sections 1 to 5 filled with real evidence.

Done when: the Display shows the ghost at four angles and the write-up has no empty `[EVIDENCE]` in sections 1 to 5.

Log:

### Wed Dec 2 Freeze and record
- [ ] **12:00 feature freeze.** Bug fixes only after this.
- [ ] Record the demo video, under 3:00. Beats are in `.kiro/steering/product.md`. Include the party clip (25 s at most).
- [ ] Finish the Kiro write-up, README disclosure and `docs/ATTRIBUTION.md`.
- [ ] Run the full checks: `pnpm test`, `pnpm typecheck`, traceability.

Done when: the video is uploaded to YouTube (public) and the write-up has no tags left.

Log:

### Thu Dec 3 Submit
- [ ] Fresh phone test of the public URL, Gallery only.
- [ ] Check `.kiro/` is in the pushed repo.
- [ ] Fill the Devpost form: category Frankenstein, repo, URL, video, write-up.
- [ ] **Submit by midday.**

Done when: Devpost shows the submission as complete.

Log:

### Fri Dec 4 Buffer
- [ ] Nothing new. Fix a broken link or a typo only.
- [ ] Deadline: 14:00 PT = **23:00 CET**. Do not wait for it.

Log:

## Cut order if you fall behind

Cut from the bottom, and say so in the write-up.

1. Standee export, relic-sketch personal photo
2. Print reprints, then the pyramid and Display page
3. Contributions beyond the Zone name
4. Phone-only parties (keep solo with Bots)
5. Never cut: SpendGuard, Gallery, the single-player gate, the write-up
