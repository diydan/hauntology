# Requirements Document

## Introduction

Party mode turns Hauntology into a same-room deduction game for two to six players. A laptop or TV only displays the shared haunted world. Every control lives on a phone: one player, the **Master**, runs the room, and every player's phone is a game pad and a private screen. An optional second device under a Pepper's-ghost pyramid shows the ghost as a hologram-style centrepiece; six original relics can be 3D printed. The premise is gentle: a visitor ghost is haunting the place, and the players work out **which ghost** (Suspect), **where** (Zone) and **with which relic** (Relic). Players take timed turns walking the shared world, search it for hidden clues, earn extra time through achievements, keep their cards secret on their phones, and contribute a suspect, a framed photo and a room name to the world. Time works against them: a **Haunt** rises as the game goes on, fires events, and ends the game if it reaches its maximum. Accusations are sealed and revealed together at the end of the Round, and a player who accuses wrongly stays in the game as a **Poltergeist** who helps steer the haunting but cannot win; if the Haunt wins, no player does. Players who are waiting can still take part: they can **Nudge** the clock (Help or Spook, paid in Resolve), play short **Cues**, and, where the owner agrees, make a friend's phone creak (a **Frame**) without anyone knowing who did it until the ending. Sound is opt-in, always has a text line, and never changes a rule. The room can also borrow the real world (the weather, hour, moon and stars of a place, and a chime on the hour), light the phones with greys, let a Poltergeist rattle the house by shaking a phone, and, with every player's own yes, let the ghost whisper a line cut from short words the players recorded (Stitch). All of it is optional, every player says yes for themselves, and none of it changes a rule. The server holds every secret, the engine decides every outcome, and a model only narrates. The mode is additive: Wander is unchanged, and the whole mode works with no printer, no Display and no model, and on one screen with Bots (a solo case).

## Glossary

- **Party Service**: the `PartyRoom` Durable Object, its routes in `api/src/routes/party.ts`, and the pure logic in `shared/src/party/`.
- **Room**: one party game, held by one `PartyRoom` Durable Object, in one world chosen by the Master.
- **Room Code**: four characters from an alphabet without ambiguous characters, identifying a Room while it is open.
- **Host**: the laptop or TV page that runs the Viewer and shows the Public View. It is display-only. It owns the collider and reports the pose of the shared camera.
- **Master**: the Player who runs the Room. The first Player to join is the Master. Only the Master can pick the world, change settings, start, pause, resume, add Bots, end the game and choose Play again.
- **Controller**: the phone page that acts as a game pad (pad layout) and private screen (panel layout). It is an installable web app.
- **Display**: an optional third page that shows the ghost for the pyramid centrepiece.
- **Player**: a seated participant, human or Bot, with a seat number, nickname and hand.
- **Bot**: a Player controlled by the Party Service using only its own Private View.
- **Suspect, Zone, Relic**: the three card categories. There are six of each. A Suspect is a Ghost Profile. A Zone is a named anchor in the world. A Relic comes from a fixed catalogue of six.
- **Card**: one Suspect, Zone or Relic. There are 18 cards.
- **Solution**: the one Suspect, one Zone and one Relic that make up the case.
- **Residue**: three non-Solution cards set aside at the deal and hidden in three different Zones. They are found with Inspect.
- **Hand**: the cards dealt to a Player. The 12 cards that are neither Solution nor Residue are dealt out.
- **Public View / Private View**: what the Host and Display may see, versus what one Player's phone may see.
- **Detective**: a Player who has not joined the haunting.
- **Turn, Round**: one Player's go; one Round is one Turn for every Detective.
- **First player**: the Detective who takes the first Turn of a Round. It moves one seat clockwise each Round.
- **Turn Clock**: the countdown for a Turn. **Bonus Seconds**: time earned through Achievements.
- **Suggestion / Accusation**: a guess at the Zone you stand in, answered by one card; versus a final claim of one Suspect, one Zone and one Relic, sealed during the accuser's Turn and revealed with every other Accusation at the end of that Round. A Player may make one Accusation per game.
- **Inspect**: an action that spends 10 seconds of a Turn in a Zone to look for Residue there. WHERE the Puzzle setting is on, a human Detective's Inspect on a phone opens that Zone's **Lock** (a short phone puzzle of the `puzzles` spec) instead, and solving it gives the same private result.
- **Haunt**: a level that rises as the game goes on and ends the game when it reaches its maximum.
- **Haunt Event**: a change to the game that fires once when the Haunt first reaches level 3, 6 and 9.
- **Bluff**: a Suggestion that names a Suspect or a Relic from the suggester's own Hand. It is a normal Suggestion, and nothing marks it until the ending recap.
- **Ending recap**: the list of what happened in a game, built from the public log when the game ends, with the Solution and the Frame and House Cue senders.
- **Poltergeist**: a Player whose Accusation was wrong. They keep their Hand, which still answers Suggestions, may send Cues, Nudges, Frames and Rattles and choose Haunt Event options, take no Turns and cannot win. Players see this as "joined the haunting".
- **Resolve**: a bank of 0 to 3 attention points, filled by one at the start of every Round and spent on Eavesdrop, Help and Spook.
- **Eavesdrop**: spending one Resolve to learn privately one card named in another Player's Suggestion that was not the card shown.
- **Scare points**: points a Poltergeist earns from the event log for the Most Haunting award, which changes no rule.
- **Nudge**: a paid change to the active Player's Turn Clock by another Player. **Help** adds 10 seconds and costs 1 Resolve. **Spook** removes 10 seconds and costs 2 Resolve.
- **Cue**: a short sound of at most 3 seconds from a fixed catalogue of four (creak, whisper, bell, laugh), played from a sound file when one exists, with a text caption. A Player who is not on their Turn plays a Cue on the Host (the TV) or on their own phone. A Cue changes no rule, and with no sound file the phone flashes and vibrates and the caption is logged.
- **Phone Cue / House Cue / Frame**: a Cue a Player plays on their own phone; a Cue the Room plays on one seeded phone when a Haunt Event fires; and a Cue one Player plays on another Player's phone. A House Cue and a Frame look identical to everyone except the sender until the ending.
- **Sound Consent**: a Player's answer, given on their phone, to whether the house may play sounds on it.
- **Conditions**: one frozen snapshot of the real world (weather class, time of day, moon, optionally stars) read once at the start; see the `conditions` spec.
- **Hour strike**: a Bell sounded on the Host and every consenting phone at the top of the host's hour; at midnight the Host strikes twelve.
- **Spirit lens**: an optional private layer on a phone, drawn only from that Player's own Private View and the Public View.
- **Light bar / light cue**: a grey light effect that runs across the screens of consenting phones in seat order.
- **Rattle**: a Cue by gesture, played by a Poltergeist by shaking their phone, that makes the floorboards creak.
- **The Becoming**: the sting that plays when a Player joins the haunting.
- **Seat Portrait**: the picture that stands for a Player on the Controller header, the Host HUD and the ending screen: the portrait of the Ghost Profile that Player contributed, drawn in full colour. A Player who contributed none, and every Bot, has a nickname chip in their seat colour instead. A Seat Portrait turns black and white when its Player joins the haunting (Requirement 19.8).
- **Stitch**: the ghost whispering a line cut from short words that consenting Players recorded, from a fixed Word Bank and fixed templates; see the `ghost-voice` spec.
- **Sound file**: one of seven short clips (creak, whisper, bell, laugh, wind, rumble, becoming); the game works without any of them.
- **Preset**: the Master's choice of Classic (base 60 seconds, Haunt maximum 10, Help and Spook, Frames on, auto-cross off, Standard Bots), Gentle (90, 12, Help only, Frames off, auto-cross on, Gentle Bots) or Quick (45, 8, Help and Spook, Frames on, auto-cross off, Standard Bots).
- **Case**: one game of the deduction rules. A **solo case** is a Room played by one human with Bots on one screen, which the app calls "Play a case".
- **Wander**: the memory walk, the original single-player game in which the ghost leads the visitor to three memories. Party mode does not change it, and a spec that says "Single player" means Wander.
- **Contribution**: a Suspect, a framed photo or a Zone name supplied by a Player.

