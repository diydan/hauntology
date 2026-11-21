# worldlabs-mcp (dev tool, built in spec `world-pipeline` task 0)

Stdio MCP server that lets Kiro drive the World Labs API during development with a hard spend cap and fixture recording. It is **not** part of the shipped app.

## Tools
| Tool | Spends credits | Auto-approved in `.kiro/settings/mcp.json` |
|---|---|---|
| `worldlabs_generate_from_image(path, name?)` | yes | **no** |
| `worldlabs_get_operation(operation_id)` | no | yes |
| `worldlabs_get_world(world_id, save_fixture?)` | no | yes |
| `worldlabs_list_worlds()` | no | yes |
| `worldlabs_spend_status()` | no | yes |

## Rules
- Reads `WLT_API_KEY` from env only. Refuses to start without it.
- Tracks credits used this process + a ledger file `tools/worldlabs-mcp/.ledger.json` (git-ignored); refuses `generate` once `WL_MAX_SPEND_CREDITS` would be exceeded.
- `save_fixture` writes the raw JSON response, with secrets and personal ids scrubbed, to `WL_FIXTURE_DIR`.
- Never prints the API key or image bytes.

## Build and run
- Source is in `src/` (`api.mjs` the client, `server.mjs` the protocol and tools, `stdio.mjs` the entry). `node build.mjs` writes `dist/index.js` (a one-line entry, the file `.kiro/settings/mcp.json` starts) and `dist/package.json` (`type: module`). Run the build after changing `src/`.
- Environment: `WLT_API_KEY` (required), `WL_API_BASE` (tests only: a `127.0.0.1` address), `WL_MAX_SPEND_CREDITS` (total over every run, default 6000), `WL_MAX_CREDITS_PER_CALL` (default 300), `WL_FIXTURE_DIR` (default `shared/fixtures/worldlabs`).
- `worldlabs_generate_from_image` takes a required `max_credits`. It is refused before anything is sent when the model's ceiling is above that, above the per-call cap, would pass the total cap, or is above the live balance. A refused request gives its estimate back to the ledger.
- Tests: `node --test tools/test/worldlabs-mcp.test.mjs` (a fake API; no test reaches the network or spends).

## Not yet verified against the service
- `GET /marble/v1/worlds/{id}` (`worldlabs_get_world`) and `GET /marble/v1/worlds` (`worldlabs_list_worlds`) are the documented shapes as remembered. The spike only recorded `POST /marble/v1/worlds:generate`, `GET /marble/v1/operations/{id}`, `GET /marble/v1/credits` and `DELETE /marble/v1/worlds/{id}`. Check the first real call of each and save a scrubbed fixture.
