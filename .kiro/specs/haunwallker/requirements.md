# Requirements Document

## Introduction

Hauntology is the product: draw or upload any place, walk into it as a 3D world, and let its ghost lead you to three memories. The existing specs cover the engines (`world-pipeline`, `world-viewer`, `ghost-creator`, `ghost-engine`, `party-mode`). This spec covers the part that joins them: the **web shell** in `web/src/app`. It owns routing, the screen flow from Start to Ending, the sketch pad, the confirm gate UI, error handling, the zero-quota path, and the way the viewer and chat are composed on the Play screen.

The shell contains no business rules. It calls the API, renders typed results, and sends the visitor to the right screen. It must never start a paid call without an explicit confirmation, and a visitor with no quota and no LLM must still be able to finish the experience.

The spec directory is named `haunwallker` because it was created under that name. The product name is Hauntology.

## Glossary

- **Shell**: the `web/src/app` feature: router, screens, layout, error boundaries, API client wrapper.
- **Screen**: one routed page: Home, Gallery, Create, Confirm, Creator, Haunt (waiting), Play, Ending.
- **Place Image**: the single image that will be turned into a world (an uploaded photo or a chosen sketch candidate), as defined in `world-pipeline`.
- **Sketch Pad**: the drawing surface on the Create screen.
- **Confirm Gate**: the Confirm screen. It shows the exact Place Image and remaining quota, and is the only place that can start a world creation.
- **Confirm Token**: the short-lived token issued by the API when the visitor confirms (see `world-pipeline`).
- **Quota Snapshot**: the remaining per-session and per-day allowance returned by the API for worlds, images, LLM calls and TTS calls.
- **Zero-Quota Path**: the route through Gallery world + Preset Ghost + scripted ghost lines that needs no paid call and no LLM.
- **Stage**: a labelled step of world creation: queued, dreaming, stitching, ready, failed.
- **Play Screen**: the Screen that hosts the Viewer and the Chat together.
- **Chat**: the text-adventure panel from `ghost-engine`, shown as a bottom sheet below 900 px and a side panel at 900 px and above.
- **Viewer**: the `web/src/viewer` feature from `world-viewer`.
- **Session**: the anonymous cookie session. There are no accounts.

## Requirements

### Requirement 1

**User Story:** As a first-time visitor, I want to understand what this is and start in one step, so that I am not lost.

#### Acceptance Criteria

1. WHEN the visitor opens the app THEN the Shell SHALL show the Home screen with the one-line premise, a "Draw a place" action, an "Upload a photo" action and a "Visit a gallery place" action.
2. THE Home screen SHALL state in plain copy that worlds are static, that the ghost is a billboard sprite, and that personal photos are deleted after 24 hours.
3. WHEN the API reports that world creation is disabled (kill switch, daily cap or total cap reached) THEN the Shell SHALL disable "Draw a place" and "Upload a photo", say why in one line, and keep "Visit a gallery place" enabled.
4. WHEN the Shell loads THEN the Shell SHALL request a Quota Snapshot once and make it available to every Screen without a second request per Screen.
5. THE Shell SHALL give every Screen a stable URL path, so that reload and the browser Back button land on a sensible Screen and never on a blank page.

### Requirement 2

**User Story:** As a visitor, I want to sketch a place with my finger or mouse, so that I can recreate somewhere I have no photo of.

#### Acceptance Criteria

1. WHEN the visitor opens Create THEN the Shell SHALL host the Sketch Pad defined by `world-pipeline` Requirement 2.1 (brush, eraser, three sizes, undo and redo of at least 30 steps, clear, mouse, touch and pen) together with an optional caption and a "Make it real" action, and SHALL NOT redefine those tool rules.
2. WHILE drawing THEN the Sketch Pad SHALL prevent page scroll and zoom inside the pad and SHALL keep pointer targets at least 44 px.
3. WHEN the visitor chooses "Make it real" THEN the Shell SHALL downscale the sketch to at most 512 px on its longest side, send it to the API once, and show the returned candidate images with alt text derived from the caption.
4. WHILE the sketch has ink coverage below the 0.5% floor in `world-pipeline` Requirement 2.2 THEN the Shell SHALL keep "Make it real" disabled and explain why, using the same shared function the API uses.
5. WHEN candidates are shown THEN the Shell SHALL show the remaining image quota and allow the visitor to pick one candidate, redraw, or go back to edit the sketch.
6. WHERE the visitor uploads a photo instead THEN the Shell SHALL accept JPEG, PNG and WebP up to a fixed size limit, show a preview, and send the file to the API without any client-side upload of metadata the visitor did not choose.
7. IF image generation fails or the image quota is exhausted THEN the Shell SHALL keep the sketch, show a typed error message, and offer the Gallery as the next step.
8. THE Sketch Pad SHALL keep the sketch in memory only, and SHALL NOT write it to local storage, cookies or analytics.

### Requirement 3

**User Story:** As a visitor, I want to see exactly what I am about to spend on, so that nothing is paid without my consent.