- **Photo Prompt**: a short, fixed instruction that suggests which everyday photo to add; each Player is offered three at a time (for example "the view from a window"), with a tip and a source of either `camera_roll` or `take_now`.
- **Relic Token**: a printed base carrying a QR plate with the payload `hw:<relic id>`.
- **Print Kit**: the models, generator and checks in `print/` and `shared/src/print/`.

## Requirements

### Requirement 1

**User Story:** As a player, I want friends to join from their phones with a code or a QR code, and one of us to run the room, so that nobody installs a native app, makes an account or needs a keyboard.

#### Acceptance Criteria

1. WHEN a laptop or TV opens the Party page THEN the Party Service SHALL create a Room with a four-character Room Code from an alphabet that excludes ambiguous characters, a join URL, a QR code of that URL and a host token held only by the Host, without choosing a world.
2. WHEN a phone opens the join URL, or enters a Room Code and a nickname, THEN the Room SHALL seat it as a Player with a player token, allow two to six Players including Bots, make the first Player to join the Master, and sanitise the nickname to at most 16 characters without control characters, markup or URLs.
3. IF the Room is full, the game has started, or the code is unknown or expired THEN the Room SHALL refuse the join with a specific reason code and SHALL NOT reveal anything about any Room.
4. WHEN a phone reconnects with its player token THEN the Room SHALL restore the same seat, hand and Private View, and a phone without a token SHALL NOT take a seat after the game has started.
5. WHEN a Room is idle for its time to live (default 6 hours), or the Master or the Host ends it, THEN the Party Service SHALL delete the Room together with all of its Contributions.
6. THE Party Service SHALL serve a Player's Private View only to that Player's token, the Public View only to tokens of the same Room, and SHALL scope every route and socket to the token that owns it.
7. THE Party Service SHALL accept the room controls (world choice, settings, start, pause, resume, add Bot, end, Play again and hand-over) only from the Master's token, and the host token SHALL carry no game control other than ending the Room. WHEN the Master hands the role over, or has been disconnected for 60 seconds, THEN the Room SHALL pass the role to the next human Player in seat order, never to a Bot, and WHERE no other human is seated THEN the Master SHALL keep the role until the Room expires.

### Requirement 2

**User Story:** As a player, I want my phone to work like a game pad, so that I can play without a keyboard.

#### Acceptance Criteria

