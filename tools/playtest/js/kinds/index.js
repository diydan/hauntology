// The registry: every Kind module in the order of the playtest index.
import lockpick from './lockpick.js';
import wires from './wires.js';
import clock from './clock.js';
import safe from './safe.js';
import musicbox from './musicbox.js';
import candles from './candles.js';
import moved from './moved.js';
import photo from './photo.js';
import words from './words.js';
import board from './board.js';
import maze from './maze.js';

// feel: which phone channels each Kind uses (all are extras; every Kind has a touch path)
export const ALL = [
  { ...lockpick, feelTags: ['tilt', 'buzz', 'sound'], tier: 1 },
  { ...wires, feelTags: ['buzz', 'sound'], tier: 1 },
  { ...clock, feelTags: ['twist', 'buzz', 'sound'], tier: 1 },
  { ...safe, feelTags: ['twist', 'buzz', 'sound'], tier: 2 },
  { ...musicbox, feelTags: ['buzz', 'sound'], tier: 2 },
  { ...candles, feelTags: ['buzz', 'sound', 'mic'], tier: 2 },
  { ...moved, feelTags: ['buzz', 'sound'], tier: 2 },
  { ...photo, feelTags: ['buzz', 'sound'], tier: 3 },
  { ...words, feelTags: ['tilt', 'buzz'], tier: 3 },
  { ...board, feelTags: ['tilt', 'buzz', 'sound', 'voice'], tier: 3 },
  { ...maze, feelTags: ['tilt', 'buzz', 'sound'], tier: 3 },
];
export default ALL;
