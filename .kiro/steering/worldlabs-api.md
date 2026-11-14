---
inclusion: fileMatch
fileMatchPattern: "api/src/worldlabs/**/*.ts"
---
# World Labs World API — working notes

Source of truth is the live API and the recorded fixtures in `shared/fixtures/worldlabs/`. Items marked (unverified) are assumptions to confirm in Spike 1.1 before relying on them.

## Calls
- Base `https://api.worldlabs.ai/marble/v1`; auth header `WLT-Api-Key: <key>`.
- `POST /worlds:generate` with `model: "marble-1.1"`, a display name, and `world_prompt`.
  - Single image: `world_prompt: { type: "image", image_prompt: { source: "uri" | "media_asset" | "data_base64", ... } }`.
  - Several images: `type: "multi-image"`, `multi_image_prompt: [{ content: <image prompt>, azimuth?: <degrees> }, ...]` (e.g. azimuth 0 and 180).
  - Image URIs must be publicly fetchable. Otherwise upload via the media-asset prepare-upload flow or send base64.
  - A single ordinary photo or illustration makes the service build a panorama first, then the world.
- Response is an **operation**. Poll `GET /operations/{id}` until `done`, then `GET /worlds/{id}`.
- Export (optional): `POST /worlds/{id}:export` with `asset_type: "splats" | "mesh"`, `format: "ply" | "glb"`. HQ mesh export costs extra credits — do not call it by default.

## Behaviour to respect
- 429 = rate limited → back off, honour `Retry-After` if present. 402 = insufficient credits → trip the kill switch, never retry.
- Generation takes minutes. Poll every ~10 s with jitter; give up after 20 min and release the reservation.
- Worlds are static (no characters, no animation). Do not promise otherwise in UI copy.
- Cost: 1,250 credits = $1; $5 minimum purchase; API credits are separate from Marble app credits. A standard world ≈ 1,500–1,600 credits (unverified; measure in Spike 1.1 and write the real number in `docs/spikes/1.1.md`).

## Adapter rules
- `worldlabs/client.ts` returns our own `WorldAssets` type; zod-parse every response with `.passthrough()` and **fail closed** on missing splat.
- Candidate asset locations to look for (unverified): SPZ splat URLs at several resolutions, a collider mesh (GLB), a panorama image, a thumbnail, a caption.
- Never log request bodies (they contain images). Never forward upstream URLs to the browser.
