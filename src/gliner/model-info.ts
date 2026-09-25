// Pinned facts about the in-browser GLiNER2.5-small bundle. Shared by
// scripts/build-model.ts (writes public/model/) and the Web Worker (reads it).

export const MODEL_REPO = "nicolasembleton/gliner2.5-small-v1-onnx";
/** Hugging Face commit of MODEL_REPO. Every download URL uses it, so the bytes never drift. */
export const MODEL_REVISION = "5e2e3f51adfb0eeb7c1f83464400b4d498d41659";
/** How the int8 file was made. Part of the browser cache key. */
export const QUANT_ID = "onnxruntime-1.30.0/quantize_dynamic/QInt8";
/** Cloudflare Workers static assets cap one file at 25 MiB; stay under it. */
export const CHUNK_BYTES = 24 * 1024 * 1024;
/** Where the build writes the bundle (relative to the repo root) and where the page serves it. */
export const MODEL_DIR = "public/model";
export const MODEL_PATH = "model/";

export interface ManifestChunk {
  /** File name relative to the manifest. */
  url: string;
  bytes: number;
  sha256: string;
}

export interface ManifestFile {
  /** Logical name, e.g. "model_int8.onnx". */
  name: string;
  bytes: number;
  sha256: string;
  chunks: ManifestChunk[];
}

export interface Manifest {
  format: 1;
  repo: string;
  revision: string;
  quant: string;
  /** onnxruntime-web version of the wasm binaries below; the JS glue must match it exactly. */
  ort: string;
  chunkBytes: number;
  files: {
    model: ManifestFile;
    tokenizer: ManifestFile;
    tokenizerConfig: ManifestFile;
    /** ort-wasm-simd-threaded.wasm, loaded by `onnxruntime-web/wasm` (the default backend). */
    ortWasm: ManifestFile;
    /** ort-wasm-simd-threaded.asyncify.wasm, loaded by `onnxruntime-web/webgpu` (opt-in backend). */
    ortWasmWebgpu: ManifestFile;
  };
}

export type Backend = "wasm" | "webgpu";
export type ManifestKey = keyof Manifest["files"];

/** The files one backend needs; the ORT binary always goes last. */
export function keysFor(backend: Backend): ManifestKey[] {
  return ["model", "tokenizer", "tokenizerConfig", backend === "webgpu" ? "ortWasmWebgpu" : "ortWasm"];
}

export function manifestBytes(m: Manifest, keys: ManifestKey[]): number {
  return keys.reduce((n, k) => n + m.files[k].bytes, 0);
}
