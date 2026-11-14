import type { ShellApi } from "@hauntology/shared/app/api";
import { createFakeBackend, type FakeBackend, type FakeOptions } from "@hauntology/shared/app/fake-api";

/**
 * The demo client: the shared fake backend behind the same `ShellApi` the real `ApiClient`
 * implements. It adds a small delay to each call, so screens show their waiting states.
 * Loaded only through `loadDemoApi` (see `demo.ts`), never in a production build.
 */
export type FakeApiOptions = FakeOptions & {
  /** Delay before each answer, in milliseconds. 0 answers on the next tick. Default 150. */
  latencyMs?: number;
  /** The clock for stage timing. Default `Date.now`. */
  now?: () => number;
  /** How to wait. Default `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
};

export type FakeApi = ShellApi & {
  /** The backend, for tests and the debug overlay: `backend.failNext("gallery", "rate_limited")`. */
  backend: FakeBackend;
};

export function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const { latencyMs = 150, now = Date.now, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)), ...backendOptions } = options;
  const backend = createFakeBackend(backendOptions);
  const call = async <T>(run: (t: number) => T): Promise<T> => {
    await sleep(latencyMs);
    return run(now());
  };

  return {
    backend,
    session: () => call((t) => backend.session(t)),
    ackNotice: () => call((t) => backend.ackNotice(t)),
    quota: () => call((t) => backend.quota(t)),
    gallery: () => call((t) => backend.gallery(t)),
    uploadPhoto: (photo) => call((t) => backend.uploadPhoto(t, photo)),
    sketchRender: (sketch, caption) => call((t) => backend.sketchRender(t, sketch, caption)),
    sketchSelect: (imageId) => call((t) => backend.sketchSelect(t, imageId)),
    placeBrief: (imageId) => call((t) => backend.placeBrief(t, imageId)),
    quote: (imageId) => call((t) => backend.quote(t, imageId)),
    createWorld: (req) => call((t) => backend.createWorld(t, req)),
    world: (worldId) => call((t) => backend.world(t, worldId)),
    deleteWorld: (worldId) => call((t) => backend.deleteWorld(t, worldId)),
    searchPlaces: (q) => call((t) => backend.searchPlaces(t, q)),
    speak: (req) => call((t) => backend.speak(t, req)),
    listen: (clip) => call((t) => backend.listen(t, clip)),
    playStart: (req) => call((t) => backend.playStart(t, req)),
    playTurn: (playId, turn) => call((t) => backend.playTurn(t, playId, turn)),
    playGet: (playId) => call((t) => backend.playGet(t, playId)),
  };
}
