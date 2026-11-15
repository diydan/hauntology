# Hauntology: product and technical overview

**Kiroween 2026, category: Frankenstein.** Hauntology stitches together technology that was never meant to meet: a hand sketch, a diffusion model, a Gaussian-splat world reconstruction, WebGL, an LLM ghost, phones used as game pads, 3D-printed relics and a Pepper's-ghost pyramid.

Read this with `README.md`. Everything under `/.kiro` is the source of truth for what gets built.

## The product

### Wander: walk into any place
1. **Start**: upload a photo, or draw a sketch that FLUX.2 on Workers AI turns into a photo.
2. **Confirm**: see the exact image and remaining quota, then "Enter this place?" Nothing paid happens before this.
3. **Build**: World Labs Marble turns the image into a walkable Gaussian-splat world. Meanwhile the player designs a ghost (Ghost Creator).
4. **Walk**: first-person in the browser with a gentle haunt layer (grade, fog, flicker, orbs).
5. **Talk**: a text-adventure conversation with the ghost. Find three memories: a sound, a person, a promise. The ending card is shareable.

Alone? **Play a case** instead: the same deduction game on one screen against Bots, with no phone and no account.

### Party mode: a same-room deduction game in the world you just made
2–6 players in one room. A laptop or TV only displays the world (Host). Every control lives on a phone, an installable web app that is a game pad and a private screen (Controller). The first player to join is the **Master** and runs the room: world, settings, Bots, start. An optional second screen under a Pepper's-ghost pyramid shows the ghost (Display).

- **One hidden answer**: which ghost, haunting which place, bound to which relic.
- **Everyone builds the world**: each player contributes a Suspect ghost, a photo and a named Zone; their photos hang in the 3D world.
- **Timed turns**: players walk the world on a clock, **Inspect** Zones for hidden **Residue** clues, make Suggestions, and seal one Accusation, revealed with everyone else's at the end of the Round (correct ones share the win). Achievements (visit three Zones, map all six, be quick, be persistent, survive a timeout) earn extra seconds, capped.
- **The Haunt pushes back**: a meter rises every Round, on every lost Turn and every wrong Accusation. At levels 3, 6 and 9 it fires an event (a Zone goes cold, a blackout, the ghost moves, a lull). At the maximum the house wins and no player does.
- **A wrong guess is not the end**: a Player who accuses wrongly joins the haunting (a **Poltergeist**). They keep their hand, take no turns, cannot win, and choose between the Haunt's events. Players who are waiting earn **Resolve** and can **Eavesdrop** to learn one card named in another Player's Suggestion that was not the card shown.
- **Waiting is play**: players who wait can **Nudge** the clock (Help adds 10 s, Spook removes 10 s, paid in Resolve, with limits so a Turn never drops under 30 s), play short **Cues**, and, if their owners agree, make a friend's phone creak (a **Frame**). A Frame costs nothing and changes no rule; nobody can tell a Frame from the house until the ending screen reveals every sender. Phone sound is opt-in and always has text, and the Master can pick the Gentle preset.
- **The real world and the ghost's voice**: the room can read the weather, hour, moon and stars of a place once and freeze them, so every player sees the same sky; a Bell sounds on the hour. The ghost can speak (and, alone, listen) through Workers AI. None of it changes a rule, and every line is shown as text.
- **Phones as light, lens and shake**: phones can light up in greys across the table, a Poltergeist can rattle the house by shaking a phone, and an optional private lens shows your own notebook marks around you. With every player's own yes, the ghost can whisper a line cut from short words the players recorded (Stitch); the clips never leave the room and are deleted at the end.
- **Secrets stay private**: the server deals hidden cards; each phone sees only its own hand and notebook.
- **Six original 3D-printable relics** carry QR tokens. Scanning one is how you name it in a Suggestion. Printing is optional; every scan has an on-screen list fallback.
- **Premise is "who is haunting this place?"**, not a murder. Relics, not weapons. No real people.
- **Optional spoken narration** through the browser's speech synthesis, off by default. Text is always shown.
- **Playable alone**: Bots fill empty seats; one player on the laptop's embedded pad can finish a full game with no other phones, no printer and no pyramid.

