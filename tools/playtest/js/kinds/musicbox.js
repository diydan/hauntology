// Music box: hear a short tune (up to three times), then play it back on the five keys.
// Every note also lights its key and buzzes once, so a muted phone still shows the tune.
import { h, sleep } from '../dom.js';
import { NOTE_FREQS } from '../core.js';

const KEY_LABEL = ['1', '2', '3', '4', '5'];
const KEY_SHAPE = ['●', '■', '▲', '◆', '★'];

export default {
  id: 'musicbox',
  title: 'Music box',
  blurb: 'Press Wind to hear the tune (three times at most). Then play it back on the keys, in the same order.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const v = lock.view;
    let plays = 0, playing = false, alive = true;
    const notes = [];
    const keys = NOTE_FREQS.map((_, i) => h('button', { class: 'key', 'aria-label': `Key ${i + 1}`, onClick: () => press(i) }, h('div', {}, KEY_SHAPE[i]), h('small', {}, KEY_LABEL[i])));
    const typed = h('div', { class: 'digits' });
    const windBtn = h('button', { class: 'primary', onClick: () => playTune() }, `Wind (${v.plays} left)`);

    function light(i, ms = 260) { keys[i].classList.add('lit'); setTimeout(() => keys[i].classList.remove('lit'), ms); }
    function press(i) {
      if (playing) return;
      light(i); feel.playNote(i); feel.buzz('tick');
      notes.push(i);
      paint();
      if (notes.length === v.n) ctx.submit({ notes: notes.slice() });
    }
    function paint() {
      typed.replaceChildren(...Array.from({ length: v.n }, (_, i) => h('span', {}, i < notes.length ? KEY_SHAPE[notes[i]] : '·')));
    }
    async function playTune() {
      if (playing || plays >= v.plays) return;
      playing = true; plays++;
      windBtn.disabled = true;
      windBtn.textContent = 'Playing…';
      for (const i of v.tune) {
        if (!alive) return;
        light(i, 420); feel.playNote(i); feel.buzz('tick');
        await sleep(650);
      }
      playing = false;
      windBtn.textContent = plays >= v.plays ? 'No winds left' : `Wind (${v.plays - plays} left)`;
      windBtn.disabled = plays >= v.plays;
    }
    ctx.onWrong(() => { notes.length = 0; paint(); });
    ctx.onCleanup(() => { alive = false; });
    stage.append(h('p', { class: 'hint' }, `A tune of ${v.n} notes.`), h('div', { class: 'row' }, windBtn), h('div', { class: 'keys' }, ...keys), typed,
      h('div', { class: 'row' }, h('button', { onClick: () => { notes.length = 0; paint(); } }, 'Clear')),
      h('p', { class: 'hint' }, 'No sound? Watch the keys light up. The tune is also shown by the shapes.'));
    paint();
  },
};
