/**
 * A Workers AI model id from the Worker's environment (`GHOST_MODEL_ID`, `IMAGE_MODEL_ID`): blank is the default, a catalog id
 * (`@cf/<author>/<model>`) is used, and anything else is `null`, which turns the feature off rather than guess at a model
 * (a model is also a price).
 */
export function catalogModelFromEnv(value: string | undefined, fallback: string): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (id === "") return fallback;
  return /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(id) ? id : null;
}
