import { THEME_LYRICS, THEME_SONGS, themeVariants, type ThemeSongKind, type ThemeVariantId } from "@hauntology/shared/songs/theme";
import { useEffect, useRef, useState } from "react";

/**
 * Tap-to-play Hauntology theme song player (intro on Home, outro on Ending screens).
 * Never autoplays on mount; pauses on unmount, lets players switch arrangements, and keeps lyrics in a fold.
 */
export function ThemeSong({ kind, heading = "h2" }: { kind: ThemeSongKind; heading?: "h2" | "h3" }) {
  const song = THEME_SONGS[kind];
  const variants = themeVariants(kind);
  const Heading = heading;
  const audio = useRef<HTMLAudioElement | null>(null);
  const [variantId, setVariantId] = useState<ThemeVariantId>("default");
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const activeVariant = variants.find((v) => v.id === variantId) ?? variants[0]!;

  useEffect(() => () => {
    audio.current?.pause();
  }, []);

  const startPlayback = (src: string) => {
    const a = audio.current ?? new Audio(src);
    audio.current = a;
    a.onended = () => setPlaying(false);
    a.onerror = () => {
      setFailed(true);
      setPlaying(false);
    };
    a.play()
      .then(() => {
        setFailed(false);
        setPlaying(true);
      })
      .catch(() => {
        setFailed(true);
        setPlaying(false);
      });
  };

  const toggle = () => {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    startPlayback(activeVariant.src);
  };

  const selectVariant = (nextId: ThemeVariantId) => {
    if (nextId === variantId) return;
    const wasPlaying = playing;
    audio.current?.pause();
    audio.current = null;
    setVariantId(nextId);
    setPlaying(false);
    setFailed(false);
    if (wasPlaying) {
      const next = variants.find((v) => v.id === nextId) ?? variants[0]!;
      startPlayback(next.src);
    }
  };

  return (
    <section aria-label={song.ariaLabel} className="ui-panel ui-stack ui-stack--tight">
      <div className="ui-row ui-row--between">
        <Heading className="ui-heading">{song.title}</Heading>
        <button type="button" className="ui-button" onClick={toggle}>
          {playing ? song.stopLabel : song.playLabel}
        </button>
      </div>
      <div className="ui-segments" role="group" aria-label="Theme arrangement">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className="ui-button"
            aria-pressed={v.id === activeVariant.id}
            onClick={() => selectVariant(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p role="status" className="ui-hint">
          The song would not play. The words are below.
        </p>
      ) : null}
      <details className="ui-fold">
        <summary>Lyrics</summary>
        <pre className="ui-lyrics">{THEME_LYRICS}</pre>
      </details>
    </section>
  );
}
