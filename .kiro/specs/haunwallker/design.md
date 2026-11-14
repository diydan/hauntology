# Design Document

## Overview

The web shell is a thin React layer in `web/src/app` that sends the visitor through Home → Create or Gallery → Confirm → Haunt → Play → Ending and keeps the Viewer and the Chat in step. It owns no business rules. Every decision that can be a pure function (route table, flow guards, the confirm state machine, error-to-copy mapping, polling plan, Play screen reducer, resume target, sketch downscale) lives in `shared/src/app/` so it can be property-tested without a browser. React components render the state those functions return and run the effects they request.

This spec reuses, and does not restate, the engines it joins:
- `world-pipeline`: the sketch pad tool rules (2.1, 2.2), `inkCoverage`, quote and create routes, job states, `DELETE /api/worlds/:id`, `GET /api/gallery`, `GET /api/quota`.
- `world-viewer`: Input Mode, content notice, HUD, `ViewerBridge`, degradation ladder.
- `ghost-creator` and `ghost-engine`: Creator screens, `POST /api/play/*`, scripted fallback.

`world-pipeline` tasks 10.1 to 10.4 (photo picker, sketch pad, confirm screen, progress screen) are implemented under this spec's tasks and satisfy those task lines.

Decisions:
- **One effect-returning reducer per flow.** `confirmReduce(state, event) → {state, effects}` and `playReduce` never perform I/O. The React layer runs effects and feeds results back as events. This is what makes "world creation fires at most once" provable.
- **The server is the source of truth.** Quota, job state, found memories and the ending come from the API. The shell keeps only the picked Place Image id, the Confirm Token (memory only), the world id and the acknowledged-notice flag.
- **The world id survives reload in the Session, not in storage the visitor can lose.** The API keeps `lastWorldId` and `lastPlayId` on the Session record, and `GET /api/session` returns them. The shell never writes photos, sketches or captions to local storage, cookies or IndexedDB.
- **Lazy Viewer.** three.js, Spark and three-mesh-bvh load by dynamic `import()` when Play mounts. Home ships without them.
- **Error boundaries per Screen and one around the Viewer.** A Viewer crash leaves the Chat, HUD and Exit alive.
- **Hash-free client routes** (`/`, `/gallery`, `/create`, `/confirm`, `/haunt/:worldId`, `/play/:worldId`, `/end/:worldId`), served by the Worker with an SPA fallback to `index.html`.

## Architecture

```mermaid
flowchart LR
  R[Router + guards\nshared/app/routes] --> S[Screens]
  S --> H[Home]
  S --> G[Gallery]
  S --> C[Create: SketchPad / PhotoPicker]
  S --> K[Confirm Gate]
  S --> W[Haunt: stage + Creator]
  S --> P[Play: Viewer + Chat + HUD]
  S --> E[Ending]
  K --> CR[confirmReduce]
  P --> PR[playReduce]
  W --> PP[pollPlan + stageOf]
  S --> ER[errorCopy]
  API[ApiClient\nfetch, same origin] --> S
  Q[QuotaStore] --> H
  Q --> K
  Q --> C
  B[ViewerBridge] <--> P
```

### Key flows

```mermaid
sequenceDiagram
  participant V as Visitor
  participant K as Confirm Gate
  participant A as API
  V->>K: arrives with imageId
  K->>A: POST /api/worlds/quote {imageId}
  A-->>K: {imageUrl, quota, confirmToken}
  V->>K: "Enter this place"
  K->>A: POST /api/worlds {imageId, confirmToken, turnstile?}
  A-->>K: {worldId, status}
  K->>K: navigate /haunt/:worldId
```

```mermaid
sequenceDiagram
  participant W as Viewer
  participant S as Play screen
  participant A as API
  W->>S: pose, proximity (≤ 4 Hz)
  V->>S: opens chat (Enter)
  S->>W: setInputMode(chat)
  S->>A: POST /api/play/:id/turn {text|button, pose}
  A-->>S: {reply, view}
  S->>W: applyView(found, anchors, hauntLevel)
  S->>S: view.ended ? navigate /end/:worldId
```

## Components and interfaces

