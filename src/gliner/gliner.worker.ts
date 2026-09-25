// GLiNER2.5-small inference inside a Web Worker, so the page's animation never waits on the model.
import { Tokenizer } from "@huggingface/tokenizers";
import { GlinerBoundaryRuntime } from "./vendor/gliner-boundary.mjs";
import { clearBundleCache, loadBundle } from "./assets";
import { extractChunked } from "./chunks";
import { DESCRIPTIONS, LABEL_NAMES, MAX_CHARS, RAW_THRESHOLD, THRESHOLD, WARMUP_TEXT } from "./labels";
import { finishSpans } from "./rules";
import { keysFor, type Backend } from "./model-info";
import type { FromWorker, GlinerLoadInfo, GlinerResult, ToWorker } from "./protocol";

type Ort = typeof import("onnxruntime-web");

interface WorkerScope {
  postMessage(msg: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  crossOriginIsolated: boolean;
}
const scope = self as unknown as WorkerScope;
const post = (msg: FromWorker) => scope.postMessage(msg);

type Gpu = { requestAdapter(): Promise<unknown | null> };

let runtime: GlinerBoundaryRuntime | null = null;
let threads = 1;
let loading: Promise<GlinerLoadInfo> | null = null;

/** Null when WebGPU is usable, else why not. */
async function webGpuProblem(): Promise<string | null> {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) return "navigator.gpu missing";
  try {
    return (await gpu.requestAdapter()) ? null : "no WebGPU adapter";
  } catch (err) {
    return `requestAdapter failed: ${String(err)}`;
  }
}

function makeTokenize(tokenizer: Tokenizer) {
  return (token: string): number[] => {
    const r = tokenizer.encode(token, { add_special_tokens: false }) as unknown;
    // Fix for the upstream README snippet: it reads `.ids`, but transformers.js 4.2 returns a
    // plain id array, so every word encoded to nothing. Accept both shapes.
    return Array.from(Array.isArray(r) ? (r as number[]) : ((r as { ids?: number[] }).ids ?? []));
  };
}

async function build(ort: Ort, model: Uint8Array, tokenizer: Tokenizer, eps: string[]): Promise<GlinerBoundaryRuntime> {
  const session = await ort.InferenceSession.create(model, {
    executionProviders: eps,
    graphOptimizationLevel: "all",
    logSeverityLevel: 3, // hide "some nodes were not assigned to the preferred EP"
  });
  const rt = new GlinerBoundaryRuntime({ ort, session, tokenize: makeTokenize(tokenizer) });
  await rt.extract(WARMUP_TEXT, LABEL_NAMES, { threshold: THRESHOLD, descriptions: DESCRIPTIONS });
  return rt;
}

async function load(baseUrl: string, want: Backend): Promise<GlinerLoadInfo> {
  const t0 = performance.now();
  let note = want === "webgpu" ? await webGpuProblem() : null;
  let backend: Backend = want === "webgpu" && !note ? "webgpu" : "wasm";
  // Each backend has its own onnxruntime-web build and wasm binary; load only the one we use.
  const ort: Ort = backend === "webgpu" ? await import("onnxruntime-web/webgpu") : await import("onnxruntime-web/wasm");
  const ortVersion = ort.env.versions.web ?? "unknown";
  const bundle = await loadBundle(new URL(baseUrl), ortVersion, keysFor(backend), (loadedBytes, totalBytes) =>
    post({ type: "progress", phase: "download", loadedBytes, totalBytes }),
  );
  const [model, tokenizerJson, tokenizerConfig, ortBinary] = bundle.files;
  post({ type: "progress", phase: "compile", loadedBytes: bundle.bytes, totalBytes: bundle.bytes });

  const t1 = performance.now();
  ort.env.logLevel = "error";
  ort.env.wasm.wasmBinary = ortBinary;
  // Threads need cross-origin isolation (COOP/COEP headers); without it ORT would warn and use 1.
  threads = scope.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
  ort.env.wasm.numThreads = threads;
  const decode = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));
  const tokenizer = new Tokenizer(decode(tokenizerJson), decode(tokenizerConfig));

  try {
    runtime = await build(ort, model, tokenizer, backend === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]);
  } catch (err) {
    if (backend === "webgpu") {
      // The asyncify binary also runs the CPU EP, so no second download.
      note = `WebGPU failed: ${String(err)}`;
      backend = "wasm";
      runtime = await build(ort, model, tokenizer, ["wasm"]);
    } else {
      if (bundle.fromCache) await clearBundleCache(); // a bad cached copy must not wedge later visits
      throw err;
    }
  }
  await bundle.cacheWrite;
  const t2 = performance.now();
  post({ type: "progress", phase: "ready", loadedBytes: bundle.bytes, totalBytes: bundle.bytes });
  return {
    backend,
    fromCache: bundle.fromCache,
    bytes: bundle.bytes,
    wireBytes: bundle.wireBytes,
    gzip: bundle.gzip,
    downloadMs: Math.round(bundle.downloadMs),
    compileMs: Math.round(t2 - t1),
    totalMs: Math.round(t2 - t0),
    threads,
    note,
  };
}

async function extract(input: string, wantRaw = false): Promise<GlinerResult> {
  const rt = runtime;
  if (!rt) throw new Error("GLiNER not loaded");
  const text = input.slice(0, MAX_CHARS);
  const t = performance.now();
  // One run per sentence chunk (<= 200 chars, <= 6 chunks); offsets come back into `text`.
  const raw = await extractChunked(text, (chunk) =>
    rt.extract(chunk, LABEL_NAMES, { threshold: RAW_THRESHOLD, descriptions: DESCRIPTIONS }),
  );
  const spans = finishSpans(raw, text);
  return { spans, inferMs: Math.round((performance.now() - t) * 10) / 10, ...(wantRaw ? { raw } : {}) };
}

// Runs are serialised: one ORT session must not run two batches at once.
let queue: Promise<unknown> = Promise.resolve();

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "load") {
    if (msg.testNoDecompressionStream) delete (self as { DecompressionStream?: unknown }).DecompressionStream;
    loading ??= load(msg.baseUrl, msg.backend);
    loading.then(
      (info) => post({ type: "loaded", id: msg.id, info }),
      (err) => {
        loading = null;
        post({ type: "error", id: msg.id, message: String(err?.message ?? err) });
      },
    );
  } else if (msg.type === "extract") {
    const run = queue.then(() => extract(msg.text, msg.raw));
    queue = run.catch(() => undefined);
    run.then(
      (result) => post({ type: "result", id: msg.id, result }),
      (err) => post({ type: "error", id: msg.id, message: String(err?.message ?? err) }),
    );
  }
};
