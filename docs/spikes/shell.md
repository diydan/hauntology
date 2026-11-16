# Shell: manual checks and the browser smoke run (task 10.4 and 10.3)

Written 2026-11-15. The web shell is `web/src/app`; its spec is `.kiro/specs/haunwallker`.

**Status in one line:** the contrast check is done and recorded below. The keyboard-only run, the 320 px check, the iOS Safari pad check and the screen-reader pass need a person with a browser and a phone, and have not been run. The Playwright smoke run is written and has not been run, because its dependency is not installed.

Nobody has opened this shell in a real browser yet. Everything else in the shell is tested in jsdom against the fake API, which cannot show a focus ring, a scroll or a screen reader. That is what this file is for.

## What the automated tests already cover

So the manual checks can stay short.

| Check | Already covered by | What it cannot see |
|---|---|---|
| Focus goes to the Screen heading on a route change, and the title or the error is announced | `web/src/app/screens/screens.test.tsx` (every Screen, main and failure path) | what a screen reader actually says |
| Text contrast, a lantern focus ring, 44 px targets, the Chat sheet, one fade token and reduced motion | `web/src/styles/styles.test.ts` | how it looks |
| Nothing in the CSS forces a page wider than 320 px | `styles.test.ts` ("has nothing that forces a page wider than 320 px") | content that overflows anyway |
| First JavaScript under 150 KB gzipped, no demo code, no `console.log`, no third-party origin, no inline script, no `dangerouslySetInnerHTML` | `web/checks/bundle.test.mjs` (builds the shell and reads it) | a real network |
| A dialog keeps focus inside, closes on Escape, and gives focus back | `Dialog.test.tsx`, the delete tests in `Haunt.test.tsx` | the real Tab order across a whole page |

## 1. Contrast of the HUD and Screen text tokens (done)

Computed from `web/src/styles/tokens.css` with the WCAG formula, against the page colour `--ink` (`#0b0d10`).

| Token | Colour | Used for | Ratio on `--ink` | Needs 4.5 |
|---|---|---|---|---|
| `--bone` | `#e9e4d8` | body text, HUD text, headings | 15.34 | passes |
| `--lantern` | `#e0a43a` | focus ring, links, button text and border | 8.84 | passes |
| `--ghost` | `#9fe8d0` | ghost lines, the "scripted ghost" mark | 13.83 | passes |
| `--alarm` | `#d4604a` | reasons and errors | 5.16 | passes |
| `--ink` on `--lantern` | | text on a pressed or selected button | 8.84 | passes |
| `--ink` on `--bone` | | | 15.34 | passes |
| `--dust` | `#6b6f76` | borders and quiet shapes only | 3.85 | fails, and is never used for text (`styles.test.ts` checks) |

Not checked: text over the 3D view. The Viewer is a stand-in, so the HUD has no picture behind it yet. Check it when `world-viewer` is built, with a bright and a dark place.

## 2. Keyboard-only run of the whole flow (not run)

Unplug the mouse, or do not touch the trackpad. Use Chrome and then Safari. Start at `/?demo=1` (and again at `/?demo=1&zero=1`).

1. Home: Tab reaches "Draw a place", "Upload a photo", "Visit a gallery place" in that order. A disabled action still takes focus and its reason is read.
2. Gallery: Tab to a place and press Enter on "Visit".
3. Haunt: reach "Make a ghost" and "Use a preset ghost", choose one with Enter. Open "Set the sky", search a city, choose a match. Reach "Play a case" and "Wander".
4. Wander: Tab to "Go in". The stand-in Viewer has buttons, so walk with Tab and Enter. Reach "Talk", type a line, press Enter. Reach "Journal" and "Exit".
5. The Ending: "Save memory card", "Haunt again", Home, Gallery.
6. Create: reach the photo picker and the Gallery link before the pad. Reach every tool of the pad, then the caption and "Make it real".
7. Confirm: reach "Enter this place", "Back", "Pick another place".
8. Delete my place: open the dialog, Tab around it (focus must stay inside), Escape closes it, focus returns to the button.

Look for: a visible lantern ring on every focused thing; focus on the page heading after every route change; no keyboard trap; nothing that works only with a pointer, apart from the pad itself, which says it is a pointer tool and has the photo picker and the Gallery before it.

| Date | Browser and system | Result | Notes |
|---|---|---|---|
| | | not run | |

## 3. 320 px width (not run)

Chrome device toolbar at 320 x 568, then a real small phone if there is one. Walk Home, Gallery, Create (with a photo chosen and with candidates), Confirm, Haunt (with the sky card open), Wander (with the Chat open) and the Ending.

Look for: no sideways scroll on any Screen; the Chat is a bottom sheet below 900 px; every target is at least 44 px tall; the pad fits and the tools wrap.

`web/e2e/zero-quota.spec.ts` checks the sideways scroll on most of these Screens in its 320 px project once Playwright is installed, which would automate the first of these.

| Date | Device | Result | Notes |
|---|---|---|---|
| | | not run | |

## 4. iOS Safari: scroll and zoom inside the pad (not run)

On a real iPhone, in Safari, open Create.

1. Draw with one finger across the pad, slowly and fast. The page must not scroll or bounce while the finger is on the pad (`touch-action: none`).
2. Pinch on the pad: it must not zoom the page. Pinch outside the pad: the page may zoom as usual.
3. Double-tap on the pad: no zoom.
4. Tap the caption box: Safari zooms into any field whose text is under 16 px. The caption, the city search and the date fields use the page font; check that none of them makes the page jump.
5. Draw with an Apple Pencil if there is one: a stroke follows the pencil, and the palm does not draw.
6. Rotate the phone with a drawing on the pad: nothing is lost.

| Date | Device and iOS | Result | Notes |
|---|---|---|---|
| | | not run | |

## 5. Screen-reader pass on Haunt and Play (not run)

VoiceOver on macOS Safari, and if possible VoiceOver on iOS and NVDA with Firefox.

Haunt: the page title and heading are read on arrival; each Stage change is read once (Queued, Dreaming, Stitching, Ready); the progress bar says "Step N of 4"; a failed place reads its reason and whether the allowance came back; the sky card, the preset list and "Delete my place" dialog are reachable and labelled.

Wander: the heading is read; "Go in" is reachable; each ghost line is read once as a subtitle; "Memory N of 3 found" is read; a failed turn is read; the Chat and the Journal can be opened and closed; Exit works.

Look for: anything read twice, anything not read, controls with no name, and a live region that talks over the ghost.

| Date | Reader and browser | Result | Notes |
|---|---|---|---|
| | | not run | |

## 6. The Playwright smoke run (task 10.3, not run)

`web/playwright.config.ts` and `web/e2e/zero-quota.spec.ts` are written. They walk the Zero-Quota Path at `/?demo=1&zero=1` (every quota at zero, the world kill switch on): Home to the Gallery to a preset ghost to Wander through three memories to the Ending, then a case against two Bots to its ending, and a place that is not there. They assert that the page makes no request to `/api/`, that the heading has focus after each route change, and (in a 320 px project) that no Screen scrolls sideways.

**What is needed to run it:** add `@playwright/test` as a development dependency of `web` (pinned to an exact version, as the rest of the repo is), and a Chromium. This machine already holds Chromium builds from other projects, so the matching one may need no download. This was not done because adding a dependency needs the owner's say. To run it afterwards: `pnpm --filter @hauntology/web exec playwright test`.

**What waits for other work:** the second half of the task, the same walk against `wrangler dev` with fakes, needs the real routes, which are shell task 3.3 and the other specs' API work.
