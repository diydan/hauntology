/**
 * Puzzle sounds as data (Web Audio recipes), and the rules for how many may play. Pure: the synthesiser lives in
 * `web/src/puzzles/feel/synth.ts`. Nothing plays without the owner's yes, and never on another phone or the Host.
 */
export const NOTE_FREQS = [392, 440, 523, 587, 659] as const;

export type NoisePart = Readonly<{ type: "noise"; filter: "bandpass" | "lowpass"; hz: number; hzTo?: number; ms: number; gain: number; attack?: number }>;
export type OscPart = Readonly<{ type: "osc"; wave: "sine" | "triangle" | "sawtooth"; from: number; to: number; ms: number; gain: number; attack?: number; wobbleHz?: number }>;
export type SoundPart = NoisePart | OscPart;
export type Recipe = Readonly<{ ms: number; parts: readonly SoundPart[] }>;

const note = (hz: number): Recipe => ({ ms: 420, parts: [{ type: "osc", wave: "triangle", from: hz, to: hz, ms: 400, gain: 0.8 }] });

export const RECIPES = {
  tick: { ms: 20, parts: [{ type: "noise", filter: "bandpass", hz: 3000, ms: 4, gain: 0.8 }] },
  click: { ms: 30, parts: [{ type: "noise", filter: "bandpass", hz: 2400, ms: 8, gain: 0.8 }, { type: "osc", wave: "sine", from: 1800, to: 1800, ms: 15, gain: 0.4 }] },
  thunk: { ms: 160, parts: [{ type: "osc", wave: "sine", from: 140, to: 70, ms: 120, gain: 0.9 }, { type: "osc", wave: "triangle", from: 600, to: 400, ms: 40, gain: 0.5 }] },
  snap: { ms: 40, parts: [{ type: "noise", filter: "lowpass", hz: 4000, ms: 25, gain: 0.9 }] },
  zap: { ms: 140, parts: [{ type: "osc", wave: "sawtooth", from: 900, to: 300, ms: 120, gain: 0.35 }] },
  bump: { ms: 100, parts: [{ type: "osc", wave: "sine", from: 220, to: 160, ms: 80, gain: 0.8 }, { type: "noise", filter: "lowpass", hz: 1200, ms: 20, gain: 0.5 }] },
  rustle: { ms: 170, parts: [{ type: "noise", filter: "bandpass", hz: 2500, ms: 150, gain: 0.5 }] },
  creak: { ms: 420, parts: [{ type: "osc", wave: "sawtooth", from: 180, to: 150, ms: 400, gain: 0.25, wobbleHz: 9 }] },
  gutter: { ms: 320, parts: [{ type: "noise", filter: "lowpass", hz: 900, ms: 300, gain: 0.5 }] },
  note0: note(NOTE_FREQS[0]),
  note1: note(NOTE_FREQS[1]),
  note2: note(NOTE_FREQS[2]),
  note3: note(NOTE_FREQS[3]),
  note4: note(NOTE_FREQS[4]),
} as const satisfies Record<string, Recipe>;
export type SoundName = keyof typeof RECIPES;

export const SOUND_CAPS = { voices: 4, masterGain: 0.5, minNoteHz: 300 } as const;

export type SoundEvent = Readonly<{ t: number; name: SoundName }>;
export type SoundPlan = Readonly<{ t: number; name: SoundName; ms: number; gain: number }>;

/** The sounds a list of timed events would really make: none without consent, never more than four at once. */
export function planSound(events: readonly SoundEvent[], consent: boolean, caps = SOUND_CAPS): SoundPlan[] {
  if (!consent) return [];
  const out: SoundPlan[] = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const rec: Recipe = RECIPES[e.name];
    const active = out.filter((o) => o.t + o.ms > e.t).length;
    if (active >= caps.voices) continue;
    out.push({ t: e.t, name: e.name, ms: rec.ms, gain: caps.masterGain });
  }
  return out;
}