### Routes the shell calls
| Call | Used by | Req |
|---|---|---|
| `GET /api/session` → `{lastWorldId?, lastPlayId?, ackNotice, flags}` | boot, resume | 4.5, 6.8, 7.7 |
| `GET /api/quota` | boot | 1.3, 1.4 |
| `GET /api/gallery` | Gallery, prefetch | 5.1, 10.4 |
| photo upload, `POST /api/sketch/render`, `POST /api/sketch/select`, `POST /api/places/brief` | Create | 2.3, 2.5, 2.6 |
| `POST /api/worlds/quote`, `POST /api/worlds` | Confirm Gate | 3.1, 3.3 |
| `GET /api/worlds/:id` | Haunt (poll), Play (manifest) | 4.1 |
| `DELETE /api/worlds/:id` | "Delete my place" | 3.8 |
| `POST /api/play/start`, `POST /api/play/:id/turn`, `GET /api/play/:id` | Play | 6.2, 6.3, 6.8 |
| `POST /api/session/ack-notice` | content notice | 6.1 |

`GET /api/session` and `POST /api/session/ack-notice` are new thin routes. They read and write only fields of the Session record and are covered by the same cookie and origin checks as every state-changing route. `ghost-engine` already persists the play session; the Session record stores only the ids.

### `web/src/app/`
`App.tsx` (router, providers), `screens/` (one folder per Screen), `ApiClient.ts` (typed fetch, maps failures to `Result`), `QuotaStore.ts` (single boot request, shared by Screens), `ErrorBoundary.tsx`, `LiveRegion.tsx`, `DebugOverlay.tsx`, `FakeApi.ts` (`?demo=1`, non-production builds only).

### `shared/src/app/`
`routes.ts` (`resolveRoute`, `pathFor`, `guardRoute`), `confirm.ts` (`confirmReduce`), `errors-copy.ts` (`errorCopy`, `retryGate`), `capabilities.ts` (`capabilities`), `stage.ts` (`stageOf`, `pollPlan`), `play.ts` (`playReduce`), `resume.ts` (`resumeTarget`), `sketch-size.ts` (`downscaleSize`), `events.ts` (the Shell-to-Viewer contract), `fake-api.ts` (fixture timeline for demo mode).

```ts
type ScreenId = 'home' | 'gallery' | 'create' | 'confirm' | 'haunt' | 'play' | 'end' | 'not_found' | 'expired';
type Route = { screen: ScreenId; worldId?: string };

type FlowState = {
  pickedImageId?: string;          // set when a Place Image is chosen
  worldId?: string;                // known world (own or Gallery)
  ghostReady: boolean;             // preset or created ghost chosen
  noticeAcked: boolean;
  playEnded: boolean;
};

type Capabilities = {
  canDraw: boolean; canUpload: boolean; canGallery: true;
  reason?: 'kill_switch' | 'day_cap' | 'total_cap' | 'quota_image' | 'quota_world';
};
```

### Route guards
`guardRoute(route, flow) → {allow: true} | {allow: false, redirect: Route}`.
- `confirm` requires `pickedImageId`, else redirect to `create`.
- `play` requires `worldId` and `ghostReady`, else redirect to `gallery` (no world) or `haunt` (no ghost).
- `end` requires `playEnded`, else redirect to `play` when `worldId` and `ghostReady` are set, otherwise to the redirect `play` itself would give (`gallery` or `haunt`). A redirect never lands on a route that redirects again.
- `haunt` requires `worldId`.
- All other screens always allow.

### Confirm Gate state machine
```ts
type ConfirmState =
  | { k: 'quoting' }
  | { k: 'ready'; imageUrl: string; token: string; quota: QuotaSnapshot; needsTurnstile: boolean }
  | { k: 'challenge'; token: string }                 // Turnstile needed
  | { k: 'creating'; token: string }
  | { k: 'created'; worldId: string }
  | { k: 'rejected'; code: ErrorCode }
  | { k: 'cancelled' };
type ConfirmEvent =
  | { t: 'quote_ok'; imageUrl: string; token: string; quota: QuotaSnapshot; needsTurnstile: boolean }
  | { t: 'quote_fail'; code: ErrorCode }
  | { t: 'turnstile_ok'; turnstile: string }
  | { t: 'enter' } | { t: 'back' } | { t: 'retry' }
  | { t: 'create_ok'; worldId: string } | { t: 'create_fail'; code: ErrorCode };
type ConfirmEffect =
  | { e: 'quote'; imageId: string }
  | { e: 'create'; imageId: string; token: string; turnstile?: string }
  | { e: 'navigate'; to: Route };
```
Rules: `enter` from `ready` with `needsTurnstile` false emits `create`. `enter` from `ready` with `needsTurnstile` true moves to `challenge` and emits nothing; `turnstile_ok` in `challenge` then emits `create`. `retry` is accepted only from `rejected` (for example `confirm_expired` or a failed quote): it emits one `quote` effect and moves to `quoting`, and the new token replaces the old one. From `creating`, `created`, `rejected` and `cancelled`, `enter` is ignored. A token is never emitted twice. `back` emits `navigate` without any `create`.

