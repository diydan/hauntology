import { rmSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { demoPlaceholderSvg } from "./src/app/demo-assets";

// The demo Gallery thumbnails (`public/demo`) are for `?demo=1` in development only; they do not ship.
const dropDemoAssets = (): Plugin => ({
  name: "drop-demo-assets",
  apply: "build",
  closeBundle() {
    rmSync("dist/demo", { recursive: true, force: true });
  },
});

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

// The Worker serves `dist/` and answers `/api/*`; in development the API runs under `wrangler dev`.
export default defineConfig({
  plugins: [react(), dropDemoAssets(), demoPlaceholders()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", target: "es2022" },
  // Debug output never ships. `console.error` stays for the logger (src/app/logger.ts).
  esbuild: { pure: ["console.log", "console.debug", "console.info"] },
});
