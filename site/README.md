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
