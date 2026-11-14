# Hauntology

Draw or upload any place. Walk into it as a 3D world. Let its ghost lead you to three memories.

Built for **Kiroween 2026 — Frankenstein** (stitching together tech that was never meant to meet).

## How it works
1. **Start**: upload a photo, or draw a sketch that FLUX.2 on Workers AI turns into a photo.
2. **Confirm**: see exactly what will be sent, then "Enter this place?" (nothing paid happens before this).
3. **Build**: World Labs Marble turns the image into a Gaussian-splat world. Meanwhile, design your ghost.
4. **Walk**: first-person in the browser (three.js + Spark) with a gentle haunt layer.
5. **Talk**: a text-adventure chat with the ghost. Find three memories.

A pre-generated Gallery lets anyone play the whole thing with zero quota.

## Party mode (same room, 2–6 players)
Turn the world into a deduction game: **which ghost is haunting this place, and which relic binds it?**
- A laptop or TV only displays the world. Every phone is an installable game pad and a private screen holding that player's hidden cards and notebook. The first player to join is the Master and runs the room.
- Everyone contributes: a suspect ghost, a photo, a named zone.
- Timed turns. Walk the world, inspect Zones for hidden clues, make suggestions, earn extra seconds with achievements, then make one accusation.
- The Haunt rises as time passes and fires events. A wrong accusation turns you into a Poltergeist who helps steer the haunting, so nobody is out.
- Waiting is play: Nudge the clock (Help or Spook, paid in Resolve, with limits so a Turn never drops under 30 s), play short Cues, and, if their owners agree, make a friend's phone creak (a Frame) without anyone knowing who did it until the ending. Phone sound is opt-in; the Gentle preset turns the needling off.
- The room can borrow the real world: the weather, hour, moon and stars of a place (read once and frozen, looks only), and a Bell on the hour. Phones can light up in greys across the table, a Poltergeist can rattle the house by shaking a phone, and an optional private lens shows your own notebook marks around you. With every player's own yes, the ghost can whisper a line cut from short words the players recorded (Stitch). None of it changes a rule, and every sound has a text line.
- Six original 3D-printable relics with QR tokens, and an optional Pepper's-ghost pyramid that shows the ghost on a second screen. Both are optional; everything has an on-screen fallback.
- Play alone on one screen: "Play on this screen" embeds a pad beside the world and Bots fill the other seats. No other phones or hardware needed.

See `docs/SUBMISSION.md` for the product and technical overview and `.kiro/specs/party-mode` for the spec.

## Spec-driven with Kiro
Everything in this repo was planned in Kiro specs first. See `/.kiro`:
- `specs/world-pipeline`, `world-viewer`, `ghost-creator`, `ghost-engine`, `conditions`, `ghost-voice`, `party-mode`: requirements (EARS), design with correctness properties, tasks (287 criteria, 124 properties across the seven)
- `steering/`: product, tech, structure, security-and-cost (always), plus file-scoped guides (ghost safety, testing, visual style, World Labs API, party mode)
- `hooks/`: traceability check on spec save, spend-guard audit, property-test sync, print-kit validation, typecheck on stop
- `settings/mcp.json`: a spend-capped World Labs dev MCP server
- Property-based tests (fast-check) for every correctness property; `node tools/check-traceability.mjs` keeps specs, tasks and tests in sync

## Layout
`shared/` pure logic and tests · `api/` Cloudflare Worker + Durable Objects · `web/` Vite + React + three.js + Spark · `print/` optional 3D-print kit (relics, pyramid holder) · `tools/` dev MCP, traceability check and print build · `docs/` overview and spike results

## Credits
Weather, hour and moon data come from [Open-Meteo](https://open-meteo.com/) (free tier, non-commercial use only). Sound credits are in `docs/sounds/CREDITS.md`.

## Disclosure
Frameworks and libraries are listed in the lockfile. No pre-existing application code is included. (Update this section if that changes.)

## Safety and privacy
Photos are metadata-stripped, kept 24 hours, worlds 7 days, and deletable on demand. Party rooms and everything contributed to them are deleted when the game ends. Hidden cards never leave the server except to their owner's phone. No analytics. Ghost output is validated and falls back to scripted lines.

## License
MIT. Third-party image attributions for Gallery Worlds are in `docs/ATTRIBUTION.md` (to be created with the Gallery).
