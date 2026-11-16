import { DEFAULT_MODEL, HttpWorldLabs, MODELS } from "./worldlabs-http";

/**
 * The settings of the real world service, read from the Worker's environment (names only; the values are the Worker's
 * secrets and vars). It lives under `api/src/guarded/` because it names the key: nothing else may.
 */
export type WorldLabsEnv = {
  /** The World API key (a secret, from platform.worldlabs.ai; not the Atlas key). Without it no world is made. */
  WLT_API_KEY?: string;
  /** A World API model: `marble-1.0-draft` (about a seventh of the price), `marble-1.0`, `marble-1.1` (the default) or `marble-1.1-plus`. Anything else turns world making off. */
  WORLD_MODEL?: string;
  /** Only for a local stand-in of the service: a loopback address such as `http://127.0.0.1:8788`. Anything else turns world making off. */
  WORLD_API_BASE?: string;
};

/**
 * The adapter for the real service, or `null` when world making is not set up. It is set up only when there is a key.
 * Every doubtful setting also gives `null`, never a guess that could spend: a model name that is not on the list (a
 * typo must not quietly become the dearest model), a base address that is not the real host or a loopback address,
 * or a key with a space in it. A blank value reads as not set.
 */
export function worldLabsFromEnv(env: WorldLabsEnv | undefined): HttpWorldLabs | null {
  const key = typeof env?.WLT_API_KEY === "string" ? env.WLT_API_KEY.trim() : "";
  if (key === "") return null;
  const modelName = typeof env?.WORLD_MODEL === "string" ? env.WORLD_MODEL.trim() : "";
  const model = modelName === "" ? DEFAULT_MODEL : MODELS.find((m) => m === modelName);
  if (model === undefined) return null;
  const base = typeof env?.WORLD_API_BASE === "string" ? env.WORLD_API_BASE.trim() : "";
  try {
    return new HttpWorldLabs({ apiKey: key, model, ...(base !== "" ? { baseUrl: base } : {}) });
  } catch {
    return null;
  }
}
