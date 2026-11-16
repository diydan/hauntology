// Section 8 of the footage page: the lip-synced talking clips. One video, one picker. The clip has its own voice, so it plays only when the player taps it
// (controls are on), and the words of the line are always on screen under the picture. A clip this build does not carry (the folder is not in git) says so.
import { LIPSYNC, lipsyncFile } from './lipsync-data.js';

const $ = (sel, root = document) => root.querySelector(sel);

/** @param {{ say: (text: string) => void }} io */
export function initLipsync({ say }) {
  const video = $('#ft-lip');
  const pick = $('#ft-lip-pick');
  const who = $('#ft-lip-who');
  const text = $('#ft-lip-text');
  pick.replaceChildren(...LIPSYNC.map((c, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${c.who}: ${c.label}`;
    return o;
  }));
  function show(i) {
    const c = LIPSYNC[i];
    video.pause();
    video.setAttribute('src', lipsyncFile(c.name));
    video.setAttribute('aria-label', `${c.who}, ${c.label}`);
    video.load();
    who.textContent = `${c.who} · ${c.label}`;
    text.textContent = c.text;
  }
  pick.addEventListener('change', () => { show(Number(pick.value)); say(`${LIPSYNC[Number(pick.value)].who}, ${LIPSYNC[Number(pick.value)].label}.`); });
  video.addEventListener('error', () => { text.textContent = `${LIPSYNC[Number(pick.value)].text} (This build does not carry the clip.)`; });
  show(0);
}
