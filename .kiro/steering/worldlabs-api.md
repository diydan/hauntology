---
inclusion: fileMatch
fileMatchPattern: "api/src/guarded/worldlabs*.ts"
---
# World Labs World API (Marble): working notes

Two World Labs products have APIs. **This project uses the World API** (Marble): `https://api.worldlabs.ai`, header `WLT-Api-Key`, credits bought at platform.worldlabs.ai (credits bought in the Marble web app do not work). It is **not** the Atlas API (`api.atlas.worldlabs.ai`, the `worldlabs` CLI, tasks such as `atlasGenerate`), which has its own keys and billing.

Source of truth is the live API and the recorded fixtures in `shared/fixtures/worldlabs/` (none recorded yet: Spike 1.1 has not been run; `docs-examples.json` there holds shapes copied from the documentation, with invented addresses, and the adapter is tested over it). Everything below is **documented** (https://docs.worldlabs.ai, OpenAPI at `/api/reference/openapi.yaml`, read 2026-11-15) and **not yet confirmed by a run**. The full table is in `docs/spikes/1.1.md`.

## Calls
- `POST /marble/v1/worlds:generate`, body `{display_name (≤ 64), model, permission, world_prompt, tags?, seed?}`; answers an operation `{operation_id, done, created_at, updated_at, expires_at, metadata, error, response, cost}`. Errors: 400 (bad input or content policy), 402 (credits), 422 (bad body), 429 (rate limit, honour `Retry-After`).
- Image prompt: `world_prompt: {type: "image", image_prompt: {source: "data_base64", data_base64, extension}, is_pano: "auto"}`. Other sources: `uri` (must be publicly fetchable) and `media_asset` (upload first). Several images: `type: "multi-image"`. Formats jpg, jpeg, png, webp. Send the picture inline and the default private `permission` (`public: false`).
- `GET /marble/v1/operations/{id}`: poll until `done`. When done and `error` is empty, `response` is the **World**: `world_id` (the examples say `id`; read `world_id`, then `id`, then `metadata.world_id`), `display_name`, `model`, `assets`. `GET /marble/v1/worlds/{id}` also exists (its documented example wraps the world as `{"world": {...}}`, while the OpenAPI file says it returns the world itself; the adapter does not use it, because the operation already holds the world).
- `assets.splats.spz_urls` `{500k, 100k, full_res}`; `assets.splats.semantics_metadata {metric_scale_factor, ground_plane_offset}`; `assets.mesh.collider_mesh_url` (GLB); `assets.imagery.pano_url`; `assets.thumbnail_url`; `assets.caption`. `hq_mesh_url` and `full_res_mesh_url` appear only after `POST /worlds/{id}:export` (HQ mesh: 3,500 credits: **never call by default**).
- `GET /marble/v1/credits` → `{remaining_credits}`. `DELETE /marble/v1/worlds/{id}` deletes a world. Credits, polling and media-asset calls cost nothing to read or poll.

## Behaviour to respect
- 429 = rate limited (about 3 starts a minute, 60 an hour by default) → back off, honour `Retry-After`. 402 = insufficient credits → trip the kill switch, never retry.
- A world takes about 5 minutes. Poll every ~10 s with jitter; give up after 20 min and release the reservation.
- **Overage:** a request admitted at a low balance may take the balance below zero, billed at month end; auto-refill does not cap it. Our own `SpendGuard` is the only hard limit: keep the prepaid balance small.
- Worlds are static (no characters, no animation). Do not promise otherwise in UI copy.
- **Frame and scale** (`https://docs.worldlabs.ai/api/rendering-spz.md` and the OpenAPI `WorldSemanticsMetadata`): the SPZ files are in the `marble_raw_opencv` frame (x right, y down, z forward). `metric = raw * metric_scale_factor` (1.0 means "could not infer"), then `aligned = metric - (0, ground_plane_offset, 0)` puts the ground at y = 0, still in that frame. The service's own viewer then turns the file 180 degrees about x. In our manifest (`poseFromService` in `shared/src/world/ingest.ts`): `orientation.upFix` = `[1, 0, 0, 0]` (that half turn), `orientation.scale` = `metric_scale_factor`, and `floorY` = `-ground_plane_offset` (the ground at y = `offset` before the turn is at `-offset` after it); the spawn is at the origin, 1.6 m above the floor, looking the way the picture looks (the file's z forward becomes the viewer's -z). The fields are optional only for worlds made before December 2025. Read from the documentation, never seen in a viewer.
- Cost: $1 = 1,250 credits, $5 minimum. One ordinary (non-pano) image: 80 (pano step) + 1,500 = **1,580 credits** (`marble-1.0`, `marble-1.1`); the draft model `marble-1.0-draft` is 80 + 150 = **230**; `marble-1.1-plus` adds up to 1,500 for large worlds.

## Open (Spike 1.1 must answer)
Whether asset URLs expire and how soon; the formats of the pano and thumbnail; whether the hosts answer Range requests; whether the collider is on every world, draft included; whether the pose above puts a real world upright, facing the way the picture faces, with its floor under the spawn (one look in the viewer; the documentation gives the frame but no example world); the accepted image size; whether a retried `worlds:generate` is charged twice (there is no idempotency key); whether `DELETE` removes the files at once.

## Adapter rules
The adapter is `HttpWorldLabs` in `api/src/guarded/worldlabs-http.ts`: the `WorldLabsPort` (start, poll) and the `WorldSource` (read the world, download a file). It lives under `guarded/` because nothing else may call the service; the job reaches it through `guarded/worldlabs.ts`, which asks for a Ticket.
- It returns our own `SourceWorld` (`api/src/worlds/ports.ts`), reads every response field by field, tolerates extra fields, and fails closed on a missing splat (the ingest fails the world).
- The key goes only to `https://api.worldlabs.ai` (or a loopback address for a stand-in); never to a file address; redirects from the API are not followed. The key, file addresses and the picture appear in no result, error or log. A file address must be `https`, with no user name and no local or numeric host.
- Failures: 402 `no_credits`; 429 `rate_limited` with `Retry-After` seconds; 408 and 5xx and no network `transient`; any other 4xx and any redirect `rejected`. A start whose answer cannot be read is `rejected`, not retried (a second start could be charged twice); a read whose answer cannot be read is `transient`.
- The picture is sent inline and private, named with the world's own id, with no text from the visitor. Splat levels `500k`, `100k` and `full_res` are all listed; pano and thumbnail formats come from the address (`.jpg`, `.jpeg`, `.png`, `.webp`), and a file with no such ending is left out.
- Never log request bodies (they contain images). Never forward upstream URLs to the browser. After ingest, deleting the world upstream (`DELETE`) would remove the photo's copy too: **not built**, owner to decide (`docs/spikes/1.1.md`).
