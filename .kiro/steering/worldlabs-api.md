---
inclusion: fileMatch
fileMatchPattern: "api/src/worldlabs/**/*.ts"
---
# World Labs World API (Marble): working notes

Two World Labs products have APIs. **This project uses the World API** (Marble): `https://api.worldlabs.ai`, header `WLT-Api-Key`, credits bought at platform.worldlabs.ai (credits bought in the Marble web app do not work). It is **not** the Atlas API (`api.atlas.worldlabs.ai`, the `worldlabs` CLI, tasks such as `atlasGenerate`), which has its own keys and billing.

Source of truth is the live API and the recorded fixtures in `shared/fixtures/worldlabs/` (none yet: Spike 1.1 has not been run). Everything below is **documented** (https://docs.worldlabs.ai, OpenAPI at `/api/reference/openapi.yaml`, read 2026-11-15) and **not yet confirmed by a run**. The full table is in `docs/spikes/1.1.md`.

## Calls
- `POST /marble/v1/worlds:generate`, body `{display_name (≤ 64), model, permission, world_prompt, tags?, seed?}`; answers an operation `{operation_id, done, created_at, updated_at, expires_at, metadata, error, response, cost}`. Errors: 400 (bad input or content policy), 402 (credits), 422 (bad body), 429 (rate limit, honour `Retry-After`).
- Image prompt: `world_prompt: {type: "image", image_prompt: {source: "data_base64", data_base64, extension}, is_pano: "auto"}`. Other sources: `uri` (must be publicly fetchable) and `media_asset` (upload first). Several images: `type: "multi-image"`. Formats jpg, jpeg, png, webp. Send the picture inline and the default private `permission` (`public: false`).
- `GET /marble/v1/operations/{id}`: poll until `done`. When done and `error` is empty, `response` is the **World**: `world_id` (the examples say `id`; read `world_id`, then `id`, then `metadata.world_id`), `display_name`, `model`, `assets`. `GET /marble/v1/worlds/{id}` also exists.
- `assets.splats.spz_urls` `{500k, 100k, full_res}`; `assets.splats.semantics_metadata {metric_scale_factor, ground_plane_offset}`; `assets.mesh.collider_mesh_url` (GLB); `assets.imagery.pano_url`; `assets.thumbnail_url`; `assets.caption`. `hq_mesh_url` and `full_res_mesh_url` appear only after `POST /worlds/{id}:export` (HQ mesh: 3,500 credits: **never call by default**).
- `GET /marble/v1/credits` → `{remaining_credits}`. `DELETE /marble/v1/worlds/{id}` deletes a world. Credits, polling and media-asset calls cost nothing to read or poll.

## Behaviour to respect
- 429 = rate limited (about 3 starts a minute, 60 an hour by default) → back off, honour `Retry-After`. 402 = insufficient credits → trip the kill switch, never retry.
- A world takes about 5 minutes. Poll every ~10 s with jitter; give up after 20 min and release the reservation.
- **Overage:** a request admitted at a low balance may take the balance below zero, billed at month end; auto-refill does not cap it. Our own `SpendGuard` is the only hard limit: keep the prepaid balance small.
- Worlds are static (no characters, no animation). Do not promise otherwise in UI copy.
- Scale: multiply positions and isotropic scales by `metric_scale_factor` (1.0 means "could not infer"); then subtract `ground_plane_offset` from Y to put the ground at y = 0. Up is Y; handedness is not stated (verify in a viewer).
- Cost: $1 = 1,250 credits, $5 minimum. One ordinary (non-pano) image: 80 (pano step) + 1,500 = **1,580 credits** (`marble-1.0`, `marble-1.1`); the draft model `marble-1.0-draft` is 80 + 150 = **230**; `marble-1.1-plus` adds up to 1,500 for large worlds.

## Open (Spike 1.1 must answer)
Whether asset URLs expire and how soon; the formats of the pano and thumbnail; whether the hosts answer Range requests; whether the collider is on every world, draft included; the up axis and handedness; the accepted image size; whether `DELETE` removes the files at once.

## Adapter rules
- `worldlabs/client.ts` returns our own `SourceWorld` type (`api/src/worlds/ports.ts`); parse every response, tolerate extra fields, and **fail closed** on a missing splat.
- Never log request bodies (they contain images). Never forward upstream URLs to the browser. After ingest, delete the world upstream (`DELETE`) so the photo's copy goes too (owner to confirm; `docs/spikes/1.1.md`).
