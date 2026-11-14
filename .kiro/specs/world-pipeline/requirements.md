# Requirements Document

## Introduction

The world pipeline turns a place the user remembers into a stored, walkable 3D world. It supports two starting paths (upload a photo, or draw a sketch that FLUX.2 on Workers AI turns into a photo), a mandatory confirm gate before any paid world generation, a spend guard that makes cost bounded and predictable, and ingestion of the finished World Labs world into our own storage. A pre-generated Gallery guarantees the full experience with zero quota.

## Glossary

- **Pipeline**: the API-side services and Durable Objects that implement this spec.
- **Place Image**: the single image that is sent to World Labs (an uploaded photo, or a chosen sketch candidate).
- **Candidate**: one of the images FLUX.2 returns for a sketch.
- **Place Brief**: a short description (setting, salient objects, mood) of the Place Image plus a safety verdict.
- **Quote**: the pre-spend summary shown at the confirm gate.
- **Confirm Token**: a short-lived HMAC token proving the user confirmed a specific Place Image in a specific session.
- **SpendGuard**: the Durable Object that atomically reserves, commits and releases quota for paid calls.
- **Ticket**: a reservation handle issued by SpendGuard.
- **WorldJob**: the Durable Object that runs one world generation to completion.
- **World Bundle**: manifest (`world.json`) plus splat, collider mesh, panorama and thumbnail stored in R2.
- **Gallery World**: a pre-generated World Bundle shipped with the app.

## Requirements

### Requirement 1

**User Story:** As a visitor, I want to upload a photo of a place, so that I can walk back into it.

#### Acceptance Criteria

1. WHEN the user submits an image THEN the Pipeline SHALL accept it only if it is JPEG, PNG or WebP, at most 10 MB, with shorter side at least 512 px and longer side at most 8192 px, and otherwise reject it with a specific reason code.
2. WHEN the declared content type disagrees with the file's magic bytes THEN the Pipeline SHALL reject the upload.
3. WHEN an image is accepted THEN the Pipeline SHALL remove EXIF, XMP and GPS metadata before the image is stored or sent to any third party.
4. WHEN an image is accepted THEN the Pipeline SHALL store it in private storage under an opaque identifier and SHALL NOT expose any listing of stored images.
5. WHERE the user supplies more than one photo (maximum 4) THEN the Pipeline SHALL treat the first as primary and make the rest available to the optional multi-image path in Requirement 11.

### Requirement 2

**User Story:** As a visitor without a photo, I want to draw a place and have it turned into an image, so that I can still enter it.

#### Acceptance Criteria

1. WHEN the user opens the sketch pad THEN the Web app SHALL provide brush, eraser, three brush sizes, undo and redo of at least 30 steps, and clear, working with mouse, touch and pen input.
2. IF the submitted sketch has ink coverage below 0.5% of its pixels THEN the Pipeline SHALL reject it without calling FLUX.2.
3. WHEN composing the image prompt THEN the Pipeline SHALL embed the user caption (3 to 200 characters) only inside a delimited data clause, strip control characters, cap total prompt length, and always attach a fixed negative prompt excluding people, text and watermarks.
4. WHEN a valid sketch and caption are submitted THEN the Pipeline SHALL call FLUX.2 with the sketch as a reference image and return two Candidates.
5. WHEN the user selects a Candidate THEN the Pipeline SHALL store it as the Place Image using the same storage rules as Requirement 1.
6. IF the image-generation quota is exhausted THEN the Pipeline SHALL make no Workers AI call and SHALL return the remaining quota and a pointer to the Gallery.

### Requirement 3

**User Story:** As the operator, I want every Place Image checked before money is spent, so that the app stays safe and on-brand.

#### Acceptance Criteria

1. WHEN a Place Image is selected THEN the Pipeline SHALL obtain from a vision-capable model a Place Brief of at most 80 words and a boolean safety verdict.
2. IF the verdict is unsafe THEN the Pipeline SHALL block world creation, delete the stored image, and show a neutral message that does not describe the content.
3. IF the moderation call fails or times out THEN the Pipeline SHALL fail closed by blocking world creation and allowing a retry.
4. WHEN a Place Brief is produced THEN the Pipeline SHALL store it with the image identifier for reuse by the ghost engine.

### Requirement 4

**User Story:** As a visitor, I want to see exactly what will be sent and confirm it, so that I am never charged for or surprised by a world.

#### Acceptance Criteria

1. WHEN the user reaches the confirm step THEN the Web app SHALL display the exact Place Image, the remaining world quota, an "Enter this place?" button and a Cancel control.
2. WHEN a Quote is requested THEN the Pipeline SHALL issue a Confirm Token that binds the image identifier, image hash and session and expires after 10 minutes.
3. WHEN a world creation request arrives THEN the Pipeline SHALL require a Confirm Token that verifies for that image and session and has not expired, and otherwise SHALL return an error without any upstream call.
4. WHEN a Confirm Token is presented more than once THEN the Pipeline SHALL return the existing job rather than start another.
5. WHERE a Turnstile secret is configured THEN the Pipeline SHALL also require a valid Turnstile token.

### Requirement 5

**User Story:** As the operator, I want hard, atomic spend limits, so that a bug or a crowd cannot run up the bill.

#### Acceptance Criteria

