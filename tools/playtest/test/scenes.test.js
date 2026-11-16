// The scene logic (Requirements 19 to 21 of .kiro/specs/puzzles): the clock shadow, the Reel and the endings. Pure functions, tested over
// their whole small domains (every Haunt level for every maximum, a grid of clock readings) and not by sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_LEVELS, LINE_AT, SHOTS, SHOT_LINE, SHOT_SOUND, SHOT_TEXT, SOUND_AT, SOUND_TEXT, WANDER, WANDER_KINDS, WANDER_SCENES, endingCard, frameTime, isEventLevel, reelLine, reelShot, reelSound, shadowPosition, shotLine, stepPosition, wanderCard, wanderScene } from '../js/scenes.js';
import { root } from './helpers.js';

const MAXES = [8, 10, 12];
const ORDER = ['ship', 'coffin', 'streets', 'mirror', 'hand', 'bed', 'house'];

test('20.1 the Reel for the default maximum: the film plays forward and each Event has a shot of its own', () => {
  const got = Array.from({ length: 11 }, (_, l) => reelShot(l, 10));
  assert.deepEqual(got, ['ship', 'ship', 'ship', 'coffin', 'streets', 'streets', 'mirror', 'hand', 'hand', 'bed', 'house']);
});

test('20.1 for every maximum the Reel never goes backwards, ends on the house at the maximum, and an Event always changes the picture', () => {
  for (const max of MAXES) {
    let prev = -1;
    for (let level = 0; level <= max; level++) {
      const shot = reelShot(level, max);
      assert.ok(shot in SHOTS, `${shot} is a shot`);
      const at = ORDER.indexOf(shot);
      assert.ok(at >= prev, `max ${max}, level ${level}: ${shot} does not come before the shot of level ${level - 1}`);
      if (isEventLevel(level, max)) assert.notEqual(shot, reelShot(level - 1, max), `max ${max}: the Event at ${level} changes the shot`);
      prev = at;
    }
    assert.equal(reelShot(max, max), 'house', `max ${max}: the maximum is the ending`);
    assert.notEqual(reelShot(max - 1, max), 'house', `max ${max}: one below the maximum is not yet the ending`);
  }
});

test('20.1 the Reel is total: any input gives a shot and a level past either end is held at that end', () => {
  for (const [level, max] of [[NaN, 10], [-5, 10], [99, 10], [3.7, 10], [undefined, undefined], [5, NaN], [5, 0], [5, -3], [Infinity, 10], [0, Infinity]]) {
    assert.ok(reelShot(level, max) in SHOTS, `reelShot(${level}, ${max})`);
  }
  assert.equal(reelShot(-5, 10), reelShot(0, 10));
  assert.equal(reelShot(99, 10), reelShot(10, 10));
});

test('20.2 an Event level is 3, 6 or 9 and below the maximum', () => {
  assert.deepEqual(EVENT_LEVELS, [3, 6, 9]);
  assert.deepEqual([...Array(13).keys()].filter((l) => isEventLevel(l, 10)), [3, 6, 9]);
  assert.deepEqual([...Array(9).keys()].filter((l) => isEventLevel(l, 8)), [3, 6]);
  assert.equal(isEventLevel(9, 9), false, 'at the maximum it is the ending, not an Event');
});

test('19.1 the clock shadow stands at the foot at the start of a Turn and at the top when the clock runs out', () => {
  assert.equal(shadowPosition(30000, 30000), 0);
  assert.equal(shadowPosition(30000, 0), 1);
  assert.equal(shadowPosition(30000, 15000), 0.5);
});

test('19.2 Help steps the shadow back and Spook steps it forward, by the share of the Turn that 10 seconds is', () => {
  for (const base of [30000, 45000, 60000, 90000]) {
    for (let remaining = 12000; remaining <= base - 12000; remaining += 3000) {
      const here = shadowPosition(base, remaining);
      assert.ok(shadowPosition(base, remaining + 10000) < here, `help at ${remaining} of ${base}`);
      assert.ok(shadowPosition(base, remaining - 10000) > here, `spook at ${remaining} of ${base}`);
      assert.ok(Math.abs(here - shadowPosition(base, remaining + 10000) - 10000 / base) < 1e-9, `help moves it by 10 s of ${base}`);
    }
  }
});

