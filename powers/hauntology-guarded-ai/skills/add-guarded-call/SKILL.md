---
name: add-guarded-call
description: Add a new paid upstream call (Workers AI model, TTS, or World Labs) to Hauntology behind SpendGuard. Use when adding any call that costs money or quota.
---

# Add a guarded call

Every paid call in Hauntology lives in `api/src/guarded/` and requires a `SpendTicket`. No other folder may call `env.AI` or the World Labs API.

## Step 1: Pick the meter

Choose the meter the call spends from: `world`, `image`, `llm` or `tts`. If a Party Room pays for it, it also spends from the Room's cap. If none fits, stop and ask. Do not add a meter silently.

## Step 2: Write the guarded function

- File: `api/src/guarded/<name>.ts`.
- Signature takes a `SpendTicket` as its first argument. Without one, the code must not compile.
- Call `env.AI.run(modelId, input)` only here. Read the model id from config, never hard-code it in a route.
- On success, the caller commits the ticket. On any failure, the caller releases it. Every code path ends in one of the two.

## Step 3: Add the scripted fallback

Every model call has a scripted result for when the cap is reached, the kill switch is on, the call times out, or the reply fails validation. The game state must be identical in both cases.

## Step 4: Keep secrets and content out of logs

Log ids and counters only. Never log prompts, captions, nicknames, photo bytes or upstream URLs.

## Step 5: Test it

- Add the fake for the upstream under `shared/fixtures/`.
- Add or update the property that says spend never exceeds a cap and no call is made after a denial.
- Run `node tools/check-traceability.mjs`.

## Step 6: Update the steering

If the call adds a new env var, add its name (no value) to `.kiro/steering/tech.md`.
