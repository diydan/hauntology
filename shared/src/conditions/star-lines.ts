import { skyVisibility } from "./sky-texture";
import { STAR_LIST } from "./star-list";
import type { SkyStar, TimeOfDay, WeatherClass } from "./types";

/** Only stars at least this many degrees above the horizon may be named (`conditions` 5.3, Requirement 5.3). */
export const STAR_LINE_MIN_ALT = 20;

export const STAR_LINE_TEMPLATES: readonly string[] = Object.freeze([
  "Look up past the eaves; {name} is clear tonight.",
  "Above the roof, {name} holds steady in the dark.",
  "If you glance toward the high glass, {name} is shining tonight.",
]);

export type StarLineResult = Readonly<{
  starName: string;
  line: string;
}>;

/**
 * Picks one named star above 20 degrees altitude at most once per game (`conditions` 5.3; Requirement 5.3).
 * Returns `null` if a star was already named (`alreadyNamed`), if the sky is hidden, or if no named star is high enough.
 */
export function pickStarLine(
  stars: readonly SkyStar[] | undefined,
  rng: number,
  alreadyNamed: boolean,
  opts?: Readonly<{ weather?: WeatherClass; timeOfDay?: TimeOfDay }>,
): StarLineResult | null {
  if (alreadyNamed || !stars || stars.length === 0) return null;
  if (opts?.weather && opts?.timeOfDay && skyVisibility(opts.weather, opts.timeOfDay) <= 0) return null;

  const eligible: Readonly<{ star: SkyStar; name: string }>[] = [];
  for (const star of stars) {
    if (star.alt <= STAR_LINE_MIN_ALT) continue;
    const entry = STAR_LIST[star.id];
    if (entry?.name) eligible.push({ star, name: entry.name });
  }
  if (eligible.length === 0) return null;

  const r = Number.isFinite(rng) ? Math.max(0, Math.min(0.999999, rng)) : 0;
  const chosen = eligible[Math.floor(r * eligible.length)]!;
  const template = STAR_LINE_TEMPLATES[Math.floor(((r * 7) % 1) * STAR_LINE_TEMPLATES.length)]!;
  return Object.freeze({
    starName: chosen.name,
    line: template.replace("{name}", chosen.name),
  });
}
