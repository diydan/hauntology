# Design Document

## Overview

**The server holds the secrets, the engine decides, the model narrates.** A `PartyRoom` Durable Object owns one game: seats, the Master, contributions, the Solution, the Residue, every Hand, the Haunt, the turn clock and the event log. Phones, the display-only Host screen and the optional Display are all thin clients that receive *views* the server computes for them. Every control lives on a phone. One Player, the **Master**, runs the room; the laptop or TV only displays. Game rules are pure functions in `shared/src/party/` (deal, residue, haunt, resolve, master, views, turn order, clock, achievements, suggestion, accusation, bots), so they are property-tested without a network or a model. Narration reuses the ghost engine's validation and scripted-fallback approach, with party-specific directives and a prompt builder that can only see the Public View.

Decisions:
- **Premise stays gentle.** "Who is haunting this place?" (visitor ghost, zone, relic), not a murder. This keeps `steering/product.md` principle 3 intact and the content safe for a shared screen.
- **Every control is on a phone.** The Host never takes game input. The first Player to join is the Master and runs the room. A laptop-only visitor uses "Play on this screen", which seats the Host page itself as a Player and embeds that Player's pad beside the world.
- **Replace weak mechanics, do not stack new ones.** Walking was only a commute, five of six players idled on each Turn, a wrong Accusation ended your game, and the ghost only narrated. Residue and Inspect give walking a purpose, Resolve and Eavesdrop give waiting players a reaction, Poltergeists keep everyone in, and the Haunt turns the round limit into a rising threat. If time runs short, cut Resolve and Eavesdrop first, then spoken narration. The Haunt, Residue and Poltergeists stay in the core.
- **The app is the antagonist.** Ideas are borrowed from table games (an app as the opponent, a dead player who switches sides, objective markers, reactions). None of their content is used.
- **Phones are pads and private screens, as an installable web app.** The same page switches between pad layout (landscape) and panel layout (portrait). A manifest, an offline shell and a wake lock make it feel like an app. No native app and no account.
- **Server-authoritative clock and rules.** Clients render; they never decide. The Host reports pose at 4 Hz (it owns the collider) and the room sanitises it exactly as the ghost engine does.
- **Suggestions resolve automatically.** The first holder clockwise shows a card without anyone tapping, so a slow, absent or Bot player never stalls the table, and card choice is seeded for tests.
- **Narration never changes rules.** Haunt levels, Haunt Event choices, Poltergeists and Resolve are rules. Spoken or written narration reads them and cannot change them.
- **Everything physical is optional.** Relic tokens and the pyramid are bonuses; manual selection and a plain single-view Display always work.
- **Reuse, do not fork.** Zone placement extracts a helper from `ghost/anchors.ts`; contributions reuse the Ghost Creator, the world pipeline's upload and moderation rules, `SpendGuard`, and `validateGhostReply`.
- **Held back for later:** secret missions for each player and asymmetric player roles. Both need a lot of content.

Depends on: `ghost-creator` (Traits, Preset Ghosts, portrait and sprite routes, Persona), `ghost-engine` (anchor placement helper, `sanitizePose`, reply validation, scripted lines), `world-pipeline` (SpendGuard meters, upload rules, moderation, retention), `world-viewer` (`ViewerBridge`, haunt layer, billboard).

## Architecture

```mermaid
flowchart LR
  subgraph Room["one PartyRoom Durable Object"]
    S[(PartyState + secrets)]
    C[single alarm: nextWake]
  end
  subgraph Dir["PartyDirectory Durable Object (singleton)"]
    D[(active rooms, per-session count)]
  end
  M[Master phone: Controller + room controls] <-- WebSocket --> Room
  P2[Other phones: Controller] <-- WebSocket --> Room
  H[Laptop or TV: Host, display only + Viewer] <-- WebSocket --> Room
  D2[Optional tablet: Display, pyramid] <-- WebSocket --> Room
  Room --> G[SpendGuard]
  Room --> B[Workers AI: moderation, portraits, narration]
  Room -- register/unregister --> Dir
  T[Printed Relic Token] -. QR scan .-> P2
  H -. "Play on this screen: embedded pad" .-> Room
```

```mermaid
sequenceDiagram
  participant C as Controller (active)
  participant H as Host + Viewer
  participant R as PartyRoom
  participant N as Narrator
  H->>R: pose (4 Hz)
  C->>R: input {move, look} (<= 30 Hz)
  R-->>H: input (active player only)
  C->>R: act inspect (10 s inside a Zone)
  R-->>C: private {inspected: zone, card or none}
  C->>R: act suggest {suspect, relic}
  R->>R: inside zone? once per turn? resolve(first holder clockwise)
  R-->>C: private {shown card}
  R->>N: public event {suggest, refuter or none}
  N-->>R: line (model or scripted)
  R-->>H: public view + event + line
  R-->>C: next turn / clock
```

## Components and interfaces

