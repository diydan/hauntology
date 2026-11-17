# The voice window: turning the ghost's voice on for a while

The ghost's voice costs money (every line nobody has heard before is a paid call to a speech model). So it is **off until you open a window**, for some minutes and some lines, and it **closes by itself**. Nothing needs a deploy to open or close it.

Status: built and tested (2026-11-16). **The Worker has not been deployed yet**, so there is nothing to open today; the first deploy starts with the voice off.

## Before the first deploy

1. Declare the Workers AI binding in `api/wrangler.jsonc`: `"ai": { "binding": "AI" }`. Without it the Worker serves no voice at all and `/admin/voice` does not exist.
2. Set the operator's token as a secret: `wrangler secret put ADMIN_TOKEN` (at least 32 printable characters). Without it there are no `/admin` routes.
3. Know what the binding also allows. It is not voice-only: the photo check, the sketch and the narrator read it too. Each still has its own switch (a World Labs key for worlds, `AI_GATEWAY_ID` for the narrator), and none is set in the repo's configuration, so declaring the binding turns nothing else on by itself.

## Opening and closing

Put your Worker's address and token in the shell, and keep the token out of anything you save:

```sh
HOST=https://your-worker.example         # where the Worker is
read -rs ADMIN_TOKEN                     # paste the token, press Enter (it is not shown)
```

Open the window for an hour and 200 lines (the defaults):

```sh
curl -s -X POST "$HOST/admin/voice" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{}'
```

Open it for 30 minutes and at most 50 paid lines:

```sh
curl -s -X POST "$HOST/admin/voice" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"minutes": 30, "cap": 50}'
```

Close it now:

```sh
curl -s -X POST "$HOST/admin/voice" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"minutes": 0}'
```

Look at it (the `voice` part of the answer):

```sh
curl -s "$HOST/admin/status" -H "Authorization: Bearer $ADMIN_TOKEN"
```

The answer has `voice: { open, until, remainingMinutes, cap, used, remainingLines }`.

**The limits:** `minutes` is 1 to 480 (8 hours), default 60; `cap` is 1 to 1000 paid lines, default 200. Opening a new window replaces the old one and starts its count at none. The body must be a JSON object: an empty body is refused (so a call that said nothing cannot open a window), and so is a field that is not listed (so a typo such as `minute` is never read as the default).

## What a window does

- **Open:** replies name the line they can be heard as, Home says `voiceEnabled: true` (the web client then shows its speak control), and `POST /api/voice/speak` plays lines.
- **Closed** (never opened, closed, or the time ran out): replies name no line, Home says `voiceEnabled: false`, and the speech route answers the quiet `503 voice_unavailable`. Nothing is looked up, called or spent. Even a line already cached does not play.
- **Lines spent** (the window's `cap` reached, the window still open): new lines cannot be made (503), but Library and cached audio keeps playing, because it costs nothing.
- Only **paid** lines count against the window. A line from the Voice Library or the cache is free and uses none of it. A call that fails gives its line back.
- The window sits on top of the other caps, which still apply: 40 paid lines for one visitor, 1500 a day for everyone (`VOICE_TTS_SESSION_CAP`, `VOICE_TTS_DAY_CAP`), and `VOICE_ENABLED=false` switches the voice off whatever the window says.

## What it costs

A line averages about 190 characters with its Steering Tag, at $25 per million characters: **about $0.005 a line**. So the default window (200 lines) is about **$1** at the most, and a window of 1000 lines about $5. The Voice Library's 527 files do not cover Single-player turns (none of 840 sampled scripted lines were in it), so in a game every line is paid the first time anyone hears it. Scripted lines mention the world's own description, so there is no fixed set to pre-render; a Gallery world, which many visitors share, is the exception.

## If something says no

| You see | It means |
|---|---|
| `401` | no token, a wrong one, or not `Authorization: Bearer <token>` |
| `404` from `/admin/voice` | the Worker cannot serve the voice: no `AI` binding, or `VOICE_TTS_MODEL_ID` / `VOICE_TTS_FALLBACK_MODEL_ID` names a model that is not accepted (only `inworld/tts-2` and `@cf/deepgram/aura-2-en`) |
| `400` with a `message` | the body was not understood; nothing was opened |
| `413` | the body was over 1 kB |
| `502 spend_guard_unavailable` | the object that holds the window could not be reached; nothing was changed, and a window that cannot be read counts as closed |

## How it is built (for the next person)

The window lives in the `SpendGuard` Durable Object beside the ledger (`shared/src/voice/window.ts`, `api/src/do/spend-guard.ts`), so every instance of the Worker sees the same one. A paid `tts` reservation first takes a line of the window, atomically, and gives it back if the call was not charged (`api/src/voice/window.ts`, `windowedSpend`); a line is returned only to the window it came from. The speech route, the replies and the Home flag all ask the window. A window that cannot be read is closed. The cap holds because a Durable Object serves a read-then-write of its storage one request at a time (the ledger relies on the same guarantee); the tests show it against an emulation of that, not against a deployed object.