test('19.1 the shadow never leaves the stairs and only the clock moves it', () => {
  let prev = -1;
  for (let remaining = 40000; remaining >= -2000; remaining -= 250) {
    const p = shadowPosition(30000, remaining);
    assert.ok(p >= 0 && p <= 1, `${remaining}`);
    assert.ok(p >= prev, 'as the clock runs down the shadow only climbs');
    prev = p;
  }
  for (const bad of [[0, 5], [-1, 5], [NaN, 5], [30000, NaN], [30000, undefined]]) assert.equal(shadowPosition(...bad), 0, `${bad}`);
});

test('19.1 frameTime maps a position inside the clip, and the last frame can show', () => {
  assert.equal(frameTime(0, 4.2), 0);
  assert.ok(Math.abs(frameTime(1, 4.2) - 4.14) < 1e-9);
  assert.equal(frameTime(2, 4.2), frameTime(1, 4.2));
  assert.equal(frameTime(-1, 4.2), 0);
  assert.equal(frameTime(0.5, 0), 0);
  assert.equal(frameTime(0.5, NaN), 0);
});

test('19.4 under reduced motion the shadow moves once a second, never ahead of the clock, and still ends at the top', () => {
  const seen = new Set();
  for (let remaining = 30000; remaining >= 0; remaining -= 100) {
    const step = stepPosition(30000, remaining);
    seen.add(step);
    assert.ok(step <= shadowPosition(30000, remaining) + 1e-12, `${remaining}`);
  }
  assert.ok(seen.size <= 31, `at most 31 positions for 30 seconds, got ${seen.size}`);
  assert.equal(stepPosition(30000, 0), 1);
  assert.equal(stepPosition(30000, 30000), 0);
});

test('21.1 and 21.2 the endings: the shots, the words, and never the word Poltergeist', () => {
  const d = endingCard('detectives');
  assert.equal(d.shot, 'dawn');
  assert.ok(d.title && d.lines.length >= 1);
  const h = endingCard('house', ['Mara', 'Joss']);
  assert.equal(h.shot, 'house');
  assert.match(h.title, /haunting continues/i);
  assert.ok(h.lines.includes('No one won.'));
  assert.ok(h.lines.includes('Mara and Joss joined the haunting.'));
  for (const c of [d, h, endingCard('house'), endingCard('house', ['A', 'B', 'C']), endingCard('detectives', ['X'])]) {
    assert.doesNotMatch(JSON.stringify(c), /poltergeist/i);
  }
});

test('21.2 the names on the house card: none, one, two, three, and blanks left out', () => {
  assert.deepEqual(endingCard('house', []).lines, ['No one won.']);
  assert.deepEqual(endingCard('house', ['Mara']).lines, ['No one won.', 'Mara joined the haunting.']);
  assert.deepEqual(endingCard('house', ['A', 'B', 'C']).lines, ['No one won.', 'A, B and C joined the haunting.']);
  assert.deepEqual(endingCard('house', ['  ', '', 'Joss']).lines, ['No one won.', 'Joss joined the haunting.']);
  assert.deepEqual(endingCard('house', [null, 4, 'Pim']).lines, ['No one won.', 'Pim joined the haunting.']);
});

test('20.3 and 21.3 every shot has its three files, a line of words for the live region, and a record', () => {
  const prov = readFileSync(resolve(root, 'media', 'PROVENANCE.md'), 'utf8');
  for (const [name, file] of Object.entries(SHOTS)) {
    for (const ext of ['webm', 'mp4', 'jpg']) assert.ok(existsSync(resolve(root, 'media', `${file}.${ext}`)), `${file}.${ext}`);
    assert.ok(SHOT_TEXT[name] && SHOT_TEXT[name].length > 5, `${name} has its words`);
    assert.match(prov, new RegExp(`^${file.startsWith('ai-') ? '#### ' : '## '}${file}$`, 'm'), `${file} has an entry (film: ## name, AI clip: #### name)`);
  }
  assert.deepEqual(Object.keys(SHOT_TEXT).sort(), Object.keys(SHOTS).sort());
});

