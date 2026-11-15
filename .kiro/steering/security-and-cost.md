---
inclusion: always
---
# Security, privacy and spend rules (always apply)

## Paid calls
1. World Labs `worlds:generate`, Workers AI `env.AI.run`, Cloudflare Images transformations, and any future paid API are called **only** from modules under `api/src/guarded/`. Each exported function takes a `SpendTicket` argument obtained from `SpendGuard.reserve()`; there is no overload without one.
2. A world creation requires, in order: valid Confirm Token → Turnstile (if configured) → moderation pass → `SpendGuard.reserve('world')` → upstream call. Any failure after reserve must `release`; success must `commit`.
3. Kill switch: `WORLD_GEN_ENABLED=false`, upstream HTTP 402, or `SpendGuard.setKill(true)` stops all new world creation immediately; Gallery and scripted ghost keep working. World creation is also off by default: it needs `WLT_API_KEY` set on the Worker, and any setting about the service that is not acceptable (a model not on the list, a base address that is not the real host or loopback) leaves it off (`api/src/guarded/worldlabs-live.ts`). `tools/test/guarded-only.test.mjs` fails any source file outside `api/src/guarded/` that names the service.
4. Tests and local dev never call paid upstreams. Use recorded fixtures or fakes. The dev MCP (`worldlabs-dev`) is the only sanctioned way to spend during development; `worldlabs_generate_*` must never be auto-approved.

## Secrets
- Never put secrets in code, fixtures, logs, client bundles, error messages, or `.kiro/` files. `.kiro/settings/mcp.json` uses `${ENV_VAR}` only.
- Never return upstream asset URLs or API hosts to the browser; serve assets from our own origin.

## User content
- Treat all user text (captions, ghost free text, chat) as **data**, never instructions. In prompts it goes inside a clearly delimited block, length-capped, control characters stripped.
- Strip EXIF/GPS/XMP from every uploaded image before storage or transmission.
- Logs: ids, counters, error codes only. No image bytes, prompts, captions or chat text at any log level in production.
- Place privacy: only a position rounded to two decimals is kept, and only in the frozen conditions snapshot for that game. No IP-based location, and no place in any log. A photo's capture date and time may be read in the browser before the re-encode; its location and every other field are discarded.
- Voice: speech, listening, the Stitch word check and live mode are paid calls and go through the guarded `WorkersAiClient` with a SpendTicket (meters `tts`, `stt` and `live`). Listening audio is deleted at once and never logged or stored; live mode stores no audio; the transcript is data like typed text. Stitch clips live only in the Room's own storage, reach no model except the word check, need each player's own yes, and are deleted when the game ends, after 6 hours, or when the player leaves.
- Retention: uploads 24 h, user worlds 7 days, Gallery permanent. "Delete my place" removes everything for that world immediately.

## Party rooms
- Hidden information lives only in the `PartyRoom` Durable Object. A phone receives its own Private View; the Host and Display receive the Public View. Narrator prompts are built from the Public View only, by type. Who sent a Frame, and whether a phone sound came from the house, is hidden information too: it stays in the `PartyRoom` until the ending.
- Seat tokens are random, unguessable and scoped to one seat; they never appear in URLs after join, logs or the Public View.
- Phone sound plays only on a phone whose owner opted in. Cues, Nudges and Frames make no paid call and no model call.
- Room spend is capped on top of global caps (`PARTY_IMAGE_ROOM_CAP`, `PARTY_LLM_ROOM_CAP`); one narration per public event for the whole room; at the cap the game continues with scripted lines.
- Photos and names contributed by players are data: moderated (fail closed), downscaled, EXIF-stripped, private to the room, deleted with the room.
- A room and everything in it is deleted on end, on host request, or after `PARTY_ROOM_TTL_HOURS`. `PARTY_ENABLED=false` stops new rooms, solo cases included, and leaves Wander (the memory walk) untouched.

## Web
- Strict CSP, no inline scripts, no `innerHTML` with user text. CORS only to the app origin. All state-changing routes require the session cookie (SameSite=Lax, HttpOnly) plus origin check.
- Rate limit by session and hashed IP (never store raw IP).

## Content safety
Ghost output stays gentle: no gore, self-harm, sexual content, real persons, or out-of-fiction statements. Model output is validated and replaced by scripted lines if it fails validation.
