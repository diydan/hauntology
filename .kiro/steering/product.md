---
inclusion: always
---
# Hauntology — product

> Walk into any place. Its ghost remembers three things.

## One line
Draw or upload any place (one you miss, one you love, or one you made up), walk into it as a 3D world, and let its ghost lead you to three memories.

## Core loop
1. **Start** — upload one photo, or draw a sketch (sketch → FLUX.2 on Workers AI → photoreal image).
2. **Confirm** — see the exact image, remaining quota, then "Enter this place?" (nothing paid happens before this).
3. **Haunt** — World Labs Marble turns the image into a Gaussian-splat world (minutes). Meanwhile the player designs their ghost.
4. **Walk** — first-person browser viewer (three.js + Spark) with a haunt layer: grade, fog, flicker, orbs.
5. **Talk** — text-adventure chat with the ghost. Find 3 memories (sound, person, promise). Ending card is shareable.

## Two ways to play a place
- **Play a case** (the deduction game): work out which ghost, where, with which relic. Alone against Bots on one screen, with no phone and no account (a **solo case**, which is a Party Room played on the embedded pad), or with friends' phones in the same room (Party Mode, below).
- **Wander** (the memory walk, the original single-player game): steps 4 and 5 above. Walk the place and let its ghost lead you to three memories. In the specs, "Single player" means Wander.

## Hackathon context
- Kiroween 2026, category **Frankenstein**: stitch together tech that was never meant to meet (hand sketch + diffusion + splat reconstruction + WebGL + LLM ghost + phones as game pads + 3D-printed relics + a Pepper's-ghost pyramid).
- Overview for readers: `docs/SUBMISSION.md`.

## Principles (these override convenience)
1. **Never spend without consent.** No paid upstream call (World Labs, Workers AI text, vision, moderation or image, Cloudflare Images) unless the user confirmed and the SpendGuard reserved quota.
2. **Never dead-end.** Gallery worlds, preset ghosts and scripted ghost lines mean a judge can finish the whole experience with zero quota and zero LLM.
3. **Gentle haunting.** Melancholy and wonder, not gore. It is horror, told calmly (a deadpan storybook narrator, a moonlit tenderness, an exact dry formality), and the ghost's menace is aimed at the visitor by hint and politeness, implied and never carried out: dread from small things that are slightly wrong, never from gore, harm done or described, insults or a jump scare (`house-style.md`, `ghost-safety.md`). No death-circumstance prompts. No real people and no real events or news at a place. Photosensitivity-safe.
4. **Personal photos are private.** Strip metadata, short retention, unguessable ids, no analytics.
5. **Honest scope.** Worlds are static; the ghost is a billboard sprite; the pyramid is an optical illusion, not a true hologram. Say so in UI copy where it matters.
6. **Secrets stay on the server.** In Party Mode no hidden card, solution or private note is ever sent to a screen or prompt that should not see it.
7. **Nothing physical is required.** Printed relics, the pyramid and even a second player's phone are optional; a solo judge can finish a full game with Bots.

## Party Mode (optional, same room)
Turn the walkable world into a deduction game for 2–6 players. A laptop or TV only displays the world (Host); every control lives on a phone, an installable web app that is a game pad and a private screen (Controller), and the first player to join is the Master who runs the room; an optional second screen under a Pepper's-ghost pyramid shows the ghost (Display). Everyone contributes to the world: a Suspect ghost, a photo, a named Zone. One hidden answer: **which ghost, haunting which place, bound to which relic**. Players take timed turns, search the world for hidden Residue, earn extra seconds through Achievements, make Suggestions and one Accusation. A Haunt level rises and fires events; a wrong Accusation makes you a Poltergeist who helps steer the haunting instead of leaving the game. Players who are waiting can Nudge the clock (Help or Spook, paid in Resolve, with strict limits), play short Cues and, where the owner agrees, make a friend's phone creak (a Frame), anonymously until the ending. Phone sound is opt-in and never required. The room can also borrow the real weather, hour, moon and stars of a place, light the phones with greys, let a Poltergeist rattle the house by shaking a phone, and, with every player's own yes, whisper a line cut from words the players recorded (Stitch). The ghost speaks, and listens in Single player. None of it changes a rule. Six original 3D-printable relics with QR tokens are optional; every physical part has an on-screen fallback. Spec: `.kiro/specs/party-mode`.

## Puzzles (optional, phone)
Short phone puzzles (eleven Kinds: lock pick, wires, clock, safe, music box, candles, what moved, torn photo, hidden words, spirit board, marble maze) at three levels. In a case they guard Inspect (on phones, and on the laptop in the solo case), get harder as the Haunt rises, and give players who joined the haunting one puzzle per Round for Scare points; in Wander an optional one stands before each memory and can always be skipped. Touch alone always works; tilt, buzz and sound are extras. Spec: `.kiro/specs/puzzles/`.

## Non-goals
Accounts, online matchmaking or remote play (Party Mode is same-room only), VR/WebXR (Spark supports it; out of scope for Kiroween), user-published public gallery, native apps, video generation, a murder or death-circumstance premise.

## Demo beats (≤ 3:00 video)
0:00 hook: sketch a kitchen in 10 s → 0:25 confirm gate → 0:40 pre-baked generation montage → 0:55 walk in, ghost appears → 1:20 first memory → 1:50 second/third (cut) → 2:15 ending card → 2:30 Kiro: specs, steering, hooks, MCP, property tests on screen → 2:55 title.
Party clip (use in place of the 1:50–2:15 cut if time allows, ≤ 25 s): three phones join by QR → a relic is scanned → the pyramid ghost reacts → a sealed Accusation is revealed at the end of the Round.
