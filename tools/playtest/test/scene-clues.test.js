// Scene clues (puzzles Requirement 22): the Place data, the pure rules that choose and draw a clue, and the four-point fit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PLACES, INKS, MIN_PLACE, PLACES, SURFACES, boxOf, isConvexQuad, placeProblems } from '../js/places.js';
import { FADES, INK_COLOURS, canvasSizeFor, drawClue, INK_LUMA, MIN_CONTRAST, MIN_LETTER_SHARE, SIGNS, SIGN_LABELS, clueWords, contrast, contrastOk, drawSpec, fitToPlace, inkFor, letterShare, placeFor, sceneClue, sceneClueView, textOf } from '../js/scene-clues.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);
const SHOTS = ['ship', 'coffin', 'streets', 'mirror', 'hand', 'bed', 'dawn', 'house', 'nothing'];
const SIGHTS = {
  code: { kind: 'safe', code: [3, 2, 5, 8] },
  time: { kind: 'clock', h: 10, m: 5 },
  knock: { kind: 'knock', groups: [2, 3, 1], long: 1 },
  pictureOnly: { kind: 'wires', order: [2, 0, 1] },
};
const view = (extra = {}) => ({
  worldClues: [
    { zone: 'hall', sign: 'moon', sight: SIGHTS.code },
    { zone: 'cellar', sign: 'key', sight: SIGHTS.time },
    { zone: 'attic', sign: 'eye', sight: SIGHTS.knock },
    { zone: 'study', sign: 'star', sight: SIGHTS.pictureOnly },
  ],
  ...extra,
});

// ------------------------------------------------------------------ 15.1 Places
test('22.1 no Place is declared until a clip has one measured, and the stand-ins are all well formed', () => {
  assert.deepEqual(Object.keys(PLACES), []);
  for (const [shot, p] of Object.entries(DEMO_PLACES)) assert.deepEqual(placeProblems(p, 20), [], shot);
});

test('22.1 a Place is refused for each way it can be wrong', () => {
  const good = DEMO_PLACES.hand;
  const bad = (patch) => placeProblems({ ...good, ...patch }, 15);
  assert.equal(bad({}).length, 0);
  assert.ok(bad({ corners: [[0, 0], [1, 0], [1, 1]] }).length, 'three corners');
  assert.ok(bad({ corners: [[0.1, 0.1], [0.5, 0.5], [0.5, 0.1], [0.1, 0.5]] }).length, 'a crossed shape');
  assert.ok(bad({ corners: [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1], [0.4, 0.1]] }).length, 'a flat shape');
  assert.ok(bad({ corners: [[0.1, 0.1], [1.2, 0.1], [1.2, 0.3], [0.1, 0.3]] }).length, 'a corner outside the picture');
  assert.ok(bad({ corners: [[0.1, 0.1], [0.1 + MIN_PLACE.w - 0.001, 0.1], [0.1 + MIN_PLACE.w - 0.001, 0.3], [0.1, 0.3]] }).length, 'too narrow');
  assert.ok(bad({ corners: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.1 + MIN_PLACE.h - 0.001], [0.1, 0.1 + MIN_PLACE.h - 0.001]] }).length, 'too short');
  assert.equal(bad({ corners: [[0.1, 0.1], [0.1 + MIN_PLACE.w, 0.1], [0.1 + MIN_PLACE.w, 0.1 + MIN_PLACE.h], [0.1, 0.1 + MIN_PLACE.h]] }).length, 0, 'the least size is allowed');
  assert.ok(bad({ surface: 'mirror' }).length);
  assert.ok(bad({ ink: 'neon' }).length);
  assert.ok(bad({ from: 15, to: 9 }).length, 'from before to');
  assert.ok(bad({ from: 9, to: 9 }).length);
  assert.ok(bad({ to: 15.5 }).length, 'to past the clip');
  assert.ok(bad({ luma: 1.2 }).length);
  assert.ok(placeProblems(null).length);
  for (const s of SURFACES) assert.equal(bad({ surface: s }).length, 0);
  for (const i of INKS) assert.equal(bad({ ink: i }).length, 0);
});

