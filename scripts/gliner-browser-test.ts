// Headless Chrome check of in-browser GLiNER: the default WASM backend cross-origin isolated
// (COOP/COEP, so WASM threads), WASM without isolation (1 thread), WASM with DecompressionStream
// deleted in the worker (raw-chunk fallback), WASM with corrupt .gz responses (decode-failure
// fallback), then the opt-in WebGPU backend, each in a fresh profile; wasm and webgpu are visited
// twice (the second visit must load from Cache Storage with no /model/ requests). The first wasm
// visit must fetch the model as .gz and nothing raw; the fallbacks must find the same spans. WASM must find the key spans (after the span rules) and keep every offset
// exact; WebGPU only has to run (onnxruntime-web 1.30 corrupts its pair reranker; see src/gliner/index.ts).
// Usage: bun run model && bun run test:gliner      (GLINER_TEST_URL=... to use a running server)
import { chromium, type Request } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { EXAMPLES } from "../src/examples";
import { EXTRA_TEXTS } from "../src/gliner/test-texts";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 5199;
const BASE = process.env.GLINER_TEST_URL ?? `http://127.0.0.1:${PORT}`;
const SERVICE = "http://127.0.0.1:8765";

async function up(url: string) {
  try {
    // connection: close, so no keep-alive socket holds vite.close() open
    return (await fetch(url, { headers: { connection: "close" }, signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

// COOP/COEP on every document unless its URL says coi=0 (what public/_headers does in production).
// Vite's static server sends *.gz with Content-Encoding: gzip (the browser decodes it itself);
// Cloudflare sends it as plain application/gzip, so drop that header here and let the page's
// DecompressionStream do the work, as in production.
function crossOriginIsolation(): Plugin {
  return {
    name: "test-coi",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0].endsWith(".gz")) {
          const set = res.setHeader.bind(res);
          res.setHeader = ((k: string, v: number | string | readonly string[]) =>
            /^content-encoding$/i.test(k) ? res : set(k, /^content-type$/i.test(k) ? "application/gzip" : v)) as typeof res.setHeader;
        }
        if (req.url?.includes("coi=0")) {
          // Keep vite.config.ts's own isolation headers off this document too.
          const set = res.setHeader.bind(res);
          res.setHeader = ((k: string, v: number | string | readonly string[]) =>
            /^cross-origin-(opener|embedder)-policy$/i.test(k) ? res : set(k, v)) as typeof res.setHeader;
        } else {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        }
        next();
      });
    },
  };
}

let vite: ViteDevServer | null = null;
if (!process.env.GLINER_TEST_URL) {
  vite = await createServer({
    root: ROOT,
    configFile: `${ROOT}vite.config.ts`,
    logLevel: "warn",
    plugins: [crossOriginIsolation()],
    server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  });
  await vite.listen();
  for (let i = 0; i < 60 && !(await up(`${BASE}/gliner-test.html`)); i++) await Bun.sleep(500);
}

const fmt = (spans: { label: string; text: string; score: number; source: string }[]) =>
  spans.map((s) => `${s.label}:${s.text}${s.source === "regex" ? "(re)" : `(${s.score})`}`).join("  ");

