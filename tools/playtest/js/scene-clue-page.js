// Section 12 of the footage page: a Scene clue written on a Place of a shot (puzzles Requirement 22), on a stand-in Place.
// The clue is drawn by this page over the video, never in the clip; the same words always go to the panel, the Clue list and the live region.
import { DEMO_PLACES } from './places.js';
import { canvasSizeFor, clueWords, drawClue, fitToPlace, sceneClue, sceneClueView } from './scene-clues.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** The Public View of the demo: one World Clue for each kind of answer (what a Room would hold), with no Solution in it. */
export const DEMO_VIEW = Object.freeze({
  worldClues: [
    { zone: 'hall', sign: 'moon', sight: { kind: 'safe', code: [3, 2, 5, 8] } },
    { zone: 'cellar', sign: 'key', sight: { kind: 'clock', h: 10, m: 5 } },
    { zone: 'attic', sign: 'eye', sight: { kind: 'knock', groups: [2, 1, 3], long: 1 } },
  ],
});
const SHOT = 'hand';

/**
 * @param {{ isOn: () => boolean, say: (text: string) => void }} io  isOn: footage may play now (not paused, not reduced, not hidden)
 * @returns {{ sync: () => void }}
 */
export function initSceneClue({ isOn, say }) {
  const video = $('#ft-sc-video');
  const canvas = $('#ft-sc-canvas');
  const panel = $('#ft-sc-panel');
  const live = $('#ft-sc-live');
  const list = $('#ft-sc-list');
  if (!video || !canvas) return { sync() {} };
  let sign = 'moon';
  let shot = SHOT;
  let shown = null; // the clue now on show, or null
  let failed = false;

  const view = () => ({ worldClues: DEMO_VIEW.worldClues.filter((c) => c.sign === sign) });
  const state = () => {
    if (document.hidden) return 'hidden';
    if (failed) return 'failed';
    if (!DEMO_PLACES[shot]) return 'noPlace';
    return isOn() ? 'on' : 'off';
  };
  const place = () => DEMO_PLACES[shot] ?? DEMO_PLACES[SHOT];

  /** Lays the canvas on the Place for the picture's current size. */
  function fit() {
    if (!shown) return;
    const pw = video.videoWidth || 480;
    const ph = video.videoHeight || 360;
    const frame = canvas.parentElement;
    const cw = frame.clientWidth || pw;
    const ch = frame.clientHeight || ph;
    const size = canvasSizeFor(place(), pw, ph);
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const f = fitToPlace(place().corners, size.w, size.h, cw, ch);
    if (f) canvas.style.transform = f.css;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const drawn = drawClue(ctx, shown, place(), pw, ph, { reducedMotion: !isOn() });
      canvas.dataset.ink = drawn.ink;
      canvas.style.mixBlendMode = drawn.blend;
    }
  }

  /** The overlay is in view only from the Place's `from` time while the footage plays; the words never wait. */
  function paintOverlay() {
    const st = state();
    const inView = shown !== null && st === 'on' && (video.currentTime || 0) >= place().from;
    canvas.dataset.in = String(inView);
  }

  function words() {
    if (!shown) { panel.hidden = true; return; }
    const v = sceneClueView(place(), shown, state());
    panel.hidden = false;
    panel.textContent = v.panel;
    live.textContent = v.live;
  }

  function show() {
    const clue = sceneClue(DEMO_PLACES, 7, shot, view());
    if (clue === null) {
      shown = null;
      canvas.dataset.in = 'false';
      panel.hidden = true;
      live.textContent = shot === SHOT ? 'No clue can be shown here.' : 'This shot has no Place, so no clue is written on the picture. The words below still carry it.';
      if (shot !== SHOT) {
        // the clue is still given in words, from the same view: nothing is lost (22.7)
        const any = sceneClue(DEMO_PLACES, 7, SHOT, view());
        if (any) { const w = clueWords(DEMO_PLACES[SHOT], any); panel.hidden = false; panel.textContent = w.list; list.append(item(w.list)); say(w.live); }
      }
      return;
    }
    shown = clue;
    const w = clueWords(place(), clue);
    if (![...list.children].some((li) => li.textContent === w.list)) list.append(item(w.list));
    words();
    say(w.live);
    fit();
    if (isOn() && !failed) {
      try { video.currentTime = Math.max(0, place().from - 1.5); } catch { /* not seekable yet */ }
      video.play?.()?.catch?.(() => {});
    }
    paintOverlay();
  }
  const item = (text) => { const li = document.createElement('li'); li.textContent = text; return li; };

  for (const b of document.querySelectorAll('[role="radio"][data-clue]')) {
    b.addEventListener('click', () => {
      sign = b.dataset.clue;
      for (const o of document.querySelectorAll('[role="radio"][data-clue]')) o.setAttribute('aria-checked', String(o === b));
    });
  }
  $('#ft-sc-show').addEventListener('click', show);
  $('#ft-sc-other').addEventListener('click', () => {
    shot = shot === SHOT ? 'ship' : SHOT;
    $('#ft-sc-other').textContent = shot === SHOT ? 'A shot with no Place' : 'Back to the plate';
    shown = null;
    canvas.dataset.in = 'false';
    show();
  });
  video.addEventListener('timeupdate', paintOverlay);
  video.addEventListener('seeked', paintOverlay);
  video.addEventListener('loadedmetadata', fit);
  video.querySelector('source:last-of-type')?.addEventListener('error', () => { failed = true; words(); paintOverlay(); });
  globalThis.addEventListener?.('resize', fit);

  return {
    sync() {
      if (!isOn() || document.hidden) video.pause?.();
      words();
      if (shown) { try { fit(); } catch { /* no canvas */ } }
      paintOverlay();
    },
  };
}