### Master and the Host screen
- **Creation.** The Host page opens the Party page and calls `POST /api/party/rooms` with no body. The Room has a code, a join URL and a host token, and `settings.worldId = null`. No world is chosen yet, so `world_too_small` cannot happen at creation.
- **The Master.** The first Player seated is the Master (`masterSeat`). The Master picks the world, settings, Bots and the start from their phone. A world is validated when the Master chooses it: `world_too_small` is returned there, and `start` without a valid world returns `world_not_set`.
- **Authority.** `canControl(state, token, command)` is the only check for room controls. Master token: `settings`, `start`, `pause`, `resume`, `addBot`, `end`, `playAgain`, `handOver`, `speech`. Host token: `end` only. Any other token: none.
- **Hand-over and timeout.** `nextMaster(players, current)` returns the next human seat in seat order, wrapping, never a Bot, or `null` when there is no other human. The Master can hand over at any time. When the Master has been disconnected for 60 seconds, the Room passes the role the same way, once. If `null`, the Master keeps the role until the Room expires.
- **Display-only Host.** The Host shows the Room Code and QR until `start`, asks for a screen wake lock, shows a reconnect state when its socket drops, and then shows the Viewer with the Public HUD. It still owns the collider and reports pose, and it still has the host token, which can only end the Room.
- **Play on this screen.** When no phone has joined, the Host offers a button that joins the page itself as a Player through the normal join flow. That Player becomes the Master, and the Host embeds that Player's Controller pad beside the world. The pad may also accept keyboard and mouse bindings, but every input still travels as that Player's own `input` message. The Master adds Bots from the embedded pad's menu. The embedded pad shows the Private View only when `peekAllowed` (every other seat is a Bot).
- **Spoken narration.** `settings.speech` (default `false`) tells the Host to read each narration line with the browser's `speechSynthesis`. The Master sends `speech {action: 'mute' | 'unmute' | 'replay' | 'skip'}`, which the Room relays to the Host. The text is always shown. Voices differ on every device, which is why the feature is off by default.
- **Installable web app.** The Controller ships a web manifest, a service worker with an offline shell that explains how to rejoin, and requests a screen wake lock while `phase === 'playing'`. Nothing depends on a native app.

### Routes and sockets
| Route | Purpose | Req |
|---|---|---|
| `POST /api/party/rooms` | create Room, no world → `{code, joinUrl, hostToken}` or `party_disabled`, `rooms_full` | 1.1, 10.6, 10.7 |
| `POST /api/party/:code/join` `{nickname}` | seat a Player; the first is the Master → `{playerToken, seat, master}` or reason | 1.2, 1.3 |
| `GET /api/party/:code/ws` | WebSocket upgrade (origin checked); first message `hello {token, role}` within 5 s | 1.4, 1.6 |
| `POST /api/party/:code/contribute/photo` | multipart image + `promptId?`; moderation (includes `person_visible`); frame | 3.2, 3.9 |
| `POST /api/party/:code/prompt/skip` | up to three skips per Player → `{round, prompts}` or `{error}` | 3.8 |
| `POST /api/party/:code/contribute/suspect` | traits → Ghost Creator flow charged to the Room | 3.3 |
| `PUT /api/party/:code/contribute/zone` | zone name | 3.1 |
| `DELETE /api/party/:code` | Master or host token ends Room; delete everything | 1.5, 1.7, 10.4 |

### PartyDirectory Durable Object
A single named DO (key `"party-directory"`) is the only place that tracks live rooms. `createRoom(code, sessionId)` atomically checks the 20-room total cap and the one-active-room-per-session rule, inserts the entry and returns `ok` or `rooms_full`. `deleteRoom(code)` removes the entry. `PartyRoom` calls both under its own mutex so the directory is always consistent; a failed `createRoom` rolls back the new DO stub immediately. The directory stores only: code → {createdMs, sessionId}. It has no sockets and no alarm of its own. **This is the only place that enforces the total Room cap and the per-session cap** (Req 10.6).

Roles: `host`, `controller`, `display`. The Master is a `controller` whose seat is `masterSeat`. The join URL carries only the Room Code. Tokens are issued after join (players) or at creation (host), are random 128-bit values, and are sent only in the socket's first message or an `Authorization` header, never in URLs.

### Socket messages (zod schemas in `shared/src/party/protocol.ts`)
Client → Room: `hello`, `ready`, `input {seq, move:[x,y], look:[dx,dy], aim?:[dx,dy]}`, `pose {pos, yaw}` (host only), `act {kind:'suggest', suspect, relic}`, `act {kind:'accuse', suspect, zone, relic}`, `act {kind:'inspect'}`, `act {kind:'pass'}`, `eavesdrop {eventId}`, `choose {eventId, option}` (Poltergeists only).
Master only: `settings {worldId?, baseSeconds?, hauntMax?, speech?}`, `start`, `pause`, `resume`, `addBot`, `end`, `playAgain`, `handOver {seat}`, `speech {action}`. Host token only: `end`.
Room → Client: `publicView`, `privateView`, `event {id, kind, data}` (public), `shown {card}` (private), `inspected {zone, card | null}` (private), `heard {eventId, category}` (private), `choice {eventId, options, deadlineMs}` (to Poltergeists), `haunt {level, event?}` (public), `clock {deadlineMs, serverNowMs}`, `speech {action}` (to the Host), `error {code}`.
Every message is validated; unknown or oversized messages close the socket. `input` and `pose` are not persisted.

