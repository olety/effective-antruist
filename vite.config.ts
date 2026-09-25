import { defineConfig, type Plugin } from "vite";
import { SITE, SOUND } from "./src/copy.ts";

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

// index.html carries %SITE_key% / %SOUND_key% slots; src/copy.ts is the only copy table.
function copySlots(): Plugin {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const tables: Record<string, Record<string, unknown>> = { SITE, SOUND };
  return {
    name: "copy-slots",
    transformIndexHtml(html) {
      return html.replace(/%(SITE|SOUND)_(\w+)%/g, (m, t: string, k: string) => {
        const v = tables[t][k];
        if (typeof v !== "string") throw new Error(`index.html: no string ${t}.${k} in src/copy.ts`);
        return esc(v).replace(/\n/g, "&#10;");
      });
    },
  };
}

// Structured data for search and AI answers, built from the same copy table: a WebSite node and
// the WebApplication itself. index.html carries one <!--JSONLD--> marker; "<" is escaped so the
// JSON can never close its <script>.
function jsonLd(): Plugin {
  const home = `${SITE.url}/`;
  const creator = { "@type": "Person", name: "therotobo", url: "https://x.com/therotobo" };
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${home}#website`, name: SITE.title, url: home, description: SITE.description, inLanguage: "en", creator },
      {
        "@type": "WebApplication",
        "@id": `${home}#app`,
        name: SITE.title,
        url: home,
        description: SITE.description,
        image: `${SITE.url}/og.png`,
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and WebAssembly. Runs GLiNER2.5 small in the browser.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        inLanguage: "en",
        genre: "parody",
        isPartOf: { "@id": `${home}#website` },
        creator,
      },
    ],
  };
  const tag = `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
  return {
    name: "json-ld",
    transformIndexHtml(html, ctx) {
      if (html.includes("<!--JSONLD-->")) return html.replace("<!--JSONLD-->", tag);
      if (ctx.path === "/index.html") throw new Error("index.html: no <!--JSONLD--> marker");
      return html;
    },
  };
}

// `bun run dev` = Vite with HMR, proxying /api to `wrangler dev` on :8787 (API=http://127.0.0.1:<port> overrides).
// gliner-test.html is dev-only: `vite` serves it at /gliner-test.html; the build ships index.html only.
const api = process.env.API ?? "http://127.0.0.1:8787";
// Cross-origin isolation for WASM threads in dev, matching public/_headers in production.
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };

export default defineConfig({
  plugins: [ortNoWasmAssets(), copySlots(), jsonLd()],
  server: { proxy: { "/api": api }, headers: isolation },
  preview: { proxy: { "/api": api }, headers: isolation },
  // assetsInlineLimit 0: stickers, fonts and sounds stay separate files, out of the entry chunk.
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
  // The GLiNER worker (src/gliner) imports onnxruntime-web; module workers need ES output.
  worker: { format: "es", plugins: () => [ortNoWasmAssets()] },
  // onnxruntime-web ships prebuilt bundles; pre-bundling them breaks their wasm loader.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