### Principles that override convenience
1. Never spend without consent. 2. Never dead-end: Gallery worlds, Preset Ghosts and scripted lines let anyone finish with zero quota and zero model calls. 3. Gentle haunting. 4. Personal photos are private. 5. Honest scope: worlds are static, the ghost is a billboard sprite, the pyramid is an optical illusion. 6. Secrets stay on the server. 7. Nothing physical is required.

## The stitch

| Stage | Technology | Role |
|---|---|---|
| Sketch → image | FLUX.2 klein 9B on Workers AI | turns a rough drawing into a photoreal place |
| Image → world | World Labs Marble API | async generation of a Gaussian-splat world with a collider |
| Render and walk | three.js, Spark, three-mesh-bvh | splat rendering, first-person movement, collision |
| Ghost design | FLUX.2 klein 9B and Cloudflare Images (portrait, background removal) | persona and billboard sprite |
| Ghost voice | Llama 4 Scout on Workers AI (words), Inworld TTS 2 (speech, three characters), Whisper (listening) | narrates directives chosen by deterministic code, then speaks them |
| The real world | Open-Meteo | the weather, hour and moon of a place, read once per game and frozen |
| Backend | Cloudflare Workers, Hono, Durable Objects, R2 | spend control, jobs, sessions, party rooms |
| Phones as pads | WebSocket to a Durable Object, touch, gyro, camera QR scan | controller and private screen |
| Hologram | four-view layout on a second screen under a clear pyramid | Pepper's-ghost centrepiece |
| Printing | parametric OpenSCAD relics, generated QR plates, STL checks | optional physical game pieces |

## Technical overview

```
Browser (Host)  ── three.js + Spark viewer ── ViewerBridge ◄── remote input
     ▲                                                          ▲
     │ PublicView                                               │ input ≤ 30 Hz
Cloudflare Worker (Hono) ── PartyRoom DO ── Private Views ──► phones (Controllers)
     │                          │            Public View ───► Display (pyramid)
     ├─ SpendGuard DO  ◄── every paid call takes a SpendTicket (api/src/guarded/)
     ├─ WorldJob DO    ── World Labs: generate → poll → ingest → R2
     └─ PlaySession DO ── ghost engine: deterministic state, model only narrates
shared/  pure TypeScript: rules, schemas, geometry, no I/O, injected clock and rng
```

Decisions that matter:
- **The engine decides, the model narrates.** All game state comes from deterministic code in `shared/`. A model call, a failure or a scripted fallback can never change the next state. This holds in Wander and in Party Mode.
- **Spend is a type-level rule.** World Labs and Workers AI are called only from `api/src/guarded/`, and each function requires a `SpendTicket` from `SpendGuard.reserve()`. Caps exist per session, per IP-day, per day and in total, plus a kill switch. Party rooms add per-room caps and one narration per public event for the whole room.
- **Hidden information by construction.** The Solution and every hand live only in `PartyRoom`. Rules return a `PublicView` or a `PrivateView`; narrator prompts accept only a `PublicView`, so a private card cannot reach a prompt.
- **Server-authoritative clock.** Turn timers run on a Durable Object alarm, so a phone going to sleep or a laptop lagging cannot change the outcome.
- **Seeded and reproducible.** Deal, zone placement, suggestion resolution and bots take a seeded rng, which is what makes the rules property-testable.
- **Pure geometry for print.** STL writing, mesh validity checks, QR relief plates and pyramid trapezoids are pure functions with property tests, so the print kit is verified without a printer.

## Specs

