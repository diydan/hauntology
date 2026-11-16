import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { demoPlaceholderSvg } from "./src/app/demo-assets";

// The demo Gallery thumbnails (`public/demo`) are for `?demo=1` in development only; they do not ship.
// It removes them from the folder the build wrote to, whatever `--outDir` says.
const dropDemoAssets = (): Plugin => {
  let demo = "";
  return {
    name: "drop-demo-assets",
    apply: "build",
    configResolved(config) {
      demo = resolve(config.root, config.build.outDir, "demo");
    },
    closeBundle() {
      rmSync(demo, { recursive: true, force: true });
    },
  };
};

// In development, the pictures `?demo=1` makes up (uploads, candidates, places) get a placeholder drawing.
const demoPlaceholders = (): Plugin => ({
  name: "demo-placeholders",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const svg = demoPlaceholderSvg((req.url ?? "").split("?")[0] ?? "");
      if (svg === null) return next();
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(svg);
    });
  },
});

// Spark's distributed module carries console.log calls, most inside its embedded worker source,
// where esbuild's `pure` cannot reach. Debug output never ships (Requirement 9.5), so the calls
// are rewritten to `void` in that one dependency; console.error and console.warn stay.
const quietSparkLogs = (): Plugin => ({
  name: "quiet-spark-logs",
  apply: "build",
  transform(code, id) {
    if (!id.includes("@sparkjsdev/spark")) return null;
    const out = code.replaceAll("console.log(", "void(").replaceAll("console.debug(", "void(").replaceAll("console.info(", "void(");
    return out === code ? null : out;
  },
});

// The Worker serves `dist/` and answers `/api/*`; in development the API runs under `wrangler dev`.
export default defineConfig({
  plugins: [react(), dropDemoAssets(), demoPlaceholders(), quietSparkLogs()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", target: "es2022" },
  // Debug output never ships. `console.error` stays for the logger (src/app/logger.ts).
  esbuild: { pure: ["console.log", "console.debug", "console.info"] },
});
