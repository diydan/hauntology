import { defineConfig, devices } from "@playwright/test";

/**
 * The Zero-Quota Path in a real browser (task 10.3). Local only, against the Vite dev server with `?demo=1`, so the
 * fake API answers and nothing is ever sent to a paid upstream. It needs `@playwright/test` and a Chromium, which
 * are not installed yet (see docs/spikes/shell.md); it is not part of `pnpm test`.
 *
 *   pnpm --filter @hauntology/web exec playwright test
 *
 * Two screens are run: a desktop one and a 320 px phone one, where every Screen is also checked for sideways scroll.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-320", use: { ...devices["Pixel 5"], viewport: { width: 320, height: 640 } } },
  ],
});