#### Acceptance Criteria

1. WHEN the visitor has picked a Place Image THEN the Shell SHALL navigate to the Confirm Gate, call `POST /api/worlds/quote`, and show the exact image from the quote at a readable size, the remaining quota, and the question "Enter this place?".
2. THE Shell SHALL NOT call `POST /api/worlds` from any Screen other than the Confirm Gate, and SHALL NOT call it before the visitor chooses "Enter this place".
3. WHEN the visitor chooses "Enter this place" THEN the Shell SHALL call `POST /api/worlds` once with the Confirm Token from the quote, disable the action while the request is in flight, and keep the Confirm Token only in memory.
4. IF the confirmation is rejected with a quota, moderation, bot-check or kill-switch code THEN the Shell SHALL show a message specific to that code, release the disabled state, and offer the Gallery.
5. IF a Turnstile challenge is required THEN the Shell SHALL render it inside the Confirm Gate and send its result with the confirmation.
6. WHEN the visitor chooses "Back" or "Pick another" THEN the Shell SHALL return to Create or Gallery without consuming quota.
7. IF the Confirm Gate is opened by URL without a picked Place Image in the Session THEN the Shell SHALL redirect to Create.
8. WHEN the visitor chooses "Delete my place" on any Screen that shows their own place THEN the Shell SHALL ask for confirmation, call the API delete route, clear all in-memory state for that place and return to Home.

### Requirement 4

**User Story:** As a visitor waiting for my world, I want something worthwhile to do, so that the minutes feel short.

#### Acceptance Criteria

1. WHEN world creation starts THEN the Shell SHALL navigate to the Haunt screen, show the current Stage with its label, and update the Stage from the job status within 5 seconds of a change.
2. WHILE the Haunt screen is open THEN the Shell SHALL offer the Ghost Creator so the visitor can design their ghost during the wait, and SHALL show a "Use a preset ghost" action.
3. WHEN the Stage becomes ready THEN the Shell SHALL tell the visitor and offer "Walk in", and SHALL NOT start the Viewer automatically.
4. IF the Stage becomes failed THEN the Shell SHALL show the typed failure reason, state whether quota was returned, and offer the Gallery and a retry only if the API says a retry is allowed.
5. IF the visitor reloads or closes the tab during the wait THEN the Shell SHALL resume the Haunt screen for the same world on return, using the world id kept in the Session.
6. WHILE waiting THEN the Shell SHALL use calm labelled progress and SHALL NOT rely on a spinner alone.
7. IF the wait exceeds the expected maximum THEN the Shell SHALL say so honestly and offer the Gallery without cancelling the job.

### Requirement 5

**User Story:** As a visitor with no quota, no patience or no account, I want to finish the whole experience anyway, so that nothing is a dead end.

#### Acceptance Criteria

1. WHEN the visitor chooses "Visit a gallery place" THEN the Shell SHALL list the Gallery worlds with thumbnail, title and a short description, using static data that needs no paid call.
2. WHEN a Gallery world is chosen THEN the Shell SHALL let the visitor pick a Preset Ghost or create a ghost, and SHALL then open the Play Screen.
3. THE Zero-Quota Path SHALL work with the world kill switch on, with every paid quota at zero, and with the LLM unavailable, by using scripted ghost lines.
4. WHEN the Play Screen runs on scripted lines THEN the Shell SHALL show a small, quiet "scripted ghost" indicator and SHALL NOT present the scripted lines as generated.
5. IF the Gallery fails to load THEN the Shell SHALL show a retry action and an error message, and SHALL NOT show an empty grid without explanation.

### Requirement 6

**User Story:** As a visitor, I want walking and talking to feel like one experience, so that I can search and speak without friction.

#### Acceptance Criteria

1. WHEN the Play Screen opens THEN the Shell SHALL show the content notice from `world-viewer` and require acknowledgement before starting the Viewer.
2. WHEN the Viewer reports an interaction prompt and the visitor accepts THEN the Shell SHALL open the Chat and set the Viewer Input Mode to chat, and WHEN the Chat closes THEN the Shell SHALL set it back to play.
3. WHEN a turn response from `POST /api/play/:id/turn` carries a new view (found memories, anchors, haunt level) THEN the Shell SHALL pass it to the Viewer, and WHEN the Viewer reports its pose or an anchor or ghost proximity THEN the Shell SHALL pass the pose with the next turn request, using one typed Shell-to-Viewer event contract defined in this spec's design under `shared/src/app/`.
4. THE Shell SHALL show the HUD with the found-memory count out of three, a journal action and an always-visible Exit control.
5. WHEN the third memory is found THEN the Shell SHALL navigate to the Ending screen with the ending card and a "Save memory card" action.
6. WHEN the visitor chooses Exit THEN the Shell SHALL dispose the Viewer, close the Chat, and return to Home or Gallery without a full page reload.
7. IF the Viewer falls back to a panorama or thumbnail THEN the Shell SHALL keep the Chat usable and show a one-line notice about the reduced view.
8. WHEN the visitor reloads the Play Screen THEN the Shell SHALL restore the same world, ghost and found memories from the play session held by the API, and SHALL show the content notice again only if it was not acknowledged in this Session.

