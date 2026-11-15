# Requirements Document

## Introduction

Haunting errands give a Player who has joined the haunting (a Poltergeist) a small secret job in the real room: get one named Detective to pick up and hold one everyday object, such as a spoon. It is played at the table, by talk and by trick, and the table is the judge. Errands add Scare points and a little Bonus time and nothing else: they never change the Solution, a Hand, a Turn or who can win. They give a haunting Player something to do between Turns, and they make the room itself part of the game.

## Glossary

- **Errand**: a secret job held by one Poltergeist: one Errand Object and one Target.
- **Errand Object**: one object from a fixed catalogue of 12 safe everyday things found in most homes (spoon, mug, cushion, sock, pen, book, remote, glass of water, tea towel, apple, coat, key ring).
- **Target**: the Detective the Poltergeist must get to hold the Errand Object.
- **Done**: the Target is holding the Errand Object in their hand at the table.
- **Caught**: a Detective names a Poltergeist and an Errand Object before the Errand is Done.
- **Errands setting**: a Room setting, on or off, set by the Master.
- Other terms (Room, Master, Player, Detective, Poltergeist, Bot, Round, Turn, Scare points, Bonus Seconds, Photo Prompt, ending recap, Public View, Private View) are as in the `party-mode` spec.

## Requirements

### Requirement 1

**User Story:** As a Player who joined the haunting, I want a secret errand, so that I still have something fun to do at the table.

#### Acceptance Criteria

1. WHERE the Errands setting is on and a Player becomes a Poltergeist THEN the Room SHALL give that Poltergeist one Errand, chosen deterministically from the Room seed, the seat and the number of Errands already given, and SHALL show it only on that Poltergeist's phone.
2. THE Room SHALL choose a Target only from Detectives who are human, seated and have not opted out of being a Target, and SHALL give no Errand WHEN no such Detective exists.
3. THE Room SHALL give a Poltergeist at most one Errand at a time, SHALL give a new one WHEN the old one is Done, Caught or two full Rounds old, and SHALL give no two Poltergeists the same Target and Errand Object at once.
4. WHERE an accepted lobby photo answered a Photo Prompt whose subject is an Errand Object THEN the Room SHALL prefer that object for the first Errand of the game, so that the object in a framed photo may become the object to fetch.

### Requirement 2

**User Story:** As a Poltergeist, I want my trick to count when it works, so that a good trick earns something.

#### Acceptance Criteria

1. WHEN the Poltergeist taps Done THEN the Room SHALL ask the Target privately "Are you holding a <object> right now?" with Yes and No, and SHALL count the Errand as Done only on Yes.
2. WHEN an Errand is Done THEN the Room SHALL give the Poltergeist two Scare points, tell the Target privately which object it was but not who sent it, and add "<Target> was made to hold a <object>" to the public log without the sender.
3. WHEN the Target answers No, or does not answer within 20 seconds THEN the Errand SHALL stay open, and a Poltergeist SHALL be able to tap Done at most once per Round per Errand.
4. THE ending recap SHALL list every Errand with its sender, Target, object and outcome.

### Requirement 3

**User Story:** As a Detective, I want to call out a trick, so that I can play back against the haunting.

#### Acceptance Criteria

1. WHILE the Errands setting is on THEN the Controller SHALL let every Detective, once per Round, call Caught by choosing one Poltergeist and one Errand Object from the catalogue.
2. WHEN a Caught call matches that Poltergeist's open Errand THEN the Room SHALL close the Errand with no Scare points, give the caller 10 Bonus Seconds on their next Turn, and add "<caller> caught a haunting" to the public log.
3. WHEN a Caught call does not match THEN the Room SHALL change nothing except using that Detective's call for the Round, and SHALL NOT tell anyone whether the Poltergeist has an Errand at all.

### Requirement 4

**User Story:** As a host of the evening, I want errands to be safe, optional and fair, so that nobody is hurt, left out or confused.

#### Acceptance Criteria

1. THE Errands setting SHALL be off by default, and only the Master SHALL change it, from the next Errand onwards.
2. EVERY Errand Object SHALL be soft or unbreakable or ordinary to hold, SHALL be in reach in a normal home, and no Errand SHALL ask anyone to touch another person, take something from a person or a bag, leave the room, or use anything hot, sharp or a medicine.
3. THE Controller SHALL let any Player opt out of being a Target at any time without saying why, and SHALL show every Errand with a line "Ask, trick or tempt. Never grab or push."
4. AN Errand SHALL change no card, Hand, Solution, Turn order, Turn Clock (other than the Bonus Seconds of 3.2) or win, a Bot SHALL never be a Target or hold an Errand, and the Public View SHALL contain no open Errand.