1. WHEN a phone is seated THEN the Controller SHALL offer a landscape pad layout with a left movement stick, a right look area, four face buttons and a menu, and a portrait panel layout with the hand, notebook and contributions, and SHALL let the Player switch between them. The four face buttons are: **Suggest** (opens the suggest screen when inside a Zone and not yet suggested this Turn), **Seal an Accusation** (opens the seal screen at any time during the Player's Turn, with a two-step confirm), **Inspect** (starts an Inspect when inside a Zone), and **Pass** (ends the Turn without a Suggestion or a sealed Accusation). The menu holds the map overlay, the Eavesdrop reaction, and, for the Master only, the room controls. Each button maps to a protocol message or a local overlay; no button is left undefined.
2. WHEN the Player touches the controls THEN the Controller SHALL send input at most 30 times per second with stick values clamped to the unit disc and look deltas clamped, and the Room SHALL discard movement and look input from any Player who is not the active Player and rate limit every token.
3. WHEN several fingers touch at once THEN the Controller SHALL track them independently, and WHEN the page loses focus or the connection drops THEN the Controller SHALL release all inputs so the stick never sticks.
4. WHERE the phone supports orientation events and the Player turns on Gyro aim THEN the Controller SHALL request permission from an explicit tap and send aim deltas, and IF permission is denied or unsupported THEN the Controller SHALL fall back to touch look without an error.
5. WHERE vibration is supported THEN the Controller SHALL pulse on turn start, time warning and card shown, and WHERE it is not supported THEN the Controller SHALL give a visual cue and an optional sound instead, and no feature SHALL depend on vibration.
6. THE Controller SHALL use touch targets of at least 48 CSS pixels, visible focus, text contrast of at least 4.5:1, never rely on colour alone, and offer a tap-to-walk direction pad as an alternative to the stick.

### Requirement 3

**User Story:** As a player, I want to add something of mine to the world, so that the mystery feels like ours.

#### Acceptance Criteria

1. WHEN the lobby is open THEN each Player MAY contribute a Suspect designed with the Ghost Creator traits or chosen from the Preset Ghosts, one photo to be framed in the world, and a name for one Zone of 3 to 24 characters, and the game SHALL start with none of them required.
2. WHEN a photo is contributed THEN the Room SHALL apply the upload rules of the world pipeline (type, size, magic bytes, metadata removal), downscale it to at most 512 pixels on the long side, obtain a safety verdict from a vision-capable model, and fail closed by rejecting the photo while keeping the Player seated.
3. WHEN a Suspect needs a portrait THEN the Room SHALL use the Ghost Creator flow with its image and model usage charged to the Room's budget, and SHALL substitute a Preset Ghost when quota is exhausted or generation fails.
4. WHEN the lobby closes THEN the Room SHALL build exactly six Suspects (contributed first, filled from Preset Ghosts), six Zones (named from contributions first, filled from a curated name list) and the six Relics, deterministically from the Room seed.
5. WHEN the world is entered THEN the Viewer SHALL show each accepted photo in a free-standing frame near its Zone, facing the spawn point, and the frame SHALL NOT block movement.
6. WHEN a Player opens the photo step THEN the Controller SHALL show three Photo Prompts offered to that Player, drawn from a fixed catalogue of exactly 12 everyday subjects that most people already have on a phone or can take in under a minute in the room (for example a meal, a pet, a window view, a street, a mug, shoes, the sky), each with a one-line tip, a "no people or faces" rule, and a statement that the photo will be shown on the shared screen.
7. WHEN the lobby opens THEN the Room SHALL offer each Player a set of three distinct Photo Prompts derived deterministically from the Room seed and the Player's seat, the Player SHALL choose one of the three, and WHERE the chosen Prompt source is `take_now` THEN the Controller SHALL open the phone camera directly, and WHERE it is `camera_roll` THEN the Controller SHALL open the photo picker.
8. WHERE a Player likes none of the three Prompts THEN the Controller SHALL let them skip to a fresh set of three, up to three skips, with no Prompt repeating for that Player across the sets, and SHALL also let them pick any photo of their own or leave the photo step, and none of these choices SHALL be required to start the game.
9. WHEN a contributed photo shows a clearly visible face or person THEN the Room SHALL reject it with the reason `person_visible` as part of the same safety verdict, keep the Player seated, and show the Prompt's tip again. This check is best effort, not a privacy guarantee, so the photo step SHALL also say that the photo will be shown on the shared screen and ask for no people.
10. WHEN the lobby is open THEN each Player MAY make their Suspect in one of three ways, chosen by that Player alone: a Preset Ghost, a ghost designed with the Ghost Creator traits, or, only WHERE the Master has switched selfie ghosts on (off by default) and the Player has given the consent of 3.11, a ghost made from their own selfie, and the Controller SHALL NOT ask for, push or reward a selfie, and the game SHALL start with none of them required.
11. WHEN a Player starts the selfie step THEN the Controller SHALL say in plain words that the selfie must be of the Player's own face, is used once to make a ghost portrait, is deleted at once and never stored, must not be used by anyone under 16, and that a fictional ghost is always available instead, SHALL need a tick from that Player, and SHALL record only a yes or no for that seat.
12. WHEN a consenting Player takes a selfie THEN the Controller SHALL use the live front camera and no photo picker, the Room SHALL check that one face is in frame, in focus and lit before any paid call, SHALL obtain a safety verdict, SHALL make one ghost portrait in the house style of the characters (a hand-coloured 19th century ghost photograph in soft natural colour, faintly translucent, on pure black; the colour is the living look that turns black and white at the Becoming, Requirement 19.8) from the selfie and a style reference with a prompt that holds no Player text, SHALL cut out the Sprite as the Ghost Creator does, SHALL charge it to the Room's image budget, and SHALL delete the selfie bytes the moment the portrait is made or fails.
13. IF a selfie is refused, fails a check, or a cap or the budget is exhausted THEN the Room SHALL substitute a Preset Ghost with no error screen and no block on starting, and a selfie Suspect SHALL be treated by every rule, line and view exactly like any other Suspect, including speaking as the Lodger.
14. WHEN a Player makes a designed or selfie Suspect THEN the Controller SHALL let them pick how the ghost sounds in plain words and with no free text, "a lower voice" (Mark) or "a lighter voice" (Chloe), with the lower voice when they pick nothing, SHALL never guess the voice from a face or a selfie, SHALL keep it as the Suspect's Lodger Voice for the rest of the game (a Preset Ghost keeps its own), and the choice SHALL change no rule, card, view or line, only which voice speaks the shared Lodger bank (`ghost-voice` 1.11).

### Requirement 4

**User Story:** As a player, I want secrets that only my phone shows, and clues hidden in the world, so that deduction and walking both matter.

#### Acceptance Criteria

1. WHEN the game starts THEN the Room SHALL choose the Solution from the seed, set aside three non-Solution cards as Residue, and deal the other 12 cards so that every card is in exactly one of the Solution, the Residue or one Hand, and Hand sizes differ by at most one.
2. THE Room SHALL send each phone only its own Private View (its Hand, the cards shown to it and the Residue it has found) and SHALL send the Host and Display only the Public View, which contains no Hand, no Residue and no Solution until the game has ended.
3. WHEN a prompt for the narrator is built THEN the Party Service SHALL include no card from any Hand, no Residue and not the Solution until the game has ended.
4. WHEN the Player opens the notebook THEN the Controller SHALL show a grid of the 18 cards against every Player and the Residue with the marks has, lacks, maybe and blank, SHALL fill in the Player's own Hand, every card shown to the Player and every Residue card the Player inspected, SHALL show how many of the three Residue cards the Player has found, SHALL mark a Player as lacking the three cards of a Suggestion that Player passed on only WHERE the auto-cross setting is on, SHALL make no other inference, SHALL never remove a mark the Player made, and SHALL keep the notebook only on the device.
5. WHEN Zones are placed THEN the Party Service SHALL choose six positions deterministically from the seed on walkable floor, within the walk radius, at least 3 m from the spawn and at least 4 m from each other, using authored Zones where a Gallery World supplies them and a fixed ring layout when validation fails, and IF the world's walk radius is below 7 m and it has no authored Zones THEN the Room SHALL refuse Party mode for that world with the reason `world_too_small` and point to the Gallery.
6. WHEN the Residue is placed THEN the Room SHALL hide each Residue card in a different Zone, deterministically from the seed. WHEN the active Player inside a Zone starts Inspect and stays for 10 seconds of the Turn, at most once per Zone per Player, THEN the Room SHALL show that Player privately the Residue card in that Zone or that there is none, SHALL add to the public log only the Zone that was inspected, and SHALL allow Inspect in a Zone under a Cold Spot.

### Requirement 5

**User Story:** As a player, I want fair timed turns and a way to earn more time, so that play is tense but fair.

#### Acceptance Criteria

1. WHEN the game starts THEN the Room SHALL choose the First player of Round 1 from the seed, and WHEN each later Round starts THEN the First player SHALL be the next Detective clockwise from the previous First player; the Room SHALL run Turns clockwise from the First player, one at a time, skipping Poltergeists, and the active Player SHALL control the shared camera through their own Controller while all other Players see the Public View and their own Private View, and WHEN a Turn starts the camera SHALL be positioned at the spawn point of the world so every Player begins from the same known location.
2. WHEN a Turn starts THEN the Room SHALL set the Turn Clock to the base seconds (Master choice of 30, 45, 60 or 90, default 60, reduced by any Blackout) plus the active Player's Bonus Seconds, capped at 120, run the clock on the server and send its deadline with the server time so every screen shows the same countdown.
3. WHEN the clock expires THEN the Room SHALL end the Turn with no penalty beyond the lost Turn and one Haunt level (and no Haunt level when a Spook was used on that Turn), and WHEN 10 seconds remain THEN every screen SHALL show a warning as visible text and the Controller SHALL pulse where supported.
4. WHEN a Player earns an Achievement THEN the Room SHALL add its Bonus Seconds to that Player's later Turns once per Achievement per game and announce it on the Public View, where the catalogue is: wanderer (visit three different Zones, +10 s), cartographer (visit all six, +15 s), quick feet (reach a Zone within 20 s of a Turn start, +5 s), persistent (make three Suggestions, +10 s) and second wind (lose two Turns to the clock, +10 s), derived only from the event log.
5. WHEN the active Player's phone disconnects THEN the Room SHALL pause the Turn Clock for up to 20 seconds and then end the Turn, and a Player who stays disconnected for two consecutive Turns SHALL be skipped until they reconnect.
6. WHERE the Master selects no clock THEN the Room SHALL run no Turn Clock, there SHALL be no Nudges and no Turn lost to the clock, and a Turn SHALL end by a sealed Accusation, a pass or the end of the Turn after a Suggestion, and the Master SHALL be able to pause and resume the game at any time.
7. WHEN a Player has become a Poltergeist THEN the Room SHALL skip them in the Turn order and their Hand SHALL still be used to answer Suggestions.

### Requirement 6

**User Story:** As a player, I want to suggest, accuse and win, so that the deduction has a payoff.

#### Acceptance Criteria

1. WHEN the active Player stands inside a Zone that is not a Cold Spot THEN the Controller SHALL let them make one Suggestion of a Suspect and a Relic for that Zone, at most one per Turn; the Room SHALL pause the Turn Clock while the Suggestion is answered, and WHEN it is resolved THEN the Room SHALL give the Player 15 seconds to seal an Accusation or end the Turn.
2. WHEN a Suggestion is made THEN the Room SHALL check the other Players clockwise from the suggester, including Poltergeists and Bots, publish a pass for each who holds none of the three cards, and stop at the first who holds at least one; IF that Player holds exactly one THEN the Room SHALL show it; IF they hold more than one and are a human Detective THEN the Controller SHALL let them choose which within 10 seconds; otherwise, and when no choice arrives in time, the Room SHALL show a held card already shown to that suggester if there is one and else one chosen from the seed; the card SHALL be shown privately to the suggester only, and the Public View SHALL say only who passed and who showed a card, or that no one could.
3. WHEN the active Player seals an Accusation of a Suspect, a Zone and a Relic during their Turn THEN the Room SHALL end that Turn, keep the Accusation out of every view but that Player's own, publish only that they sealed an Accusation, and refuse a second Accusation from the same Player in that game.
4. WHERE the Player scans a Relic Token with the phone camera THEN the Controller SHALL accept the payload `hw:<relic id>` as the Relic selection, reject any other payload, and keep manual selection available at all times.
5. WHEN a Round ends THEN the Room SHALL, in this order: (a) reveal together every Accusation sealed in that Round, and IF one or more are correct THEN end the game, reveal the Solution and make exactly those Players the winners, and for each wrong one make that Player a Poltergeist, tell only them that it was wrong without saying which card, publish that they joined the haunting and raise the Haunt by one; (b) IF every Player is a Poltergeist THEN end the game with the house winning; (c) raise the Haunt by one; (d) fire the Haunt Events of 11.2; (e) IF the Haunt is at its maximum THEN end the game with the house winning; and WHEN the house wins THEN no Player SHALL be a winner. IF the Haunt reaches its maximum during a Round THEN the Room SHALL finish that Round before step (e).
6. WHEN the game ends THEN the Room SHALL return the Solution, the Residue placements, the winners if any, ranked for the First Detective title by fewest Suggestions made and then least Turn time used, the Most Haunting award and the ending recap of 6.8 for the ending screen, and WHEN the Master chooses Play again THEN the Room SHALL start a new game with a new seed and the same world, Players and Contributions, and reset the Haunt, the Residue, Resolve and every Poltergeist.
7. WHEN a Player makes a Suggestion THEN the Controller SHALL offer every Suspect and every Relic, including cards in the Player's own Hand and cards the notebook marks as no, and the Room SHALL accept a Suggestion that names a Suspect or a Relic from the suggester's own Hand (a **Bluff**) like any other, resolve it by 6.2 looking only at the other Players' Hands, and until the game ends SHALL NOT mark it as a Bluff or reveal in any public event, log line, narrator prompt or view whether a named Suspect or Relic was in the suggester's Hand; only the ending recap of 6.8 SHALL say which Suggestions were Bluffs.
8. WHEN the game ends THEN the Room SHALL build an **ending recap** from the public log only, in order: each Round and Turn with the Player's nickname, each Suggestion (the Zone, the Suspect, the Relic and who showed a card, never which card, and a mark on every Suggestion that was a Bluff, whoever made it), each Inspect (the Zone only), each Accusation sealed and, when the Round ended, its result, each Haunt rise and Haunt Event with the option that applied, each change to a Poltergeist, and the sender of every Frame and House Cue as in 14.5, with the Solution and a count of Turns, Suggestions and Inspects for each Player, and the recap SHALL NOT contain any card shown, any Inspect or Eavesdrop result, any Hand, any Residue not yet found or any Stitch clip, and the Display SHALL play it as a scripted sequence within the limits of 7.4 that the Master can skip, and every phone SHALL show it as a list.

### Requirement 7

**User Story:** As a group in one room, I want a big shared screen and an optional hologram centrepiece, so that the table feels like a game.

#### Acceptance Criteria

1. THE Host SHALL be display-only. It SHALL show the Room Code and QR code until the game starts, request a screen wake lock, show a reconnect state when its connection drops, and then show the shared Viewer with a Public HUD of the active Player, the clock, the round, the Haunt level, the public log, Achievements and Poltergeists, with all ghost and narrator text in a polite live region and never any Hand, Residue or Solution.
2. WHEN a Controller drives the Viewer THEN the Viewer SHALL accept remote movement and look input through the ViewerBridge with the same speed, collision and comfort limits for every Player, and the Host SHALL offer no other input path than the embedded pad of "Play on this screen".
3. WHEN a device opens the Display URL of a Room THEN the Party Service SHALL send it only the Public View, and the Display SHALL draw the host ghost's Sprite on black four times at 0, 90, 180 and 270 degrees around the centre, sized from a footprint the user calibrates on screen without assuming any pixel density, with a single-view mode for plain screens and toggles for orientation and mirroring.
4. WHEN a public event occurs (suggestion, card shown, wrong Accusation, correct Accusation, Achievement, time warning, Haunt Event) THEN the Display SHALL react with a scripted animation limited to three flashes per second and a luminance change of at most 20%, SHALL remove flicker when the visitor prefers reduced motion, and on a correct Accusation SHALL reveal the culprit Suspect's Sprite.
5. IF no Display is connected THEN the game SHALL be unaffected.
6. WHERE the Master turns on spoken narration THEN the Host SHALL read each narration line aloud in the voice of that line's Speaker (7.8) of the `ghost-voice` spec (the browser's speech synthesis when that is unavailable), SHALL leave it off by default, SHALL always show the same line as text, and SHALL let the Master mute, replay or skip a line.
7. THE Controller SHALL be an installable web app with a manifest, an offline shell that explains how to rejoin, and a screen wake lock while a game is running, and no feature SHALL need a native app.
8. THE Party Service SHALL give every narration line, scripted or from a model, one Speaker fixed by its kind, from the three characters of the `ghost-voice` spec: the **Keeper** for the procedure of the game (turns, the clock, achievements, Suggestions, cards shown, Inspect, sealed Accusations, Cues and Nudges), the **Whisper** for the haunting (Haunt Events, a Player joining the haunting, and the haunting winning), and the **Lodger** for a Suspect (a text aside when a Suspect is named, a stall when a Suspect is accused, and the confession when the Solution is revealed), and SHALL speak a Lodger line aloud only for an Accusation and the reveal.
9. THE Lodger SHALL give no tell: until the Solution is revealed, every Lodger line and its delivery SHALL be chosen without reading the Solution, SHALL read and sound the same for a guilty and an innocent Suspect, SHALL come from one bank shared by all six Suspects, spoken in the Suspect's own Lodger Voice, which belongs to its profile and is never chosen from the Solution (`ghost-voice` 1.11), and SHALL say nothing about which part of a wrong Accusation was wrong; and the confession SHALL be spoken only for the Suspect in the Solution and only after the Solution is revealed, and no audio SHALL be prepared, requested or cached ahead of time because of the Solution (`ghost-voice` 1.9).

