import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    // Same fork bounds as shared/vitest.config.ts (vitest 2.1.8 + tinypool 1.1.1 on a 10-core machine).
    pool: "forks",
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
  },
});