### Stage mapping and polling
`stageOf(jobState)`: `queued → queued`, `generating → dreaming`, `ingesting → stitching`, `ready → ready`, `failed → failed`, matching `world-pipeline` states and the labels in `steering/visual-style.md`.
`pollPlan({ now, lastPollAt, visible, stage, rateLimitedUntil, startedAt }) → { pollAt: number | null; overdue: boolean }`:
- `null` when the tab is hidden or the stage is terminal.
- otherwise the next time is `max(lastPollAt + 3000, rateLimitedUntil)`, never more than 5000 ms after the last poll, so a change shows within 5 s of the next poll.
- `overdue` is true once `now − startedAt` passes 15 minutes (the job times out at 20), which triggers the honest "taking long" copy and the Gallery offer without cancelling.

### Play screen reducer
```ts
type PlayState = { mode: 'play' | 'chat'; found: number; noticeAcked: boolean; ended: boolean; degraded?: 'pano' | 'thumb' };
type PlayEvent =
  | { t: 'ack_notice' } | { t: 'open_chat' } | { t: 'close_chat' } | { t: 'exit' }
  | { t: 'view'; found: number; ended: boolean } | { t: 'viewer_degraded'; rung: 'pano' | 'thumb' };
type PlayEffect =
  | { e: 'start_viewer' } | { e: 'set_input_mode'; mode: 'play' | 'chat' }
  | { e: 'dispose_viewer' } | { e: 'navigate'; to: Route };
```
`start_viewer` is emitted only after `ack_notice` (or when the Session already has the notice acknowledged). `open_chat` and `close_chat` each emit `set_input_mode` once. `view` with `ended` true emits `navigate` to `end`. `exit` always emits `dispose_viewer` before `navigate`.

### Shell-to-Viewer contract (`events.ts`)
Defined once in `shared` and used by both sides, so neither imports the other's internals.
```ts
type ViewerToShell =
  | { t: 'pose'; pos: Vec3; yaw: number }                 // ≤ 4 Hz, from ViewerBridge
  | { t: 'prompt'; target: 'anchor' | 'ghost' | null }
  | { t: 'degraded'; rung: 'pano' | 'thumb' };
type ShellToViewer =
  | { t: 'set_input_mode'; mode: 'play' | 'chat' }
  | { t: 'apply_view'; found: AnchorId[]; anchors: Anchor[]; hauntLevel: number; ghostVisible: boolean };
```
The shell attaches the last `pose` to each `POST /api/play/:id/turn`; the server runs `sanitizePose`. The shell never sends hidden seeds because it never receives them.

### Resume
`resumeTarget(session, flags) → Route`: with `lastPlayId` and a live play session → `play`; with a `lastWorldId` whose status is `queued | generating | ingesting` → `haunt`; with a `ready` world and no play → `play` start; otherwise `home`. Missing or expired Session → `home` with a short notice. Resume applies only when the visitor opens `/` or a stale route; it never overrides a deep link that passes its guard.

### Error copy
`errorCopy(code: ErrorCode) → { title: string; body: string; next: 'retry' | 'gallery' | 'home' | 'wait' }`, an exhaustive table over `ErrorCode` in `shared/src/errors.ts`. The table is a `Record<ErrorCode, …>`, so adding a code without copy is a compile error. Unknown strings from the network map to a single generic entry. Server `message` text is never rendered.
`retryGate(retryAfterSec, now) → { enabledAt }` clamps the advised delay to [1 s, 120 s].

`errors.ts` lacked several codes that the `world-pipeline` design lists (`blank_sketch`, `unsafe_image`, `bad_confirm`, `confirm_expired`, `turnstile_failed`, `quota_session`, `quota_day`, `quota_total`, `timeout`, `ingest_failed`) and used different names for three conditions. Task 1.1 reconciled them: `errors.ts` is the source of truth, keeps its existing names (`upload_bad_type`, `upload_too_large`, `world_gen_disabled`) and adds `upload_too_small` and `upload_bad_magic` for the design's `too_small` and `bad_magic` (`world_too_small` is a party code and stays apart). The shell adds `shell_crash` (screen boundary fallback) and `session_expired` (Expired screen), alongside the existing `world_not_found`. `errorCopy` is exhaustive over the one list.