### Requirement 8

**User Story:** As a maker, I want printable relics and a pyramid holder, so that the table has real objects.

#### Acceptance Criteria

1. THE Print Kit SHALL contain original parametric models in `print/scad/` for six Relics (music box, wax hand, locket, planchette, silver key, bell), each with a base for a Relic Token, and SHALL NOT reproduce any third-party game's weapons, characters, names or art.
2. WHEN the Print Kit is built THEN `tools/build-print.mjs` SHALL generate each Relic Token plate as an STL from the payload `hw:<relic id>` with a module size of at least 1.2 mm and a plate no larger than 40 mm, check every STL for watertightness, positive volume and fit on a 180 mm bed, and fail on any violation.
3. WHEN a pyramid holder is built THEN its four trapezoid faces SHALL be computed from the base and top edge with the faces at about 45 degrees to the screen, defaulting to a 60 mm base and a 10 mm top, and the holder SHALL be parametric for larger screens.
4. WHERE a Suspect Sprite exists THEN the Print Kit MAY export a standee STL made from the alpha silhouette extruded with a base, which SHALL be watertight and fit the bed.
5. THE Print Kit SHALL be optional: no Room feature SHALL depend on any printed object.

### Requirement 9

**User Story:** As a judge or a lone visitor, I want to see party mode with one laptop, so that I never need friends, phones or hardware.

