// Messages between the page (index.ts) and the GLiNER Web Worker (gliner.worker.ts).
import type { GlinerSpan, RawEntity } from "./labels";
import type { Backend } from "./model-info";

export type GlinerPhase = "download" | "compile" | "ready";

export interface GlinerProgress {
  loadedBytes: number;
  totalBytes: number;
  phase: GlinerPhase;
}

export type GlinerBackend = Backend;

export interface GlinerLoadInfo {
  backend: GlinerBackend;
  /** True when every file came from Cache Storage (no network). */
  fromCache: boolean;
  bytes: number;
  /** Bytes fetched from the network, before any zstd the server adds (0 from cache). */
  wireBytes: number;
  /** True when the model chunks came gzip-compressed and DecompressionStream decoded them. */
  gzip: boolean;
  downloadMs: number;
  /** Session creation plus the warm-up run (WebGPU shader compile happens here). */
  compileMs: number;
  totalMs: number;
  /** WASM threads: min(4, cores) when the page is cross-origin isolated (COOP/COEP), else 1. */
  threads: number;
  /** Why WebGPU was not used, when it was asked for and not used. */
  note: string | null;
}

export interface GlinerResult {
  spans: GlinerSpan[];
  /** Model runs (one per sentence chunk) plus post-processing, measured inside the worker. */
  inferMs: number;
  /** Model entities before thresholds and rules, only when asked for (extractTimed(text, { raw: true })). */
  raw?: RawEntity[];
}

export type ToWorker =
  | { type: "load"; id: number; baseUrl: string; backend: Backend; testNoDecompressionStream?: boolean }
  | { type: "extract"; id: number; text: string; raw?: boolean };

export type FromWorker =
  | ({ type: "progress" } & GlinerProgress)
  | { type: "loaded"; id: number; info: GlinerLoadInfo }
  | { type: "result"; id: number; result: GlinerResult }
  | { type: "error"; id: number; message: string };