### `shared/src/party/`
`roomCode.ts` (`generateRoomCode`, `normalizeCode`), `nickname.ts` (`sanitizeNickname`), `seats.ts` (`seatPlayer`, `canJoin`), `auth.ts` (`authorize(token, resource)`), `master.ts` (`canControl`, `nextMaster`, `handOver`), `room.ts` (serialise/parse, expiry), `input.ts` (`sanitizeInput`, `coalesceInput`, `releaseAll`), `pool.ts` (`buildPool`), `photoPrompts.ts` (`PHOTO_PROMPTS`, `offerPrompts`, `skipOffer`), `deal.ts` (`dealCase`), `residue.ts` (`placeResidue`, `canInspect`, `inspect`), `views.ts` (`publicView`, `privateView`), `zones.ts` (`placeZones`, `validateZones`, `ringZones`), `notebook.ts` (`autoMarks`, `markCard`), `turns.ts` (`nextPlayer`, `advance`), `budget.ts` (`turnBudget`), `achievements.ts` (`earned`, `bonusSeconds`), `clock.ts` (`clockStatus`, `nextWake`, `onDisconnect`), `haunt.ts` (`hauntRise`, `eventOptions`, `fireEvent`, `chooseOption`, `applyEvent`), `resolve.ts` (`gainResolve`, `canEavesdrop`, `eavesdrop`), `suggest.ts` (`canSuggest`, `resolveSuggestion`), `accuse.ts` (`resolveAccusation`, `gameOver`), `relicToken.ts` (`parseRelicToken`), `ending.ts` (`endingPayload`, `playAgain`), `bots.ts` (`botAct`), `narrate.ts` (`PartyDirective`, `buildPartyPrompt`, `partyScripted`), `spend.ts` (`roomCaps`, `narrationRequests`), `telemetry.ts` (whitelist), `limits.ts` (`acceptJoin`, `acceptRoom`), `display.ts` (`pyramidLayout`, `effectLimits`).
`shared/src/print/`: `stl.ts` (`writeStl`, `checkMesh`), `qrPlate.ts` (`qrPlateMesh`, `rasterTop`), `pyramid.ts` (`pyramidTrapezoid`, `holderParams`), `standee.ts` (`standeeMesh`).

**Photo Prompts.** `PHOTO_PROMPTS` is a fixed catalogue of 12 entries, each `{ id, text, tip, source: 'camera_roll' | 'take_now' }`: a meal you ate recently, a pet or any animal, the view from a window, a street or building near home, a place outdoors you like, a mug or cup you use, your shoes, the sky right now, something on the nearest table, a plant, a door you use every day, a favourite chair or corner. Every `tip` ends with "No people or faces." `offerPrompts(seed, seat, round) → [PromptId, PromptId, PromptId] | null` shuffles the catalogue with the seeded stream `photo:<seat>` (derived from the Room seed) and returns entries `3 × round` to `3 × round + 2`, for `round` 0 to 3, and `null` for any larger round. Four rounds of three use all 12 entries exactly once, so a Player who skips three times never sees a repeat. The Room stores only each Player's current `round` (the skips used); there is no cross-Player rule, so two Players may be offered or choose the same Prompt. `skipOffer(round) → round + 1 | null` returns `null` after the third skip. Prompts are not secret and travel in the lobby view; they are not a Contribution and are never required. The vision verdict returns `{safe, personVisible}`; `personVisible` turns into the `photo_rejected:person_visible` reason.

```ts
type Seat = 1 | 2 | 3 | 4 | 5 | 6;
type CardKind = 'suspect' | 'zone' | 'relic';
type Card = { kind: CardKind; id: string };            // s1..s6, z1..z6, r1..r6
type Solution = { suspect: string; zone: string; relic: string };
type Settings = { worldId: string | null; baseSeconds: 30 | 45 | 60 | 90 | null; hauntMax: 8 | 10 | 12; speech: boolean };
type Player = { seat: Seat; nickname: string; kind: 'human' | 'bot'; connected: boolean;
                poltergeist: boolean; resolve: number /* 0..3 */; inspected: string[] /* zone ids */;
                hand: Card[]; achievements: AchievementId[]; missedTurns: number };
type Phase = 'lobby' | 'playing' | 'ended';
type Turn = { seat: Seat; round: number; startedMs: number; budgetMs: number | null; pausedMs: number; suggested: boolean;
              inspecting?: { zone: string; untilMs: number } };
type HauntOption = 'cold-spot' | 'blackout' | 'restless' | 'lull';
type Haunt = { level: number; max: 8 | 10 | 12; fired: (3 | 6 | 9)[];
               pending?: { eventId: string; level: 3 | 6 | 9; options: [HauntOption, HauntOption]; deadlineMs: number };
               coldSpot?: { zone: string; round: number }; blackoutNext: boolean };
type Residue = { zone: string; card: Card }[];           // exactly three, three different Zones, secret
type LogEvent =
  | { kind: 'turn-start'; seat: Seat; atMs: number } | { kind: 'visit'; seat: Seat; zone: string; sinceTurnMs: number }
  | { kind: 'suggest'; seat: Seat; zone: string; suspect: string; relic: string; refuter: Seat | null }
  | { kind: 'inspect'; seat: Seat; zone: string }                                  // never carries what was found
  | { kind: 'accuse'; seat: Seat; correct: boolean } | { kind: 'timeout'; seat: Seat } | { kind: 'achievement'; seat: Seat; id: AchievementId }
  | { kind: 'haunt'; level: number } | { kind: 'haunt-event'; level: 3 | 6 | 9; chosen: HauntOption };
type PartyState = { code: string; phase: Phase;
                    // seed is a secret 128-bit value (crypto.getRandomValues); it never leaves the DO.
                    // Anything visible to clients (e.g. bot wait times on the Host) uses a separate
                    // derived stream so the deal cannot be replayed from observable output.
                    seed: Uint8Array /* 16 bytes, CSPRNG */;
                    masterSeat: Seat | null; masterDisconnectedSinceMs: number | null;
                    settings: Settings; players: Player[]; turn: Turn | null; haunt: Haunt;
                    solution: Solution | null; residue: Residue | null; pool: Pool; log: LogEvent[];
                    eavesdrop?: { eventId: string; suggester: Seat; category: CardKind; untilMs: number };
                    createdMs: number; lastActiveMs: number; hostToken: string };
// Public and Private Views are derived; they are separate types so a Hand cannot be put in a Public View by mistake.
type PublicView = { phase: Phase; masterSeat: Seat | null;
                    players: { seat: Seat; nickname: string; poltergeist: boolean; connected: boolean; handSize: number }[];
                    turnSeat: Seat | null; round: number; haunt: { level: number; max: number; coldSpotZone?: string };
                    pool: PublicPool; log: PublicEvent[]; solution?: Solution /* only when ended */ };
type PrivateView = { seat: Seat; hand: Card[]; shown: Card[]; found: { zone: string; card: Card }[]; resolve: number };
```