test('21.2 no player-facing string of the scenes says Poltergeist', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[ \t]\/\/ .*$/gm, '');
  for (const f of ['js/scenes.js', 'js/scenes-page.js', 'footage.html']) assert.doesNotMatch(strip(readFileSync(resolve(root, f), 'utf8')), /poltergeist/i, f);
});

test('Wander: the scene has its files and its record, the Whisper line is the real scripted one, and the card holds the memory', () => {
  const prov = readFileSync(resolve(root, 'media', 'PROVENANCE.md'), 'utf8');
  for (const sc of Object.values(WANDER_SCENES)) assert.match(prov, new RegExp(`^#{2,4} ${sc.clip}$`, 'm'), `${sc.clip} has a record`);
  const bank = readFileSync(resolve(root, '..', '..', 'docs', 'story', 'ghost-lines.md'), 'utf8');
  assert.ok(bank.includes(`| \`reveal.soft.1\` | ${WANDER.reveal} |`), 'the line is reveal.soft.1 of the ghost line bank, word for word');
  assert.doesNotMatch(WANDER.reveal, /\d|poltergeist/i, 'a reveal line has no digits and no Poltergeist');
  assert.deepEqual(wanderCard('  I waited by the water.  '), { title: 'A memory, found.', lines: ['I waited by the water.'] });
  for (const none of [undefined, null, '', '   ', 7]) assert.deepEqual(wanderCard(none).lines, [], `wanderCard(${none}) has no body`);
});

test('20.6 the scrape sounds only at Haunt 3 and the knock at Haunt 7 and 8, below the maximum, for every maximum', () => {
  for (const max of MAXES) {
    const got = Array.from({ length: max + 1 }, (_, l) => reelSound(l, max));
    const want = Array.from({ length: max + 1 }, (_, l) => (l === 3 ? 'scrape' : l === 7 || l === 8 ? 'knock' : null));
    want[max] = null; // the maximum is the ending, which has no sound of its own
    assert.deepEqual(got, want, `max ${max}`);
  }
  assert.deepEqual(Array.from({ length: 11 }, (_, l) => reelSound(l, 10)), [null, null, null, 'scrape', null, null, null, 'knock', 'knock', null, null]);
});

test('20.6 a sound belongs to the shot, so it can never be on a level that has another shot', () => {
  for (const max of MAXES) for (let l = 0; l <= max; l++) assert.equal(reelSound(l, max), SHOT_SOUND[reelShot(l, max)] ?? null);
  assert.deepEqual(Object.keys(SHOT_SOUND).sort(), ['coffin', 'hand']);
  for (const shot of Object.keys(SHOT_SOUND)) assert.ok(shot in SHOTS, `${shot} is a shot`);
});

test('20.6 reelSound is total: odd input gives a sound or null, never a throw', () => {
  for (const [l, m] of [[NaN, 10], [3, NaN], [-5, 10], [99, 10], [3.7, 10], [undefined, undefined], [3, 0], [7, -1]]) {
    const r = reelSound(l, m);
    assert.ok(r === null || r in SOUND_TEXT, `reelSound(${l}, ${m}) = ${r}`);
  }
  assert.equal(reelSound(3.7, 10), 'scrape', 'a fraction counts as its whole part');
  assert.equal(reelSound(99, 10), null, 'past the maximum is the house, which is silent');
});

test('20.6 each sound has its words, its file in the game folder, a credit, and no word of speech', () => {
  const credits = readFileSync(resolve(root, '..', '..', 'docs', 'sounds', 'CREDITS.md'), 'utf8');
  assert.deepEqual(Object.keys(SOUND_TEXT).sort(), [...new Set(Object.values(SHOT_SOUND))].sort());
  for (const [name, words] of Object.entries(SOUND_TEXT)) {
    assert.ok(words.length > 10, `${name} has words`);
    assert.ok(existsSync(resolve(root, '..', '..', 'web', 'public', 'sounds', `${name}.m4a`)), `${name}.m4a is in web/public/sounds`);
    assert.ok(credits.includes(`| \`${name}.m4a\` |`), `${name} has a row in CREDITS.md`);
    assert.doesNotMatch(words, /poltergeist/i);
  }
});