#### Acceptance Criteria

1. WHERE no phone has joined THEN the Host SHALL offer "Play on this screen", which seats the page itself as the first Player through the normal join flow, makes it the Master and shows that Player's Controller pad beside the world, and the Master SHALL be able to add Bots up to the Player limit.
2. WHEN a Bot has a Turn THEN the Party Service SHALL choose only legal actions using only that Bot's Private View and the Public View, SHALL infer card locations from its Hand, the cards shown to it, the Residue it found, every pass, every showing, the public Hand sizes and its own Eavesdrop hints, SHALL Inspect a Zone it has not inspected while it knows fewer than three Residue cards, SHALL seal an Accusation only when each category has one candidate left (Standard) or its chance of being right is at least one half (Gentle), SHALL answer and Eavesdrop by the defaults of 6.2 and 11.4, SHALL wait between 1.5 and 6 seconds before each action, SHALL make every choice deterministically from the seed, and SHALL NOT send a Cue, Nudge, Frame or Rattle or choose a Haunt Event.
3. WHERE every other seat is a Bot THEN the embedded pad MAY show the Master's Private View on the shared screen, WHERE the Party Service determines this condition server-side and sends the permission only when every other seated Player is a Bot, and WHERE any other human is seated THEN the Host SHALL NOT show any Private View.
4. THE Wander memory walk SHALL be unaffected by Party mode, and WHILE world generation or model quota is exhausted THEN Party mode SHALL still run with Gallery Worlds, Preset Ghosts and scripted narration.
5. WHEN a visitor alone chooses to play a case on one screen THEN the Shell SHALL let them choose a world, a preset (Classic, Relaxed, which is Gentle, or Quick) and two to five Bots (default two, at the level of the preset), and the Host SHALL then create the Room, seat the visitor as the first Player and Master through the normal join flow, add those Bots, fill every Suspect and Zone name from the Preset Ghosts and the curated Zone names, and start the game, with no phone, no photo contribution, no Room Code and no model call needed, and a world that is too small for a case SHALL be refused as in 4.5.
6. WHILE every other seat is a Bot THEN the Room SHALL run exactly the rules of Multiplayer with no special case, the Controller SHALL offer no Nudge, Frame or Rattle (there is no other human to nudge, frame or watch), the light bar, Stitch and the Spirit lens SHALL be absent, spoken narration SHALL stay off unless the visitor turns it on, and leaving the screen or reloading SHALL end the Room.

