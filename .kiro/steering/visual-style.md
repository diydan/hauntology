---
inclusion: fileMatch
fileMatchPattern: "web/**/*.tsx"
---
# Visual and interaction style

## Look
- Palette (CSS variables): `--ink #0b0d10`, `--bone #e9e4d8`, `--lantern #e0a43a`, `--ghost #9fe8d0`, `--dust #6b6f76`, `--alarm #d4604a`. Text on `--ink` must be ≥ 4.5:1 contrast.
- Type: monospace display (JetBrains Mono or IBM Plex Mono) for UI chrome and the chat prompt `>`; readable serif (Newsreader) for ghost speech. Self-host fonts; no third-party font requests.
- Voice of UI copy: terse, text-adventure. "> look", "You are in a place you remember." Never cute, never gory.

## Motion
- Slow, small. Fade 300–600 ms. No screen shake. Flicker obeys the viewer spec (≤ 3 flashes/s) and is disabled under `prefers-reduced-motion`.
- Loading is a feature: show stage labels (queued → dreaming → stitching → ready) with calm progress, not a spinner alone.

## Layout
- Mobile-first. Touch targets ≥ 44 px. Chat is a bottom sheet on phones, side panel ≥ 900 px.
- Always-visible **Exit** control in Play. Content notice before first entry ("quiet, dim, may flicker").

## Accessibility
- Full keyboard path. Visible focus ring in `--lantern`. Chat log is `aria-live="polite"`; ghost speech always has text (never audio-only).
- Images have alt text; sprite alt = persona description.
