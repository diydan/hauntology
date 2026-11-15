import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "checks/**/*.test.mjs"],
    globals: false,
    // The style tests read the CSS files as text (`?raw`); by default vitest turns CSS into an empty string.
    css: { include: [/\.css/] },
    // Same fork bounds as shared/vitest.config.ts (vitest 2.1.8 + tinypool 1.1.1 on a 10-core machine).
    pool: "forks",
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
  },
});