1. WHEN a paid call is about to be made THEN the Pipeline SHALL first reserve one unit from SpendGuard, and SHALL deny the call without any upstream request if the session, daily or total cap for that meter is exhausted.
2. WHEN a reserved operation fails, times out or is cancelled THEN the Pipeline SHALL release the Ticket so the unit is returned.
3. WHEN a reserved operation succeeds THEN the Pipeline SHALL commit the Ticket so the unit stays consumed.
4. IF world generation is disabled by configuration or the upstream returns insufficient-credits THEN the Pipeline SHALL deny all new world creation until re-enabled while keeping the Gallery available.
5. WHEN FLUX.2 image calls and ghost LLM calls are made THEN the Pipeline SHALL meter them in SpendGuard with their own caps, separate from the world meter.
6. WHEN reserve, commit and release requests arrive concurrently THEN SpendGuard SHALL never allow committed plus reserved units to exceed any cap.
7. WHEN the client asks for quota THEN the Pipeline SHALL return remaining counts per meter and nothing else about other sessions.

### Requirement 6

**User Story:** As a visitor, I want repeat requests to be free, so that a double click or a revisit costs nothing.

#### Acceptance Criteria

1. WHEN a world creation request matches a ready world with the same image hash and options THEN the Pipeline SHALL return that world without any upstream call and without consuming quota.
2. WHEN a world creation request matches a job already in flight THEN the Pipeline SHALL attach the requester to that job.

### Requirement 7

**User Story:** As a visitor, I want to see progress while my world is built, so that I know it is working.

#### Acceptance Criteria

1. WHEN a confirmed, reserved request starts THEN the WorldJob SHALL call World Labs generate with model `marble-1.1` using the Place Image and record the operation id.
2. WHILE a job is not finished THEN the WorldJob SHALL poll about every 10 seconds with jitter, back off on rate-limit responses honouring any retry delay, and give up after 20 minutes.
3. WHEN the job state changes THEN the Pipeline SHALL expose one of `queued`, `generating`, `ingesting`, `ready` or `failed` with a human-readable progress label through the status endpoint.
4. IF the upstream returns a client error other than rate limiting THEN the WorldJob SHALL move to `failed`, map it to a user-safe message, and release the Ticket.
5. IF the upstream returns insufficient credits THEN the WorldJob SHALL move to `failed`, release the Ticket and trip the kill switch.
6. WHEN a job reaches `ready` or `failed` THEN the Pipeline SHALL ignore any later event for that job.

### Requirement 8

**User Story:** As the Web app, I want finished worlds served from our own origin in a stable shape, so that the viewer can rely on them.

#### Acceptance Criteria

1. WHEN World Labs reports completion THEN the WorldJob SHALL fetch the world, copy the splat, collider mesh, panorama and thumbnail into our storage, and verify each stored object is non-empty.
2. WHEN assets are stored THEN the Pipeline SHALL write a validated manifest containing identifiers, asset paths, orientation fix, scale, spawn pose, floor height, bounds, source kind and the Place Brief.
3. IF the splat is missing or empty THEN the WorldJob SHALL fail and release the Ticket, and IF only the collider, panorama or thumbnail is missing THEN the WorldJob SHALL mark the world ready with those assets omitted from the manifest.
4. WHEN a client requests an asset THEN the Pipeline SHALL serve it from our own origin with range-request support and long-lived caching.
5. WHEN any response is sent to the browser THEN the Pipeline SHALL NOT include the World Labs API key or any upstream asset URL.

### Requirement 9

**User Story:** As a judge or first-time visitor, I want to play a finished world immediately, so that I can experience Hauntwalk without waiting or spending.

#### Acceptance Criteria

1. THE Pipeline SHALL ship at least six Gallery Worlds, each with a manifest, a ghost preset and image attribution, playable with zero quota.
2. WHEN the Gallery list is requested THEN the Pipeline SHALL return id, title, thumbnail and image licence or attribution for each Gallery World.
3. WHILE world generation is disabled or out of quota THEN the Gallery and everything downstream of it SHALL remain fully functional.
4. WHEN a user world is ready THEN the Pipeline SHALL expose it at a share link using an unguessable identifier of at least 128 bits.

### Requirement 10

**User Story:** As a user who uploaded a personal photo, I want it gone soon and removable on demand, so that my memories stay mine.

#### Acceptance Criteria

1. WHEN stored objects exceed their retention (uploads 24 hours, user worlds 7 days) THEN the Pipeline SHALL delete them, and SHALL never delete Gallery Worlds.
2. WHEN the user chooses "Delete my place" THEN the Pipeline SHALL delete the upload, candidates, world bundle, ghost sprite and play sessions for that world immediately.
3. WHEN the Pipeline logs events THEN it SHALL record only identifiers, counters and error codes, and never image bytes, prompts, captions or chat text.

### Requirement 11

**User Story:** As a visitor with only one photo, I want the system to synthesise extra views when that helps, so that the world is more complete.

#### Acceptance Criteria

1. WHERE the enhance feature is enabled and the user supplied a single photo THEN the Pipeline SHALL create extra views of the same scene by outpainting and submit them with the original as a multi-image prompt with distinct azimuths.
2. THE enhance feature SHALL default to disabled unless the recorded A/B spike shows it improves worlds over the single-image path.
3. IF any enhance step fails or exceeds its image quota THEN the Pipeline SHALL fall back to the single-image path using the original photo.
