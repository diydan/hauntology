// GENERATED from design/tokens.json by tools/build-tokens.mjs. Do not edit: change the JSON and run `pnpm build-tokens`.
// For code that cannot read a CSS variable: an SVG or canvas picture, a Three.js colour, a test. Everything else uses the CSS variables.

export const color = {
  "ink": "#0b0d10",
  "ink-deep": "#050607",
  "void": "#000000",
  "wood": "#150f0a",
  "wood-2": "#21170f",
  "wood-3": "#2e2015",
  "ember": "#1b1209",
  "wood-line": "#3d2d1f",
  "leather": "#6b4d33",
  "dust": "#6b6f76",
  "ash": "#b3aa97",
  "bone": "#e9e4d8",
  "lantern": "#e0a43a",
  "lantern-hi": "#f2bb55",
  "ghost": "#9fe8d0",
  "alarm": "#d4604a",
  "orb-lantern-core": "#fff2d2",
  "orb-lantern-rim": "#6a4a14",
  "orb-ghost-core": "#effff9",
  "orb-ghost-rim": "#25584a",
  "art-red": "#ff6b6b",
  "art-blue": "#6bb6ff",
  "art-green": "#6be39a",
  "art-yellow": "#ffd86b",
  "art-violet": "#c49bff",
  "art-white": "#e8e8e8",
  "art-silver": "#c9c9d4",
  "art-pink": "#ff8b8b",
  "art-gold": "#e8c27a",
  "art-cyan": "#7fe0e0",
  "art-lavender": "#d6d6ee",
  "art-orange": "#ffb27a",
  "art-cream": "#f4efc1",
  "art-sun": "#ffe27a",
  "art-copper": "#c8793a",
  "art-brass": "#c2a24a",
  "art-steel": "#a9b1ba",
  "art-wood": "#9a6a42",
  "art-ivory": "#ece3cc",
  "art-paper": "#d9ccaa",
  "art-flame": "#ffb54a",
  "art-glass": "#8fc6d6",
  "art-iron": "#7b8088",
  "art-stone": "#857f74",
  "art-leather": "#a46a40",
  "art-sepia": "#b08a5a",
} as const;

export const role = {
  "surface-page": "#0b0d10",
  "surface-sunk": "#050607",
  "surface-panel": "#150f0a",
  "surface-raised": "#21170f",
  "surface-hover": "#2e2015",
  "line": "#3d2d1f",
  "line-strong": "#6b4d33",
  "text": "#e9e4d8",
  "text-quiet": "#b3aa97",
  "shape-quiet": "#6b6f76",
  "accent": "#e0a43a",
  "accent-hi": "#f2bb55",
  "accent-rare": "#9fe8d0",
  "danger": "#d4604a",
  "on-accent": "#0b0d10",
  "focus": "#e0a43a",
  "speaker-whisper": "#9fe8d0",
  "speaker-keeper": "#e0a43a",
  "speaker-suspect": "#e9e4d8",
} as const;

export const breakpointPx = {
  "wide": 900,
  "roomy": 640,
} as const;

export const motionMs = {
  "fade": 400,
  "fadeQuick": 300,
  "fadeSlow": 600,
  "breathe": 2400,
} as const;

export const targetPx = 44;

export type ColorName = keyof typeof color;
export type RoleName = keyof typeof role;
