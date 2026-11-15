# Prop mockups

Standalone drawings of ESP32 and servo props for Hauntology party mode. Open `index.html`, pick one, and press the buttons on the right to play the game events it would hear. Nothing here is real hardware or connected to the game.

- `mockups/NN-name.html`: one self-contained page per idea (no network, no dependencies).
- `index.html`: gallery with thumbnails from `shots/`.
- `src/harness.js`, `src/harness.css`: shared page, servo tweens, event queue, log, settings.
- `src/scenes/NN-name.js`: one scene per idea (the SVG, the render rule, the events, the notes).

Each page shows what the prop may see, what it must never see, parts, spec links and questions to decide.

```
node tools/prop-mockups/build.mjs            # rebuilds mockups/ and index.html
node tools/prop-mockups/shoot.mjs mockups    # screenshots each page, reports console errors
node tools/prop-mockups/shoot.mjs sheets     # 4-up contact sheets
```

`shoot.mjs` needs the headless Chrome that Playwright caches under `~/Library/Caches/ms-playwright` (or set `CHROME`).

Seven mockups remain, numbered as they were first drawn (numbers are not reused): 1 ghost in the box, 3 Haunt needle, 5 haunting flipper, 9 curtain reveal, 12 rattle chandelier, 15 relic vault (PIN shown on every seated phone) and 20 cut wires board. On 2026-11-15 the owner dropped 2, 4, 6, 7, 8, 10, 11, 13, 14, 16, 17, 18 and 19. A box that opens when a puzzle Lock is solved is not drawn: it would make a solved Lock public, which puzzles 1.2 forbids.

## 3D viewer (`viewer.html`)

Looks at the printed parts in 3D, in the spool colour each one prints in. Two tabs: **Parts** (one STL at a time, as printed, with the 180 mm bed) and **As built** (each prop laid out from the part sizes, with an Explode slider and tick boxes). Each part carries a tag: M moves, E holds electronics, S static. The as-built layouts are rough stackings, not the designer's real assembly.

It reads `print/stl/*.stl`, so it needs a web server (a `file://` page cannot load them). From the repo root:

```
python3 -m http.server 8781 --bind 127.0.0.1
# open http://127.0.0.1:8781/tools/prop-mockups/viewer.html   (add #built/p01 to open a build)
```

The page has no dependencies. On the lab it is at https://mtest.hauntology.app/props/viewer (the lab build copies it and the STLs into `/props/`).