const probe = (file) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }); return r.status === 0 ? Number(r.stdout) : null; };

test('20.6 every sound has a start time inside its shot, and the shot is long enough for the sound to begin and be heard', { skip: probe(resolve(root, 'media', `${SHOTS.hand}.mp4`)) === null && 'ffprobe not installed' }, () => {
  assert.deepEqual(Object.keys(SOUND_AT).sort(), Object.keys(SOUND_TEXT).sort(), 'a start time for each sound, and no other');
  for (const [shot, sound] of Object.entries(SHOT_SOUND)) {
    const at = SOUND_AT[sound];
    const clip = probe(resolve(root, 'media', `${SHOTS[shot]}.mp4`));
    assert.ok(Number.isFinite(at) && at >= 0, `${sound} starts at a real time`);
    assert.ok(at < clip - 0.5, `${sound} starts at ${at} s of a ${clip.toFixed(2)} s shot, at least half a second before the end`);
  }
  assert.ok(SOUND_AT.knock > 8 && SOUND_AT.knock < 10, 'the knock is the first rap of the AI hand-at-the-door clip, at about 9 s (measured on its own sound, 8.99 s)');
});

// ---- 20.7 to 20.9: a line written for each shot's own picture ----
const story = ['party-lines.md', 'ghost-lines.md'].map((f) => readFileSync(resolve(root, '..', '..', 'docs', 'story', f), 'utf8')).join('\n');
const rowOf = (id) => new RegExp(`^\\| \`${id.replace(/\./g, '\\.')}\` \\| (.+?) \\|\\s*$`, 'm').exec(story)?.[1];
const SIGNS = /\b(moon|key|eye|hand|star|bell)\b/i; // the six Signs: a line never names one, so it can never read as a clue
const BANNED = /\b(AI|model|prompt|instructions?|rules?|turns?|rounds?|points?|scores?|cards?|hands?|clocks?|seconds?|levels?|games?|play|master|poltergeist|cannot|cold spot|blackout|restless|lull)\b/i;

test('20.7 every shot has a line (the film shots too, since 2026-11-16), each its own story-bank row word for word', () => {
  assert.deepEqual(Object.keys(SHOT_LINE).sort(), Object.keys(SHOTS).sort());
  const ids = new Set();
  for (const [shot, line] of Object.entries(SHOT_LINE)) {
    assert.equal(rowOf(line.id), line.text, `${shot}: ${line.id} is a row of party-lines.md, word for word`);
    assert.ok(line.id.startsWith('scene.'), `${line.id} is a scene line, never an Event or an ending line the Room can also draw`);
    assert.equal(line.speaker, line.id.endsWith('.soft.1') ? 'whisper' : 'keeper', `${shot}: the speaker matches the id's voice`);
    assert.ok(line.id.endsWith('.soft.1') || line.id.endsWith('.dry.1'));
    assert.ok(!ids.has(line.id), `${line.id} is used by one shot only`);
    ids.add(line.id);
  }
});