test('22.1 a shot with no Place never carries a Scene clue', () => {
  for (const seed of SEEDS) for (const shot of ['ship', 'nothing', 'constructor', '__proto__']) assert.equal(sceneClue(DEMO_PLACES, seed, shot, view()), null, shot);
  assert.equal(placeFor(DEMO_PLACES, 'ship'), null);
  assert.equal(placeFor(PLACES, 'hand'), null);
  assert.equal(placeFor(DEMO_PLACES, 'hand'), DEMO_PLACES.hand);
});

test('the ink is the better of the two tokens, and the blend follows it', () => {
  assert.deepEqual([inkFor(0.8).ink, inkFor(0.8).blend], ['ink', 'multiply']);
  assert.deepEqual([inkFor(0.05).ink, inkFor(0.05).blend], ['bone', 'screen']);
  assert.equal(contrastOk(0.71, 'ink'), true);
  assert.equal(contrastOk(0.71, 'bone'), false);
  assert.equal(contrastOk(0.5, 'neon'), false);
  assert.ok(Math.abs(contrast(1, 0) - 21) < 1e-9);
  assert.equal(INK_LUMA.ink < INK_LUMA.bone, true);
});

// ------------------------------------------------------------------ 15.2 Property 27
test('Property 27: a Scene clue is one of the view\'s text clues, the same for the same inputs, and does not read the Solution', () => {
  for (const shot of ['hand', 'bed', 'dawn']) for (const seed of SEEDS) {
    const v = view();
    const c = sceneClue(DEMO_PLACES, seed, shot, v);
    if (c === null) continue;
    const src = v.worldClues.find((x) => x.sign === c.sign);
    assert.ok(src, 'a clue of the view');
    assert.equal(c.answer, textOf(src.sight));
    assert.notEqual(c.answer, null, 'a text answer');
    assert.notEqual(src.sight.kind, 'wires', 'never a picture clue');
    assert.deepEqual(sceneClue(DEMO_PLACES, seed, shot, v), c, 'the same inputs');
    // nothing but worldClues is read: a Solution, a Hand or a Residue changes nothing
    const noisy = view({ solution: { suspect: 'x', zone: 'y', relic: 'z' }, hands: { 1: ['a'] }, residueAt: { hall: 'card' }, locks: { open: {} } });
    assert.deepEqual(sceneClue(DEMO_PLACES, seed, shot, noisy), c);
    assert.ok(SIGNS.includes(c.sign));
  }
  // a different seed or shot can choose differently, and an empty or missing view gives nothing
  const picks = new Set(SEEDS.map((s) => sceneClue(DEMO_PLACES, s, 'hand', view())?.sign));
  assert.ok(picks.size > 1, 'the seed matters');
  for (const v of [{}, { worldClues: [] }, null, { worldClues: [{ zone: 'a', sign: 'moon', sight: SIGHTS.pictureOnly }] }]) assert.equal(sceneClue(DEMO_PLACES, 1, 'hand', v), null);
});

test('Property 27: a clue a Place cannot show is never chosen (letters too small)', () => {
  const small = { corners: [[0.1, 0.1], [0.23, 0.1], [0.23, 0.19], [0.1, 0.19]], surface: 'plate', ink: 'engraved', from: 1, to: 5, luma: 0.8 };
  const places = { tiny: small };
  const long = { zone: 'a', sign: 'moon', sight: { kind: 'safe', code: [1, 2, 3, 4, 5, 6, 7, 8] } };
  const short = { zone: 'b', sign: 'key', sight: { kind: 'safe', code: [1, 2] } };
  assert.ok(letterShare(small, '1 2 3 4 5 6 7 8') < MIN_LETTER_SHARE);
  assert.ok(letterShare(small, '1 2') >= MIN_LETTER_SHARE);
  for (const seed of SEEDS.slice(0, 40)) assert.equal(sceneClue(places, seed, 'tiny', { worldClues: [long, short] })?.sign, 'key');
  assert.equal(sceneClue(places, 1, 'tiny', { worldClues: [long] }), null);
  // a surface whose brightness neither ink reads on is not used
  const grey = { ...small, corners: DEMO_PLACES.hand.corners, luma: 0.15 };
  assert.equal(sceneClue({ grey }, 1, 'grey', { worldClues: [short] }), null);
});

