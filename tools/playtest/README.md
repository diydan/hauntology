# Hauntology playtest and device lab

Live at **https://mtest.hauntology.app** (a Cloudflare Worker with static assets and one Durable Object per lab room).

Two things in one place:

1. **Device lab** (`/lab`): open one link on several devices, see who is on it, and fire **sound, light and buzz**
   on this device (local) or push them to one device, some, or all (remote), timed together from the server clock.
2. **Phone tests**: a phone check (`/check`) and the ten puzzles plus one extra (`/clock`, `/wires`, ...).

No framework and no build step for the pages. The only server code is `src/` (the lab room).

## First phone test (about 5 minutes, two devices)

1. On device A open **https://mtest.hauntology.app/lab**. Tap **Allow sound, light & buzz**.
2. Scan the QR code on A with device B's camera (or **Copy link**). On B tap **Allow** too.
3. Both screens list two devices. Tap **Identify** next to the other one: its name should fill its screen for 3 s.
4. On A choose **This device** and tap `bell`, a light (`wave`) and a buzz (`thunk`). Notice what you hear, see and feel.
5. Switch to **Push to others** and tap the same three. B should do them about half a second later.
6. Set **Spread** to 400 ms and push the light `wave` to **All devices** with a third device: a wave across the room.
7. Push **Combos > sync probe** to all. Do the devices beat together? Note anything late in **What happened**.
8. On B (an iPhone, if you have one) try **Buzz mode** until it says `iPhone tick trick`, then push `thunk` to it.
9. Open `/check` on each device, answer the questions, **Build and copy the report** and paste it back.

## Device lab

Open `/lab` on a device. It makes a room code (`#room=ABCDE`). **Copy link** or **Share**, open it on the other devices.

- **Devices on this link** updates live: join, leave, platform, buzz mode, sound state, reduced motion, round trip and
  clock error. **Identify** shows that device's name big for 3 seconds.
- **Allow sound, light & buzz (tap once)**: phones start muted. Sound needs that tap (it mirrors the opt-in in
  party-mode). A pushed sound to a muted device comes back as `blocked (sound_locked)`.
- **Fire**, with **This device** (plays now) or **Push to others**:
  - Sound: the recipes plus synthesised stand-ins for the seven files of `docs/SOUNDS.md` (bell, whisper, wind,
    rumble, becoming, creak; no laugh).
  - Light: glow, wave, heartbeat, failing bulb, creeping dark, steady. Greys only, fades only, at most two changes a
    second, peak below white, at most 6 s. A device that prefers reduced motion skips light and says so.
  - Buzz: tick, click, thunk, snap, buzz, bump, rumble, heartbeat. An iPhone has no vibrate: it plays a visual
    twin and the ack says `visual_only`. Try **Buzz mode > iPhone tick trick** (Spike puzzles 1.1).
  - Combos: house cue, rattle 1 to 3, becoming, and **sync probe** (three beats 600 ms apart on every device at
    once, to hear and see whether phones are in step).
- **Push options**: send to all, all others or ticked devices; start in 300 ms to 1.5 s; spread (a wave, one device
  after another in join order, 400 ms is "restless").
- **What happened** logs every join, leave, push, and each device's answer (`played`, `blocked`, `skipped`, `dropped`)
  with how many milliseconds off its planned start it fired.

How timing works: every device pings the server a few times and keeps the sample with the smallest round trip
(`js/sync.js`). A push gets one start time `at` on the server clock. A device that would start more than 150 ms late
drops the effect (`dropped (late)`) instead of playing it late. These are the numbers of party-mode Spikes 1.7 and
1.8, so the lab is the place to measure them.

Safety: the server only accepts effects from a fixed catalogue, clamps durations, allows 16 devices a room, 10 pushes
then 1 a second per device, 2 KB messages, and refuses a foreign `Origin`. Nothing is stored: a room exists while
sockets are open. Anyone with the link can push, so treat a room code like a password. The pages are `noindex`.
`LAB_ENABLED=false` in `wrangler.jsonc` turns the lab off.

## Phone tests

| Page | What |
|---|---|
| `/check` | buzz, tilt, sound, mic tests (Spikes puzzles 1.1 to 1.4); copy a report |
| `/clock` `/wires` `/lockpick` | the first three puzzle Kinds |
| `/safe` `/musicbox` `/candles` `/moved` | the second set |
| `/photo` `/words` `/board` `/maze` | the third set (maze is the optional extra) |
| `/design/` | the design system catalogue: every element and token of the look (`design/` in the repo), to check the look on a phone |
| `/footage` | one public-domain clip (Nosferatu, 1922, the stair shadow) behind a Sight, a Lock and "Nothing came loose", in three looks (Spikes puzzles 1.7). Rules: Requirement 18; record: `media/PROVENANCE.md`. Its Reel plays our own scrape (Haunt 3) and knock (Haunt 7 and 8), copied from `web/public/sounds/` into `media/` by the build, behind a Sound switch (Requirement 20.6). It uses `/design/`, so serve the built site: `node build.mjs && node serve.mjs 8791 --dist`, then open `http://127.0.0.1:8791/footage.html` |

Each puzzle page has easy and normal, three attempts, a Cap timer, **Touch only**, **Assist**, a Sight / walk delay /
Faded flow for memory puzzles, and a result card to copy. Add `#seed=12345&level=normal` to replay the same lock.

## Run and deploy

```
node build.mjs            # copies the public files into dist/ (and design/ to dist/design/); empties dist/ except dist/puzzles
node build-apps.mjs       # builds the web app's two phone pages with vite: dist/puzzles/ and dist/controller/ (run it after build.mjs)
wrangler deploy           # Worker + assets + Durable Object, custom domain mtest.hauntology.app
```

The print-kit viewer is built in at `/print/` (`tools/prop-mockups/viewer.html` with the STL files from `print/stl` and `print/reference`).

In one line: `node build.mjs && node build-apps.mjs && wrangler deploy`. `/controller/` is the phone Controller with a stand-in Room (the Room Code K7M2 joins as the Master; MAX6 is full, STR4 has started). Any session that deploys the lab should run `build-apps.mjs` first, or the live puzzles are the last ones built.

```
node serve.mjs            # local static server on 127.0.0.1:8787 (no lab, no https: tilt will not work)
node serve.mjs 8791 --dist  # the same, but serving the built dist/ (has /design/ and /media/), with byte ranges for Safari video
```

Tilt needs https, so test on a phone through the deployed domain. `src/`, `test/` and docs are not uploaded.
The domain is a Workers custom domain; Cloudflare creates the DNS record and certificate. A Mac that looked the name
up before it existed may cache "not found" for a while; `dig @1.1.1.1 mtest.hauntology.app` shows the truth.

## Tests

`node --test --test-timeout=500000` (Node 22, no install; the page tests need `web/node_modules/jsdom` and skip
themselves without it):

- `core.test.js`: puzzle logic, tilt maths, fixed-step physics, buzz and sound limits, breath detection.
- `lab.test.js`: clock sync, light plans, protocol, the room logic with fake sockets, Worker routing.
- `pages.test.js`, `ui.test.js`: every puzzle page in jsdom, played with taps and drags.
- `lab-page.test.js`: the lab page wired to the real room logic through an in-memory network, with other devices.

## What this is not

A throwaway harness. The real puzzle code is TypeScript in `shared/src/puzzles/` and `web/src/puzzles/`
(`.kiro/specs/puzzles`); `js/core.js` keeps the same names and rules. Nothing is copied from the Cyber-Orb demo
(CC BY-NC 4.0); it was read only for the tilt-and-buzz idea.