/** The bank rules for a spoken line, as a list of what is wrong with it (none when it is fine). */
const lineProblems = (text) => {
  const bad = [];
  if (text.length > 240) bad.push('over 240 characters');
  const n = text.split(/(?<=[.!?])\s+/).length;
  if (n < 1 || n > 4) bad.push(`${n} sentences`);
  if (/\d/.test(text)) bad.push('a digit');
  if (/[\[\]<>`*#{}|]/.test(text)) bad.push('markup or a placeholder');
  if (!/\b(I|me|my|we|us)\b/.test(text)) bad.push('no first person');
  if (SIGNS.test(text)) bad.push('a Sign word');
  if (BANNED.test(text)) bad.push('a banned or Event word');
  if (/\b(was|were|had|did|have been)\b/i.test(text)) bad.push('past tense');
  return bad;
};

test('20.7 every shot line follows the bank rules and never names a Sign, a clue, a card or an Event kind', () => {
  for (const [shot, { text }] of Object.entries(SHOT_LINE)) assert.deepEqual(lineProblems(text), [], shot);
  assert.deepEqual(lineProblems('I count 3 steps.'), ['a digit'], 'the rule can fail: a digit');
  assert.deepEqual(lineProblems('The moon is up. I wait.'), ['a Sign word'], 'the rule can fail: a Sign');
});

test('20.7 the line of a shot is the line of its level, and every level has one, over every level and maximum', () => {
  for (const max of MAXES) {
    for (let l = 0; l <= max + 1; l++) {
      const shot = reelShot(l, max);
      assert.equal(reelLine(l, max), shotLine(shot), `level ${l} of ${max}`);
      assert.notEqual(reelLine(l, max), null, `level ${l} of ${max} is ${shot}`);
    }
  }
  assert.deepEqual(Array.from({ length: 11 }, (_, l) => reelLine(l, 10)?.id ?? null), ['scene.ship.soft.1', 'scene.ship.soft.1', 'scene.ship.soft.1', 'scene.crate.soft.1', 'scene.street.soft.1', 'scene.street.soft.1', 'scene.mirror.soft.1', 'scene.hand-door.soft.1', 'scene.hand-door.soft.1', 'scene.bed.soft.1', 'scene.lights-out.soft.1']);
  assert.equal(shotLine('dawn').id, 'scene.dawn-door.dry.1', 'the dawn line belongs to the ending shot, not to a level');
});

test('20.7 shotLine and reelLine are total: odd input gives a line or null, and never a throw or an inherited property', () => {
  for (const bad of [undefined, null, 5, 'toString', 'constructor', '__proto__', {}, [], 'stairs', '']) assert.equal(shotLine(bad), null, String(bad));
  for (const [l, m] of [[NaN, 10], [-3, 10], [99, 10], [3.7, 10], [7, undefined], [7, 'x'], [null, null]]) {
    const r = reelLine(l, m);
    assert.ok(r === null || Object.values(SHOT_LINE).includes(r), `reelLine(${l}, ${m})`);
  }
  assert.equal(reelLine(99, 10), SHOT_LINE.house, 'past the maximum is the house');
});

test('20.8 every line starts inside its shot and ends before the shot does, using the rendered length of the line', { skip: probe(resolve(root, 'media', `${SHOTS.hand}.mp4`)) === null && 'ffprobe not installed' }, () => {
  assert.deepEqual(Object.keys(LINE_AT).sort(), Object.keys(SHOT_LINE).sort(), 'a start time for each line, and no other');
  // How long each line is spoken, as rendered into the Voice Library by Inworld (Whisper: Pippa, rate 0.9; Keeper: Ronald, rate 0.9), measured on 2026-11-16 and
  // rounded up. For the three short film shots and the house it is when the speech ends (the file's last few tenths are silence); the rest are the file's length.
  const RENDERED_S = { ship: 3.4, coffin: 4.0, streets: 3.6, mirror: 8.3, hand: 10.4, bed: 10.2, house: 13.4, dawn: 9.7 };
  for (const shot of Object.keys(SHOT_LINE)) {
    const clip = probe(resolve(root, 'media', `${SHOTS[shot]}.mp4`));
    const at = LINE_AT[shot];
    assert.ok(Number.isFinite(at) && at >= 0, `${shot} starts at a real time`);
    assert.ok(at + RENDERED_S[shot] <= clip - 0.1, `${shot}: starts at ${at} s, runs ${RENDERED_S[shot]} s, in a ${clip.toFixed(2)} s shot`);
  }
});

test('20.8 the dawn line is placed so that "the door opens" is said as the door opens in the picture (10.4 s)', () => {
  const DOOR_OPENS_IN_LINE = 6.1; // seconds into the rendered line (the 2026-11-16 render: the third sentence starts at 5.6 s, "open the door" about 0.5 s in)
  const at = LINE_AT.dawn + DOOR_OPENS_IN_LINE;
  assert.ok(Math.abs(at - 10.4) <= 0.5, `said at ${at.toFixed(1)} s of the shot, the door opens at 10.4 s`);
});

// ---- 23: the scenes of Wander ----
const filmEntry = (file) => new RegExp(`^${file.startsWith('ai-') || file.startsWith('wander-chimes') || file.startsWith('wander-chair') || file.startsWith('wander-letter') ? '#### ' : '## '}${file}$`, 'm');
const size = (file) => { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim().split(',').map(Number) : null; };

test('23.1 the three kinds of memory each have a scene, with files, a record and the words of the scene', () => {
  assert.deepEqual(WANDER_KINDS, ['sound', 'person', 'promise']);
  assert.deepEqual(Object.keys(WANDER_SCENES).sort(), [...WANDER_KINDS].sort());
  const prov = readFileSync(resolve(root, 'media', 'PROVENANCE.md'), 'utf8');
  for (const [kind, sc] of Object.entries(WANDER_SCENES)) {
    for (const ext of ['webm', 'mp4', 'jpg']) assert.ok(existsSync(resolve(root, 'media', `${sc.clip}.${ext}`)), `${kind}: ${sc.clip}.${ext}`);
    assert.match(prov, filmEntry(sc.clip), `${sc.clip} has an entry`);
    assert.ok(sc.text.length > 20 && !/\d/.test(sc.text), `${kind} has its words, with no digit`);
    assert.ok(['portrait', 'landscape'].includes(sc.shape));
  }
  assert.equal(WANDER_SCENES.promise.clip, 'wander-departure', 'the promise memory is the farewell from Frankenstein (1910)');
});

test('23.2 the held-back letter is not used: a clip with writing on it never ships as a scene', () => {
  for (const sc of Object.values(WANDER_SCENES)) assert.doesNotMatch(sc.clip, /letter/);
});

test('23.3 every Wander scene has a Whisper line, a row of ghost-lines.md word for word', () => {
  for (const [kind, sc] of Object.entries(WANDER_SCENES)) {
    assert.equal(rowOf(sc.line.id), sc.line.text, `${kind}: ${sc.line.id} is a row of ghost-lines.md, word for word`);
    assert.equal(sc.line.speaker, 'whisper');
    assert.ok(sc.line.id.startsWith('wander.') && sc.line.id.endsWith('.soft.1'));
    assert.deepEqual(lineProblems(sc.line.text), [], kind);
    assert.doesNotMatch(sc.line.text, /\b(house|memory|memories|ghost)\b/i, `${kind}: a single-player line names no place and never says what the memory is`);
  }
  assert.equal(new Set(Object.values(WANDER_SCENES).map((sc) => sc.line.id)).size, WANDER_KINDS.length, 'each kind its own line');
});

test('23.3 each Wander line starts inside its scene and ends before the scene does; each shape matches its clip', { skip: probe(resolve(root, 'media', `${WANDER_SCENES.promise.clip}.mp4`)) === null && 'ffprobe not installed' }, () => {
  const RENDERED_S = { sound: 8.5, person: 12.2, promise: 9.9 }; // the Voice Library renders (Pippa, rate 0.9), measured on 2026-11-16 and rounded up
  for (const [kind, sc] of Object.entries(WANDER_SCENES)) {
    const file = resolve(root, 'media', `${sc.clip}.mp4`);
    const [w, h] = size(file);
    assert.equal(h > w, sc.shape === 'portrait', `${kind}: a ${w} x ${h} clip is ${sc.shape}`);
    if (!sc.line) continue;
    const dur = probe(file);
    assert.ok(Number.isFinite(sc.lineAt) && sc.lineAt >= 0, `${kind} starts at a real time`);
    assert.ok(sc.lineAt + RENDERED_S[kind] <= dur - 0.1, `${kind}: starts at ${sc.lineAt} s, runs ${RENDERED_S[kind]} s, in a ${dur.toFixed(2)} s scene`);
  }
});

test('23 wanderScene is total: an odd kind gets the film and never an inherited property', () => {
  for (const bad of [undefined, null, 5, '', 'toString', 'constructor', '__proto__', {}, [], 'letter']) assert.equal(wanderScene(bad), WANDER_SCENES.promise, String(bad));
  for (const kind of WANDER_KINDS) assert.equal(wanderScene(kind), WANDER_SCENES[kind]);
});