### Case building and dealing
`buildPool(contributions, presets, seed)`: suspects = contributed Ghost Profiles first (one per Player, at most six), then Preset Ghosts by seeded order until six; zones = contributed names first then the curated list by seeded order; relics = the fixed catalogue `r1 music box, r2 wax hand, r3 locket, r4 planchette, r5 silver key, r6 bell`. `dealCase(pool, seats, seed)`: seeded shuffle per category, the first card of each shuffled category is the Solution; the other 15 are shuffled together, the first three become the Residue and the remaining 12 are dealt round robin from a seed-chosen seat, so hand sizes differ by at most one (two cards each at six Players). `seed` here and in `botAct` / `resolveSuggestion` / `placeResidue` / `playAgain` is a **derived substream** (e.g. HKDF or XChaCha20 keystream) of the room's secret seed, never the raw bytes. The derived stream for public-facing output (bot wait times as seen by the Host, refuter selection visible in the public event) is separate from the stream for private choices (shown card selection, Residue placement), so observing public output cannot help a player reconstruct the deal.

### Residue and Inspect
`placeResidue(zones, residueCards, seed)` assigns each of the three Residue cards to a different Zone, from a seeded shuffle of the six Zone ids (the stream `residue`). `canInspect(state, seat, pose, zone)` is true only for the active Player who is not a Poltergeist, stands inside that Zone, has not inspected it before (`player.inspected`), and when the Zone is not under a Cold Spot. `inspect` starts `turn.inspecting = {zone, untilMs: now + 10 000}`; the Turn Clock keeps running, and the Turn can still end, a Suggestion can still be made and the Player can still move. Leaving the Zone, or the Turn ending (including the clock expiring), before `untilMs` cancels the Inspect. When `untilMs` passes with the Player still inside, the Room records the Zone in `player.inspected` and sends the private `inspected {zone, card | null}`. The only public trace is the log event `{kind: 'inspect', seat, zone}`. Inspect does not end the Turn.

### Views and leakage
`publicView(state)` and `privateView(state, seat)` are the only functions that cross the room boundary. The Public View exposes hand *sizes*, never cards, never Residue, and exposes the Solution only when `phase === 'ended'`. Public events are redacted constructions: a `suggest` event carries seat, zone, suspect, relic and the refuter seat (or null), never the card shown; an `inspect` event carries seat and zone only. `heard` and `inspected` are private messages. The narrator's `buildPartyPrompt(publicState, directive)` takes a `PublicView` by type, so private data cannot reach it.

### Zones
`placeZones(sampler, spawn, bounds, walkRadius, seed)` calls the shared `placePoints` helper extracted from `ghost/anchors.ts` with `count = 6`, the same rules as Anchors (walkable floor, inside the walk radius and bounds, ≥ 3 m from the spawn, ≥ 4 m apart, radius 2.5 m), and `ringZones` as fallback: six points 60° apart on a ring of radius clamp(0.6 × walkRadius, 4, 8). Precondition: walk radius ≥ 7 m, else authored Zones or `world_too_small`. The check runs when the Master chooses the world. Extracting the helper must not change `placeAnchors`.

### Turns, clock, achievements
`nextPlayer(players, current, now)`: next seat in order that is not a Poltergeist and not skipped for missed turns; increments the round when the order wraps. `turnBudget({baseSeconds | null, bonusSeconds, capSeconds = 120, blackout})` returns `min(cap, base' + bonus)` seconds, where `base' = max(15, base − 15)` when `blackout` is true and `base` otherwise, or `null` for no clock. The clock lives in the Durable Object as a **single alarm**. Because a Durable Object supports only one alarm at a time, `nextWake(state, now): number` is a pure function that returns the earliest of all pending deadlines: the turn expiry (`startedMs + pausedMs + budgetMs`), the 10-second warning, the 20-second disconnect-pause grace, the Inspect completion (`turn.inspecting.untilMs`), the Haunt Event choice deadline (`haunt.pending.deadlineMs`, 15 s), the Eavesdrop window close (`eavesdrop.untilMs`, 10 s), the Master disconnect timeout (60 s), any pending bot-think deadline, and the 6-hour room TTL. The DO always sets its alarm to `nextWake`, recomputes on every state change, and dispatches in the alarm handler by comparing `now` against each deadline. `clockStatus(turn, now)` returns `running`, `warning` (≤ 10 s) or `expired`. `onDisconnect` pauses the clock for up to 20 s then ends the Turn; two consecutive missed Turns skip the Player until they reconnect. Achievements are detectors over the event log: `wanderer` (three distinct `visit` zones by that seat), `cartographer` (all six), `quick feet` (a `visit` with `sinceTurnMs ≤ 20 000`), `persistent` (three `suggest`), `second wind` (two `timeout`). `earned(log, seat)` is a set, so evaluation is idempotent and order-independent; `bonusSeconds` sums the catalogue values of earned ids (10, 15, 5, 10, 10) and applies from the next Turn.

