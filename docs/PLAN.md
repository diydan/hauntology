# Internal plan (not for readers)

## Dates (all PT)
- **Dec 1, 12:00**: last time to request Kiro credits. Do it now.
- **Dec 4, 14:00**: submission deadline. Target **Dec 3**; Dec 4 is buffer only.
- **Nov 21**: Gallery worlds generated (credits must be spent before the Dec 1 request). Task 9.1, six worlds via ingest-gallery.

## Deliverables checklist
- [ ] Public GitHub repo, MIT licence (included), `/.kiro` committed (`.gitignore` does not exclude it)
- [ ] Working app URL (Cloudflare Pages + Worker)
- [ ] Public YouTube demo under 3 minutes (beats in `.kiro/steering/product.md`)
- [ ] Kiro write-up (skeleton below), started now, not on Dec 2
- [ ] Category: Frankenstein
- [ ] Code disclosure (README "Disclosure"; update if anything pre-existing is added)
- [ ] `docs/ATTRIBUTION.md` for Gallery images

## Devpost pitch (paste)
> **Category: Frankenstein.** Hauntwalk stitches together technologies that were never meant to meet: a hand-drawn sketch or old photo becomes an image with FLUX.2 on Workers AI, then a walkable 3D Gaussian-splat world via World Labs, rendered in the browser with three.js and Spark. You design a ghost, walk into the place, and talk to the ghost to find its three memories. Then play it as a same-room party game: phones become game pads and private screens, 3D-printed relics carry QR tokens, and a Pepper's-ghost pyramid shows the ghost while everyone races the clock to work out who is haunting the place. Built spec-first in Kiro with steering, hooks, a custom MCP server and 71 property-based tests.

## Naming
Check domain and trademark availability for "Hauntwalk" before publishing. No third-party game names, characters, quotes or art anywhere (app, repo, video, Devpost). Party Mode uses an original relic set and no CLUE or Cluedo names.

## Timeline
| Dates | Goal |
|---|---|
| Nov 14–21 | Scaffold, worldlabs MCP, spikes 1.1–1.3 (core), pure logic and property tests. **Generate Gallery worlds (right after the World Labs spike, done by Nov 21).** Start capturing write-up evidence. |
| Nov 22–27 | SpendGuard, routes, WorldJob, viewer core. Engine pure logic. **Party: spikes 1.1–1.3 and `shared/src/party` pure logic.** |
| Nov 28–Dec 1 | PlaySession + narrator, creator, chat UI. **Request Kiro credits.** Deploy preview. **Party: PartyRoom DO, Host and Controller pages.** Write-up sections 1–4. |
| Dec 2–3 | Polish, phone perf pass, **Party: Display and print kit if time**, record video, finish write-up, README, submit. |
| Dec 4 | Buffer. |

### Party Mode cut line
Party Mode is large. Build in this order and stop when time runs out; each layer is playable on its own.
1. **Core**: rooms and join, Controller pad, deal, turns and clock, Suggest and Accuse, Bots, scripted narration, Gallery zones (party tasks 2, 4, 6–9, 12).
2. **Contributions**: Suspect, photo and Zone name from phones (tasks 5, 9.8).
3. **Display**: pyramid page (task 10).
4. **Print kit**: relics, QR plates, holder (tasks 3, 11). The standee (3.6) is a stretch.
Property tests for a layer land with that layer.

## Spend estimate (unverified; measure in Spike 1.1)
World Labs: about $1.2–1.3 per world, $5 minimum top-up. Plan: ~14 dev and Gallery worlds (~$18) + live cap of ~20 worlds (~$26). Set `WORLD_TOTAL_CAP` to what you can afford; the Gallery covers judges if the cap is hit. Party rooms reuse an existing world (Gallery or the creator's own), so a room adds only capped image and model calls (12 and 60 per room by default). Workers AI calls are small but capped.

## Kiro write-up (fill in as you go)
Each section needs one concrete example with evidence.
1. **Specs**: how requirements → design → tasks drove the build. One design property that caught a real bug; screenshot the failing test.
2. **Property-based testing**: 71 properties across five specs. One shrunk counter-example fast-check found, with before and after code. For party mode, the token-planting leakage test (Property 8) is the best story.
3. **Steering**: a specific example from `security-and-cost.md` (every guarded call takes a SpendTicket) or `party-mode.md` (narrator takes a Public View only).
4. **Hooks**: what each of the five catches. Screenshot the traceability hook firing when a spec changed without a matching task.
5. **MCP**: the spend-capped World Labs server; a fixture it produced.
6. **What didn't work and what we'd change.** Honest reflection scores higher than a highlight reel.
Evidence goes in `docs/evidence/` as you build: hook output, a failing then passing property test, spike docs, pyramid and printed-relic photos.

## Demo video checklist
- [ ] Readable at 1080p: Newsreader serif for ghost speech, JetBrains Mono for UI chrome
- [ ] Palette on screen matches `--ink`/`--bone`/`--lantern`/`--ghost` from `visual-style.md`
- [ ] Ghost speech visible as text in every shot
- [ ] Beat sheet followed: hook 0:00, confirm gate 0:25, memory reveal visible
- [ ] Party clip ≤ 25 s: phones join by QR, relic scan, pyramid ghost reacts, Accusation resolves
- [ ] Kiro usage visible on screen at 2:30
- [ ] Under 3:00

## Spec gaps to fix before implementation reaches them
- [ ] **IDOR (real)**: `POST /api/play/start` and `GET /api/play/:id` need an ownership requirement (session scoped to the caller). `POST /api/sketch/select` needs a check that the candidate belongs to the caller's session. Party routes already scope by seat token (party Property 3).
- [ ] **SpendGuard ticket TTL (as written, no bug)**: ticket TTL is 30 min and the WorldJob poll limit is 20 min, so there is no race. The earlier note to "raise from 30 to 25 min" would lower it and is not needed. Optional: add a requirement that TTL must exceed the poll limit plus ingest time.
- [ ] **40-turn cap (already stated)**: it is in ghost-engine requirement 6.1 as well as the design. Nothing to add.

## Top risks
1. World Labs response shape, orientation and scale differ from assumptions (Spike 1.1 retires this).
2. Credits run out before judging (Gallery, caps, kill switch; request credits by Dec 1).
3. Party Mode scope. Mitigation: the cut line above.
4. Phone performance of splats (LOD, adaptive quality, pano fallback).
5. Party Spikes 1.2 and 1.3 (iOS controls, QR scans, pyramid) go badly. Mitigation: list fallback for relics, single-view Display, keyboard solo play.
6. Write-up left to the last day.
7. Multi-view enhance doesn't help (off by default; Spike 1.3 of world-pipeline decides).