// Spans the WASM backend must find (the Python service finds them too), and spans it must not print.
const MUST: Record<string, string[]> = {
  A: ["job:Staff engineer", "ai_lab:Anthropic", "ai_lab:Google Brain", "donation:10%", "charity:GiveWell",
    "charity:Shrimp Welfare Project", "food:Vegan", "hobby:ultramarathons", "city:SF", "pet:two cats"],
  B: ["job:indie hacker", "city:Lisbon", "money:$4k MRR", "food:steak", "pet:3 dogs"],
  C: ["food:chicken sandwich", "donation:$20", "charity:homeless shelter", "employer:fintech startup", "city:Tokyo"],
  polycule: ["charity:GiveWell", "city:Berkeley"],
  emoji_ja: ["donation:$5", "charity:Red Cross", "city:Kyoto"],
  bio600: ["ai_lab:OpenAI", "ai_lab:DeepMind", "charity:Against Malaria Foundation", "charity:GiveDirectly", "charity:food bank"],
};
const MUST_NOT: Record<string, RegExp> = {
  A: /^charity:GiveWell and/,
  pigeons: /^food:.*pigeon/i,
  polycule: /^(pet|animal):.*polycule/i,
};
const keyOf = (s: { label: string; text: string }) => `${s.label}:${s.text}`;
const wasmSpans: Record<string, string[]> = {};
const report: Record<string, unknown> = {};
let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.log(`  FAIL ${msg}`);
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"],
});
try {
  for (const mode of ["wasm", "wasm-1t", "wasm-nods", "wasm-badgz", "webgpu"] as const) {
    const ctx = await browser.newContext();
    const modelRequests: string[] = [];
    ctx.on("request", (r: Request) => {
      if (new URL(r.url()).pathname.startsWith("/model/")) modelRequests.push(r.url());
    });
    // Every .gz answers with bytes that are not the chunk: the loader must fall back to the raw chunk.
    if (mode === "wasm-badgz") {
      await ctx.route(/\/model\/.*\.gz$/, (route) =>
        route.fulfill({ status: 200, contentType: "application/gzip", body: Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2, 3, 4]) }),
      );
    }
    for (const visit of mode === "wasm" || mode === "webgpu" ? [1, 2] : [1]) {
      modelRequests.length = 0;
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("[pageerror]", e.message));
      page.on("response", (r) => {
        if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) console.log(`[http ${r.status()}]`, r.url());
      });
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") console.log(`[console.${m.type()}]`, m.text().slice(0, 300));
      });
      const t0 = Date.now();
      const qs = `auto=1&extra=1&raw=1${mode === "webgpu" ? "&ep=webgpu" : ""}${mode === "wasm-1t" ? "&coi=0" : ""}` +
        `${mode === "wasm-nods" ? "&nods=1" : ""}`;
      await page.goto(`${BASE}/gliner-test.html?${qs}`);
      await page.waitForFunction(() => (window as any).__glinerTest?.done, null, { timeout: 300_000, polling: 100 });
      const wallMs = Date.now() - t0;
      const st = await page.evaluate(() => (window as any).__glinerTest);
      await page.close();
      const key = `${mode}#${visit}`;
      const gzReq = modelRequests.filter((u) => u.endsWith(".gz")).length;
      const binReq = modelRequests.filter((u) => u.endsWith(".bin")).length;
      report[key] = { wallMs, modelRequests: modelRequests.length, gzRequests: gzReq, binRequests: binReq, ...st };
      console.log(`\n== ${key}: wall ${wallMs} ms, /model/ requests ${modelRequests.length}`);
      if (st.error) {
        fail(st.error);
        continue;
      }
      const i = st.info;
      console.log(`  backend ${i.backend}${i.note ? ` (${i.note})` : ""}, fromCache ${i.fromCache}, ` +
        `${(i.bytes / 1e6).toFixed(1)} MB (${(i.wireBytes / 1e6).toFixed(1)} MB fetched, gzip ${i.gzip}; ${gzReq} .gz + ${binReq} .bin requests), download ${i.downloadMs} ms, compile+warm-up ${i.compileMs} ms, load total ${i.totalMs} ms, ` +
        `threads ${i.threads} (crossOriginIsolated ${st.crossOriginIsolated})`);
      for (const r of st.runs) console.log(`  ${r.id} (${r.chars} ch): infer ${r.inferMs} ms, round trip ${r.roundTripMs} ms\n     ${fmt(r.spans)}`);
      if (mode === "webgpu" && i.backend !== "webgpu") fail(`expected webgpu, got ${i.backend}`);
      if (mode !== "webgpu" && i.backend !== "wasm") fail(`expected wasm, got ${i.backend}`);
      if (mode === "wasm" && !(i.threads > 1)) fail(`isolated page ran ${i.threads} thread(s)`);
      if (mode === "wasm-1t" && i.threads !== 1) fail(`non-isolated page ran ${i.threads} threads`);
      if (visit === 1 && (mode === "wasm" || mode === "wasm-1t") && (!i.gzip || binReq || !gzReq || !(i.wireBytes < i.bytes))) {
        fail(`${mode}: expected the model as .gz only (gzip ${i.gzip}, ${gzReq} .gz, ${binReq} .bin, ${i.wireBytes} of ${i.bytes} bytes fetched)`);
      }
      if (mode === "wasm-nods" && (i.gzip || gzReq || !binReq)) fail(`wasm-nods: expected raw chunks only (gzip ${i.gzip}, ${gzReq} .gz, ${binReq} .bin)`);
      if (mode === "wasm-badgz" && (i.gzip || !gzReq || !binReq)) fail(`wasm-badgz: expected .gz then raw (gzip ${i.gzip}, ${gzReq} .gz, ${binReq} .bin)`);
      for (const r of st.runs) {
        const got: string[] = r.spans.map(keyOf);
        if (!r.spans.some((s: any) => s.source === "gliner")) fail(`${r.id}: no model spans`);
        if (!r.offsetsOk) fail(`${r.id}: a span's offsets do not slice to its text`);
        if (mode !== "webgpu") {
          if (wasmSpans[r.id] && (mode === "wasm-nods" || mode === "wasm-badgz") && got.join("|") !== wasmSpans[r.id].join("|")) {
            fail(`${r.id} (${mode}): spans differ from the gz path`);
          }
          wasmSpans[r.id] ??= got;
          const missing = (MUST[r.id] ?? []).filter((k) => !got.includes(k));
          if (missing.length) fail(`${r.id} (${mode}): missing ${missing.join(", ")}`);
          const bad = got.filter((k) => MUST_NOT[r.id]?.test(k));
          if (bad.length) fail(`${r.id} (${mode}): must not print ${bad.join(", ")}`);
        } else if (visit === 1 && wasmSpans[r.id]) {
          const lost = wasmSpans[r.id].filter((k) => !got.includes(k));
          const extra = got.filter((k) => !wasmSpans[r.id].includes(k));
          if (lost.length || extra.length) console.log(`  KNOWN ISSUE ${r.id} webgpu vs wasm: lost [${lost.join(", ")}] extra [${extra.join(", ")}]`);
        }
      }
      if (st.runs.length !== EXAMPLES.length + EXTRA_TEXTS.length) fail(`ran ${st.runs.length} texts`);
      if (visit === 2 && (!i.fromCache || modelRequests.length)) fail(`repeat visit hit the network (${modelRequests.length} /model/ requests)`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  (vite?.httpServer as { closeAllConnections?: () => void } | null)?.closeAllConnections?.();
  await vite?.close();
}

// Side by side with the Python service (base model) when it is up.
if (await up(`${SERVICE}/health`)) {
  console.log(`\n== Python service ${SERVICE} (reference)`);
  for (const ex of EXAMPLES) {
    const r = await (await fetch(`${SERVICE}/extract`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: ex.text }), signal: AbortSignal.timeout(10_000),
    })).json() as any;
    console.log(`  ${ex.id}: ${r.entities.map((e: any) => `${e.kind}:${e.text}${e.source === "regex" ? "(re)" : `(${e.confidence})`}`).join("  ")}`);
  }
}

mkdirSync(`${ROOT}.cache/gliner`, { recursive: true });
writeFileSync(`${ROOT}.cache/gliner/browser-test.json`, JSON.stringify(report, null, 2));
console.log(`\n${failed ? "FAILED" : "OK"} (report: ${ROOT}.cache/gliner/browser-test.json)`);
process.exit(failed ? 1 : 0);
