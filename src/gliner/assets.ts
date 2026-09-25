// Fetch, verify and cache the GLiNER bundle (runs inside the Web Worker).
//
// First visit: GET manifest.json, fetch every chunk in parallel with streamed progress,
// check each chunk's and each file's sha256, reassemble, and keep each file in Cache Storage
// under its sha256. Repeat visit: the manifest and files come from Cache Storage, zero network.
import {
  MODEL_REVISION, QUANT_ID, manifestBytes,
  type Manifest, type ManifestFile, type ManifestKey,
} from "./model-info";

const CACHE_NAME = "yard3-gliner";
/** Cache key of the manifest that describes the cached files. */
const MANIFEST_KEY = "__gliner/manifest.json";

export interface Bundle {
  /** One buffer per requested key, in the order asked. */
  files: Uint8Array[];
  manifest: Manifest;
  /** True when nothing came over the network. */
  fromCache: boolean;
  bytes: number;
  downloadMs: number;
  /** Settles when the Cache Storage write is done (at once on a cache hit). Never rejects. */
  cacheWrite: Promise<void>;
}

export type DownloadProgress = (loadedBytes: number, totalBytes: number) => void;

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf as Uint8Array<ArrayBuffer>));
  let s = "";
  for (const b of d) s += b.toString(16).padStart(2, "0");
  return s;
}

const fileKey = (base: URL, f: ManifestFile) => new URL(`__gliner/${f.sha256}/${f.name}`, base).href;
const manifestKey = (base: URL) => new URL(MANIFEST_KEY, base).href;

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null; // private mode, opaque origin, blocked storage
  }
}

/** A manifest counts only if it matches what this build of the code expects. */
function usable(m: Manifest | null, ortVersion: string, keys: ManifestKey[]): m is Manifest {
  return !!m && m.format === 1 && m.revision === MODEL_REVISION && m.quant === QUANT_ID && m.ort === ortVersion &&
    keys.every((k) => !!m.files?.[k]?.sha256);
}

async function cachedManifest(cache: Cache, base: URL): Promise<Manifest | null> {
  try {
    const res = await cache.match(manifestKey(base));
    return res ? ((await res.json()) as Manifest) : null;
  } catch {
    return null;
  }
}

async function cachedFile(cache: Cache | null, base: URL, f: ManifestFile): Promise<Uint8Array | null> {
  if (!cache) return null;
  try {
    const res = await cache.match(fileKey(base, f));
    if (!res) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength === f.bytes ? buf : null;
  } catch {
    return null;
  }
}

async function fetchChunk(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url, { priority: "low" } as RequestInit);
  if (!res.ok) throw new Error(`GLiNER bundle: HTTP ${res.status} for ${url}`);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.byteLength);
    return buf;
  }
  const parts: Uint8Array[] = [];
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.byteLength;
    onBytes(value.byteLength);
  }
  return concat(parts, n);
}

function concat(parts: Uint8Array[], n: number): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

async function fetchFile(base: URL, f: ManifestFile, onBytes: (n: number) => void): Promise<Uint8Array> {
  const parts = await Promise.all(
    f.chunks.map(async (c) => {
      const buf = await fetchChunk(new URL(c.url, base).href, onBytes);
      if (buf.byteLength !== c.bytes) throw new Error(`GLiNER bundle: ${c.url} is ${buf.byteLength} bytes, want ${c.bytes}`);
      if ((await sha256Hex(buf)) !== c.sha256) throw new Error(`GLiNER bundle: sha256 mismatch in ${c.url}`);
      return buf;
    }),
  );
  const whole = concat(parts, f.bytes);
  if ((await sha256Hex(whole)) !== f.sha256) throw new Error(`GLiNER bundle: sha256 mismatch in ${f.name}`);
  return whole;
}

async function store(cache: Cache, base: URL, manifest: Manifest, fresh: [ManifestFile, Uint8Array][]) {
  for (const [f, buf] of fresh) {
    await cache.put(fileKey(base, f), new Response(buf as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": "application/octet-stream" },
    }));
  }
  // The manifest goes in last, so a half-written cache never looks complete.
  await cache.put(manifestKey(base), new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } }));
  // Drop files no longer in the manifest (an older model or onnxruntime-web).
  const keep = new Set([manifestKey(base), ...Object.values(manifest.files).map((f) => fileKey(base, f))]);
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

/** Forget the cached bundle (used when a cached model fails to load). */
export async function clearBundleCache(): Promise<void> {
  try {
    if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
  } catch {
    /* nothing cached */
  }
}

/**
 * Load `keys` from Cache Storage, else from `base` (the directory holding manifest.json).
 * `ortVersion` is the onnxruntime-web version of the running JS; its wasm binary must match it.
 */
export async function loadBundle(base: URL, ortVersion: string, keys: ManifestKey[], onProgress: DownloadProgress): Promise<Bundle> {
  const t0 = performance.now();
  const cache = await openCache();

  // Repeat visit: manifest and every file from the cache, no network at all.
  let manifest = cache ? await cachedManifest(cache, base) : null;
  if (usable(manifest, ortVersion, keys)) {
    const m = manifest;
    const hits = await Promise.all(keys.map((k) => cachedFile(cache, base, m.files[k])));
    if (hits.every((h) => h)) {
      const bytes = manifestBytes(m, keys);
      onProgress(bytes, bytes);
      return { files: hits as Uint8Array[], manifest: m, fromCache: true, bytes, downloadMs: performance.now() - t0, cacheWrite: Promise.resolve() };
    }
  }

  const res = await fetch(new URL("manifest.json", base).href, { cache: "no-cache" });
  if (!res.ok) throw new Error(`GLiNER bundle: HTTP ${res.status} for manifest.json (run: bun run model)`);
  manifest = (await res.json()) as Manifest;
  if (manifest.ort !== ortVersion) {
    throw new Error(`GLiNER bundle has onnxruntime-web ${manifest.ort} wasm but the page runs ${ortVersion} (run: bun run model)`);
  }
  if (!usable(manifest, ortVersion, keys)) throw new Error("GLiNER bundle: manifest does not match this build (run: bun run model)");
  const m = manifest;
  const total = manifestBytes(m, keys);
  let loaded = 0;
  let lastSent = 0;
  const onBytes = (n: number) => {
    loaded += n;
    const now = performance.now();
    if (now - lastSent > 50) {
      lastSent = now;
      onProgress(loaded, total);
    }
  };
  onProgress(0, total);
  const fresh: [ManifestFile, Uint8Array][] = [];
  const files = await Promise.all(
    keys.map(async (k) => {
      const f = m.files[k];
      const hit = await cachedFile(cache, base, f); // e.g. the model, cached by the other backend
      if (hit) {
        onBytes(hit.byteLength);
        return hit;
      }
      const buf = await fetchFile(base, f, onBytes);
      fresh.push([f, buf]);
      return buf;
    }),
  );
  onProgress(total, total);
  const downloadMs = performance.now() - t0;
  // The worker awaits this after compiling, so the write overlaps session creation.
  const cacheWrite = cache
    ? store(cache, base, m, fresh).catch((err) => console.warn("GLiNER: cache write failed", err))
    : Promise.resolve();
  return { files, manifest: m, fromCache: false, bytes: total, downloadMs, cacheWrite };
}
