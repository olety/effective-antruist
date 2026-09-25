import { defineConfig } from "vite";

// `bun run dev` = Vite with HMR, proxying /api to `wrangler dev` on :8787.
export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { outDir: "dist", emptyOutDir: true },
});