| Spec | What it covers | Criteria | Properties |
|---|---|---|---|
| `world-pipeline` | upload, sketch, quote and confirm, SpendGuard, WorldJob, ingest, Gallery, deletion | 50 | 14 |
| `world-viewer` | splat rendering, first-person movement, tilt to look, collision, haunt layer, atmosphere, ViewerBridge, performance | 31 | 12 |
| `ghost-creator` | Persona, portrait, sprite, Preset Ghosts, safety | 21 | 8 |
| `ghost-engine` | memories, directives, scripted and model modes, validation, caps | 30 | 14 |
| `party-mode` | rooms and the Master, phone controller, contributions, the Haunt, Residue and Poltergeists, hidden cards, turns and clock, achievements, suggestions, sealed accusations and Bots, phone sound, Frames, light, Rattle and Stitch, displays, print kit, solo cases, cost and privacy | 114 | 59 |
| `conditions` | the real weather, hour, moon and stars of a place, frozen once per game | 23 | 11 |
| `ghost-voice` | the ghost's speech, listening, Stitch and live mode | 24 | 12 |

293 acceptance criteria written in EARS form and 130 correctness properties across these seven specs, and the web shell spec (`haunwallker`) adds 77 and 11. Party Mode is deliberately built on the others: it reuses the pipeline's SpendGuard and Gallery, the viewer's bridge, the creator's Persona and the engine's reply validation, and adds one Durable Object, three pages and a pure `shared/src/party` and `shared/src/print` library.

## How Kiro is used

| Kiro feature | What is in the repo |
|---|---|
| **Specs** | eight specs (seven engine specs and the web shell), each `requirements.md` (EARS) → `design.md` (with correctness properties) → `tasks.md` (spikes first, then pure logic with tests, then Durable Objects, routes, UI) |
| **Property-based testing** | every correctness property has exactly one fast-check test, tagged with its spec, number and the requirements it validates |
| **Steering** | always-on: product, tech, structure, security-and-cost. File-scoped: ghost-safety, testing, visual-style, worldlabs-api, party-mode |
| **Hooks** | five: traceability check on spec save, spend-guard audit on API saves, property-test sync on `shared/` saves, print-kit validation on `print/` saves, typecheck on stop |
| **MCP** | a spend-capped World Labs dev server (ledger, secret scrubbing, fixture recording); generation tools are never auto-approved |
| **Consistency tooling** | `node tools/check-traceability.mjs` fails if a criterion has no task, a property has no matching test task, or ids and names drift between design and tasks |

## Where to look

| If you want to judge… | Start here |
|---|---|
| The idea and who it is for | this page, `.kiro/steering/product.md` |
| Depth of Kiro use | `.kiro/specs/*`, `.kiro/steering/*`, `.kiro/hooks/*`, `tools/check-traceability.mjs` |
| The hardest design problem | `.kiro/specs/party-mode/design.md` (hidden information, clock, bots) |
| Cost and safety discipline | `.kiro/steering/security-and-cost.md`, `ghost-safety.md` |
| Look and feel | `.kiro/steering/visual-style.md` |

## Try it without any quota
- **Gallery**: six pre-built worlds with Preset Ghosts. Play the whole Wander loop, or a whole case against Bots, with no account, no upload and no model calls.
- **Play a case, solo**: open a Gallery World, choose "Play a case", pick a preset and two to five Bots, and play on one screen. Your hand shows only when every other seat is a Bot.
- **Party Mode, with phones**: scan the lobby QR code. A second screen is optional; printed relics are optional.

## Safety, privacy and spend
- Photos are metadata-stripped, moderated (fail closed), kept 24 hours; worlds 7 days; "Delete my place" removes everything at once. Party rooms and all their contributions are deleted when the game ends or after 6 hours.
- All user text is treated as data inside delimited, length-capped blocks. Logs hold ids and counters only.
- Ghost and narrator output is gentle, validated, and replaced by scripted lines if it fails validation. Effects obey photosensitivity limits and reduced-motion settings.
- No analytics. Seat tokens are unguessable and scoped to one seat.

## Limits, stated honestly
- Worlds are static reconstructions; there is no moving geometry. The ghost is a sprite.
- The pyramid is a Pepper's-ghost illusion. Its orientation and calibration are tuned on real hardware (party Spike 1.3).
- Phone latency, iOS sensor permissions and camera QR reliability are verified in spikes, not assumed (`.kiro/steering/tech.md` lists each open assumption).
