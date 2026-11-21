import { soundUrl, type SoundId } from "@hauntology/shared/party/sounds";
import type { SoundDeps } from "../controller/play/phone-sound";

/** The player of the real page: Web Audio with the sound files, cached once decoded. `unlock` is called from a tap. */
export function browserAudio(g: { AudioContext?: new () => AudioContext; fetch: typeof fetch }): { play: SoundDeps["play"]; unlock: () => Promise<boolean> } {
  let ctx: AudioContext | null = null;
  const buffers = new Map<SoundId, Promise<AudioBuffer | null>>();
  const context = (): AudioContext | null => { if (ctx === null && g.AudioContext !== undefined) ctx = new g.AudioContext(); return ctx; };
  const load = (id: SoundId): Promise<AudioBuffer | null> => {
    const c = context();
    if (c === null) return Promise.resolve(null);
    let p = buffers.get(id);
    if (p === undefined) {
      p = g.fetch(soundUrl(id)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b === null ? null : c.decodeAudioData(b))).catch(() => null);
      buffers.set(id, p);
    }
    return p;
  };
  return {
    unlock: async () => { const c = context(); if (c === null) return false; try { await c.resume(); return c.state === "running"; } catch { return false; } },
    play: (id, volume) => {
      void load(id).then((buf) => {
        const c = ctx;
        if (buf === null || c === null) return;
        const src = c.createBufferSource();
        const gain = c.createGain();
        gain.gain.value = Math.min(0.8, Math.max(0, volume));
        src.buffer = buf;
        src.connect(gain).connect(c.destination);
        src.start();
      });
    },
  };
}
