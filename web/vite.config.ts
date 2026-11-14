import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Worker serves `dist/` and answers `/api/*`; in development the API runs under `wrangler dev`.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", target: "es2022" },
  // Debug output never ships. `console.error` stays for the logger (src/app/logger.ts).
  esbuild: { pure: ["console.log", "console.debug", "console.info"] },
});
