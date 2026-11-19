/**
 * Host Web Audio Stitch sequence player (ghost-voice 5.11, Requirements 5.1 and 5.4).
 *
 * Decodes Stitch clip byte buffers and schedules them back-to-back on one Web Audio timeline
 * while showing the Subtitle; returns `stop()` to halt playback immediately on unmount/mute.
 */
export type DecodedStitchBuffer = {
  readonly duration: number;
};

export type StitchSourceNode = {
  buffer: DecodedStitchBuffer | null;
  connect(dest: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
};

export type StitchAudioContextLike = {
  readonly currentTime: number;
  readonly destination: unknown;
  decodeAudioData(data: ArrayBuffer): Promise<DecodedStitchBuffer>;
  createBufferSource(): StitchSourceNode;
};

export type StitchPlaybackHandle = {
  played: boolean;
  totalDurationSec: number;
  stop: () => void;
};

export async function playStitchSequence(
  ctx: StitchAudioContextLike | null,
  clips: readonly Uint8Array[],
  subtitle: string,
  onSubtitle?: (text: string) => void,
): Promise<StitchPlaybackHandle> {
  onSubtitle?.(subtitle);
  if (ctx === null || clips.length === 0) {
    return { played: false, totalDurationSec: 0, stop: () => {} };
  }

  const decoded: DecodedStitchBuffer[] = [];
  for (const clip of clips) {
    try {
      const copy = clip.slice().buffer as ArrayBuffer;
      decoded.push(await ctx.decodeAudioData(copy));
    } catch {
      return { played: false, totalDurationSec: 0, stop: () => {} };
    }
  }

  let cursor = ctx.currentTime;
  const sources: StitchSourceNode[] = [];
  for (const buf of decoded) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(cursor);
    cursor += buf.duration;
    sources.push(src);
  }

  const totalDurationSec = Math.max(0, cursor - ctx.currentTime);
  return {
    played: true,
    totalDurationSec,
    stop: () => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
    },
  };
}
