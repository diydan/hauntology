# Spike puzzles 1.9: the Secret knock on real tables (plan)

Task 16.4 of `.kiro/specs/puzzles`. Written 2026-11-17, not run yet. The `knock` Kind is built and in `main` (PR #59), but no Room picks it: it stays out of `DEFAULT_KINDS` until this spike passes.

## The question

On real phones lying on real tables, does a knock count as a knock, and only a knock? And can ordinary people open the door in three tries on each level?

## What you need

| Thing | Detail |
|---|---|
| Phones | Three: an iPhone, a recent Android, and an older or cheaper phone if there is one |
| Tables | Two: a wooden one, and a hard one (glass, stone or a laminate kitchen top) |
| People | Five who have not seen the puzzle, one at a time |
| Pages | The Knock test: https://mtest.hauntology.app/knock.html. The puzzle: https://mtest.hauntology.app/puzzles/?kind=knock |
| Time | About 15 minutes per phone and table for part A, about 5 minutes per person for part B |

Lay the phone flat, screen up, in the middle of the table. Knock with a knuckle about a hand's width from it.

## Part A: do the sensors tell a knock from everything else? (the owner, alone)

For each phone on each table, open the Knock test page, tap **Start**, allow motion and the microphone, and run its six short tests. Then tap **Copy the report** and paste it into the results below.

| Test | Want | What it checks |
|---|---|---|
| Five knocks, a second apart | 5 | knocks are not missed |
| Two quick, pause, one | groups 2 / 1 | groups are read right |
| Talk, laugh, clap, no knock | 0 | sound alone is not a knock |
| Cup down, lean, slide the phone | 0 | a bump alone is not a knock |
| Three knocks at the far end | 3 | a knock away from the phone |
| Tap the phone's back three times | 3 | holding the phone works too |

The page runs three detectors at once (motion only, microphone only, both). The game uses **both** when both sensors are on. If **both** misses knocks on a phone where **motion** alone does not, move the **Jolt needed** slider down until five of five count, and write down the value.

## Part B: can people open the door? (five people)

Say only: "The ghost knocks on a door once. Knock it back on the table to open it." Do not show them how.

For each person, on one phone and one table (spread the five across the phones and tables):

1. Open the puzzle with the clue: `https://mtest.hauntology.app/puzzles/?kind=knock&level=easy&seed=<1 to 9999>`. Use a new seed per person, so nobody learns a pattern.
2. Let them hear the clue once (the faded memory card plays it), then knock. **Known gap:** a phone only plays sound after a tap on the page, and on this demo page the card appears before any tap, so the first clue may be silent (the dots, the words and the buzz still show it). Note whether they heard it. If it is silent on every phone, fix that before part B counts.
3. Note how many tries it took (1, 2, 3, or not opened), and whether they used the table or tapped the door.
4. Repeat with `level=medium`, then `level=hard`.
5. Ask: "Was it fun? Was anything unclear?" Write their words.

## Results

### Part A

| Phone | Table | 5 knocks | 2 / 1 | Talk | Bump | Far | Phone's back | Jolt needed | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | wood | | | | | | | | |
| | hard | | | | | | | | |

Paste each copied report under the table.

### Part B

| Person | Phone, table | Easy tries | Medium tries | Hard tries | Table or tap | Their words |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

## Pass marks

| Check | Pass | Then |
|---|---|---|
| Missed knocks (part A, both detectors) | at most 1 in 10, on every phone and table | keep 2.5 m/s² and the 90 ms pairing |
| False knocks from talk or a bump | none, on every phone and table | keep the pairing as it is |
| Easy opened in three tries | 5 of 5 people | `knock` joins `DEFAULT_KINDS` at easy |
| Medium opened in three tries | 4 of 5 | medium is allowed |
| Hard opened in three tries | 3 of 5 | hard is allowed; below that, hard is dropped or the long pause is made longer |
| Fun | most say yes | |

If a check fails, change one thing at a time and run that part again:

- **Missed knocks:** lower the jolt (`JOLT_KNOCK` in `web/src/puzzles/kinds/Knock.tsx`) or the click (`MIC_KNOCK`), or widen the pairing (`PAIR_MS`).
- **False knocks:** raise them back, or use motion only on that phone.
- **People cannot open it:** lengthen the pause between groups when the clue plays (`KNOCK_PLAY` in `shared/src/puzzles/knock.ts`) or the quiet before the check (`KNOCK_READ.quietMs`).

## After the spike

1. Write the results into this file, with the date.
2. Change the settings the results asked for, each with a test.
3. If the pass marks are met, add `knock` to `DEFAULT_KINDS` in `shared/src/puzzles/types.ts` and tick task 16.4.
4. Hand the Zone door and the Haunt Event to the Party Mode spec (task 16.6).
