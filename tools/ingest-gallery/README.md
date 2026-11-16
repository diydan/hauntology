# ingest-gallery (dev tool, world-pipeline 9.1)

Turns worlds you **already have the files of** into **Gallery Worlds**: `gallery/<id>/world.json` plus the files it names, in the same R2 bucket the Worker reads. It does not make worlds. It calls **no** paid service and **no** network address of its own (a test checks that). Nothing is written unless you ask.

The manifest is built by the app's own code (`shared/src/world/gallery.ts`, which calls `buildManifest`, the builder the real ingest uses), so a Gallery world and a user world cannot drift apart.

## Where the files come from

Anything that gives you a splat (`.spz`, `.ply` or `.splat`), a thumbnail (`.jpg`, `.png` or `.webp`), and if you have them a collider (`.glb`) and a panorama: the Spike 1.1 runner's `--download DIR`, the World Labs app or its CLI, or files you made yourself. **Making a world costs credits** (about 1,250 credits is $1; see `docs/spikes/1.1.md`) and is done by you, with your key, outside this tool. Check the World Labs terms for showing a world you made in a public Gallery before you ship it.

## The plan

One JSON file. File paths are relative to the plan's own folder. A typo or an extra field is an error, on purpose.

```json
{
  "date": "2026-11-15",
  "worlds": [
    {
      "id": "blue-kitchen",
      "title": "The blue kitchen",
      "brief": "A narrow kitchen with a blue door and a kettle on the stove.",
      "ghostPreset": "wistful-cook",
      "attribution": { "credit": "Photo by A. Person", "licence": "CC BY 4.0", "url": "https://example.com/photos/blue-kitchen" },
      "files": {
        "splat": [{ "file": "kitchen/splat-500k.spz", "lod": "500k" }, { "file": "kitchen/splat-100k.spz", "lod": "100k" }],
        "collider": "kitchen/collider.glb",
        "pano": "kitchen/pano.jpg",
        "thumb": "kitchen/thumb.jpg"
      },
      "pose": {
        "service": { "metricScaleFactor": 1.4, "groundPlaneOffset": -0.9 },
        "spawn": { "position": [0, 2.5, 0], "yaw": 0.5 },
        "bounds": { "min": [-8, 0.9, -8], "max": [8, 5, 8] }
      },
      "anchors": [{ "id": "a1", "pos": [1, 1.5, 2], "radius": 1 }]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `date` | a real day, `YYYY-MM-DD`. It becomes every manifest's `createdAt`, so the same plan always writes the same bytes. |
| `id` | 3 to 48 lower-case letters, digits and hyphens. It is public (`/api/worlds/<id>`). Two worlds may not share one. |
| `brief` | the Place Brief the ghost works from (1 to 2000 characters). |
| `ghostPreset` | the Preset Ghost that haunts it (the ghost creator's presets, not built yet; the id is kept as given). |
| `attribution` | `credit` and `licence` as plain lines; `url` optional: an `https` page with no login, query or fragment, never a World Labs address. |
| `files.splat` | 1 to 8; give each its own `lod` (`100k`, `500k`, `full`) when there is more than one, because the name in the bucket is made from it. |
| `files.thumb` | **required**: the Gallery list shows it (Requirement 9.2). Collider and panorama are optional (a note is printed). |
| `pose` | optional, and the hand-tuning. `service` is what World Labs reported for the world (`semantics_metadata`); `orientation`, `spawn`, `floorY` and `bounds` override it. |
| `anchors` | up to three, ids `a1` to `a3`, each inside the bounds. |

Every file is checked: its format fits its role, its first bytes fit the format (a web page saved under a splat's name is caught), its size is more than none and at most 150 MB. The pose is checked too: the bounds are a box, the spawn and every anchor are inside it, the floor is inside it, and the spawn's eye is 0.5 to 3 m above the floor.

## Use

```sh
node tools/ingest-gallery/ingest.mjs --plan gallery/plan.json                 # check only: prints each world, writes nothing
node tools/ingest-gallery/ingest.mjs --plan gallery/plan.json --stage out     # also write out/gallery/<id>/... to look at
node tools/ingest-gallery/ingest.mjs --plan gallery/plan.json --upload        # into the LOCAL bucket `pnpm dev:api` reads (api/.wrangler/state)
node tools/ingest-gallery/ingest.mjs --plan gallery/plan.json --upload --remote          # preview of the real bucket, nothing sent
node tools/ingest-gallery/ingest.mjs --plan gallery/plan.json --upload --remote --yes    # upload to the real bucket
```

`--persist-to DIR` names another local folder. `--bucket NAME` and `--jurisdiction eu|fedramp` are for a bucket other than `hauntology-worlds`. It uses `pnpm --filter api exec wrangler` and **your** `wrangler login`; nothing is stored.

If any world in the plan does not build, **nothing** is written or uploaded. Upload rules: an object already there with the same bytes is skipped; one with different bytes stops the run (`--overwrite` replaces it); every upload is read back and compared; one request at a time, no retries; each world's `world.json` goes up last, so a half-uploaded world has no manifest and is not found. Running it again finishes what stopped.

## Tuning a world

1. Run with `--upload` into the local bucket, start `pnpm dev:api`, open `/api/worlds/<id>`, and look at it in the viewer.
2. Change `pose` (spawn, bounds, floor) or the anchors in the plan, and run `--upload --overwrite`. Only `world.json` changes, so it is quick.
3. When it is right, upload with `--remote --yes`.

Nothing in retention or delete can reach `gallery/`, so a Gallery world stays until you delete it yourself:
`pnpm --filter api exec wrangler r2 object delete hauntology-worlds/gallery/<id>/<name> --remote`.
A file you drop from a plan later is not deleted from the bucket; it is just no longer named.
