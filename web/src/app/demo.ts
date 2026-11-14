import type { ShellApi } from "@hauntology/shared/app/api";
import type { FakeApiOptions } from "./FakeApi";

/** `?demo=1` asks for the fake API. */
export const wantsDemo = (search: string): boolean => new URLSearchParams(search).get("demo") === "1";

/**
 * Extra switches for recording and tests, read only when `?demo=1` is set:
 * `fast=1` short stages (about 2 s in all), `zero=1` every quota at zero with the kill switch on
 * (the Zero-Quota Path), `turnstile=1` the quote asks for a Turnstile result, `fail=1` a created
 * world fails.
 */
export function demoOptions(search: string): FakeApiOptions {
  const q = new URLSearchParams(search);
  const on = (k: string): boolean => q.get(k) === "1";
  const options: FakeApiOptions = {};
  if (on("fast")) options.stageMs = { queued: 400, generating: 1200, ingesting: 400 };
  if (on("zero")) {
    options.quota = { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 };
    options.flags = { worldGenEnabled: false };
  }
  if (on("turnstile")) options.needsTurnstile = true;
  if (on("fail")) options.worldOutcome = "failed";
  return options;
}

/**
 * The fake API when `?demo=1` is set on a non-production build, otherwise `null`.
 * The import sits inside the `import.meta.env.PROD` guard, so a production build drops `FakeApi`
 * and the shared fake backend (the bundle test, task 10.2, checks this).
 */
export async function loadDemoApi(search: string): Promise<ShellApi | null> {
  if (!import.meta.env.PROD && wantsDemo(search)) {
    const { createFakeApi } = await import("./FakeApi");
    return createFakeApi(demoOptions(search));
  }
  return null;
}
