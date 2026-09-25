// Headless Chrome check of in-browser GLiNER: the default WASM backend, then the opt-in WebGPU
// backend, each in a fresh profile, each visited twice (the second visit must load from Cache
// Storage with no /model/ requests). WASM must find the key spans the Python service finds;
// WebGPU only has to run (onnxruntime-web 1.30 corrupts its pair reranker; see src/gliner/index.ts).
// Usage: bun run model && bun run test:gliner      (GLINER_TEST_URL=... to use a running server)
import { spawn, type Subprocess } from "bun";
import { chromium, type Request } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { EXAMPLES } from "../src/examples";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 5199;
const BASE = process.env.GLINER_TEST_URL ?? `http://127.0.0.1:${PORT}`;
const SERVICE = "http://127.0.0.1:8765";

async function up(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

let vite: Subprocess | null = null;
if (!process.env.GLINER_TEST_URL) {
  vite = spawn(["bunx", "vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: ROOT, stdout: "ignore", stderr: "inherit",
  });
  for (let i = 0; i < 60 && !(await up(`${BASE}/gliner-test.html`)); i++) await Bun.sleep(500);
}

const fmt = (spans: { label: string; text: string; score: number; source: string }[]) =>
  spans.map((s) => `${s.label}:${s.text}${s.source === "regex" ? "(re)" : `(${s.score})`}`).join("  ");

// Spans the WASM backend must find (the Python service finds them too).
const MUST: Record<string, string[]> = {
  A: ["job:Staff engineer", "ai_lab:Google Brain", "donation:10%", "food:Vegan", "hobby:ultramarathons", "city:SF", "pet:two cats"],
  B: ["job:indie hacker", "city:Lisbon", "money:$4k MRR", "food:steak", "pet:3 dogs"],
  C: ["food:chicken sandwich", "donation:$20", "employer:fintech startup", "city:Tokyo"],
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
  for (const mode of ["wasm", "webgpu"] as const) {
    const ctx = await browser.newContext();
    const modelRequests: string[] = [];
    ctx.on("request", (r: Request) => {
      if (new URL(r.url()).pathname.startsWith("/model/")) modelRequests.push(r.url());
    });
    for (const visit of [1, 2]) {
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
      await page.goto(`${BASE}/gliner-test.html?auto=1${mode === "webgpu" ? "&ep=webgpu" : ""}`);
      await page.waitForFunction(() => (window as any).__glinerTest?.done, null, { timeout: 300_000, polling: 100 });
      const wallMs = Date.now() - t0;
      const st = await page.evaluate(() => (window as any).__glinerTest);
      await page.close();
      const key = `${mode}#${visit}`;
      report[key] = { wallMs, modelRequests: modelRequests.length, ...st };
      console.log(`\n== ${key}: wall ${wallMs} ms, /model/ requests ${modelRequests.length}`);
      if (st.error) {
        fail(st.error);
        continue;
      }
      const i = st.info;
      console.log(`  backend ${i.backend}${i.note ? ` (${i.note})` : ""}, fromCache ${i.fromCache}, ` +
        `${(i.bytes / 1e6).toFixed(1)} MB, download ${i.downloadMs} ms, compile+warm-up ${i.compileMs} ms, load total ${i.totalMs} ms`);
      for (const r of st.runs) console.log(`  ${r.id}: infer ${r.inferMs} ms, round trip ${r.roundTripMs} ms\n     ${fmt(r.spans)}`);
      if (mode === "webgpu" && i.backend !== "webgpu") fail(`expected webgpu, got ${i.backend}`);
      if (mode === "wasm" && i.backend !== "wasm") fail(`expected wasm, got ${i.backend}`);
      for (const r of st.runs) {
        const got: string[] = r.spans.map(keyOf);
        if (!r.spans.some((s: any) => s.source === "gliner")) fail(`${r.id}: no model spans`);
        if (mode === "wasm") {
          wasmSpans[r.id] = got;
          const missing = (MUST[r.id] ?? []).filter((k) => !got.includes(k));
          if (missing.length) fail(`${r.id}: missing ${missing.join(", ")}`);
        } else if (visit === 1 && wasmSpans[r.id]) {
          const lost = wasmSpans[r.id].filter((k) => !got.includes(k));
          const extra = got.filter((k) => !wasmSpans[r.id].includes(k));
          if (lost.length || extra.length) console.log(`  KNOWN ISSUE ${r.id} webgpu vs wasm: lost [${lost.join(", ")}] extra [${extra.join(", ")}]`);
        }
      }
      if (st.runs.length !== EXAMPLES.length) fail(`ran ${st.runs.length} examples`);
      if (visit === 2 && (!i.fromCache || modelRequests.length)) fail(`repeat visit hit the network (${modelRequests.length} /model/ requests)`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  vite?.kill();
}

// Side by side with the Python service (base model) when it is up.
if (await up(`${SERVICE}/health`)) {
  console.log(`\n== Python service ${SERVICE} (reference)`);
  for (const ex of EXAMPLES) {
    const r = await (await fetch(`${SERVICE}/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: ex.text }) })).json() as any;
    console.log(`  ${ex.id}: ${r.entities.map((e: any) => `${e.kind}:${e.text}${e.source === "regex" ? "(re)" : `(${e.confidence})`}`).join("  ")}`);
  }
}

mkdirSync(`${ROOT}.cache/gliner`, { recursive: true });
writeFileSync(`${ROOT}.cache/gliner/browser-test.json`, JSON.stringify(report, null, 2));
console.log(`\n${failed ? "FAILED" : "OK"} (report: ${ROOT}.cache/gliner/browser-test.json)`);
process.exit(failed ? 1 : 0);