### The Haunt
`hauntRise(state, cause)` with `cause` one of `round-end`, `timeout`, `wrong-accusation` returns the state with `level = min(max, level + 1)`. After a rise, `fireEvent(state)` checks whether the new level is 3, 6 or 9, is not in `haunt.fired`, and is below `max`; if so it adds the level to `fired` and sets `haunt.pending` with `eventOptions(seed, level)`, two distinct options chosen from `cold-spot`, `blackout`, `restless`, `lull` by a seeded shuffle. The next Poltergeist in seat order (the smallest Poltergeist seat greater than the active seat, wrapping) receives `choice` and has 15 seconds; `chooseOption` accepts `choose` only from that Player. When the deadline passes, or when no Poltergeist exists, the first option applies. `applyEvent`:
- `cold-spot`: `coldSpot = {zone, round}` where the Zone is picked by the seeded stream and `round` is the Round it applies to (the current Round, or the new Round when the event fired at a Round end). While active, `canSuggest` and `canInspect` are false in that Zone.
- `blackout`: `blackoutNext = true`; the next `turnBudget` uses it and clears it. The Host dims the scene through `effectLimits`, within the photosensitivity limits.
- `restless`: public event only; the Host moves the ghost Sprite to another Zone. No rules effect.
- `lull`: `level = max(0, level − 1)`.
When `level === max`, the game ends (`gameOver`), no event fires, and the Solution is revealed. Because a level can rise only by 1, each of 3, 6 and 9 fires at most once, and Lull can add at most three Rounds, so a game always ends within `max + 3` Rounds.

### Resolve and Eavesdrop
`gainResolve(players)` runs at every Round end: each Player who is not a Poltergeist gets `resolve = min(3, resolve + 1)`. After a Suggestion with a refuter, the Room opens `state.eavesdrop = {eventId, suggester, category, untilMs: now + 10 000}` where `category` is the kind of the card shown. `canEavesdrop(state, seat, eventId, now)` is true for a Player who is not a Poltergeist and not the suggester, has `resolve ≥ 1`, and acts before `untilMs`. `eavesdrop` subtracts 1 and sends the private `heard {eventId, category}`. The card is never sent. Resolve is the first thing to cut if time runs short.

### Suggestion and accusation
`canSuggest(state, seat, pose)`: active seat, not a Poltergeist, pose inside a Zone's radius, the Zone not under a Cold Spot, `turn.suggested === false`. `resolveSuggestion(state, seat, {zone, suspect, relic})`: walk seats clockwise from `seat + 1` (wrapping, excluding `seat`), the refuter is the first whose Hand intersects the three cards (Poltergeists and Bots included); `shown` is the intersection element chosen by `seededPick(seed, turnIndex)`; result `{refuter: Seat | null, shown?: Card}` where only the suggester receives `shown`. `resolveAccusation(state, seat, triple)` returns `{correct}`; a correct Accusation makes only the accuser the winner, a wrong one makes the Player a Poltergeist (Hand stays), adds one Haunt level and tells only them. `gameOver(state)` is true on a correct Accusation, when every Player is a Poltergeist, or when the Haunt level equals its maximum.

### Narration
Directives: `turn-start`, `suggest`, `shown`, `none-shown`, `inspect`, `accuse-wrong`, `accuse-right`, `achievement`, `time-warning`, `haunt-event`, `poltergeist`, `ended-solved`, `ended-haunted`. `partyScripted(kind, persona, rng)` has at least five variants per kind in the host ghost's voice. At most one model narration is requested per public event, for the whole Room; `narrationRequests(eventLog) ≤ publicEventCount`. The reply passes `validateGhostReply`; failure or cap or kill switch means a scripted line. Game state never reads the narration, and no narration changes the Haunt, an event choice or Resolve.

### Spend
Room caps default to 12 image units and 60 model units, enforced through `SpendGuard` with the Room id as the scope; global caps still apply. Preset Ghosts, Gallery Worlds and scripted lines make a zero-spend game possible.