// ------------------------------------------------------------------ 15.3 Property 28
test('Property 28: a Decoy is drawn like a clue; only the Sign and the answer differ', () => {
  for (const [shot, place] of Object.entries(DEMO_PLACES)) {
    const real = { sign: 'moon', answer: '3 2 5 8', text: '3 2 5 8', decoy: false };
    const decoy = { sign: 'bell', answer: '4 1 9 6', text: '4 1 9 6', decoy: true };
    assert.deepEqual(drawSpec(place, real), drawSpec(place, decoy), shot);
    assert.deepEqual(drawSpec(place, real, { reducedMotion: true }), drawSpec(place, decoy, { reducedMotion: true }));
    const w1 = clueWords(place, real);
    const w2 = clueWords(place, decoy);
    assert.equal(w1.live.replace(/moon|3 2 5 8/g, '_'), w2.live.replace(/bell|4 1 9 6/g, '_'), 'the same sentence');
  }
  // the draw never reads the flag, but the choice passes it on for the Host's own tests
  const flaggedOne = sceneClue(DEMO_PLACES, 5, 'hand', { worldClues: [{ zone: 'a', sign: 'moon', sight: SIGHTS.code, decoy: true }] });
  assert.equal(flaggedOne?.decoy, true);
  assert.equal(sceneClue(DEMO_PLACES, 5, 'hand', { worldClues: [{ zone: 'a', sign: 'moon', sight: SIGHTS.code }] })?.decoy, false);
  // the choice does not tell: a view with the flag and one without give the same clue
  const flagged = { worldClues: view().worldClues.map((c, i) => ({ ...c, decoy: i % 2 === 1 })) };
  for (const seed of SEEDS.slice(0, 50)) {
    const a = sceneClue(DEMO_PLACES, seed, 'hand', view());
    const b = sceneClue(DEMO_PLACES, seed, 'hand', flagged);
    assert.equal(a?.sign, b?.sign);
    assert.equal(a?.answer, b?.answer);
  }
});

// ------------------------------------------------------------------ 15.4 the fit
const near = (a, b) => Math.abs(a - b) < 1e-6;
test('22.4 the four corners of the canvas land exactly on the four corners of the Place', () => {
  for (const [shot, place] of Object.entries(DEMO_PLACES)) for (const [pw, ph] of [[480, 360], [640, 480], [1280, 720]]) {
    const w = 300, h = 60;
    const fit = fitToPlace(place.corners, w, h, pw, ph);
    assert.ok(fit, shot);
    const spots = [[0, 0], [w, 0], [w, h], [0, h]];
    spots.forEach(([x, y], i) => {
      const [u, v] = fit.map(x, y);
      assert.ok(near(u, place.corners[i][0] * pw) && near(v, place.corners[i][1] * ph), `${shot} corner ${i}: ${u},${v}`);
    });
    // the CSS carries the same sixteen numbers
    assert.match(fit.css, /^matrix3d\((-?[\d.e+-]+,){15}-?[\d.e+-]+\)$/);
    assert.equal(fit.matrix.length, 16);
    assert.equal(fit.matrix[15], 1);
    // the middle of the canvas lands inside the Place's box
    const [mx, my] = fit.map(w / 2, h / 2);
    const b = boxOf(place.corners);
    assert.ok(mx >= b.x * pw && mx <= (b.x + b.w) * pw && my >= b.y * ph && my <= (b.y + b.h) * ph);
  }
});

