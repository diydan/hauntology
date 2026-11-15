# worldlabs-spike (dev tool, world-pipeline Spike 1.1)

Makes one world from one picture on the World Labs **World API** (Marble) and records what the service really answers. Not part of the shipped app. The findings so far, and what a run must still answer, are in `docs/spikes/1.1.md`.

You need a **World API** key from https://platform.worldlabs.ai and credits bought there. The Atlas CLI key and credits bought in the Marble app do not work.

```sh
export WLT_API_KEY=...                                   # in your own shell; never in the repo or in chat
node tools/worldlabs-spike/spike.mjs --image photo.jpg   # no spend: reads the balance, prints the plan
node tools/worldlabs-spike/spike.mjs --image photo.jpg --yes-spend --delete-after --download scratch/wl   # draft model, about 230 credits
node tools/worldlabs-spike/spike.mjs --image photo.jpg --model marble-1.1 --max-credits 1600 --yes-spend    # standard, about 1,580 credits
```

Options: `--image FILE`, `--model` (`marble-1.0-draft` by default), `--max-credits N` (the most one run may cost, default 300), `--yes-spend`, `--pano` (the picture is an equirectangular panorama), `--delete-after` (delete the world upstream and record whether its files go), `--download DIR`, `--out DIR`.
Environment: `WLT_API_KEY`, `WL_MAX_SPEND_CREDITS` (total over all runs, default 6000, kept in `tools/worldlabs-mcp/.ledger.json`), `WL_FIXTURE_DIR` (default `shared/fixtures/worldlabs`).

Rules it keeps: nothing that costs is sent without `--yes-spend`; it refuses a run that could pass either cap, or whose most-it-could-cost is above the balance; the key goes only to `https://api.worldlabs.ai`; it never prints the key, an address or the picture; the saved fixtures have every address and id replaced. Tests: `node --test tools/test/worldlabs-spike.test.mjs` (a local fake of the API; no test spends).