### Requirement 7

**User Story:** As a visitor, I want the app to recover from problems gracefully, so that a bug never ends my visit.

#### Acceptance Criteria

1. THE Shell SHALL wrap each Screen in an error boundary that shows a calm message, an error code and a route back to Home, and SHALL log only the code and a Screen id.
2. THE Shell SHALL isolate the Viewer in its own error boundary, so that a Viewer crash leaves the Chat and Exit control working.
3. WHEN an API call fails with a typed error code from `shared/src/errors.ts` THEN the Shell SHALL map that code to a fixed user-facing message and SHALL NOT show raw server text.
4. IF the network is offline THEN the Shell SHALL say so, keep local state, and retry idempotent reads when the connection returns.
5. WHEN the API returns 429 THEN the Shell SHALL wait for the advised delay before enabling the action again.
6. THE Shell SHALL show a not-found Screen for unknown routes and an expired Screen for deleted or expired worlds, each with a link to Home and Gallery.
7. IF the Session cookie is missing or expired THEN the Shell SHALL create a new Session and, for a Screen that needs server state, return to Home with a short explanation.

### Requirement 8

**User Story:** As a visitor with accessibility needs, I want to use every Screen my own way, so that the experience is open to me.

#### Acceptance Criteria

1. THE Shell SHALL be fully operable with the keyboard alone, with a visible focus ring in `--lantern`, and SHALL move focus to the Screen heading on every route change.
2. THE Shell SHALL announce Stage changes, errors and ghost speech in polite live regions.
3. THE Sketch Pad SHALL offer a non-drawing alternative path (upload a photo or visit the Gallery) that is reachable without pointer input.
4. WHERE the visitor prefers reduced motion THEN the Shell SHALL replace transitions with instant changes and keep fades under 150 ms.
5. THE Shell SHALL keep text at a contrast ratio of at least 4.5:1 against its background, use touch targets of at least 44 px, and provide alt text for every image.
6. THE Shell SHALL be usable at 320 px width without horizontal scroll, and SHALL use a bottom-sheet Chat below 900 px and a side-panel Chat at 900 px and above.

### Requirement 9

**User Story:** As the owner of the project, I want the shell to follow the security and privacy rules, so that visitors' photos and the budget stay safe.

#### Acceptance Criteria

1. THE Shell SHALL load only same-origin scripts, styles, fonts and assets, and SHALL work under a strict Content Security Policy with no inline scripts.
2. THE Shell SHALL render user text (captions, chat, names) as text and SHALL NOT use `innerHTML` with it.
3. THE Shell SHALL call the API only with the Session cookie and same-origin requests, and SHALL NOT receive or display upstream asset URLs or API hosts.
4. THE Shell SHALL NOT include secrets, analytics, third-party trackers or third-party font requests.
5. THE Shell SHALL NOT log image bytes, captions or chat text to the console in production builds.
6. WHEN the visitor uploads a photo THEN the Shell SHALL tell them before upload that metadata is stripped and the photo is kept for 24 hours at most.

### Requirement 10

**User Story:** As a visitor on a phone or an older laptop, I want the app to load fast and stay light, so that it works for me.

#### Acceptance Criteria

1. THE Shell SHALL load the Viewer, Spark and three.js code only when the visitor enters the Play Screen, and SHALL keep the Home screen's initial JavaScript under 150 KB gzipped.
2. WHEN the visitor leaves the Play Screen THEN the Shell SHALL release the Viewer and its listeners before mounting the next Screen.
3. WHILE a tab is hidden THEN the Shell SHALL pause polling of job status and resume it when the tab is shown again.
4. THE Shell SHALL prefetch the Gallery list after the Home screen is idle, and SHALL NOT prefetch any world asset before the visitor chooses a world.

### Requirement 11

**User Story:** As a developer and as a judge, I want the shell to be testable and demo-ready, so that I can trust it and record it.

#### Acceptance Criteria

1. THE Shell SHALL implement its route table, flow guards (for example "Confirm needs a picked image") and error-code mapping as pure functions in `shared` that take their inputs as parameters, and SHALL cover them with property tests using seeded generators.
2. THE Shell SHALL run every Screen against recorded fixtures and fakes in tests and local development, and SHALL NOT call a paid upstream.
3. WHERE `?demo=1` is set on a non-production build THEN the Shell SHALL use a fake API that returns fixture Stages on a short timer, so the demo beats (sketch, confirm gate, generation montage, walk, memories, ending) can be recorded without spending.
4. THE Shell SHALL expose the Quota Snapshot, the current Stage and the Viewer frame rate in a debug overlay when `?debug=1` is set.
5. EACH Screen SHALL have at least one component test that covers its main path and one that covers its main failure path.
