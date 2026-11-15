---
inclusion: fileMatch
fileMatchPattern: "web/**/*.tsx"
---
# Visual and interaction style

The values below are written once in `design/tokens.json` and the pieces are built once in `design/elements.css`; see `design-system.md` for how to build a screen from them. This file says what the look is for.

## Look
- Scheme: black, dark brown, **yellow as the main colour**, a little green, red for warnings. Black is the page; four dark browns give depth (panel, raised, hovered, borders); cream is text.
- Palette (CSS variables): `--ink #0b0d10`, `--bone #e9e4d8`, `--lantern #e0a43a` (yellow), `--ghost #9fe8d0` (green), `--dust #6b6f76`, `--alarm #d4604a`. These six names and values are frozen. The browns (`--wood #150f0a`, `--wood-2 #21170f`, `--wood-3 #2e2015`, `--wood-line #3d2d1f`, `--leather #6b4d33`) and `--ash #b3aa97` (quiet text) were added with the design tokens. Elements use roles (`--text`, `--accent`, `--surface-raised`...), not these names.
- Text on any surface must be ≥ 4.5:1 (`pnpm check-tokens` checks every pair). `--dust` is 3.85:1 on `--ink`, so it is for shapes only; quiet text is `--ash`.
- Yellow: the one main button, edges, lamps, focus, the Keeper. Green is rare: the Whisper (light, glow, nameplate edge) and the tick box. The stage is lit by whoever speaks: Whisper green, Keeper yellow, Suspect cream. A portrait is always round.
- Type: monospace (IBM Plex Mono, self-hosted) for UI chrome and the chat prompt `>`; readable serif (Newsreader, self-hosted) for ghost speech. No third-party font requests. Self-host fonts. Sizes are in rem.
- Voice of UI copy: terse, text-adventure. "> look", "You are in a place." Never cute, never gory.

## Motion
- Slow, small. Fade 300–600 ms (the tokens `--fade-quick` 300, `--fade` 400, `--fade-slow` 600; all 0 under reduced motion). No screen shake. Flicker obeys the viewer spec (≤ 3 flashes/s) and is disabled under `prefers-reduced-motion`.
- Loading is a feature: show stage labels (queued → dreaming → stitching → ready) with calm progress, not a spinner alone.

## Layout
- Mobile-first. Touch targets ≥ 44 px. Chat is a bottom sheet on phones, side panel ≥ 900 px.
- Always-visible **Exit** control in Play. Content notice before first entry ("quiet, dim, may flicker").

## Accessibility
- Full keyboard path. Visible focus ring in `--lantern`. Chat log is `aria-live="polite"`; ghost speech always has text (never audio-only).
- Images have alt text; sprite alt = persona description.
