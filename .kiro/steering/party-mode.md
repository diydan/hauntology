---
inclusion: fileMatch
fileMatchPattern: "**/party/**"
---
# Party Mode rules

Spec: `.kiro/specs/party-mode`. These apply to everything under a `party/` folder, `api/src/do/PartyRoom*`, and `shared/src/print/`.

- **The server holds the secrets; the engine decides; the model narrates.** The Solution, every hand and every private note live only in `PartyRoom`. Rules code returns a `PublicView` or a `PrivateView`; narrator prompts accept only a `PublicView`.
- **Never send a secret to the wrong role.** Host and Display are public screens. A hidden card reaches a phone only through that seat's Private View.
- **Premise: "who is haunting this place?"** No murder, no death circumstances, no real people. Relics, not weapons. Do not use the CLUE or Cluedo names, characters or the classic weapon set.
- **Every control is on a phone.** The Host is display-only. Room controls (world, settings, start, pause, Bots, end, Play again, hand-over) come only from the Master's token; the host token can only end the Room. The one-laptop path embeds a Player's pad on the Host page, and it is still a Player.
- **Narration never changes state.** The Haunt level, Haunt Event choices, Poltergeists and Resolve are rules in `shared/src/party/`; narration, spoken or written, only reads them. Every directive has at least five scripted variants; a failed, capped or disabled model call is replaced by a scripted line.
- **Waiting is play, within limits.** Help (+10 s, 1 Resolve) and Spook (-10 s, 2 Resolve) obey the floor and caps in `nudge.ts`: a Turn never drops under 30 s, one Help and one Spook per Turn, one Spook per Round for the table, and a timeout after a Spook never raises the Haunt. Cues and Frames change no rule. Bots never Nudge, Cue or Frame. Accepted Nudges are counted for haunting Players and for everyone else (`nudgeCounts`, shown at the end only). Every per-player limit lives on the seat and survives a reconnect.
- **A wrong guess never wins.** Accusations are sealed and revealed at the end of the Round; Players who joined the haunting keep every action but can't win; the house's win has no player winners.
- **Phone sound is opt-in and never the only signal.** Play a sound on a phone only after its owner said yes, at most three per phone per Round, with a text line in the log and a flash and vibration fallback (flash obeys the photosensitivity limit). The Master can turn sounds, Frames or Spooks off (the Gentle preset). Cues, Nudges and Frames never call a model; their lines are scripted.
- **A House Cue and a Frame look identical until the ending.** They produce the same public event and the same private "that was not you". Who sent a Frame, and which events came from the house, is hidden information that lives only in `PartyRoom` (`cueSources`) and appears only in the ending payload.
- **Light, Rattle and Stitch are optional, consented and rule-free.** Light cues use greys and whites only, at most two brightness changes a second, fades only, a peak below full white, at most 6 s, none for reduced motion, and start at a server time at least 500 ms ahead with late phones dropped. Only Poltergeists Rattle, by three swings in 1.5 s or a hold button; Rattle shares every Cue limit; the log never names a sender. Stitch is off by default, needs each player's own yes (the Master cannot say yes for anyone) and the 16-or-guardian tick, plays at most one line a Round and two a game, and its clips never leave the room. The real world (weather, hour, moon, stars) is read once, frozen, and changes looks and words, never a rule.
- **Time and randomness are injected.** Turn clocks use the Durable Object alarm; pure code takes `now` and a seeded rng.
- **Contributed content is data.** Nicknames, zone names, suspect details and photos go inside delimited data blocks, length-capped, control characters stripped.
- **Nothing physical is required.** Every QR scan has a list fallback; the Display is optional; printing is optional. Wander (the memory walk) must behave exactly as before, and a solo case (one human and Bots on one screen) is an ordinary Room played on the embedded pad, with no special rules.
- **Photosensitivity.** Display and Host effects obey `effectLimits` (flash rate, area, contrast) and `prefers-reduced-motion`.
