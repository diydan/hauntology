# Fonts of the design system

Self-hosted, as `.kiro/steering/visual-style.md` asks: no third-party font request is made. Latin subsets only.

| File | Font | Used for | Source |
|---|---|---|---|
| `newsreader-latin-400-normal.woff2`, `newsreader-latin-400-italic.woff2` | Newsreader | the ghost's speech and the log of what was said: `--font-ghost` | `@fontsource/newsreader` 5.3.0 |
| `ibm-plex-mono-latin-400-normal.woff2`, `ibm-plex-mono-latin-500-normal.woff2` | IBM Plex Mono | the interface (buttons, labels, the title): `--font-ui` | `@fontsource/ibm-plex-mono` 5.3.0 |

Both fonts are under the SIL Open Font License 1.1 (`OFL-Newsreader.txt`, `OFL-IBM-Plex-Mono.txt`). The files were fetched from the public npm registry and checked against the registry's published sha512 before use.

`design/fonts.css` declares them. The play-through demo (`pnpm voice-demo`) serves them at `/design/fonts/`; the web app imports `design/fonts.css`.
