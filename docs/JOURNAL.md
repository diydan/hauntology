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
- [ ] **Spike B, voice and weather** (ghost-voice 1.1, conditions 1.1). Time a spoken line (under 4 s?), try Whisper on a short clip, call Open-Meteo from a Worker. Write `docs/spikes/ghost-voice-1.1.md` and `docs/spikes/conditions-1.1.md`.
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
