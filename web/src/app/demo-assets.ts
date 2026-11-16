/**
 * Placeholder pictures for `?demo=1` in development. The demo API hands out addresses such as
 * `/demo/uploads/demo-img-1.svg`, `/demo/candidates/...` and `/demo/worlds/...` for pictures it never
 * stores; the development server answers them with a plain drawing, so the Create, Confirm and Haunt
 * screens show a picture and not a broken one. Nothing here is in a production build: the plugin that
 * calls it only serves, and the whole `public/demo` folder is dropped at build time.
 */
const KINDS = { uploads: "Your photo", candidates: "A candidate", worlds: "Your place" } as const;
const PATH = /^\/demo\/(uploads|candidates|worlds)\/([A-Za-z0-9_-]{1,64})\.svg$/;

/** A small number from the id, so each picture has its own colour and the same id always has the same one. */
export function hueOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** The SVG for a demo picture address, or `null` for any other path. The id is limited to safe characters before it is used. */
export function demoPlaceholderSvg(pathname: string): string | null {
  const m = PATH.exec(pathname);
  if (m === null) return null;
  const kind = KINDS[m[1] as keyof typeof KINDS];
  const hue = hueOf(m[2] as string);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 40% 22%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 45% 10%)"/></linearGradient></defs>
<rect width="640" height="480" fill="url(#g)"/>
<rect x="150" y="150" width="340" height="230" fill="none" stroke="hsl(${hue} 30% 70%)" stroke-width="3"/>
<path d="M150 380l90-110 70 70 60-80 120 120z" fill="hsl(${hue} 30% 35%)"/>
<text x="320" y="110" font-family="monospace" font-size="28" text-anchor="middle" fill="hsl(${hue} 30% 85%)">${kind}</text>
<text x="320" y="440" font-family="monospace" font-size="16" text-anchor="middle" fill="hsl(${hue} 20% 70%)">demo picture</text>
</svg>
`;
}
