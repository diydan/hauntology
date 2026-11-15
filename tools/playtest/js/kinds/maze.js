// Marble maze (optional): tilt the phone to roll the orb to the hole. A wall hit buzzes for 100 ms.
// Same idea as the Cyber-Orb demo (tilt moves a ball, walls buzz), rebuilt with fixed time steps. Nothing copied.
import { h } from '../dom.js';
import { defaultWorld, newBall, makeStepper, clamp } from '../core.js';

export default {
  id: 'maze',
  title: 'Marble maze',
  blurb: 'Roll the orb to the ring. Tilt the phone, or drag a finger to pull the orb. Walls bump and buzz.',
  memory: false,
  usesTilt: true,
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const grid = lock.view.grid, rows = grid.length, cols = grid[0].length;
    const CS = Math.round(clamp(Math.min(360 / cols, (innerHeight - 270) / rows), 24, 40));
    const W = cols * CS, H = rows * CS;
    const walls = [];
    let start = null, goal = null;
    grid.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') walls.push({ x: x * CS, y: y * CS, w: CS, h: CS });
      if (ch === 'S') start = { x: (x + 0.5) * CS, y: (y + 0.5) * CS };
      if (ch === 'G') goal = { x: (x + 0.5) * CS, y: (y + 0.5) * CS };
    }));
    const r = CS * 0.3;
    const world = { ...defaultWorld(W, H, walls, r), friction: 2.6, maxSpeed: 210, accel: 13 };
    const ball = newBall(start.x, start.y);
    const roll = makeStepper(ball, world);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { width: W * dpr, height: H * dpr, style: { width: `${W}px`, height: `${H}px`, display: 'block', margin: '0 auto', borderRadius: '10px', touchAction: 'none' }, 'aria-label': 'Maze' });
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    let finger = null, done = false;
    const local = (e) => { const b = cv.getBoundingClientRect(); return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H }; };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); finger = local(e); });
    cv.addEventListener('pointermove', (e) => { if (finger) finger = local(e); });
    const up = () => { finger = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    ctx.onTick((t, dt) => {
      if (done) return;
      let tilt = { x: 0, y: 0 };
      if (finger) tilt = { x: clamp((finger.x - ball.x) * 0.6, -45, 45), y: clamp((finger.y - ball.y) * 0.6, -45, 45) };
      else if (feel.tiltOn) tilt = feel.tiltScaled;
      const impact = roll(dt, tilt);
      if (impact > 0) { feel.buzz('bump'); feel.sound('bump'); }
      if (Math.hypot(ball.x - goal.x, ball.y - goal.y) < CS * 0.38) {
        done = true;
        ctx.submit({ reachedAtMs: Math.round(ctx.elapsed()), hits: ball.hits });
        return;
      }
      c.fillStyle = '#10121a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#3a3f58';
      for (const w of walls) { c.beginPath(); c.roundRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 4); c.fill(); }
      c.strokeStyle = '#7fd6a1'; c.lineWidth = 4; c.beginPath(); c.arc(goal.x, goal.y, CS * 0.34, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(185,166,255,.3)'; c.beginPath(); c.arc(ball.x, ball.y, r * 1.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b9a6ff'; c.beginPath(); c.arc(ball.x, ball.y, r, 0, Math.PI * 2); c.fill();
    });
    stage.append(h('p', { class: 'hint' }, 'Reach the green ring.'), cv,
      h('p', { class: 'hint' }, 'Tilt on: lean the phone. Tilt off: hold a finger where you want the orb to go.'));
  },
};
