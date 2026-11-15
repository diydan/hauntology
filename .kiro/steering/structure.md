---
inclusion: always
---
# Hauntology — structure and conventions

```
hauntology/
  .kiro/               specs, steering, hooks, settings/mcp.json (all committed)
  shared/src/          pure logic + zod schemas + fixtures loaders. No I/O. Property tests live here.
    party/             Party Mode rules: rooms, deal, turns, suggestions, bots, views, nudges, cues, light, rattle, stitch
    conditions/        the real world: place, weather class, time of day, moon, Memory Day, stars (pure)
    voice/             the ghost's voice: speakable lines, speaking policy, Word Bank and Stitch templates, budgets (pure)
    print/             STL writer, mesh checks, QR plates, pyramid geometry
  shared/fixtures/     recorded upstream responses (worldlabs/, ai/) used by contract tests
  api/src/
    routes/            Hono route modules (thin: parse → call service → respond)
    guarded/           the ONLY place that calls World Labs, Workers AI or Cloudflare Images (see security-and-cost.md)
      workersai/       WorkersAiClient: text and vision (Scout), guard (Llama Guard 3), images (FLUX.2), cut-out (Images)
    worldlabs/         typed client + response adapters
    conditions/        geocoding and weather fetch (3 s timeout, 15 minute cache), snapshot freeze
    voice/             speech, listening and live-mode services (calls go through guarded/workersai/)
    do/                SpendGuard, WorldJob, PlaySession, PartyRoom durable objects
    ghost/             engine glue: narrate(), prompts, fallbacks
  web/src/
    app/               routes/screens: Home, Gallery, Create, Confirm, Creator, Play
    sketch/ viewer/ ghost/ creator/   feature folders
    party/             host/ controller/ display/ (three pages of Party Mode)
  print/               optional 3D-print kit: scad/ (relics, pyramid holder), generated STL, README
  design/              the design system: tokens.json (every value, written once), elements.css (the reusable ui- elements), fonts.css and fonts/ (self-hosted), catalogue.html (every element on one page; open /design/ in `pnpm voice-demo`). See steering/design-system.md
  tools/
    build-tokens.mjs   writes web/src/styles/tokens.css and shared/src/design/tokens.ts from design/tokens.json (`pnpm build-tokens`; `--check` or `pnpm check-tokens` fails when they are stale or a contrast rule fails)
    worldlabs-mcp/     dev MCP server (spend-capped)
    build-print.mjs    generates QR plates, runs openscad if present, checks every STL
    check-traceability.mjs   spec ↔ task ↔ property consistency check
    check-sounds.mjs   fails the build on a sound file with no credit, over a size limit or in the wrong format
    check-voice-library.mjs   fails the build when a scripted spoken line has no Library entry, an entry has no line, or a text holds a Steering Tag
    build-banks.mjs   generates the typed story banks in shared/src/voice/banks/ (lodger, ghost, party) from lodger-lines.md, ghost-lines.md and party-lines.md in docs/story/ (`--check` fails when one is out of date)
    voice-demo/        the play-through (built from the design system, and its visual reference): a local page (127.0.0.1 only, read-only) that plays the Library audio with the character portraits and lip-synced clips in game order, in a Wander and two party rounds, with subtitles; `pnpm voice-demo`
    voice-render/      the local Worker (never deployed) that prerender-voice.mjs calls for Inworld audio; token-guarded, allow-listed
    lib/               helpers shared by the tools above (story-banks.mjs, voice-library-check.mjs, prerender-plan.mjs, prerender-run.mjs, prerender-upload.mjs, reel.mjs, audio-check.mjs); test/ holds their `node --test` tests
    prerender-voice.mjs   owner-run before a deploy: renders the missing Library audio (ghost-voice) into R2 with a manual budget; audio is never committed (dry run, `--render` for one voice, `--upload` to R2 and `--reel` listening reels are all built; see docs/VOICE-LIBRARY-PLAN.md)
  docs/                SUBMISSION.md (overview for readers), PLAN.md (internal), SOUNDS.md (sourcing brief), sounds/CREDITS.md, spikes/
```

## Rules
- `web` and `api` may import `shared`; `shared` imports nothing from them. `web` never imports `api` internals — share types via `shared`.
- Pure functions take their clock/rng as parameters. Property tests pass seeded generators.
- Route handlers contain no business rules; rules live in `shared` (pure) or `do/` (stateful).
- File names kebab-case; types PascalCase; zod schema named `FooSchema` with `type Foo = z.infer<...>`.
- Errors: return typed results (`{ok:false, code}`) from pure logic; map to HTTP in routes. Error codes are stable strings listed in `shared/src/errors.ts`.
- Every spec task ends with its tests green. Do not mark a task done with failing tests.
- Commit messages: conventional commits; mention spec task id (e.g. `feat(pipeline): 5.1 spend guard reserve`).
