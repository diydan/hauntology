// Knock detection for the "Knock test" page: pure logic, no DOM, no sensors, so it can be tested with node.
// A knock is a short jolt the motion sensor feels and/or a sharp click the microphone hears. The microphone gives
// only a loudness number; nothing is recorded or kept. Knocks close together make a group: one knock, two knocks...

export const KNOCK_DEFAULTS = Object.freeze({
  mode: 'both',        // 'motion' | 'mic' | 'both'
  motion: 2.5,         // m/s² of sudden change (gravity removed) that counts as a jolt
  mic: 0.22,           // peak level 0..1 that counts as a click
  micRise: 3,          // the peak must be this many times the recent average (a click, not talk)
  pairMs: 90,          // in 'both', the jolt and the click must be this close
  debounceMs: 150,     // one knock cannot count twice inside this
  groupGapMs: 700,     // knocks closer than this belong to one group
});

export function makeDetector(opts = {}) {
  const o = { ...KNOCK_DEFAULTS, ...opts };
  let lastJolt = -Infinity, lastClick = -Infinity, lastKnock = -Infinity;
  const knocks = [];
  const groups = [];
  let open = [];
  const knock = (t, source) => {
    if (t - lastKnock < o.debounceMs) return null;
    lastKnock = t;
    const k = { t, source };
    knocks.push(k);
    if (open.length && t - open[open.length - 1].t > o.groupGapMs) { groups.push(open.length); open = []; }
    open.push(k);
    return k;
  };
  return {
    opts: o,
    knocks,
    groups,
    /** A motion reading: the size of the sudden change in m/s². */
    motion(t, change) {
      if (!(change >= o.motion)) return null;
      lastJolt = t;
      if (o.mode === 'motion') return knock(t, 'motion');
      if (o.mode === 'both' && t - lastClick <= o.pairMs) return knock(t, 'both');
      return null;
    },
    /** A microphone reading: this frame's peak, and the recent average level. */
    mic(t, peak, avg) {
      if (!(peak >= o.mic && peak >= o.micRise * Math.max(avg, 0.005))) return null;
      lastClick = t;
      if (o.mode === 'mic') return knock(t, 'mic');
      if (o.mode === 'both' && t - lastJolt <= o.pairMs) return knock(t, 'both');
      return null;
    },
    /** Close a group that has gone quiet; returns its size, or 0. */
    flush(t) {
      if (open.length && t - open[open.length - 1].t > o.groupGapMs) { const n = open.length; groups.push(n); open = []; return n; }
      return 0;
    },
    reset() { knocks.length = 0; groups.length = 0; open = []; lastJolt = lastClick = lastKnock = -Infinity; },
  };
}

/** The size of the sudden change between two acceleration readings (gravity cancels out between close readings). */
export const jolt = (a, b) => (a && b ? Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0), (a.z ?? 0) - (b.z ?? 0)) : 0);
