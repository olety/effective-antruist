// Pinned facts about the in-browser GLiNER2.5-small bundle. Shared by
// scripts/build-model.ts (writes public/model/) and the Web Worker (reads it).

export const MODEL_REPO = "nicolasembleton/gliner2.5-small-v1-onnx";
/** Hugging Face commit of MODEL_REPO. Every download URL uses it, so the bytes never drift. */
export const MODEL_REVISION = "5e2e3f51adfb0eeb7c1f83464400b4d498d41659";
/**
 * How the model file was made (scripts/quantize-e4.py): int8 MatMuls plus a 4-bit embedding table.
 * Part of the browser cache key: a changed id makes returning visitors fetch the model once more,
 * and the loader then deletes the old files from Cache Storage.
 */
export const QUANT_ID = "onnxruntime-1.30.0/e4/MatMul-QInt8+Gather-uint4-b128-asym";
/** Cloudflare Workers static assets cap one file at 25 MiB; stay under it. */
export const CHUNK_BYTES = 24 * 1024 * 1024;
/** Where the build writes the bundle (relative to the repo root) and where the page serves it. */
export const MODEL_DIR = "public/model";
export const MODEL_PATH = "model/";

export interface ManifestChunk {
  /** File name relative to the manifest. */
  url: string;
  bytes: number;
  /** sha256 of the chunk's raw (decompressed) bytes; the loader checks it on either path. */
  sha256: string;
  /**
   * The same chunk gzip-compressed (model chunks only: Cloudflare serves .bin uncompressed, while
   * .json and .wasm already get zstd on the wire). The loader fetches it and decodes it with
   * DecompressionStream("gzip"), falling back to `url` when that is missing or fails.
   */
  gz?: ManifestGz;
}

export interface ManifestGz {
  url: string;
  /** Size of the .gz file (what goes over the wire). */
  bytes: number;
  /** sha256 of the .gz file itself (lets the build skip recompressing). */
  sha256: string;
}

export interface ManifestFile {
  /** Logical name, e.g. "model_e4.onnx". */
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

/** Bytes fetched for one chunk: the .gz size when `gzip` is on and the chunk has one. */
export const wireChunkBytes = (c: ManifestChunk, gzip: boolean) => (gzip && c.gz ? c.gz.bytes : c.bytes);

/** Bytes fetched for `keys` (before any zstd Cloudflare adds to .json and .wasm). */
export function manifestWireBytes(m: Manifest, keys: ManifestKey[], gzip: boolean): number {
  return keys.reduce((n, k) => n + m.files[k].chunks.reduce((s, c) => s + wireChunkBytes(c, gzip), 0), 0);
}
