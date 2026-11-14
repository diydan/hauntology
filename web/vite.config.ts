import { rmSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The demo Gallery thumbnails (`public/demo`) are for `?demo=1` in development only; they do not ship.
const dropDemoAssets = (): Plugin => ({
  name: "drop-demo-assets",
  apply: "build",
  closeBundle() {
    rmSync("dist/demo", { recursive: true, force: true });
  },
});

// The Worker serves `dist/` and answers `/api/*`; in development the API runs under `wrangler dev`.
export default defineConfig({
  plugins: [react(), dropDemoAssets()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", target: "es2022" },
  // Debug output never ships. `console.error` stays for the logger (src/app/logger.ts).
  esbuild: { pure: ["console.log", "console.debug", "console.info"] },
});