### Capabilities
`capabilities(quota, flags) → Capabilities`. `canDraw` needs image quota, world quota and `WORLD_GEN_ENABLED`; `canUpload` needs world quota and the flag; `canGallery` is always `true`. `reason` follows a fixed priority (kill switch, total cap, day cap, image quota, world quota).

### Sketch downscale
`downscaleSize(w, h, max = 512) → {w, h}`: preserves aspect ratio within rounding, longest side ≤ `max`, never enlarges, always ≥ 1 px on each side.

### Sketch Pad, photo picker, Turnstile
- The pad is a `<canvas>` with pointer events and `touch-action: none`. It stores strokes in memory for undo and redo (≥ 30 steps, per `world-pipeline`). Ink coverage uses `inkCoverage` from `shared/src/sketch.ts`, the same function the server uses.
- A keyboard path to the same outcome is the photo picker and the Gallery, both reachable by Tab. The pad itself is a pointer tool and is labelled as such.
- The photo picker re-encodes through a canvas (drops EXIF, GPS and XMP) before upload, per `world-pipeline` task 10.1, and shows the retention notice before the file is chosen.
- Turnstile loads only when the quote says it is required. The script is fetched from Cloudflare's own URL (`https://challenges.cloudflare.com/turnstile/v0/api.js`). It is never proxied, cached or self-hosted, because Cloudflare's [client-side rendering docs](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/) warn that proxying or caching it breaks Turnstile when Cloudflare updates it. The CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` and only when Turnstile is configured.

### Accessibility and motion
- On route change the router focuses the Screen's `h1` (`tabIndex={-1}`) and announces the title in a polite live region.
- Stage changes, errors and ghost speech go through one `LiveRegion` component (`aria-live="polite"`).
- Transitions use a single `fade` token (300 to 600 ms) that drops to 0 to 150 ms under `prefers-reduced-motion`.
- Chat is a bottom sheet below 900 px and a side panel at 900 px and above. The layout is CSS grid with a container query; no JS breakpoint logic.

### Security and privacy
- **World access.** Gallery worlds are public. A visitor's own world is private to the Session that created it. The shell assumes `GET /api/worlds/:id`, its assets, `DELETE /api/worlds/:id` and `POST /api/play/start` serve an own world only to that Session, and answer `world_not_found` for both a missing and a foreign id, so ids cannot be probed. `/haunt/:worldId` and `/play/:worldId` are therefore not shareable for own worlds. A visitor shares the memory card image, not a link. This is a requirement on the `world-pipeline` and `ghost-engine` routes, tracked in `docs/IMPLEMENTATION.md` until those specs state it.
- Same-origin `fetch` with `credentials: 'same-origin'`. No third-party origin appears in the CSP `script-src`, `connect-src`, `font-src` or `img-src` except Turnstile when configured.
- User text is rendered through React text nodes. A lint rule bans `dangerouslySetInnerHTML` in `web/`.
- Production builds replace `console.*` with a logger that accepts only `(code, screenId)`.
- Image URLs come from the API's own origin (`/api/worlds/:id/assets/:name` or R2 proxy paths), never from an upstream host.
- Confirm Token lives in the reducer state only. It is never put in a URL, storage or log.
- `?demo=1` and `FakeApi` are tree-shaken from production builds (`import.meta.env.PROD` guard) and tested for absence in the bundle.

### Performance
- Route-level code splitting: Play, Creator and Sketch Pad are dynamic imports. A size test fails the build if Home's initial JavaScript exceeds 150 KB gzipped.
- Gallery prefetch uses `requestIdleCallback` (or a 1 s timeout fallback) after Home mounts.
- Leaving Play calls `dispose_viewer`, waits for the dispose promise, then mounts the next Screen.

## Error handling
- Screen boundary fallback shows `errorCopy('shell_crash')`, the code, a Home link, and logs `(code, screenId)`.
- Viewer boundary fallback replaces the canvas with the thumbnail and keeps the Chat and Exit.
- Offline: `navigator.onLine` plus fetch failure shows the offline banner; idempotent reads (`GET`) retry on the `online` event. `POST` never retries automatically.
- 429: the API client reads `Retry-After`, passes it to `retryGate`, and the triggering control stays disabled until `enabledAt`.
- Unknown route → `not_found`. A world that returns `world_not_found` or `session_expired` → `expired`.

## Testing strategy
- Property tests (below) on every module in `shared/src/app/`, seeded, at least 100 runs, generators in `*.arb.ts`.
- Component tests (jsdom, Testing Library) per Screen: one main path and one failure path, using `FakeApi`. Focus management and live-region announcements are asserted.
- A model-based test drives `confirmReduce` and `playReduce` with random event sequences against a small oracle.
- A bundle test asserts Home's gzipped size, the absence of `FakeApi` and `console.log` in the production build, and that no origin outside the allow-list appears in built output.
- A Playwright smoke run (local, fixtures only) walks the Zero-Quota Path: Home → Gallery → preset ghost → Play → three memories → Ending. It runs against `?demo=1` and the API in `wrangler dev` with fakes; it never calls a paid upstream.
- Manual checks, recorded in `docs/spikes/shell.md`: keyboard-only run, 320 px width, iOS Safari scroll and zoom inside the pad, screen-reader pass on Haunt and Play.

## Correctness Properties

### Property 1: Routes are total and round-trip
*For any* string path, `resolveRoute` returns exactly one `ScreenId` (unknown paths give `not_found`), and for any route produced by `resolveRoute`, `resolveRoute(pathFor(route))` equals that route.
**Validates: Requirements 1.5, 7.6**

### Property 2: Guards never expose a screen without its prerequisites
*For any* flow state and route, `guardRoute` allows `confirm` only when `pickedImageId` is set, `play` only when `worldId` is set and `ghostReady` is true, and `end` only when `playEnded` is true; otherwise it returns a redirect to a route that itself passes the guard.
**Validates: Requirements 3.7, 5.2, 6.5**

### Property 3: World creation fires at most once and only after consent
*For any* sequence of confirm events, `create` effects number at most one, appear only after an `enter` event, never appear after `back`, and never follow `create_fail` or `create_ok` without a new quote; ignored events leave the state unchanged.
**Validates: Requirements 3.2, 3.3, 3.4, 3.6**

### Property 4: Every error code has fixed copy and no raw server text is shown
*For any* `ErrorCode` and any server-supplied message string, `errorCopy` returns non-empty title and body drawn from the fixed table, independent of the message, with `next` set to one of the allowed actions; any string that is not an `ErrorCode` maps to the generic entry.
**Validates: Requirements 2.7, 3.4, 4.4, 7.3**

### Property 5: Gallery is always available and creation follows quota
*For any* quota snapshot and flags, `canGallery` is true; `canDraw` and `canUpload` are false whenever the kill switch is on or the relevant quota is zero; and when they are false `reason` is set.
**Validates: Requirements 1.3, 5.3**

### Property 6: Stage mapping and polling plan are safe
*For any* job state, `stageOf` returns the matching label and `ready` maps to a Stage that offers "Walk in" without auto-starting; for any timeline of polls, `pollPlan` returns `null` while hidden or terminal, never schedules a poll earlier than `lastPollAt + 3000` or before `rateLimitedUntil`, never schedules more than 5000 ms after the last poll when visible and not rate limited (when rate limited, the next poll is exactly `rateLimitedUntil`), and flags `overdue` only after 15 minutes.
**Validates: Requirements 4.1, 4.3, 4.4, 4.7, 10.3**

### Property 7: Play reducer keeps input mode and Exit consistent
*For any* sequence of play events, the viewer input mode equals `chat` exactly while the chat is open, `start_viewer` is emitted only after the notice is acknowledged, `exit` always emits `dispose_viewer` before `navigate`, and `ended` leads to exactly one navigation to the Ending.
**Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6**

### Property 8: Sketch downscale preserves shape and never enlarges
*For any* positive width and height, `downscaleSize` returns dimensions with longest side at most 512, both sides at least 1, aspect ratio within one pixel of rounding of the input, and no side larger than the input.
**Validates: Requirements 2.3**

### Property 9: Retry gate honours the advised delay
*For any* advised delay and time, `retryGate` returns `enabledAt` at least one second and at most 120 seconds after `now`, equal to the clamped advice, and a control is enabled if and only if `now ≥ enabledAt`.
**Validates: Requirements 7.5**

### Property 10: Resume picks a reachable, correct target
*For any* Session record and world status, `resumeTarget` returns `haunt` only for in-flight worlds, `play` only for a world that is ready or has a live play session, `home` when the Session is missing or expired, and always a route that passes `guardRoute` for the resulting flow state.
**Validates: Requirements 4.5, 6.8, 7.7**

### Property 11: The ink floor gate matches the server
*For any* canvas bitmap, the shell enables "Make it real" if and only if `inkCoverage(bitmap) ≥ 0.005`, using the same function and constant as the API's sketch route.
**Validates: Requirements 2.4**
