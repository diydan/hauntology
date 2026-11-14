import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    // vitest 2.1.8 + tinypool 1.1.1 throw "minThreads and maxThreads must not
    // conflict" with the default fork counts on a 10-core machine. Explicit bounds avoid it.
    pool: "forks",
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
  },
});
