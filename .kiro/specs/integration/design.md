# Design Document

## Overview

Three layers, each depending only on the one below:

```
web pages (Case screen + pad, Controller, Host, Display, Wander)
        │  sockets, routes
Room server  (api: PartyRoom DO, PartyDirectory DO, /api/party routes)   ← no rules
        │  step(state, action, now)
Engine  (shared/src/party/engine.ts)                                      ← the order of the rules
        │
Rules   (shared/src/party/*, shared/src/puzzles/*, errands, world-clues)  ← built and tested
```

## The Engine

```ts
type Who = { role: 'host' | 'display' | 'controller' | 'bot' | 'alarm'; seat: Seat | null };
type Action =
  | { kind: 'client'; who: Who; msg: ClientMessage }      // zod-validated protocol message (party-mode protocol.ts)
  | { kind: 'alarm' }                                      // the one alarm fired
  | { kind: 'bot'; seat: Seat; choice: BotChoice };        // a Bot's legal choice from botMind
type Addressee = { to: 'public' } | { to: 'seat'; seat: Seat } | { to: 'host' } | { to: 'display' };
type Outbound = Addressee & { msg: ServerMessage };
type StepResult = { state: RoomGameState; out: Outbound[]; wakeAtMs: number | null; refused?: ReasonCode };

export function step(state: RoomGameState, action: Action, nowMs: number): StepResult;
```

`RoomGameState` joins the lobby `RoomState` (room.ts), the `GameState` (game.ts), the turn and clock state, the Haunt, the open Locks and, later, the Errands and World Clues. The Engine is a switch over Action kinds that calls the rule modules in the order the `party-mode` design gives; it adds no rule. Every outbound message is built by `publicView`, `privateView`, `publicEvent` or a builder of the same kind. `wakeAtMs` is `nextWake` over every deadline in the state.

## The Room server

`PartyRoom` keeps sockets (Hibernation API), a token per socket, and the state in storage. For each socket message: parse with the protocol schema, map the token to `Who` with `whoIs`, call `step`, save, send `out`, set the alarm to `wakeAtMs`. For the alarm: call `step` with `{kind:'alarm'}`. Bots run by alarm with think time from the Bot spec; their choices come from `botMind` and enter as Actions. The directory DO keeps the caps. The server code is small enough that the routes and DO tests are wiring tests only.

## The solo case

The Case screen's `HostPort.start(setup, sky)` creates a Room with `soloSetup`, joins the visitor as the Master on the embedded pad, adds the Bots and starts. The Host view and the pad live on one page; the pad sends the same Controller messages a phone would. `playAgain` and `dispose` map to the Room's Play again and end. The stand-in (`web/src/app/case/standin.tsx`) is removed when this works.

## Puzzles on phones

Inspect on a phone by a human Detective with the Puzzle setting on opens a Lock: the Engine records an open Lock for that seat and Zone (puzzles task 3), sends the Lock's view privately, and on a verified Attempt sends the same `inspected` result a plain Inspect sends. The Controller mounts `PuzzleHost` with `PlatformKit.puzzleFeel` from the device settings. Bots and the shared-screen pad get a plain Inspect.

## Correctness Properties

### Property 1: The Engine is deterministic and refuses without change
For any state, Action and time, `step` returns the same result every time; an Action that is not legal for its sender returns a reason code and the same state.
**Validates: Requirements 2.1, 2.2**

### Property 2: No outbound message leaks
For any random full game (Bots in every seat, random Actions including illegal ones, puzzles on and off), no message addressed to the Public View audience, the Host or the Display contains a planted Hand card, Residue card, shown card, Solution (before the end) or the sender of a Frame, House Cue, Rattle or Errand, and every seat message holds only that seat's own secrets.
**Validates: Requirements 2.3**

### Property 3: One alarm is enough
For any reachable state, `wakeAtMs` equals `nextWake` over every pending deadline, and firing the alarm at that time makes progress or returns a later wake.
**Validates: Requirements 2.4, 3.1**

### Property 4: Every solo case ends
For any world, preset and Bot count from 2 to 5, a game in which the human only passes ends within `hauntMax + 3` Rounds with an ending payload, and Play again starts a fresh game with the same seats.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Optional layers change nothing when off
For any game, turning an Optional layer off gives the same states, views and outcomes as a build without that layer.
**Validates: Requirements 7.1**

## Testing

Properties 1 to 5 as fast-check tests on the Engine (no server). Wiring tests for the DO (socket, save-before-send, alarm) with Miniflare. A Playwright-style run of the solo case through the Case screen at Phase 4, and of a two-phone party at Phase 5, in the CDP harness used for the puzzle screens.
