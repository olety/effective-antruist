import { defineConfig, type Plugin } from "vite";

// src/gliner hands onnxruntime-web its wasm binary as bytes (from the chunked, cached /model/
// bundle), so the bundles' `new URL("ort-wasm-*.wasm", import.meta.url)` fallback is never used.
// Left alone, Vite copies those binaries into dist/assets, and the 26.8 MB asyncify one breaks
// the 25 MiB Cloudflare asset cap. Point the fallback somewhere Vite does not follow.
function ortNoWasmAssets(): Plugin {
  const re = /new URL\("(ort-wasm-simd-threaded[a-z.]*\.wasm)",import\.meta\.url\)/g;
  return {
    name: "ort-no-wasm-assets",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("onnxruntime-web") || !re.test(code)) return null;
      re.lastIndex = 0;
      return { code: code.replace(re, 'new URL("/model/$1",self.location.href)'), map: null };
    },
  };
}

// `bun run dev` = Vite with HMR, proxying /api to `wrangler dev` on :8787.
// gliner-test.html is dev-only: `vite` serves it at /gliner-test.html; the build ships index.html only.
export default defineConfig({
  plugins: [ortNoWasmAssets()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { outDir: "dist", emptyOutDir: true },
  // The GLiNER worker (src/gliner) imports onnxruntime-web; module workers need ES output.
  worker: { format: "es", plugins: () => [ortNoWasmAssets()] },
  // onnxruntime-web ships prebuilt bundles; pre-bundling them breaks their wasm loader.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
