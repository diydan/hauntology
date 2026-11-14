# Requirements Document

## Introduction

The conditions feature brings a little of the real world into the haunting: a place, one weather snapshot, an optional Memory Day, the moon and the real stars above the place. It is read once at the start of a game and frozen, so every player sees the same sky. It changes looks (tint, fog, rain, snow, stars), sound (an optional quiet loop) and the ghost's words (a few enum values, never free text). It never changes a rule. It stays small on purpose: weather, time and moon only. News and crime at a place are left out, because a real place can be someone's home.

## Glossary

- **Conditions service**: the pure logic in `shared/src/conditions/` plus the one outside-call module in `api/src/conditions/`.
- **Place**: a position rounded to two decimals, with a time zone and a display label. Nothing else about the place is kept.
- **Place Input**: what the browser or a city search hands over before it is rounded: a latitude, a longitude and optionally a time zone and a label.
- **Time of Day**: one of dawn, day, dusk or night, taken from the local hour at the Place.
- **Weather Class**: one of clear, cloud, fog, rain, storm or snow.
- **Temperature Band and Wind Band**: coarse bands (for example cold, mild, warm; calm, breezy, windy) derived from the Open-Meteo numbers.
- **Moon Phase**: one of eight named phases, computed from the date with no service.
- **Snapshot**: the frozen record of Place, Time of Day, Weather Class, bands, Moon Phase, optional Memory Day and optional stars, read once at the start of a game.
- **Default**: a clear sky and the host's clock.
- **Memory Day**: a date from 1940 to yesterday and a Time of Day, chosen by the visitor, or suggested from a photo's capture time.
- **Open-Meteo**: the outside weather service (forecast, archive and geocoding endpoints). It is free for non-commercial use and not paid per call here.
- **Atmosphere**: the part of a Snapshot the Viewer may use: no coordinates, no label and no date.
- **Star Texture**: the one image of the stars and moon drawn once per Snapshot, at most 1024 by 512 pixels.
- **Host**: the screen that shows the world (the visitor's own screen in Single player).
- **ViewerBridge**: the Viewer's command and event interface, owned by `world-viewer`.

## Requirements

### Requirement 1

**User Story:** As a player, I want to set the place and the hour of my haunting, or leave them to the game, so that the sky outside can match somewhere real without telling anyone where I live.

#### Acceptance Criteria

1. WHEN the visitor types a city name in the sky card THEN the Conditions service SHALL return at most five matching places, each shown as a label, and SHALL let the visitor pick one.
2. WHEN the visitor taps "Use this table's location" THEN the browser SHALL share its position with the game, and no position SHALL be requested at any other time and none SHALL be guessed from the network address.
3. WHEN a Place is set THEN the Conditions service SHALL keep only its latitude and longitude rounded to two decimals, its time zone and a display label, and SHALL store nothing else about the place.
4. THE Conditions service SHALL take the Time of Day (dawn, day, dusk or night) from the local hour at the Place, or from the host's clock with a clear sky when no Place is set.

### Requirement 2

**User Story:** As a player, I want one real sky for the whole game, so that everyone at the table sees the same weather and nothing about it can surprise us.

#### Acceptance Criteria

1. WHEN a game starts THEN the Conditions service SHALL read one Snapshot, once, and freeze it for the whole game so that every player and every screen sees the same sky.
2. THE Conditions service SHALL put only weather, time and moon in a Snapshot (with the rounded Place and Memory Day they were read for), and SHALL never put news, crime or any real event in it.
3. WHEN a Place is set THEN the Conditions service SHALL read from Open-Meteo a Weather Class (clear, cloud, fog, rain, storm or snow) with a Temperature Band and a Wind Band.
4. IF the weather call fails, takes longer than 3 seconds, or CONDITIONS_ENABLED is off THEN the Conditions service SHALL use the Default without showing an error, and SHALL make no outside call when CONDITIONS_ENABLED is off.
5. WHEN a Snapshot is read THEN the Conditions service SHALL make at most one weather call for the game and SHALL cache each answer for 15 minutes by rounded Place.
6. THE Conditions service SHALL compute the Moon Phase from the date alone, with no service call, as one of eight phases.

### Requirement 3

**User Story:** As a player, I want to set the haunting on a day that mattered to me, so that the sky in the world matches a day I remember.

#### Acceptance Criteria

1. WHEN the visitor sets a Memory Day THEN the Conditions service SHALL accept a date from 1940 up to yesterday together with a Time of Day, and SHALL reject any other date.
2. WHEN a Memory Day and a Place are set THEN the Conditions service SHALL read that day's recorded weather from the Open-Meteo archive, with the same 3 second timeout and fall back to the Default as in criterion 2.4.
3. WHEN the visitor picks a photo THEN the browser SHALL read the photo's capture date and time (EXIF DateTimeOriginal) before the photo is re-encoded and offer it as a suggested Memory Day, SHALL read no other field, SHALL discard the location and every other field, and SHALL let the visitor change or clear the suggestion.

### Requirement 4

**User Story:** As a player, I want the weather to show in the world and be heard softly, so that the place feels like it is under a real sky.

#### Acceptance Criteria

1. WHEN the game's Snapshot has been read THEN the Host SHALL pass its Atmosphere to the Viewer through `setAtmosphere` on the ViewerBridge (owned by `world-viewer` criterion 3.6), and the Viewer SHALL use it for looks and sound only.
2. WHEN an Atmosphere is set THEN the Viewer SHALL tint the world and add fog according to the Weather Class and Time of Day, and SHALL change nothing else about the haunt layer.
3. WHEN the weather is rain, storm or snow THEN the Viewer SHALL draw falling particles capped in number, with a lower cap when the visitor prefers reduced motion and a lower cap at low quality.
4. WHERE ambient loop files are present THEN the Viewer SHALL play one quiet loop for the weather at no more than 30 percent volume, only after a user gesture, with at most 12 loops in total, and a missing file SHALL change nothing.

### Requirement 5

**User Story:** As a player, I want the ghost to notice the weather and the night sky in its own gentle way, so that it feels present, without ever bringing the outside world's troubles in.

#### Acceptance Criteria

1. WHEN a narrator prompt is built THEN the Engine SHALL include from the Snapshot only the Weather Class, the time bucket and the moon name.
2. WHEN a model reply mentions news, crime, death or a real event THEN the Engine SHALL replace it with a scripted line, and no scripted line SHALL mention any of them.
3. WHERE stars are visible THEN the Narrator SHALL name at most one star, once per game, using a fixed scripted line.

### Requirement 6

**User Story:** As a player, I want the night sky in the world to be the real one for my place and date, so that looking up feels true.

#### Acceptance Criteria

1. WHEN the Time of Day is dusk or night and a Place is set THEN the Conditions service SHALL compute the stars and the moon above the Place for that date and hour from a built-in list of at most 300 bright stars, using simple low-precision formulas.
2. WHEN the stars have been computed THEN the Viewer SHALL draw them once into a Star Texture of at most 1024 by 512 pixels, so that no star is drawn per frame.
3. WHEN the weather is cloud THEN the Viewer SHALL dim the stars, and WHEN the weather is fog, rain, storm or snow THEN the Viewer SHALL hide them.
