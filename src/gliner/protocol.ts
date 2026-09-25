// Messages between the page (index.ts) and the GLiNER Web Worker (gliner.worker.ts).
import type { GlinerSpan } from "./labels";
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
  downloadMs: number;
  /** Session creation plus the warm-up run (WebGPU shader compile happens here). */
  compileMs: number;
  totalMs: number;
  /** Why WebGPU was not used, when it was asked for and not used. */
  note: string | null;
}

export interface GlinerResult {
  spans: GlinerSpan[];
  /** Model run plus post-processing, measured inside the worker. */
  inferMs: number;
}

export type ToWorker =
  | { type: "load"; id: number; baseUrl: string; backend: Backend }
  | { type: "extract"; id: number; text: string };

export type FromWorker =
  | ({ type: "progress" } & GlinerProgress)
  | { type: "loaded"; id: number; info: GlinerLoadInfo }
  | { type: "result"; id: number; result: GlinerResult }
  | { type: "error"; id: number; message: string };
