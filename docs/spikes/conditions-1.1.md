# Spike conditions 1.1: Open-Meteo, as it really answers

**Status: run on 2026-11-15 (just after midnight, CET), part of it. 22 real calls, all free (no key, no credits, no `SpendTicket`), nothing spent.** You said to run it against the real Open-Meteo. The spec asks for more than I could do safely, so this file says what ran and what did not.

## What ran, and how

The real module `api/src/conditions/open-meteo.ts` ran against the real service, on **the local Worker runtime of this machine** (`wrangler dev`, `api/wrangler.conditions.jsonc`, `api/dev/conditions-spike.ts`, on 127.0.0.1 only, stopped after the one run). It is **not** a deployed Worker: the spec's "deploy a throwaway Worker" was not done, because I do not deploy. The queries were made up: two capital cities (Paris, Reykjavik), one nonsense name and fixed dates. No visitor, no real place of yours, no key was involved. The answers are saved, unedited, in `shared/fixtures/weather/open-meteo-2026-11-15.json`, and `api/src/conditions/open-meteo-recorded.test.ts` runs the module and the parsers over them with no network.

## What it found

| Question | Answer |
|---|---|
| Are our addresses accepted? | **Yes**, all three, exactly as the module builds them (`/v1/search?...count=5&language=en`, `/v1/forecast?...current=weather_code,temperature_2m,wind_speed_10m&timezone=auto`, `/v1/archive?...&hourly=...&timezone=auto`). |
| Do our parsers read the real answers? | **Yes**, all of them, with one gap closed: an answer that says `{"error": true, "reason": ...}` was read as "no matches" by the city search; it is now a failure (real errors come with status 400, which the module already refused, so nothing a visitor could see changed). |
| City search | Up to 5 matches with `latitude`, `longitude`, an IANA `timezone`, `name`, `admin1` and `country` (the label is built from those). A name with no match answers `{"generationtime_ms": ...}` with **no `results` key**: an empty list, not an error. |
| Forecast | `current` has `weather_code`, `temperature_2m` (°C) and `wind_speed_10m` (km/h); with `timezone=auto` the answer names the place's own IANA zone and `current.time` is local time there. |
| Archive | 24 hourly entries of local time for one day, from **1940-01-01**. Before 1940 it answers **400** with `{"error": true, "reason": "Parameter 'start_date' is out of allowed range from 1940-01-01 to 2026-11-15"}` (the game's own check already stops at 1940, so this is a second wall, and the game would use the Default). |
| The newest day with data | The allowed range ended on the request's own date in UTC (2026-11-15), and **every hour was filled in** for that date and for 1, 2, 3, 5 and 7 days before it: no `null` codes. So the game's "up to yesterday" is safe. (Data this fresh is likely model data, not a measurement: fine for a mood, not for a record.) |
| Sunrise and sunset | The forecast can give them: `daily=sunrise,sunset` answered local ISO times (Paris, 2026-11-16: 08:01 and 17:09). They **could replace the fixed hour table**; the game does not use them yet. |
| Weather codes | The standard WMO list; the ones that came back were 0, 2, 3, 51, 53, 55 and 61, all mapped. |
| Errors | A refused request is a JSON body with `error` and `reason` and status 400 (for example a latitude of 999). |
| Time | 22 calls: median 22 ms, slowest 163 ms (an archive call); 6 repeated forecasts: p50 17 ms, p95 20 ms. **From this machine, not from a Worker at the edge**, so it shows the service is fast, not what a deployed Worker will see. All far under the 3-second limit. |
| Rate limits | The forecast and archive answers carry `x-ratelimit-limit: 600`, `x-ratelimit-window: 60`, `x-ratelimit-cost: 1`, `x-ratelimit-remaining` (it counted down 599 to 590) and `x-ratelimit-reset`; the city search sends none. No `retry-after` was seen (no call was refused for rate). Open-Meteo's terms page gives the free limits as under 10,000 calls a day, 5,000 an hour and 600 a minute. |
| Caching | The city search answers `cache-control: public, max-age=86400`. |
| Terms (from Open-Meteo's own page) | The free API is for **non-commercial use only**; subscriptions or advertising on a site or app count as commercial, and commercial use needs a paid plan. Data is under **CC BY 4.0**; the page gives no wording for the credit, so the credits screen should name Open-Meteo.com, link to it and say CC BY 4.0. The page does not name the paid plan's host or how its key is handled. |

## What is still open

- **From a deployed Worker:** the real time at the edge (p50 and p95), what many Workers sharing egress addresses see against the 600-a-minute limit, and whether the free host refuses Cloudflare addresses. (Needs a deploy, which is yours to do.)
- **The Cache API on `workers.dev`:** it does nothing there (Cloudflare's rule), so the 15-minute cache is more calls, not wrong answers; whether KV is needed waits for a real host.
- **The paid plan:** its host and key handling, if the game is ever sold.
- **Phones:** the `navigator.geolocation` prompt, denial and timeout on a real iPhone, a real Android phone and a TV browser, and whether a photo from iOS Safari and Android Chrome still carries `DateTimeOriginal` (HEIC conversion). Only a person with the phones can do this.
- **The sky dome:** whether the sky behind a real splat is visible, with one outdoor and one indoor world.
- **The attribution wording** the owner wants on the credits screen.

## Decision for you

1. Is "run locally, 22 free calls" enough to call the endpoints and shapes checked? I have recorded it as **checked from this machine**, and kept the deployed-Worker questions open.
2. Should the fixed hour table be replaced by sunrise and sunset from the forecast? It would make a winter evening in Reykjavik look right, at the cost of a second field to read; nothing is built.