### Requirement 10

**User Story:** As the operator, I want party mode bounded in cost and safe for private photos, so that a crowd or a bug cannot hurt anyone or the budget.

#### Acceptance Criteria

1. WHEN a Room needs a paid call THEN the Party Service SHALL reserve it from SpendGuard against the Room's own caps (images 12, model calls 60, by default) in addition to the global caps, and SHALL make no upstream call when any cap denies.
2. WHEN narration is needed THEN the Party Service SHALL request at most one model narration per public event for the whole Room, not one per phone, and SHALL use scripted lines when the cap is reached, the kill switch is on, or the reply fails validation, with game state identical in every case.
3. WHEN a nickname, Zone name or Suspect detail is used in a prompt THEN the Party Service SHALL place it only inside a delimited data block, strip control characters and enforce its length limit.
4. WHEN a Room is deleted THEN the Party Service SHALL remove its photos, Sprites, nicknames and state immediately, and SHALL use a photo for nothing but moderation and its frame (a selfie is not a photo contribution: it is used for nothing but its ghost portrait, 3.12, and is never stored).
5. THE Party Service SHALL record only counters and error codes (rooms, players seated, turns, suggestions, accusations, timeouts, fallbacks), and SHALL NOT record nicknames, photos, Zone names, details or narration text.
6. THE Party Service SHALL rate limit join attempts by hashed IP, allow one active Room per host session and at most 20 active Rooms in total by default, and refuse the rest with a reason code.
7. WHERE `PARTY_ENABLED` is false THEN the Party Service SHALL refuse to create Rooms, solo cases included, while Wander keeps working.

### Requirement 11

**User Story:** As a player, I want the haunting to push back and every player to stay in the game, so that waiting is never dull and a wrong guess is not the end.

#### Acceptance Criteria

