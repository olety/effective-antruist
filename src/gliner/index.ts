// In-browser GLiNER2.5-small for the Rat World judge.
//
//   import { loadGliner, extract } from "./gliner";
//   await loadGliner({ onProgress: ({ loadedBytes, totalBytes, phase }) => bar(loadedBytes / totalBytes, phase) });
//   const spans = await extract(text);          // [{label, text, start, end, score, source}]
//   fetch("/api/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, source, spans }) });
//
// The model runs in a Web Worker on the WASM (CPU) backend. Files come from /model/
// (bun run model) and stay in Cache Storage, so a repeat visit needs no network.
// Labels, threshold and the money rule match service/app.py. If loadGliner() rejects
// (old browser, blocked storage), POST without `spans` and the server extracts instead.
//
// Why WASM by default: on onnxruntime-web 1.30 the WebGPU EP computes start/end logits
// correctly but corrupts the in-graph pair reranker (pair_indices like 17-5), so spans go
// missing (Lisbon, Tokyo) with fp32 and int8 alike; and with the int8 graph it is also
// slower than WASM, because MatMulInteger runs on the CPU anyway. `backend: "webgpu"`
// keeps the WebGPU path (EPs ["webgpu", "wasm"]) for when that is fixed.
import type { FromWorker, GlinerBackend, GlinerLoadInfo, GlinerProgress, GlinerResult, ToWorker } from "./protocol";
import type { GlinerSpan } from "./labels";

export const DEFAULT_BACKEND: GlinerBackend = "wasm";

export type { GlinerBackend, GlinerLoadInfo, GlinerPhase, GlinerProgress, GlinerResult } from "./protocol";
export type { GlinerSpan } from "./labels";
export { LABELS, THRESHOLD } from "./labels";

export interface LoadOptions {
  onProgress?: (p: GlinerProgress) => void;
  /** "wasm" (default) or "webgpu" (falls back to WASM when the browser has no adapter). */
  backend?: GlinerBackend;
  /** Directory that holds manifest.json. Default: `model/` next to the page's base URL. */
  baseUrl?: string;
}

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };
type WorkerRequest = ToWorker extends infer T ? (T extends ToWorker ? Omit<T, "id"> : never) : never;

let worker: Worker | null = null;
let loadPromise: Promise<GlinerLoadInfo> | null = null;
let info: GlinerLoadInfo | null = null;
let lastProgress: GlinerProgress | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Set<(p: GlinerProgress) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./gliner.worker.ts", import.meta.url), { type: "module", name: "gliner" });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      lastProgress = { loadedBytes: msg.loadedBytes, totalBytes: msg.totalBytes, phase: msg.phase };
      for (const fn of listeners) fn(lastProgress);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === "error") p.reject(new Error(msg.message));
    else p.resolve((msg.type === "loaded" ? msg.info : msg.result) as never);
  };
  worker.onerror = (e) => {
    const err = new Error(`GLiNER worker crashed: ${e.message || "unknown error"}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
    loadPromise = null;
    info = null;
  };
  return worker;
}

function call<T>(msg: WorkerRequest): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: never) => void, reject });
    w.postMessage({ ...msg, id } as ToWorker);
  });
}

/** Download (or read from cache) and compile the model. Safe to call many times; loads once. */
export function loadGliner(opts: LoadOptions = {}): Promise<GlinerLoadInfo> {
  if (opts.onProgress) {
    listeners.add(opts.onProgress);
    if (lastProgress) opts.onProgress(lastProgress);
  }
  if (!loadPromise) {
    const baseUrl = opts.baseUrl ?? new URL(`${import.meta.env.BASE_URL}model/`, location.href).href;
    loadPromise = call<GlinerLoadInfo>({ type: "load", baseUrl, backend: opts.backend ?? DEFAULT_BACKEND }).then(
      (i) => (info = i),
      (err) => {
        loadPromise = null;
        throw err;
      },
    );
  }
  return loadPromise;
}

/** Spans for `text` (first 1500 chars), with timing. Loads the model first if needed. */
export async function extractTimed(text: string): Promise<GlinerResult> {
  await loadGliner();
  return call<GlinerResult>({ type: "extract", text });
}

/** Spans for `text` (first 1500 chars). Loads the model first if needed. */
export async function extract(text: string): Promise<GlinerSpan[]> {
  return (await extractTimed(text)).spans;
}

/** Load info once ready, else null. */
export function glinerInfo(): GlinerLoadInfo | null {
  return info;
}

/** Stop the worker and free the model's memory. The next call loads again (from cache). */
export function disposeGliner(): void {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  info = null;
  lastProgress = null;
  for (const p of pending.values()) p.reject(new Error("GLiNER disposed"));
  pending.clear();
}
