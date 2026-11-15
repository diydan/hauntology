/**
 * What the finite placeholders of a scripted line are filled with, as WORDS A SPEAKER SAYS (ghost-voice task 2.18).
 * One table, used both to expand the Library ahead of time and (when the ghost engine is built) to fill a line at play time, so
 * the two can never disagree about what was rendered. Pure.
 *
 * The weather class names are not speakable as they stand: "Today it is cloud" is a label, not a sentence. A weather class is
 * therefore spoken as an adjective ("cloudy"), and a line is written to fit it: "Today it is {weather}", never "the {weather}".
 */
import { MOON_PHASES, TIMES_OF_DAY, WEATHER_CLASSES } from "../conditions/types";
import type { MoonPhase, TimeOfDay, WeatherClass } from "../conditions/types";
import type { FinitePlaceholders } from "./library";

/** `{weather}`: the class, as an adjective. */
export const WEATHER_WORDS: Readonly<Record<WeatherClass, string>> = {
  clear: "clear",
  cloud: "cloudy",
  fog: "foggy",
  rain: "rainy",
  storm: "stormy",
  snow: "snowy",
};

/** `{time}`: the part of the day, as it is. "It is dawn", "It is night". */
export const TIME_WORDS: Readonly<Record<TimeOfDay, string>> = { dawn: "dawn", day: "day", dusk: "dusk", night: "night" };

/** `{moon}`: the phase, as it is. "The moon goes by waxing gibbous just now". */
export const MOON_WORDS: Readonly<Record<MoonPhase, string>> = {
  "new moon": "new moon",
  "waxing crescent": "waxing crescent",
  "first quarter": "first quarter",
  "waxing gibbous": "waxing gibbous",
  "full moon": "full moon",
  "waning gibbous": "waning gibbous",
  "last quarter": "last quarter",
  "waning crescent": "waning crescent",
};

/**
 * `{bearing}`: the eight relative bearings of a hint, in the order of ghost-engine design (`relativeBearing`). Written out here
 * until `shared/src/ghost/hints.ts` exists; it must then export these and this list must be removed.
 */
export const BEARING_WORDS: readonly string[] = ["ahead", "ahead-right", "right", "behind-right", "behind", "behind-left", "left", "ahead-left"];

/** `{band}`: the three distance bands of a hint (ghost-engine design `distanceBand`). */
export const BAND_WORDS: readonly string[] = ["far", "nearer", "very close"];

/** The spoken word for a weather class, a part of the day or a moon phase. */
export const weatherWord = (w: WeatherClass): string => WEATHER_WORDS[w];
export const timeWord = (t: TimeOfDay): string => TIME_WORDS[t];
export const moonWord = (m: MoonPhase): string => MOON_WORDS[m];

/** The values `buildLibrary` expands each finite placeholder over, in a fixed order. */
export const FINITE_VALUES: FinitePlaceholders = {
  weather: WEATHER_CLASSES.map((c) => WEATHER_WORDS[c]),
  time: TIMES_OF_DAY.map((t) => TIME_WORDS[t]),
  moon: MOON_PHASES.map((m) => MOON_WORDS[m]),
  bearing: BEARING_WORDS,
  band: BAND_WORDS,
};