1. WHEN the game starts THEN the Room SHALL set the Haunt to 0 with a maximum chosen by the Master (8, 10 or 12, default 10), and SHALL raise it by one when a Round ends, by one when a Turn ends by the clock unless a Spook was applied during that Turn, and by one for each wrong Accusation when it is revealed, never above the maximum and, except through a Lull, never down, and SHALL end the game only as in 6.5.
2. WHEN the Haunt first reaches 3, 6 or 9 and is below the maximum THEN the Room SHALL fire one Haunt Event for that threshold, drawn from Cold Spot (one Zone cannot be the Zone of a Suggestion until the end of the next Round, while Inspect there stays allowed), Blackout (the next Turn's base seconds drop by 15 but never below 15 and the Host scene dims within the photosensitivity limits), Restless (the ghost Sprite moves to another Zone and the narrator says so, with no effect on the rules) and Lull (the Haunt falls by one but never below 0), and SHALL offer two distinct options chosen from the seed, of which a human Poltergeist chooses one within 15 seconds, the Poltergeists taking turns in the order they joined, and otherwise the first applies.
3. WHEN a Player's Accusation is revealed as wrong THEN that Player SHALL become a Poltergeist who keeps their seat, nickname, Hand and Resolve, whose Hand answers Suggestions with the default choice of 6.2, who takes no Turns and cannot suggest, accuse, inspect, Eavesdrop or win, and who may send Cues, Nudges, Frames and Rattles and choose Haunt Event options.
4. WHEN a Round starts THEN each Player, including a Poltergeist, SHALL gain one Resolve up to a maximum of three, and WHEN a card has been shown for another Player's Suggestion THEN each Detective other than the suggester and the Player who showed it MAY spend one Resolve within 10 seconds to Eavesdrop, and the Room SHALL tell each such Player privately one of the other two named cards, chosen from the seed for that Player, SHALL never tell them the card shown, and SHALL publish who eavesdropped; Resolve is also what a Nudge costs (12.3).
5. THE Public View SHALL carry the Haunt level, the Poltergeist seats, each Player's Hand size and Resolve count, who eavesdropped and how many Accusations are sealed in the current Round, as numbers and names only, and never a Hand, a Residue card, the content of an Accusation or the Solution before the game ends, and every game SHALL end within the Haunt maximum plus three Rounds.
6. THE Room SHALL give each Poltergeist scare points from the event log (one per Frame sent, one per Rattle accepted, one per Haunting puzzle solved (`puzzles` Requirement 17), two per Spook applied, three for each Turn that ended by the clock while they had Spooked or Rattled during it), SHALL name the Poltergeist with the most on the ending screen as Most Haunting, and SHALL let the points change no rule.

### Requirement 12

**User Story:** As a player waiting for my Turn, I want small ways to take part, so that I am never only watching; and as the player on my Turn, I want those ways to be limited, so that nobody can wreck my Turn.

#### Acceptance Criteria

1. WHEN a Player who is not the active Player and not a Bot plays a Cue THEN the Room SHALL accept one of the four catalogue Cues, at most one per Player every 4 seconds, with at most three Cues playing at once and at most six Cues per Turn for the whole table, SHALL add it to the public log as text under the Player's nickname, and SHALL change no rule, and WHEN a limit is reached THEN the Room SHALL refuse the Cue with a reason and play nothing.
2. WHEN a Player who is not the active Player and not a Bot (a Poltergeist may) uses a Nudge while a Turn Clock runs THEN the Room SHALL spend that Player's Resolve (Help 1, Spook 2) and refuse the Nudge without enough Resolve, SHALL add 10 seconds (Help, never past 120 seconds) or remove 10 seconds (Spook) from that Turn's clock for every screen at the same deadline, and SHALL announce it in the public log under the Player's nickname.
3. A Spook SHALL be accepted only when at least 20 seconds remain on the clock, the Turn's total seconds stay at 30 or more after it, no Spook has been used in this Round by any Player or in any of the previous three Turns, and the Player did not Spook on the previous Turn, and otherwise the Room SHALL refuse it with a named reason (for example `spook_round_limit`) and spend no Resolve, so that a 30-second clock never allows a Spook.
4. THE Room SHALL allow at most one Help and one Spook per Turn, so that Nudges add at most 10 seconds and remove at most 10 seconds from any Turn, and every per-Player limit (Resolve, Nudges, Cue timing, sounds per Round, Frames) SHALL belong to the seat and survive a reconnect, and the Room SHALL count each accepted Nudge in one of two counters, one for Players who joined the haunting and one for everyone else, which change no rule and are shown on the ending screen.
5. WHERE the Master sets Sounds off, or sets Nudges to help-only or off, THEN the Room SHALL refuse the disabled actions with a reason code and change nothing else, the defaults being Sounds on and Nudges set to Help and Spook, and the setting SHALL apply from the next action; the Master panel SHALL offer the presets Classic (base 60 seconds, Haunt maximum 10, Help and Spook, Frames on, auto-cross off, Standard Bots), Gentle (base 90, maximum 12, Help only, Frames off, auto-cross on, Gentle Bots) and Quick (base 45, maximum 8, Help and Spook, Frames on, auto-cross off, Standard Bots), and no Cue, Nudge or Frame SHALL use a paid call or a model: their public lines are scripted.

### Requirement 13

**User Story:** As a player, I want to see and understand every Cue and Nudge, so that nothing happens to the table silently.

#### Acceptance Criteria

1. WHEN a Cue, Nudge, Frame or House Cue happens THEN the Host SHALL show it as a text line in the public log and in a polite live region, a Cue played on the TV SHALL last at most 3 seconds, no sound SHALL be the only signal of anything, every screen SHALL show a changed Turn Clock deadline within one second with the active Player's Controller showing "+10 s" or "-10 s" and the nickname as text, and the Controller menu SHALL offer the Cue picker (the four Cues, TV or this phone), Help and Spook with their Resolve cost and, where Frames are on, the Frame picker (a Player and a Cue), each with touch targets of at least 48 CSS pixels and an unavailable one explained in words.
2. WHEN a Player's Accusation is revealed as wrong THEN every player-facing string (the Controller, Host HUD, Display, scripted lines, narrator lines and ending screen) SHALL say that the Player "joined the haunting" and SHALL NOT use the word "Poltergeist", and WHEN the house wins THEN the ending SHALL say that the haunting continues, that no one won, and who joined the haunting.

### Requirement 14

**User Story:** As a player, I want the phones to be part of the haunting, only if their owners agree, so that a creak can come from the table and nobody can tell who made it.

#### Acceptance Criteria

1. WHEN a phone is seated THEN the Controller SHALL ask once, with a tap that also unlocks audio, whether the house may play sounds on it, keep the answer on the seat and let the Player change it at any time, play a sound on a phone only after a yes and at most three sounds per phone per Round from every source except the Player's own Puzzle sounds (the `puzzles` spec: interface sounds the Player makes by playing a Lock, played only on their own phone after the same yes, never counted toward the three and never sent to another phone or the Host), and WHERE a consenting phone cannot play sound THEN it SHALL flash (at most three flashes per second, none when the visitor prefers reduced motion) and vibrate where supported instead, and no feature SHALL depend on sound.
2. WHEN a Player who is not the active Player plays a Cue THEN they SHALL choose the TV (the default) or their own phone as the place it plays, a Cue on their own phone SHALL need their consent, last at most 3 seconds and share the limits of Requirement 12.1, and the public log SHALL show it under their nickname.
3. WHEN a Haunt Event fires THEN the Room SHALL play a House Cue on one phone chosen from the seed among consenting phones with a free sound slot (on every such phone in seat order, 400 milliseconds apart, for Restless), SHALL log it as text such as "a creak came from Sam's phone" without saying the house made it, and SHALL tell only that phone's owner privately "that was not you".
4. WHEN a Player who is not the active Player plays a Cue on another Player's consenting phone (a Frame) THEN the Room SHALL accept it only while Frames are on, at most one per sender and one per target per Round and within the Cue limits of Requirement 12.1, SHALL charge no Resolve and change no rule, SHALL log it as the same public event as a House Cue naming only the target's phone, and SHALL tell only the target privately "that was not you".
5. WHEN the game ends THEN the ending screen SHALL reveal the sender of every Frame and mark every House Cue as the house's, and before the end no Public View, public event, log line, narrator prompt or other Player's Private View SHALL carry the source of any Frame or House Cue, so that a House Cue and a Frame are indistinguishable until then.
6. WHEN the Master turns Frames off THEN the Room SHALL refuse every Frame with a reason, and WHEN the Master turns sounds off THEN no sound SHALL play on any device while every line stays in the log as text, and neither switch SHALL need a paid call or a model.

### Requirement 15

**User Story:** As a player, I want the room to share the real sky and the real hour, so that the haunting feels tied to a real place and time.

#### Acceptance Criteria

1. WHEN the host's local clock reaches the top of an hour during a game THEN the Room SHALL sound a Bell on the Host and, at the same server time, on every phone with Sound Consent and a free sound slot, log it as text, and change no rule.
2. WHEN the host's local time is midnight THEN the Host SHALL strike the Bell twelve times, the ghost SHALL speak one scripted midnight line, and nothing about the clock, Resolve, the Haunt, a Hand or the Solution SHALL change.
3. THE Master SHALL be able to turn the hour strike off, and it SHALL be on by default.
4. WHEN the Master starts a game THEN the Master SHALL be able to choose a place from a city search, the table's location, or conditions off, and the Room SHALL read the conditions once through the `conditions` spec, freeze them for the whole game, show the atmosphere on the Host, add only the weather class, time of day and moon to the Public View, and let the real world change looks, sound and the ghost's words but never a rule.

### Requirement 16

**User Story:** As a player, I want an optional private lens on my phone, so that the haunting also has a layer only I can see.

#### Acceptance Criteria

1. THE Spirit lens SHALL be off by default and a Player SHALL turn it on for themselves, point the phone at the TV, tap to calibrate and then turn the phone to look around the layer, asking for motion permission from an explicit tap and showing a fixed view where there are no sensors.
2. THE Spirit lens SHALL draw only the Player's own notebook marks, the Zones they inspected and ripples from Cues, using only their own Private View and the Public View, so that the server sends no new hidden information for it.
3. THE Spirit lens SHALL draw simple sprites at no more than 30 frames per second and SHALL pause when the phone is face down or the page is hidden.
4. THE Spirit lens SHALL say that it is a private layer around the Player that can drift, SHALL offer a re-tap to calibrate again, and SHALL use neither the camera nor markers.

### Requirement 17

**User Story:** As a player, I want the haunting to reach across the phones as light, so that the whole table feels it together.

#### Acceptance Criteria

1. WHEN a phone is seated THEN the join question SHALL also ask, with the sound question, whether the house may light that phone's screen, SHALL keep the answer on the seat and let the Player change it at any time, and the light bar SHALL be on by default with a Master switch.
2. WHEN a Haunt Event, the hour strike or a House Cue happens THEN the Room SHALL run one light cue (a wave, a heartbeat, a failing bulb, a creeping dark or a one-phone glow) across the consenting phones in seat order.
3. THE light cues SHALL use greys and whites only and never a colour, at most two brightness changes per second, fades only, a peak below full white and a length of at most 6 seconds, and SHALL not run for a Player who prefers reduced motion.
4. WHEN the Room starts a light or sound cue on several phones THEN it SHALL set the start at a server time at least 500 milliseconds ahead using each phone's measured clock offset, and SHALL drop a phone whose offset error is over 150 milliseconds rather than play the cue late.

### Requirement 18

**User Story:** As a group, I want the ghost to be able to whisper a line made from our own words, only if each of us agrees, so that the haunting can sound like the room.

#### Acceptance Criteria

1. THE Master SHALL be able to turn Stitch on for the Room, it SHALL be off by default, and nothing about Stitch SHALL be asked or recorded while it is off.
2. WHEN Stitch is on THEN the join question SHALL ask each Player for their own yes, the Master SHALL NOT be able to say yes for anyone, the question SHALL say in plain words that the clips are deleted when the game ends and that a parent or guardian should say yes for a child, and SHALL include a tick "I am 16 or older, or a parent or guardian is saying yes for me" kept only as a yes or no, and WHEN a Player leaves THEN the Room SHALL delete their clips at once.
3. WHEN a consenting Player records the Word Bank THEN the Room SHALL accept each word through the word check of the `ghost-voice` spec, never block the lobby or the start for a missing clip, and never use a Player who has no clips.
4. WHEN a Haunt Event fires or it is midnight THEN the Room MAY play one stitched line on the Host with a subtitle, at most once per Round and twice per game, never in the first 60 seconds of a game or during the end-of-Round reveal, never from the same Player twice running, with the log saying only "a voice whispered", and no rule SHALL change.
5. WHEN the game ends or 6 hours pass THEN the Room SHALL delete every clip, and the ending screen SHALL show each stitched line and whose words it used.

### Requirement 19

**User Story:** As a player who has joined the haunting, I want to rattle the house from my phone, so that I am still part of the table, without anyone knowing who did it.

#### Acceptance Criteria

1. THE Room SHALL let only a Poltergeist Rattle, by shaking their phone (a deliberate shake is three swings above a set strength within 1.5 seconds) or, without sensors, with a hold-to-rattle button.
2. THE Rattle SHALL be a Cue by gesture and share every Cue limit of Requirement 12.1: 4 seconds between sends, 6 per Turn for the whole table and 3 sounds per phone per Round, refusing it with a reason when a limit is reached.
3. EACH Poltergeist SHALL turn Rattle on for themselves, off by default because iPhones ask for motion permission, and the Master's Rattle switch SHALL be on by default.
4. WHEN Rattles are accepted in a Turn THEN the effect SHALL follow their number (1 to 2 a creak and a slow grey breathing, 3 to 4 wind and a grey wave in seat order, 5 to 6 a low rumble and a creeping dark that returns as a pale swell), played on the Host and on every phone that said yes at no more than 80 percent volume, a phone with no sounds left for the Round getting the light only, and the count SHALL reset each Turn.
5. THE public log SHALL say only "the floorboards creaked", "a wind passed" or "the house rumbled", the ending screen SHALL list every Rattle with who sent it, and no clock, Resolve, Haunt level, Hand or Solution SHALL be touched.
6. WHEN a Player joins the haunting THEN a sting of at most 4 seconds SHALL play on their own phone and the Host with a grey fade of the light bar outward from their seat, once per Player and not counted toward the 3 sounds a phone gets, and their phone SHALL then offer Rattle.
7. WHILE a Turn runs THEN a Poltergeist's phone SHALL show a private prompt to start the first Rattle and a stronger one once someone else's Rattle has landed, each at most once per Turn, with a button to turn Rattle on, and no sender SHALL be named.
8. WHEN a Player joins the haunting THEN that Player's Seat Portrait SHALL change, once and for the rest of the game, from full colour to black and white on every screen that shows it (the Controller header, the Host HUD and the ending screen), as a cross-fade of at most 0.6 seconds (a cut under reduced motion); the black and white picture SHALL be the pre-made one for a Preset Ghost and the same picture drawn in greyscale for any other portrait; a nickname chip SHALL lose its colour the same way; and the change SHALL never be the only signal, because the nickname row also says "joined the haunting" (Requirement 13.2).
9. THE look of a Seat Portrait SHALL follow only the Poltergeist seats of the Public View, so that it reveals nothing about any Hand, the Residue or the Solution, and no colour change SHALL apply to a Suspect card, a Lodger speaker badge, the Keeper, the Whisper or any other picture, so that the colour of a Suspect says nothing about the case.

### Requirement 20

**User Story:** As the maker, I want the game's sounds to be a few small, properly licensed files that the game does not depend on, so that nothing is blocked while they are found.

#### Acceptance Criteria

1. THE game SHALL use seven sound files (creak, whisper, bell, laugh, wind, rumble, becoming), each mono `.m4a` of at most 50 kilobytes, at most 350 kilobytes in all, at most 3 seconds (the becoming at most 4), levelled to about -16 LUFS, with no words, no real person's voice and nothing from a film, game or song.
2. WHEN a sound file is absent THEN the game SHALL behave identically except that the phone flashes and vibrates and the Host shows the log line, and nothing SHALL fail or wait.
3. THE build check SHALL fail on a sound file with no credit in `docs/sounds/CREDITS.md`, over a size limit or in the wrong format.

### Requirement 21

**User Story:** As a Player, I want the screens of this feature to look and behave like the rest of the game, so that it feels like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (Host, Controller and Display) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE Host SHALL show the stage, the Haunt and the players with `ui-stage`, `ui-meter` and `ui-chips`, and the ghost's and the Keeper's lines with `ui-nameplate` and `ui-dialogue`; THE Controller SHALL use `ui-button`, `ui-tool`, `ui-chips` and `ui-sheet` for its menu; and the HUD SHALL show only what this spec gives a Player.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
