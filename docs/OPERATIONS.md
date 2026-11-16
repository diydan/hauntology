# Operations: the world switch

New world creation can be closed and opened on a running Worker, without a deploy. This is for whoever pays for the world service. It costs nothing to look at.

## What closes new worlds

| What | Who | How it is undone |
|---|---|---|
| `WORLD_GEN_ENABLED` set to `false`, `0` or `off` | you, in the Worker's variables | change the variable (takes effect on the next request after it is saved) |
| The kill switch | you, with the command below | `open` |
| The world service answers 402 (out of credits) | the Worker, by itself | top up the credits at platform.worldlabs.ai, then `open` |
| No `WLT_API_KEY` on the Worker | nobody has set one | set the secret |

While worlds are closed, **uploads, picture checks and new worlds are refused. The Gallery, and worlds already being made, keep working.** Home shows worlds closed within a moment.

## One-time setup

1. In your own terminal, make a token. It must be at least 32 characters; this gives 64:
   `openssl rand -hex 32`
2. Save it as the Worker's secret `ADMIN_TOKEN`. Paste it at the prompt; do not put it in a file in the repo or in chat:
   `cd api && pnpm exec wrangler secret put ADMIN_TOKEN`
   (For `wrangler dev`, put `ADMIN_TOKEN=...` in `api/.dev.vars`.)
3. Keep the same token in your shell when you use the command.

Until `ADMIN_TOKEN` is set the operator routes do not exist (a plain 404). To remove them again, delete the secret. To change the token, set it again.

## Using it

```
export ADMIN_TOKEN=...            # in your own shell
node tools/worldgen-switch.mjs https://YOUR-WORKER status
node tools/worldgen-switch.mjs https://YOUR-WORKER close
node tools/worldgen-switch.mjs https://YOUR-WORKER open
```

`status` says `world making: OPEN` or `CLOSED`, with the reasons: `WORLD_GEN_ENABLED` (the variable), `kill_switch`, `no_world_service_key`. It also says when the day cap or the total cap is reached. If the Worker cannot reach its spend counter, `status` says so and does not guess.

The command sends the token only over https (or http to localhost), never prints it, and does not follow a redirect. The same calls by hand: `GET /admin/status` and `POST /admin/kill` with `{"on": true}` to close or `{"on": false}` to open, and the header `Authorization: Bearer $ADMIN_TOKEN`.

## After the world service runs out of credits

1. The Worker closes worlds by itself on the first 402 (`status` shows `kill_switch`).
2. Top up at platform.worldlabs.ai (the balance there, not the Marble app).
3. `open`.

## Limits to know

- The token is the whole protection. There is no limit on wrong guesses, which does not matter for a random 64-character token. A Cloudflare rate-limiting rule or an Access policy on `/admin/*` would add a layer.
- The spend counter (`SpendGuard`) caps what can be spent whatever the switch says; the switch is for stopping at once, not for budgeting. Keep `WORLD_TOTAL_CAP` and the prepaid balance small.
- A change of the switch is not logged.

## The Gallery

Gallery Worlds are the ones a visitor can walk into with no key and no credits. They are made by you, once, and live in the bucket under `gallery/<id>/`, where nothing in retention or delete can reach them. `tools/ingest-gallery/` (README inside) checks a plan of worlds you already have the files of, builds each `world.json`, and uploads it: to the local bucket by default, to the real one only with `--remote --yes`. It makes no paid call. Making the worlds themselves costs World API credits and is yours to start.

## Run the whole app on your machine

The Worker serves the web app and the API from one address, as it would if it were deployed. It spends nothing: with no `WLT_API_KEY` no world is made, and nothing here calls a paid service.

```
pnpm dev:app          # builds web/dist, then runs wrangler dev (the address is printed)
```

