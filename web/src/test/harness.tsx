import type { ShellApi } from "@hauntology/shared/app/api";
import { render } from "@testing-library/react";
import { App } from "../app/App";
import { createDebugStore, type DebugStore } from "../app/debugStore";
import { createFakeApi, type FakeApi, type FakeApiOptions } from "../app/FakeApi";
import type { PlayMemoryStore } from "../app/play/memory";
import { createQuotaStore, type QuotaStore } from "../app/QuotaStore";
import type { PlatformKit } from "../app/platform";
import { createRouter, type Router } from "../app/router";
import { fakeHistory } from "./fakeHistory";

export { fakeHistory };

export type Harness = {
  api: ShellApi;
  fake: FakeApi | null;
  history: ReturnType<typeof fakeHistory>;
  router: Router;
  quota: QuotaStore;
  debug: DebugStore;
  utils: ReturnType<typeof render>;
};

/** Renders the whole App at `path` on a fake history and the demo API (no timers, no network). */
export function renderApp(path: string, options: { api?: ShellApi; fake?: FakeApiOptions; debug?: boolean; platform?: Partial<PlatformKit>; memory?: PlayMemoryStore } = {}): Harness {
  const fake = options.api ? null : createFakeApi({ latencyMs: 0, ...options.fake });
  const api = options.api ?? (fake as FakeApi);
  const history = fakeHistory(path);
  const router = createRouter(history);
  const quota = createQuotaStore(api);
  const debug = createDebugStore();
  const utils = render(<App api={api} router={router} quota={quota} debugStore={debug} debug={options.debug ?? false} {...(options.platform ? { platform: options.platform } : {})} {...(options.memory ? { memory: options.memory } : {})} />);
  return { api, fake, history, router, quota, debug, utils };
}