test('22.4 the fonts: engraved is IBM Plex Mono, the others are Newsreader italic', () => {
  const clue = { sign: 'moon', answer: '3 2 5', text: '3 2 5', decoy: false };
  const eng = drawSpec({ ...DEMO_PLACES.hand, ink: 'engraved' }, clue);
  assert.deepEqual([eng.font, eng.fontStyle], ['IBM Plex Mono', 'normal']);
  for (const ink of ['condensation', 'handwritten']) { const d = drawSpec({ ...DEMO_PLACES.hand, ink }, clue); assert.deepEqual([d.font, d.fontStyle], ['Newsreader italic', 'italic']); }
});

test('22.4 a flat or crossed shape, or a size that is not a size, is refused', () => {
  assert.equal(fitToPlace([[0.1, 0.1], [0.5, 0.1], [0.3, 0.1], [0.7, 0.1]], 100, 20, 480, 360), null, 'flat');
  assert.equal(fitToPlace([[0.1, 0.1], [0.5, 0.5], [0.5, 0.1], [0.1, 0.5]], 100, 20, 480, 360), null, 'crossed');
  assert.equal(fitToPlace([[0.1, 0.1], [0.5, 0.1], [0.5, 0.3]], 100, 20, 480, 360), null, 'three corners');
  assert.equal(fitToPlace(DEMO_PLACES.hand.corners, 0, 20, 480, 360), null);
  assert.equal(fitToPlace(DEMO_PLACES.hand.corners, 100, 20, NaN, 360), null);
  assert.equal(isConvexQuad([[0, 0], [1, 0], [1, 1], [0, 1]]), true);
  assert.equal(isConvexQuad([[0.1, 0.1], [0.2, 0.1], [0.3, 0.1], [0.4, 0.1]]), false, 'four points on a line');
  assert.equal(isConvexQuad([[0, 0], [1, 0], [0.4, 0.4], [0, 1]]), false, 'a dent');
  // an axis-aligned Place gives a plain scale and shift
  const f = fitToPlace([[0.25, 0.5], [0.75, 0.5], [0.75, 1], [0.25, 1]], 100, 50, 400, 200);
  assert.ok(near(f.matrix[0], 2) && near(f.matrix[5], 2) && near(f.matrix[12], 100) && near(f.matrix[13], 100) && near(f.matrix[3], 0) && near(f.matrix[7], 0));
});

// ------------------------------------------------------------------ 15.8 Property 29
test('Property 29: nothing is lost when the picture is not shown', () => {
  const place = DEMO_PLACES.hand;
  for (const state of ['on', 'reducedMotion', 'dataSaver', 'hidden', 'failed', 'noPlace']) for (const [sight, sign] of [[SIGHTS.code, 'moon'], [SIGHTS.time, 'key'], [SIGHTS.knock, 'eye']]) {
    const clue = { sign, answer: textOf(sight), text: textOf(sight), decoy: false };
    const v = sceneClueView(place, clue, state);
    assert.ok(v.clueList.includes(SIGN_LABELS[sign]) && v.clueList.includes(clue.answer), `${state}: the Clue list holds the Sign and the words`);
    assert.ok(v.panel.includes(clue.answer), `${state}: the panel holds the words`);
    assert.equal(v.overlay, state === 'on', `${state}: the picture is drawn only while footage plays`);
    assert.equal(v.panelAtOnce, state !== 'on', `${state}: the panel shows at once whenever the overlay is not drawn`);
    assert.match(v.live, /^A clue is written on the brass plate: the /);
  }
  const live = clueWords(place, { sign: 'moon', answer: '3 2 5' }).live;
  assert.equal(live, 'A clue is written on the brass plate: the moon, 3 2 5.');
});

