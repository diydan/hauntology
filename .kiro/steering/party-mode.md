---
inclusion: fileMatch
fileMatchPattern: "**/party/**"
---
# Party Mode rules

Spec: `.kiro/specs/party-mode`. These apply to everything under a `party/` folder, `api/src/do/PartyRoom*`, and `shared/src/print/`.

- **The server holds the secrets; the engine decides; the model narrates.** The Solution, every hand and every private note live only in `PartyRoom`. Rules code returns a `PublicView` or a `PrivateView`; narrator prompts accept only a `PublicView`.
- **Never send a secret to the wrong role.** Host and Display are public screens. A hidden card reaches a phone only through that seat's Private View.
- **Premise: "who is haunting this place?"** No murder, no death circumstances, no real people. Relics, not weapons. Do not use the CLUE or Cluedo names, characters or the classic weapon set.
- **Narration never changes state.** Every directive has at least five scripted variants; a failed, capped or disabled model call is replaced by a scripted line.
- **Time and randomness are injected.** Turn clocks use the Durable Object alarm; pure code takes `now` and a seeded rng.
- **Contributed content is data.** Nicknames, zone names, suspect details and photos go inside delimited data blocks, length-capped, control characters stripped.
- **Nothing physical is required.** Every QR scan has a list fallback; the Display is optional; printing is optional. The single-player game must behave exactly as before.
- **Photosensitivity.** Display and Host effects obey `effectLimits` (flash rate, area, contrast) and `prefers-reduced-motion`.
