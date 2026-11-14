import { z } from "zod";

/**
 * Types and schemas of the real-world conditions (the `conditions` spec). Pure: no I/O.
 * A snapshot is read once per game and frozen; it changes looks, sound and the ghost's words, never a rule.
 */

export const TIMES_OF_DAY = ["dawn", "day", "dusk", "night"] as const;
export const WEATHER_CLASSES = ["clear", "cloud", "fog", "rain", "storm", "snow"] as const;
export const TEMP_BANDS = ["freezing", "cold", "mild", "warm", "hot"] as const;
export const WIND_BANDS = ["calm", "breezy", "windy"] as const;
/** Exactly eight, in order from the new moon. */
export const MOON_PHASES = [
  "new moon", "waxing crescent", "first quarter", "waxing gibbous",
  "full moon", "waning gibbous", "last quarter", "waning crescent",
] as const;

export const TimeOfDaySchema = z.enum(TIMES_OF_DAY);
export const WeatherClassSchema = z.enum(WEATHER_CLASSES);
export const TempBandSchema = z.enum(TEMP_BANDS);
export const WindBandSchema = z.enum(WIND_BANDS);
export const MoonPhaseSchema = z.enum(MOON_PHASES);

export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;
export type WeatherClass = z.infer<typeof WeatherClassSchema>;
export type TempBand = z.infer<typeof TempBandSchema>;
export type WindBand = z.infer<typeof WindBandSchema>;
export type MoonPhase = z.infer<typeof MoonPhaseSchema>;

/** The stars list holds at most this many bright stars. */
export const MAX_STARS = 300;

const round2 = (x: number): number => Math.round(x * 100) / 100;
// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;

/** A Place keeps only a position rounded to two decimals, a time zone name or null, and a short label. */
export const PlaceSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    tz: z.string().min(1).max(64).nullable(),
    label: z.string().min(1).max(80).regex(NO_CONTROL),
  })
  .strict()
  .refine((p) => p.lat === round2(p.lat) && p.lon === round2(p.lon), { message: "position must be rounded to two decimals" });
export type Place = z.infer<typeof PlaceSchema>;

/** What the client sends before rounding. `normalizePlace` turns it into a `Place`. */
export const PlaceInputSchema = z
  .object({
    lat: z.number().finite(),
    lon: z.number().finite(),
    tz: z.string().max(64).nullable().optional(),
    label: z.string().max(200).optional(),
  })
  .strict();
export type PlaceInput = z.infer<typeof PlaceInputSchema>;

export const MemoryDaySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeOfDay: TimeOfDaySchema }).strict();
export type MemoryDay = z.infer<typeof MemoryDaySchema>;

/** A star above the place: `id` indexes the built-in list, `az` and `alt` are degrees, `mag` is brightness. */
export const SkyStarSchema = z
  .object({
    id: z.number().int().min(0).max(MAX_STARS - 1),
    az: z.number().finite().min(0).max(360),
    alt: z.number().finite().min(-90).max(90),
    mag: z.number().finite().min(-2).max(8),
  })
  .strict();
export type SkyStar = z.infer<typeof SkyStarSchema>;

export const MoonSkySchema = z
  .object({ az: z.number().finite().min(0).max(360), alt: z.number().finite().min(-90).max(90), lit: z.number().finite().min(0).max(1) })
  .strict();
export type MoonSky = z.infer<typeof MoonSkySchema>;

export const ConditionsSnapshotSchema = z
  .object({
    place: PlaceSchema.optional(),
    timeOfDay: TimeOfDaySchema,
    weather: WeatherClassSchema,
    tempBand: TempBandSchema,
    windBand: WindBandSchema,
    moon: MoonPhaseSchema,
    memoryDay: MemoryDaySchema.optional(),
    stars: z.array(SkyStarSchema).max(MAX_STARS).optional(),
    moonSky: MoonSkySchema.optional(),
    source: z.enum(["live", "memory", "default"]),
  })
  .strict();
export type ConditionsSnapshot = Readonly<z.infer<typeof ConditionsSnapshotSchema>>;

/** What goes to the viewer: no coordinates, no label, no source. */
export const AtmosphereSchema = z
  .object({
    timeOfDay: TimeOfDaySchema,
    weather: WeatherClassSchema,
    tempBand: TempBandSchema,
    windBand: WindBandSchema,
    moon: MoonPhaseSchema,
    stars: z.array(SkyStarSchema).max(MAX_STARS).optional(),
    moonSky: MoonSkySchema.optional(),
  })
  .strict();
export type Atmosphere = z.infer<typeof AtmosphereSchema>;

/** The only fields of a snapshot a Public View may carry. */
export const PublicConditionsSchema = z.object({ timeOfDay: TimeOfDaySchema, weather: WeatherClassSchema, moon: MoonPhaseSchema }).strict();
export type PublicConditions = z.infer<typeof PublicConditionsSchema>;

/** The only fields of a snapshot a narrator prompt may carry. Absent when the snapshot is the default. */
export const PromptFieldsSchema = z.object({ weather: WeatherClassSchema, timeBucket: TimeOfDaySchema, moon: MoonPhaseSchema }).strict();
export type PromptFields = z.infer<typeof PromptFieldsSchema>;

/** What the Master or the visitor chose before the snapshot is read. `hostHour` is the host's local hour, 0 to 23. */
export const ConditionsChoiceSchema = z
  .object({ place: PlaceInputSchema.optional(), memoryDay: MemoryDaySchema.optional(), hostHour: z.number().int().min(0).max(23) })
  .strict();
export type ConditionsChoice = z.infer<typeof ConditionsChoiceSchema>;
