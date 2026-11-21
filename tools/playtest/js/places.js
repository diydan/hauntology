// Places (puzzles Requirement 22.1): a blank, flat surface of a locked-off footage shot where the Host may write a Scene clue.
// A Place is declared here only after a person has looked at every frame of its window and place-check.mjs has passed it (22.10),
// so `PLACES` is empty until a clip has one. `DEMO_PLACES` is a stand-in for the demo page and the tests; nothing ships from it.
//
//   shot: { corners: four [x, y] shares of the picture, clockwise from the top left,
//           surface: 'plate' | 'pane' | 'page' | 'plaque', ink: 'engraved' | 'condensation' | 'handwritten',
//           from, to: seconds in the clip in which it is in view and unobstructed, luma: measured brightness 0..1 }

export const SURFACES = Object.freeze(['plate', 'pane', 'page', 'plaque']);
export const INKS = Object.freeze(['engraved', 'condensation', 'handwritten']);
/** The least a Place may be, as shares of the picture's width and height (22.1). */
export const MIN_PLACE = Object.freeze({ w: 0.12, h: 0.08 });

/** @type {Record<string, any>} */
export const PLACES = Object.freeze({});

/** Stand-ins: a brass plate on a dark door, a misted pane, a page. Not measured on any clip. */
export const DEMO_PLACES = Object.freeze({
  hand: { corners: [[0.62, 0.28], [0.78, 0.27], [0.79, 0.38], [0.63, 0.39]], surface: 'plate', ink: 'engraved', from: 9, to: 15, luma: 0.71 },
  bed: { corners: [[0.2, 0.2], [0.42, 0.2], [0.42, 0.34], [0.2, 0.34]], surface: 'pane', ink: 'condensation', from: 2, to: 10, luma: 0.12 },
  dawn: { corners: [[0.55, 0.5], [0.8, 0.5], [0.8, 0.66], [0.55, 0.66]], surface: 'page', ink: 'handwritten', from: 1, to: 12, luma: 0.8 },
});

const isShare = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** True when four points, in order, form a convex four-sided shape that does not cross itself and is not flat. */
export function isConvexQuad(c) {
  if (!Array.isArray(c) || c.length !== 4) return false;
  const signs = [];
  for (let i = 0; i < 4; i++) {
    const z = cross(c[i], c[(i + 1) % 4], c[(i + 2) % 4]);
    if (Math.abs(z) < 1e-9) return false;
    signs.push(Math.sign(z));
  }
  return signs.every((s) => s === signs[0]);
}

/** The width and height shares of the smallest box round the corners. */
export const boxOf = (c) => {
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/**
 * What is wrong with a Place, in words; an empty list means it is well formed (22.1). `clipSeconds` is the length of the shot's clip, or
 * null when it is not known.
 * @returns {string[]}
 */
export function placeProblems(place, clipSeconds = null) {
  const out = [];
  if (!place || typeof place !== 'object') return ['not an object'];
  const c = place.corners;
  if (!Array.isArray(c) || c.length !== 4 || !c.every((p) => Array.isArray(p) && p.length === 2 && isShare(p[0]) && isShare(p[1]))) out.push('corners must be four [x, y] shares of the picture');
  else if (!isConvexQuad(c)) out.push('corners must form a convex four-sided shape');
  else {
    const b = boxOf(c);
    if (b.w < MIN_PLACE.w - 1e-9) out.push(`the Place is narrower than ${MIN_PLACE.w * 100} per cent of the width`);
    if (b.h < MIN_PLACE.h - 1e-9) out.push(`the Place is shorter than ${MIN_PLACE.h * 100} per cent of the height`);
  }
  if (!SURFACES.includes(place.surface)) out.push('unknown surface');
  if (!INKS.includes(place.ink)) out.push('unknown ink');
  if (!(typeof place.from === 'number' && Number.isFinite(place.from) && place.from >= 0)) out.push('from must be a time in seconds');
  if (!(typeof place.to === 'number' && Number.isFinite(place.to) && place.to > place.from)) out.push('to must come after from');
  else if (clipSeconds !== null && place.to > clipSeconds + 1e-9) out.push('to is past the end of the clip');
  if (!(typeof place.luma === 'number' && place.luma >= 0 && place.luma <= 1)) out.push('luma must be a brightness from 0 to 1');
  return out;
}