// ------------------------------------------------------------------ 15.9 Property 30
test('Property 30: for every Place and every answer text the game can make, the ink reads, the letters are big enough, the fade is a token and nothing flashes or moves', () => {
  const texts = [];
  for (let n = 3; n <= 5; n++) texts.push(textOf({ kind: 'safe', code: Array.from({ length: n }, (_, i) => (i * 3 + 2) % 10) }));
  for (const h of [1, 9, 10, 12]) for (const m of [0, 5, 35, 59]) texts.push(textOf({ kind: 'clock', h, m }));
  texts.push(textOf({ kind: 'knock', groups: [2, 3], long: null }), textOf({ kind: 'knock', groups: [2, 1, 3], long: 1 }));
  const lumas = [0.02, 0.1, 0.12, 0.2, 0.3, 0.5, 0.71, 0.9, 1];
  for (const place of [...Object.values(DEMO_PLACES), ...lumas.map((luma) => ({ ...DEMO_PLACES.hand, luma }))]) for (const answer of texts) {
    const clue = sceneClue({ p: place }, 1, 'p', { worldClues: [{ zone: 'z', sign: 'moon', sight: sightOf(answer) }] });
    if (clue === null) continue; // a Place that cannot meet both is not used for that text
    const spec = drawSpec(place, clue);
    assert.ok(contrast(place.luma, INK_LUMA[spec.ink]) >= MIN_CONTRAST, `${place.luma} ${answer}`);
    assert.ok(spec.letterShare >= MIN_LETTER_SHARE, `${answer} letters ${spec.letterShare}`);
    assert.deepEqual([spec.fadeIn, spec.fadeOut], [FADES.in, FADES.out]);
    assert.deepEqual([FADES.in, FADES.out], ['fade-slow', 'fade']);
    assert.equal(spec.flash, false);
    assert.equal(spec.moves, false);
    const still = drawSpec(place, clue, { reducedMotion: true });
    assert.deepEqual([still.fadeIn, still.fadeOut], [null, null], 'no fade under reduced motion');
  }
});
function sightOf(text) {
  if (/^\d+:\d\d$/.test(text)) { const [h, m] = text.split(':').map(Number); return { kind: 'clock', h, m }; }
  if (/pause|^\d(, |$)/.test(text) && text.includes(',')) return { kind: 'knock', groups: text.split(', ').filter((x) => /^\d+$/.test(x)).map(Number), long: text.includes('long') ? 1 : null };
  return { kind: 'safe', code: text.split(' ').map(Number) };
}

// ------------------------------------------------------------------ 15.4 drawClue
test('22.4 drawClue paints the words at the clip\'s own pixel size, in the token ink and the surface\'s font, on a transparent canvas', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([String(k), ...a]); }), set: (t, k, v) => { t[k] = v; calls.push(['set', String(k), v]); return true; } });
  const place = DEMO_PLACES.hand; // a plate: engraved, light, so dark ink
  const clue = { sign: 'moon', answer: '3 2 5 8', text: '3 2 5 8', decoy: false };
  const r = drawClue(ctx, clue, place, 480, 360);
  const size = canvasSizeFor(place, 480, 360);
  assert.deepEqual([r.w, r.h], [size.w, size.h]);
  assert.ok(size.w <= 480 * 0.2 && size.h <= 360 * 0.2, 'the canvas is the Place\'s box in clip pixels, not the screen\'s');
  assert.equal(r.ink, 'ink');
  assert.equal(r.blend, 'multiply');
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'fillStyle' && c[2] === INK_COLOURS.ink));
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'font' && /IBM Plex Mono/.test(c[2]) && !/italic/.test(c[2])));
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === '3 2 5 8' && c[2] === r.w / 2 && c[3] === r.h / 2), 'centred in the canvas');
  assert.ok(calls.some((c) => c[0] === 'clearRect'), 'transparent: it clears and draws no background');
  assert.ok(!calls.some((c) => c[0] === 'fillRect'));
  assert.ok(r.px >= MIN_LETTER_SHARE * 360 - 1, 'the letters are at least 5 per cent of the height');
  // a dark pane gets the light ink and an italic face
  calls.length = 0;
  const pane = drawClue(ctx, { sign: 'eye', answer: '10:05', text: '10:05', decoy: false }, DEMO_PLACES.bed, 480, 360);
  assert.equal(pane.ink, 'bone');
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'fillStyle' && c[2] === INK_COLOURS.bone));
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'font' && /italic/.test(c[2]) && /Newsreader/.test(c[2])));
  assert.equal(INK_COLOURS.ink, '#0b0d10');
  assert.equal(INK_COLOURS.bone, '#e9e4d8');
});
