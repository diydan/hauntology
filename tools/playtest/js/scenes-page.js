// The three scene demos of the footage test page: the clock shadow, the Reel and the two endings (Requirements 19 to 21).
// Everything here is driven by public state only (a clock, a Haunt level, a list of nicknames). The video is decoration:
// its meaning is always also said in words (the text twin of each shot) and the page works with the footage off.
import { SHOTS, SHOT_TEXT, endingCard, frameTime, isEventLevel, reelShot, shadowPosition, stepPosition } from './scenes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clock = (ms) => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Points a video at a shot: both formats, the poster, and a reload. The markup already has the two `source` elements. */
export function setShot(video, name) {
  const file = SHOTS[name];
  if (!file) throw new RangeError(`unknown shot ${name}`);
  video.setAttribute('poster', `media/${file}.jpg`);
  video.querySelector('source[type="video/webm"]').setAttribute('src', `media/${file}.webm`);
  video.querySelector('source[type="video/mp4"]').setAttribute('src', `media/${file}.mp4`);
  video.load();
}

/**
 * @param {{ isOn: () => boolean, say: (text: string) => void }} io  isOn: footage may move now; say: the page's live region
 * @returns {{ sync: () => void }}  call sync when isOn may have changed
 */
export function initScenes({ isOn, say }) {
  // ---- 4. the clock shadow: the Turn Clock, drawn as a shadow climbing the stairs
  const scrub = $('#ft-scrub');
  const clockText = $('#ft-clock-text');
  const BASE = 30000;
  let remaining = BASE;
  let running = false;
  let last = 0;

  function drawClock() {
    clockText.textContent = `Turn Clock ${clock(remaining)}`;
    if (document.hidden) return;
    // Footage off (reduced motion, data saver, paused): the shadow still shows the clock, but only moves once a second.
    const pos = isOn() ? shadowPosition(BASE, remaining) : stepPosition(BASE, remaining);
    const d = scrub.duration;
    if (Number.isFinite(d) && d > 0) {
      const t = frameTime(pos, d);
      if (Math.abs((scrub.currentTime || 0) - t) > 0.02) scrub.currentTime = t;
    }
  }
  const timer = setInterval(() => {
    if (running) {
      const now = Date.now();
      remaining = Math.max(0, remaining - (now - last));
      last = now;
      if (remaining === 0) { running = false; say('The Turn Clock ran out. The shadow is at the top.'); }
    }
    drawClock();
  }, 100);
  timer?.unref?.(); // in Node (the tests) a timer must not keep the process alive; in a browser this is a number and does nothing
  scrub.addEventListener('loadedmetadata', drawClock);

  $('#ft-clock-start').addEventListener('click', () => { remaining = BASE; running = true; last = Date.now(); drawClock(); say('Turn started: 30 seconds.'); });
  $('#ft-clock-help').addEventListener('click', () => { remaining += 10000; drawClock(); say('Help: 10 seconds more. The shadow steps back.'); });
  $('#ft-clock-spook').addEventListener('click', () => {
    remaining = Math.max(0, remaining - 10000);
    if (remaining === 0) running = false;
    drawClock();
    say('Spook: 10 seconds less. The shadow steps forward.');
  });
  $('#ft-clock-pause').addEventListener('click', () => {
    running = !running;
    last = Date.now();
    $('#ft-clock-pause').textContent = running ? 'Pause clock' : 'Resume clock';
  });

  // ---- 5. the Reel: the film plays forward as the Haunt rises
  const reel = $('#ft-reel');
  const meter = $('#ft-meter');
  let haunt = 0;
  let max = 10;
  let shown = 'ship';

  function seg(n) {
    const s = document.createElement('span');
    s.className = `ui-seg${n <= haunt ? ' is-on' : ''}${isEventLevel(n, max) ? ' ui-seg--event' : ''}${n === max ? ' ui-seg--max' : ''}`;
    return s;
  }
  function drawHaunt(play) {
    const shot = reelShot(haunt, max);
    meter.replaceChildren(...Array.from({ length: max }, (_, i) => seg(i + 1)));
    meter.setAttribute('aria-label', `Haunt ${haunt} of ${max}`);
    $('#ft-haunt-text').textContent = `Haunt ${haunt} of ${max}`;
    $('#ft-reel-text').textContent = `${isEventLevel(haunt, max) ? 'Haunt Event. ' : haunt >= max ? 'The house wins. ' : ''}${SHOT_TEXT[shot]}`;
    if (shot !== shown) { setShot(reel, shot); shown = shot; }
    if (play && isOn()) { reel.currentTime = 0; reel.play().catch(() => say('The browser blocked the clip. Tap Play footage.')); }
  }
  $('#ft-haunt-up').addEventListener('click', () => { haunt = Math.min(max, haunt + 1); drawHaunt(true); });
  $('#ft-haunt-down').addEventListener('click', () => { haunt = Math.max(0, haunt - 1); drawHaunt(true); });
  const maxButtons = [...document.querySelectorAll('[role="radio"][data-max]')];
  for (const b of maxButtons) {
    b.addEventListener('click', () => {
      max = Number(b.dataset.max);
      haunt = Math.min(haunt, max);
      for (const o of maxButtons) o.setAttribute('aria-checked', String(o === b));
      drawHaunt(false);
    });
  }
  drawHaunt(false);

  // ---- 6. the two endings: a hero shot, then our own title card
  const end = $('#ft-end');
  const card = $('#ft-card');
  let pending = null;
  function showCard() {
    if (!pending) return;
    $('#ft-card-title').textContent = pending.title;
    $('#ft-card-lines').textContent = pending.lines.join(' ');
    card.hidden = false;
    say(`${pending.title} ${pending.lines.join(' ')}`);
    pending = null;
  }
  function playEnding(outcome) {
    pending = endingCard(outcome, ['Mara', 'Joss']);
    card.hidden = true;
    setShot(end, pending.shot);
    say(SHOT_TEXT[pending.shot]);
    if (isOn()) end.play().catch(() => showCard());
    else showCard();
  }
  end.addEventListener('ended', showCard);
  $('#ft-end-detectives').addEventListener('click', () => playEnding('detectives'));
  $('#ft-end-house').addEventListener('click', () => playEnding('house'));
  $('#ft-end-skip').addEventListener('click', () => { end.pause(); showCard(); });

  return {
    sync() {
      if (!isOn()) { reel.pause(); end.pause(); }
      drawClock();
    },
  };
}
