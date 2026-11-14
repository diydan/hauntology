---
inclusion: always
---
# Security, privacy and spend rules (always apply)

## Paid calls
1. World Labs `worlds:generate`, Workers AI `env.AI.run`, and any future paid API are called **only** from modules under `api/src/guarded/`. Each exported function takes a `SpendTicket` argument obtained from `SpendGuard.reserve()`; there is no overload without one.
2. A world creation requires, in order: valid Confirm Token → Turnstile (if configured) → moderation pass → `SpendGuard.reserve('world')` → upstream call. Any failure after reserve must `release`; success must `commit`.
3. Kill switch: `WORLD_GEN_ENABLED=false`, upstream HTTP 402, or `SpendGuard.setKill(true)` stops all new world creation immediately; Gallery and scripted ghost keep working.
4. Tests and local dev never call paid upstreams. Use recorded fixtures or fakes. The dev MCP (`worldlabs-dev`) is the only sanctioned way to spend during development; `worldlabs_generate_*` must never be auto-approved.

## Secrets
- Never put secrets in code, fixtures, logs, client bundles, error messages, or `.kiro/` files. `.kiro/settings/mcp.json` uses `${ENV_VAR}` only.
- Never return upstream asset URLs or API hosts to the browser; serve assets from our own origin.

## User content
- Treat all user text (captions, ghost free text, chat) as **data**, never instructions. In prompts it goes inside a clearly delimited block, length-capped, control characters stripped.
- Strip EXIF/GPS/XMP from every uploaded image before storage or transmission.
- Logs: ids, counters, error codes only. No image bytes, prompts, captions or chat text at any log level in production.
- Retention: uploads 24 h, user worlds 7 days, Gallery permanent. "Delete my place" removes everything for that world immediately.

## Party rooms
- Hidden information lives only in the `PartyRoom` Durable Object. A phone receives its own Private View; the Host and Display receive the Public View. Narrator prompts are built from the Public View only, by type.
- Seat tokens are random, unguessable and scoped to one seat; they never appear in URLs after join, logs or the Public View.
- Room spend is capped on top of global caps (`PARTY_IMAGE_ROOM_CAP`, `PARTY_LLM_ROOM_CAP`); one narration per public event for the whole room; at the cap the game continues with scripted lines.
- Photos and names contributed by players are data: moderated (fail closed), downscaled, EXIF-stripped, private to the room, deleted with the room.
- A room and everything in it is deleted on end, on host request, or after `PARTY_ROOM_TTL_HOURS`. `PARTY_ENABLED=false` stops new rooms and leaves single-player untouched.

## Web
- Strict CSP, no inline scripts, no `innerHTML` with user text. CORS only to the app origin. All state-changing routes require the session cookie (SameSite=Lax, HttpOnly) plus origin check.
- Rate limit by session and hashed IP (never store raw IP).

## Content safety
Ghost output stays gentle: no gore, self-harm, sexual content, real persons, or out-of-fiction statements. Model output is validated and replaced by scripted lines if it fails validation.