### Display and pyramid
`pyramidLayout({width, height, innerPx, tilePx, orientation, mirror})` returns four tiles centred at `innerPx + tilePx/2` from the centre along ±x and ±y, rotated 0°, 90°, 180°, 270° (so each faces its pyramid side), each tile shrunk with `fitTile` when it would leave the screen, never overlapping. `innerPx` and `tilePx` come from the on-screen calibration (the user matches a drawn square to the pyramid's footprint); no pixel density is assumed. `effectLimits(events, prefersReducedMotion)` schedules reactions (including the Blackout dimming and Haunt Event reactions) so flashes ≤ 3 per second and luminance step ≤ 20%, and returns none when reduced motion is preferred. Whether tops point inward or outward, and whether to mirror, is decided by Spike 1.3 on real hardware.

### Print Kit
- `pyramidTrapezoid({baseMm, topMm})` returns an isosceles trapezoid whose slant height is `(baseMm − topMm)/2 × √2`, which puts the faces at 45° to the screen. Defaults 60 mm and 10 mm (about 6 cm base, 1 cm top, 3.5 cm slant, as in common phone-sized templates). `holderParams` scales it for larger screens.
- `qrPlateMesh(matrix, {moduleMm ≥ 1.2, baseMm, reliefMm})` builds a watertight heightfield solid: a base plate with dark modules raised by `reliefMm`; vertices are on a 1 µm integer grid so welding is exact. The plate is at most 40 mm per side.
- `checkMesh(mesh, {bedMm: 180})` welds vertices, requires every edge to be shared by exactly two faces with opposite orientation, positive signed volume, and a bounding box that fits the bed. `writeStl` emits binary STL.
- `standeeMesh(alphaMask, {thicknessMm, baseMm})` traces the alpha silhouette, simplifies it, extrudes it and adds a base (stretch).
- Relic and holder `.scad` files take their parameters from a shared header; `tools/build-print.mjs` runs `openscad` when installed, writes STLs to `dist/print/`, runs `checkMesh` on every one and exits non-zero on failure. QR scan reliability of a single-colour relief plate is unverified; Spike 1.2 compares it with a two-colour plate.

### Bots
`botAct(privateView, publicView, settings, rng)` returns one legal action: walk to and Inspect a Zone it has not inspected, make a Suggestion when inside a Zone, and accuse only when its notebook (derived from its own Private View and found Residue) leaves exactly one candidate per category. A Bot that is the next Poltergeist picks a Haunt Event option from its seeded stream. It receives no other Hand and no unfound Residue by construction.

## Error handling
Codes: `party_disabled`, `rooms_full`, `world_too_small`, `room_unknown`, `room_full`, `game_started`, `bad_token`, `rate_limited`, `photo_rejected:<reason>`, `quota_image`, `moderation_unavailable`, `not_your_turn`, `not_in_zone`, `already_suggested`, `bad_relic_token`, `not_master`, `world_not_set`, `poltergeist`, `cold_spot`, `already_inspected`, `eavesdrop_denied`. Contribution failures never stop the lobby: the Player is told and the Preset or default is used. A lost Host connection pauses the game and shows a reconnect state; the Room persists until its time to live. The narrator never blocks a turn.

## Testing strategy
- Property tests for every pure module; a model-based test drives `PartyState` with random sequences of join, leave, input, inspect, suggest, accuse, eavesdrop, Haunt choice, timeout, disconnect and Master hand-over events against a small oracle and asserts the invariants (no leakage, hand partition, termination, Resolve bounds).
- A leakage fuzz test plants unique tokens in every Hand, the Residue and the Solution, runs a game, and asserts no token appears in any Public View, public event, narrator prompt or log line before the game ends, and that a token appears in a Private View only for the Player who found it.
- `PartyRoom` is tested with an in-memory storage fake, a fake clock and a fake Workers AI. Sockets are tested with a fake pair.
- STL and QR tests use a test-only decoder. Print builds in CI skip `openscad` steps when the binary is absent but still run `checkMesh` on the TS-generated parts.
- Manual spikes record latency, device behaviour and pyramid photos in `docs/spikes/party-*.md`. The design numbers (Haunt maximum 10, thresholds 3, 6 and 9, Resolve cap 3, Inspect 10 s, choice window 15 s, Master timeout 60 s) are untested and are tuned in playtests once the core layer plays end to end. Open watch points: thin hands at six Players (two cards each), a Player accusing wrongly on purpose to become a Poltergeist, and the variable quality of browser speech.

## Correctness Properties

### Property 1: Room codes are well formed
*For any* seed, `generateRoomCode` returns four characters from the unambiguous alphabet, and `normalizeCode` maps any case and spacing variant of a valid code to the same canonical code and rejects every other string.
**Validates: Requirements 1.1**

### Property 2: Seating and nicknames
*For any* sequence of join attempts, the number of seated Players never exceeds six, seats are unique, joins are refused with the correct reason when the Room is full or the game has started, the first seated Player is the Master, and `sanitizeNickname` returns at most 16 characters with no control characters, markup or URLs and is idempotent.
**Validates: Requirements 1.2, 1.3**

### Property 3: Tokens grant exactly their own data
*For any* Room state and any token, `authorize` grants a Private View only to the token that owns that seat, grants the Public View to any valid token of that Room and to no other Room's token, a reconnect with a player token restores the same seat and Hand while a tokenless join after the start is refused, and `peekAllowed` returns true if and only if every other seated player is a Bot (this check runs server-side in `authorize`, not on the client).
**Validates: Requirements 1.4, 1.6, 9.3**

### Property 4: Room lifecycle round-trips and deletes completely
*For any* Room state, serialising then parsing yields an equal state, a Room older than its time to live is reported expired, and after deletion no photo, Sprite, nickname or state can be retrieved by any operation.
**Validates: Requirements 1.5, 10.4**

### Property 5: Controller input is bounded and never sticks
*For any* stream of raw input including NaN, infinities and oversized values, `sanitizeInput` returns a stick vector inside the unit disc and clamped look deltas, `coalesceInput` emits at most 30 messages per second, input from a non-active Player or from a Poltergeist produces no movement, and `releaseAll` yields a zero stick and no held buttons.
**Validates: Requirements 2.2, 2.3**

### Property 6: The case pool is complete, deterministic and never blocked
*For any* set of Contributions (including none, duplicates, rejected photos and injected generation failures) and any seed, `buildPool` returns exactly six distinct Suspects, six distinct Zones and the six Relics, with contributed items first, equal output for equal inputs, and the lobby can always start.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 7: The deal is a valid partition
*For any* pool, seat count from two to six and seed, `dealCase` yields one Suspect, one Zone and one Relic as the Solution, three further cards as the Residue, each of the other 12 cards in exactly one Hand, no Solution or Residue card in any Hand, Hand sizes differing by at most one, and identical output for identical inputs.
**Validates: Requirements 4.1**

### Property 8: Views never leak secrets
*For any* reachable state with unique random tokens planted in every Hand, the Residue and the Solution, no Public View, public event, narrator prompt or log entry before the game ends contains any token, a Private View contains only its own Hand, cards shown to it and Residue it has found, and after the game ends the Public View contains the Solution.
**Validates: Requirements 4.2, 4.3**

### Property 9: Zones are valid and the world-size rule holds
*For any* generated room, seed and spawn meeting the precondition, `placeZones` returns six Zones that pass `validateZones` (walkable, inside bounds and walk radius, ≥ 3 m from spawn, ≥ 4 m apart), identical for identical inputs; `validateZones` rejects any violation; `ringZones` always passes when the walk radius is at least 7 m; and a world below 7 m with no authored Zones is refused as `world_too_small`.
**Validates: Requirements 4.5**

### Property 10: Notebook marks are monotone
*For any* hand, set of shown cards, set of found Residue and sequence of Player marks, `autoMarks` marks exactly the hand, the shown cards and the found Residue as no, a Player's mark is never removed by an automatic update, and applying the same updates in any order gives the same notebook.
**Validates: Requirements 4.4**

### Property 11: Turn order is fair
*For any* seating with any Poltergeists and skips, `nextPlayer` never returns a Poltergeist or a skipped Player, visits every remaining Player once per Round in seat order, and increments the Round exactly when the order wraps.
**Validates: Requirements 5.1, 5.7**

### Property 12: Turn budgets and achievements are bounded and monotone
*For any* base, achievement set, cap and Blackout flag, `turnBudget` equals `min(cap, base' + bonus)` with `base' = max(15, base − 15)` under Blackout and `base` otherwise, is non-decreasing as achievements are added, is `null` exactly when no clock is selected, never exceeds 120 seconds with the default cap, and `earned` over any event log is a set that is idempotent, independent of event order, awards each achievement at most once, and only counts events by that seat.
**Validates: Requirements 5.2, 5.4, 5.6**

### Property 13: The clock, nextWake, and disconnects end turns exactly once
*For any* turn, pause and disconnect timeline, `nextWake(state, now)` returns the minimum of all pending deadlines (turn expiry, 10-second warning, disconnect-pause grace, Inspect completion, Haunt Event choice, Eavesdrop window, Master disconnect timeout, bot-think deadline, room TTL); the DO alarm is always set to `nextWake` and is recomputed on every state change. `clockStatus` is `warning` exactly in the last 10 seconds and `expired` exactly at or after the deadline; an expired Turn ends exactly once with no penalty other than the lost Turn and one Haunt level; a disconnect pauses the clock for at most 20 seconds before the Turn ends; and two consecutive missed Turns cause a skip until reconnect.
**Validates: Requirements 5.3, 5.5**

### Property 14: Suggestions resolve to the first holder clockwise
*For any* state, suggester and suggestion, `canSuggest` is true only for the active Player who is not a Poltergeist, inside a Zone not under a Cold Spot, who has not yet suggested this Turn, and `resolveSuggestion` returns the first Player clockwise whose Hand intersects the three cards (Poltergeists and Bots included), a shown card that is in both the suggestion and that Hand, no refuter exactly when no Hand intersects, the same result for the same seed, and a public event that does not contain the shown card.
**Validates: Requirements 6.1, 6.2**

### Property 15: Accusations decide the game and the game terminates
*For any* state and accusation, `resolveAccusation` is correct if and only if all three cards equal the Solution, a correct Accusation makes only the accuser the winner, a wrong Accusation makes only the accuser a Poltergeist, keeps their Hand in play and adds one Haunt level, `gameOver` is true exactly when an Accusation was correct, every Player is a Poltergeist, or the Haunt level equals its maximum, the ended state is absorbing, and any sequence of legal actions ends within `(maximum + 3) × players` Turns.
**Validates: Requirements 6.3, 6.5**

### Property 16: Relic tokens parse strictly
*For any* string, `parseRelicToken` returns a Relic id if and only if the string is exactly `hw:` followed by one of the six ids, never throws, and `parseRelicToken(`hw:${id}`)` returns `id` for all six.
**Validates: Requirements 6.4**

### Property 17: Endings and replays preserve what they should
*For any* ended game, `endingPayload` contains the Solution, the winner if any and a timeline without private data, and `playAgain` keeps the Players, the Master, the world and Contributions, resets Hands, Poltergeists, Haunt, Residue, Resolve, achievements and the log, and uses a new seed.
**Validates: Requirements 6.6**

### Property 18: The pyramid layout is symmetric and in bounds
*For any* screen size, inner offset and tile size, `pyramidLayout` returns four tiles with rotations 0, 90, 180 and 270, symmetric about the centre, inside the screen, non-overlapping, and tile size non-decreasing in the requested size until clamped.
**Validates: Requirements 7.3**

### Property 19: Display effects respect photosensitivity limits
*For any* sequence of public events (including Haunt Events and Blackout), the schedule from `effectLimits` has at most three flashes in any one-second window and a luminance step of at most 20%, and is empty when reduced motion is preferred.
**Validates: Requirements 7.4**

### Property 20: Printed meshes are valid and QR plates round-trip
*For any* QR matrix, `qrPlateMesh` produces a mesh that passes `checkMesh` (every edge shared by two opposite-facing faces, positive volume, fits a 180 mm bed), has modules of at least 1.2 mm and a side of at most 40 mm, and `rasterTop` of the mesh equals the matrix; and `checkMesh` rejects a mesh with a missing face, a flipped face, or a bounding box over the bed.
**Validates: Requirements 8.2**

### Property 21: Pyramid faces are consistent
*For any* base and top edge with `top < base`, `pyramidTrapezoid` returns an isosceles trapezoid whose faces are within one degree of 45° to the screen, whose slant height increases with the base, and whose defaults are a 60 mm base and a 10 mm top.
**Validates: Requirements 8.3**

### Property 22: Bots are legal and blind to other hands
*For any* state and seed, every action from `botAct` (including Inspect and Haunt Event choices) is legal in that state, the action is unchanged when every other Player's Hand and every unfound Residue card is replaced by random cards, a Bot accuses only when its notebook leaves exactly one candidate per category, and `peekAllowed` is true if and only if every other seated player is a Bot (and this is determined server-side in `authorize`, not by the client).
**Validates: Requirements 9.2, 9.3**

### Property 23: Spend is bounded and narration never changes the game
*For any* sequence of events and any narration outcomes (success, failure, timeout, over cap, kill switch), reserved plus committed units never exceed any Room or global cap, no upstream call is made after a denial, at most one narration is requested per public event, and the sequence of game states, Haunt levels and Haunt Event choices is identical in every case.
**Validates: Requirements 10.1, 10.2**

### Property 24: Telemetry carries no content and abuse is capped
*For any* game with random nicknames, Zone names, details and photos, every telemetry event uses only whitelisted counter names and error codes and contains none of that content, and for any stream of join and create attempts `acceptJoin` and `acceptRoom` never exceed their per-hash, per-session and total limits.
**Validates: Requirements 10.5, 10.6**

### Property 25: Room controls obey the Master
*For any* Room state, token and command, `canControl` allows `settings`, `start`, `pause`, `resume`, `addBot`, `end`, `playAgain`, `handOver` and `speech` only for the Master's token, allows the host token only `end`, and refuses every other token; `nextMaster` returns the next human seat in seat order, wrapping, never a Bot, and `null` when no other human is seated; and a Master disconnected for 60 seconds passes the role exactly once, while a hand-over changes the Master to the chosen human only.
**Validates: Requirements 1.7**

### Property 26: The Haunt rises by the rules and events fire once
*For any* sequence of rise causes and Haunt Event choices, the level never goes below 0 or above its maximum, rises by exactly one for each Round end, lost Turn and wrong Accusation, falls by one only through Lull, ends the game when it reaches the maximum, and each of the levels 3, 6 and 9 fires at most one Haunt Event, only when below the maximum, with two distinct options, resolved by the next Poltergeist's pick or by the first option when no pick arrives within 15 seconds or no Poltergeist exists; Blackout never lowers a Turn's base seconds below 15, and a Cold Spot refuses Suggestions and Inspect in its Zone for exactly its Round.
**Validates: Requirements 11.1, 11.2**

### Property 27: Poltergeists keep their Hand and never take a Turn
*For any* state in which a Player becomes a Poltergeist, that Player's seat, nickname and Hand are unchanged, `nextPlayer` never returns them, their movement, Suggestion, Accusation and Inspect are refused, they still answer Suggestions by seat order, and they are the only Players who may choose Haunt Event options.
**Validates: Requirements 11.3**

### Property 28: Residue is hidden, and inspection is private and once only
*For any* seed and seat count, the Residue is three non-Solution cards in three different Zones and in no Hand; for any sequence of Inspect actions, a Player learns a Residue card only by staying 10 seconds of a Turn inside that Zone, at most once per Zone per Player, never inside a Cold Spot, receives it only in their own Private View, and the public log shows only the Zone.
**Validates: Requirements 4.6**

### Property 29: Resolve is bounded and Eavesdrop reveals only a category
*For any* sequence of Rounds and Eavesdrop attempts, Resolve stays between 0 and 3, rises by one per Round for a Player who is not a Poltergeist, each Eavesdrop costs exactly one and is accepted only within 10 seconds of another Player's resolved Suggestion by a Player with Resolve who is not a Poltergeist, and its result contains only the category of the card shown and never the card.
**Validates: Requirements 11.4, 11.5**

### Property 30: Photo Prompt offers are deterministic, complete and bounded
*For any* Room seed and seat, `offerPrompts` returns three distinct catalogue entries for rounds 0 to 3, equal output for equal inputs, the four rounds together contain every catalogue entry exactly once, and rounds above 3 return `null`; `skipOffer` advances the round by one for rounds 0 to 2 and returns `null` at round 3; and offers for one seat do not depend on any other seat's round.
**Validates: Requirements 3.6, 3.7, 3.8**
