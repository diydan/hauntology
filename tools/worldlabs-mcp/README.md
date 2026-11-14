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
