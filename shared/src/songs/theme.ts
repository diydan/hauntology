/**
 * Hauntology theme song ("Half a Step Behind") used on the intro (Home), outro (Ending),
 * and landing page (`site/public/assets/bed.mp3`).
 */

export type ThemeSongKind = "intro" | "outro";

export type ThemeVariantId = "default" | "female-rock" | "classical";

export type ThemeVariant = Readonly<{
  id: ThemeVariantId;
  label: string;
  src: string;
}>;

export type ThemeSongInfo = Readonly<{
  kind: ThemeSongKind;
  src: string;
  title: string;
  ariaLabel: string;
  playLabel: string;
  stopLabel: string;
}>;

export const THEME_LYRICS = `Welcome to Hauntology, a place you used to know
Sketch a crooked doorway where the faded shadows go
Count your footsteps down the quiet of the hall
Stop your breath and hear one extra footstep fall
Every chair was kept awaiting your return
Waiting softly where the lonely candles burn

Three lost memories are hiding in the cold
One a sound, and one a face you used to hold
One a promise spoken faintly in the gloom
Pull the thread and wake the static in the room

Turn the light on, watch the corners bend!
Where do you stop, where does it begin?
Every memory has teeth tonight
Waiting at the edges of your sight!
Swear you're wide awake, swear you haven't lost your mind
Then why's your shadow moving half a step behind?

Six cold relics on the table in the grey
Stitched-together whispers slowly start to play
Search the corners for the traces left unseen
Catch the mirror blinking late across the screen
Hear the bell strike as the shadows start to climb
Seal your answer at the running out of time!

Guess it wrong inside the dark
Now the haunting claims your part
Look into the glass
You were never here alone!

Turn the light on, watch the corners bend!
Where do you stop, where does it begin?
Every memory has teeth tonight
Waiting at the edges of your sight!
Swear you're wide awake, swear you'll leave this place behind
While something wears your footsteps half a step behind!

Stop your breath and hear it call...
Welcome to Hauntology—
Half a step behind you all.`;

export const THEME_SONGS: Record<ThemeSongKind, ThemeSongInfo> = {
  intro: {
    kind: "intro",
    src: "/songs/theme-intro.mp3",
    title: "Theme · Half a Step Behind",
    ariaLabel: "Intro theme song",
    playLabel: "Play intro theme",
    stopLabel: "Stop intro theme",
  },
  outro: {
    kind: "outro",
    src: "/songs/theme-outro.mp3",
    title: "Outro · Half a Step Behind",
    ariaLabel: "Outro theme song",
    playLabel: "Play outro theme",
    stopLabel: "Stop outro theme",
  },
};

export const themeVariants = (kind: ThemeSongKind): readonly ThemeVariant[] => [
  { id: "default", label: kind === "intro" ? "Rock" : "Outro Rock", src: THEME_SONGS[kind].src },
  { id: "female-rock", label: "Female Rock", src: "/songs/theme-female-rock.mp3" },
  { id: "classical", label: "Horror Classical", src: "/songs/theme-classical.mp3" },
];
