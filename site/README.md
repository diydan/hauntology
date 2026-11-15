# Hauntology landing page

Static site for <https://hauntology.app/>. No build step, no framework, no tracking.

## Layout

```
site/
  wrangler.jsonc        Cloudflare Workers static-assets config (assets only, no Worker)
  public/               everything that gets served
    index.html          the page (head, body, three script tags)
    404.html
    css/site.css        all page styles
    css/fonts.css       self-hosted @font-face (latin subset)
    js/hero-figure.js   "Your place, haunted" before/after figure (Canvas 2D)
    js/phones.js        "shake the house" phone strip
    js/app.js           built bundle: three.js + hero scene + night-at-the-table demo + sound
    assets/             house.glb, bg.mp4, bg.webp, moon.webp, bed.mp3, og.jpg
    fonts/              woff2 files (SIL OFL), subset to the characters the page uses
    _headers            security + cache headers
```

## Preview

```sh
python3 -m http.server 8123 --bind 127.0.0.1 --directory site/public
# or, closer to production:
cd site && npx wrangler dev
```

Open <http://127.0.0.1:8123/>. Do not open `index.html` from disk: the page uses `fetch()` for the model and audio.

## Deploy

```sh
cd site && npx wrangler deploy
```

Then attach `hauntology.app`: uncomment the `routes` line in `wrangler.jsonc` (the zone must be in the same Cloudflare account), or add the custom domain in the dashboard. `.app` is HSTS-preloaded, so the site is HTTPS-only.

## Notes

- `js/app.js` is a minified bundle with no source in this repo. Edit the other files freely; treat `app.js` as a vendored build until its source is added.
- The house is loaded from `assets/house.glb` (decoded from the mockup's base64 module). It is CC BY 4.0, "Happy Halloween" by JessSwynn; the footer credit must stay.
- `_headers` ships the CSP as **Report-Only**. Load the live page, check the console for violations, then rename it to `Content-Security-Policy`.
- `og.jpg` is generated from the background plus the title. Replace it with a real screenshot of the finished hero when there is one.
- The demo and screen mockups on the page are labelled as scripted or illustrative. Keep that wording until the game ships.
- Fonts are subset to ASCII plus `· × é ’ “ ” … ↔ −`. Text with any other character falls back to a system font for that character. To add one, re-subset the file with `pyftsubset` (fonttools) from the Google Fonts latin files.
- `house.glb` is preloaded in `<head>` so it downloads while `app.js` loads. Keep the preload URL identical to the one in `app.js`.
- `bg.mp4` is H.264, 960x540, 24 fps, no audio, CRF 34. It loads late and sits under a dark overlay, so it can stay small.
- Window silhouettes live in `js/app.js`: `pw()` draws the five figures into a 5-cell atlas (256 px each, drawn from the sill up and running off the bottom edge), and `gw` sets which window shows which figure and how big. The shader scales the figure by the window's width-to-height ratio, so drawings are not squeezed. Keep every figure one solid piece that reaches the bottom of its cell.
- The figures move in `Fd()` (same file, the `mv` table and `a(o)`): most walk across a window in 1.5 to 5 seconds, a few stop for a few seconds, and the hands fade in and out. Each window waits 2.5 to 9 seconds between visitors. With reduced motion on, each window shows one still figure.
- The hero door sequence is in `js/app.js` (`HauntDoorSeq`, then the hooks in `kd()`): the front door starts shut and swings open as you scroll, the camera goes up to it, and the ghost goes in ahead into pure darkness (a black panel just inside the doorway; the camera stops just outside it). The ghost turns its back on us before the door and keeps well ahead (at least 1.3 units along the view). It is lined up on the doorway in the world (not on the screen) by scroll 38%, low and dead centre, and shrunk to about a quarter of its usual size, because the real ghost model is about 1 wide by 1.3 tall and the door is 0.28 wide. The dark closes in from the edges: scene fog thickens and goes black (`fog()` in `HauntDoorSeq`) while `.hero-dark` shrinks a clear circle around the doorway, and the last 10% of scroll ends in the page's ink colour so the next section follows seamlessly. The green hand that used to lie in the doorway is removed. The green eyes are moved at load into the big arched window on the right tower; they flash RUN in Morse every 30 to 75 s. That window is always a deep, dark brown-black (not pure black), so the eyes show; the wall round it is untouched. The door leaf is dressed at load (planks, grain, knots, iron straps with rivets, lock plate and keyhole, a brass lever handle), all drawn in `HauntDoorSeq`'s `dress()` so there are no extra files. Everything is a function of scroll progress, so scrolling back undoes it. The hero now holds the page for 280svh (`.hero` in `css/site.css`); the black fade at the end is `.hero-dark`. Reduced motion keeps the door shut and the ghost on its perch. The door is the model's `FrontDoor` node, hinged at the left jamb at runtime.
