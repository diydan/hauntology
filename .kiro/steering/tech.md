---
inclusion: always
---
# Hauntwalk — tech stack

## Languages and tooling
- TypeScript (strict) everywhere. pnpm workspaces. Vitest + fast-check for tests. zod for runtime schemas.
- `web/`: Vite + React + three.js (r180+) + `@sparkjsdev/spark` + `three-mesh-bvh`.
- `api/`: Cloudflare Workers + Hono. Durable Objects: `SpendGuard`, `WorldJob`, `PlaySession`, `PartyRoom` (WebSocket Hibernation API), `PartyDirectory` (singleton for room codes and caps). R2 for blobs. KV only for non-critical caches.
- `shared/`: pure TypeScript (no I/O, no Date.now/Math.random inside logic; inject clock and rng). This is where property tests live.
- Pin exact versions in the lockfile at install time; do not guess version numbers.

## External services
| Service | Use | Notes |
|---|---|---|
| World Labs World API (`https://api.worldlabs.ai/marble/v1`, header `WLT-Api-Key`, model `marble-1.1`) | image → world | async: `worlds:generate` → poll `operations/{id}` → `worlds/{id}`. ~1,250 credits = $1; a world is roughly $1.2–1.3. Details: `worldlabs-api.md`. |
| Workers AI `@cf/black-forest-labs/flux-2-dev` | sketch → photo (reference-image editing), ghost portrait generation (text→image) | multipart form, up to 4 × 512 px reference images; Spike 1.2 verifies sketch-conditioning quality |
| Workers AI `@cf/bria/rmbg-2.0` | ghost portrait → sprite cut-out (background removal) | returns PNG with transparent alpha; direct drop-in |
| Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | ghost narration text, place brief, scripted-line generation | 220-token output cap; fp8-fast variant has 2–4× speed boost via speculative decoding |
| Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct` | image moderation (safety verdict on uploaded photos) | vision model; used only for the moderation call, not narration |
| Workers AI `@cf/inworld/tts-2` | ghost voice (spoken narration per persona) and host voice (turn announcements, achievements, endings) | 90+ voices; ghost voice ID is a field on `GhostPersona`; host voice default `Serena`; mp3 output streamed to client; scripted text fallback when cap hit |
| Browser camera + QR decoding (built-in `BarcodeDetector` where present, a pinned JS decoder otherwise) | Party Mode relic scans | optional; every scan has a list fallback |
| `openscad` CLI (optional, dev only) | compile `print/scad/*.scad` to STL | `tools/build-print.mjs` skips the compile step if it is absent |
| Cloudflare Turnstile | optional bot gate on world creation | only if `TURNSTILE_SECRET` set |

All AI calls go through the `env.AI` Workers AI binding — no external auth, no SigV4, no Bedrock SDK. The `AIClient` wrapper in `api/src/ai/` abstracts `env.AI.run(modelId, input)` with spend-guard enforcement and scripted fallbacks.

## Environment (names only — never commit values)
Secrets: `WLT_API_KEY`, `HMAC_SECRET`, `TURNSTILE_SECRET` (optional).
Vars (defaults): `GHOST_MODEL_ID=@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `GHOST_TTS_VOICE=Mortimer`, `HOST_TTS_VOICE=Serena`, `WORLD_GEN_ENABLED=true`, `WORLD_SESSION_CAP=2`, `WORLD_DAY_CAP=10`, `WORLD_TOTAL_CAP=30`, `IMAGE_SESSION_CAP=8`, `IMAGE_DAY_CAP=150`, `LLM_SESSION_CAP=40`, `LLM_DAY_CAP=1500`, `TTS_SESSION_CAP=40`, `TTS_DAY_CAP=1500`, `UPLOAD_TTL_HOURS=24`, `WORLD_TTL_DAYS=7`, `ENHANCE_VIEWS=false`.
Party Mode vars (defaults): `PARTY_ENABLED=true`, `PARTY_MAX_PLAYERS=6`, `PARTY_ROOM_TTL_HOURS=6`, `PARTY_IMAGE_ROOM_CAP=12`, `PARTY_LLM_ROOM_CAP=60`, `PARTY_TTS_ROOM_CAP=60`, `PARTY_ACTIVE_ROOMS_CAP=20`, `PARTY_ROOMS_PER_SESSION=1`.

## Unverified assumptions (each has a spike; do not build on them blindly)
1. Exact field names/URLs for splat, collider mesh, pano, thumbnail in the World Labs world response, and whether upstream asset URLs expire.
2. Whether FLUX.2 [dev] on Workers AI produces acceptable sketch-to-photo quality using a sketch as the reference image (edge-guided conditioning). If not, evaluate `flux-2-max`. Spike 1.2 retires this.
3. Splat/world orientation and scale conventions (needed for up-vector and eye height).
4. Whether outpaint-synthesized extra views improve world quality over a single photo.
5. Spark API surface for opacity/recolor/LOD in the installed version.
6. Party Mode: WebSocket p50/p95 input latency through a Durable Object with six phones at 30 Hz (party Spike 1.1).
7. Party Mode: iOS and Android multitouch, orientation permission, vibration, camera QR scan reliability on single-colour relief plates (party Spike 1.2).
8. Party Mode: pyramid orientation, mirroring and calibration on real hardware (party Spike 1.3).
9. TTS latency for `inworld/tts-2` at the ghost narration call site (220-token output → audio round-trip); acceptable threshold is under 2 s. If too slow, evaluate `@cf/openai/tts-1` (lower latency, less expressive).

When an assumption is resolved, record it in `docs/spikes/<n>.md` and update this list.