- `wrangler dev` needs `web/dist` to exist. To run the Worker alone after one build: `pnpm dev:api`.
- A link such as `/shared/<id>`, `/gallery` or `/haunt/<id>` opens the app when typed into the address bar or reloaded. A file that is not there (`/assets/old-hash.js`) is a 404.
- `/api/*` and `/admin/*` are never answered with a page. `/admin` exists only when `ADMIN_TOKEN` is set.
- For the web app alone, with the fake API and no Worker, run `pnpm dev:web` and add `?demo=1` to the address.

## The ghost's words from the model (ghost-engine 4)

The ghost speaks from scripted lines by itself. A model (Claude Haiku 5.5, through the AI Gateway) can word its replies instead, and it is **off until you turn it on**. It costs about 0.01 cent a turn (a 20-turn game is about 0.2 cent), paid from prepaid AI Gateway credits.

To turn it on:
1. Load credits in the Cloudflare dashboard (AI, AI Gateway). Pick a gateway: `default` is made on the first call.
2. In `api/wrangler.jsonc` declare the `AI` binding (`"ai": { "binding": "AI" }`). **This also lets the other Workers AI adapters run** (the Place Brief check and the sketch), which spend when worlds are made.
3. Set the variable `AI_GATEWAY_ID` (for example `default`). Optional: `NARRATOR_MODEL_ID` (default `anthropic/claude-haiku-5.5`; only an Anthropic Haiku id is accepted).

To turn it off at once, set `GHOST_NARRATION_ENABLED` to `false` and deploy: the ghost speaks only scripted lines and the game goes on. The Chat tells a visitor that typed words may go to an AI model only while a model is really on (the `ghostModel` flag of `GET /api/session`), so with the switch off or no binding the note is gone. The caps are the usual ones in `SpendGuard`: `LLM_SESSION_CAP` (a visitor, default 40) and `LLM_DAY_CAP` (everyone, default 1500). A game also stops using the model after 40 model turns, after the ending, and for any text that tries to change the ghost's rules.

**Data retention (you decided on 2026-11-15: fine for Haiku 5.5).** What a visitor types (up to 200 characters a turn) goes to the model inside the prompt. Cloudflare's page for Haiku 5.5 carries no "zero data retention" tag (the page for Haiku 4.5 does), and you accepted that. If you change your mind, set `NARRATOR_MODEL_ID=anthropic/claude-haiku-4.5`: ten times the price (about 2 cents for a 20-turn game), accepted by the adapter and not yet run through the gateway.

The log has one line for each model turn, `play.narrate`, with an outcome (`model`, `invalid`, `refused`, `failed`, `capped` or `off`) and how many calls it took. No word of a prompt or a reply is logged.

## The real weather of a place (conditions, ghost-engine 3.1)

When a visitor chooses a Place on the sky card, the Worker reads the real weather, hour and moon of that place **once**, when the game starts, and keeps it with the game. It is a free call to Open-Meteo (no key, no credits, no `SpendTicket`; its free tier is for non-commercial use, so a paid plan is needed if the game is ever sold). **No Place chosen means no call at all.** A slow (over 3 seconds) or failing answer gives the normal look, and the game starts.

- **Turn it off:** set `CONDITIONS_ENABLED` to `false` and deploy: no weather call is made and every game has the normal look.
- **`WEATHER_BASE_URL`** (unset means Open-Meteo's own hosts): only for tests and stand-ins; it must be an `https` address (or `http` on this machine), with no login, query or fragment in it, or the feature turns itself off.
- **The log** has one line for each read, `conditions.read`, with `source`, `reason` and `cache`. It never holds a place, a label, a position or a date.
- **What is kept:** the game's own record holds a position rounded to two decimals, its label and the sky, and is deleted with the game (24 hours at most).
- **Checked against the real service from this machine (22 free calls, 2026-11-15; `docs/spikes/conditions-1.1.md`):** the endpoints and answer shapes are as built. **Not yet from a deployed Worker:** edge latency and the shared-address rate limit (600 a minute). The caches do nothing on `workers.dev`. The free tier is non-commercial only; credit Open-Meteo.com (CC BY 4.0) on the credits screen.
