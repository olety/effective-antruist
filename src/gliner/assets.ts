// Fetch, verify and cache the GLiNER bundle (runs inside the Web Worker).
//
// First visit: GET manifest.json, fetch every chunk in parallel with streamed progress,
// check each chunk's and each file's sha256, reassemble, and keep each file in Cache Storage
// under its sha256. Repeat visit: the manifest and files come from Cache Storage, zero network.
// Model chunks come as .gz (Cloudflare sends .bin uncompressed) and are decoded with the
// browser's DecompressionStream("gzip"); without it, or when decoding fails, the raw chunk.
import {
  MODEL_REVISION, QUANT_ID, manifestBytes, manifestWireBytes, wireChunkBytes,
  type Manifest, type ManifestChunk, type ManifestFile, type ManifestKey,
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
  /** Bytes fetched from the network before any zstd (0 on a cache hit). */
  wireBytes: number;
  /** True when the model chunks came as .gz and were decoded by DecompressionStream. */
  gzip: boolean;
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

/** Read `stream` into one buffer of exactly `want` bytes (throws when it is longer or shorter). */
async function readExact(stream: ReadableStream<Uint8Array>, want: number, what: string): Promise<Uint8Array> {
  const out = new Uint8Array(want);
  let off = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (off + value.byteLength > want) {
      void reader.cancel().catch(() => {});
      throw new Error(`GLiNER bundle: ${what} is longer than ${want} bytes`);
    }
    out.set(value, off);
    off += value.byteLength;
  }
  if (off !== want) throw new Error(`GLiNER bundle: ${what} is ${off} bytes, want ${want}`);
  return out;
}

/** The response body, reporting each network chunk to `onBytes` as it is read. */
function counted(res: Response, url: string, onBytes: (n: number) => void): ReadableStream<Uint8Array> {
  if (!res.ok) throw new Error(`GLiNER bundle: HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error(`GLiNER bundle: no body for ${url}`);
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        onBytes(chunk.byteLength);
        ctrl.enqueue(chunk);
      },
    }),
  );
}

async function checkChunk(buf: Uint8Array, c: ManifestChunk, what: string) {
  if ((await sha256Hex(buf)) !== c.sha256) throw new Error(`GLiNER bundle: sha256 mismatch in ${what}`);
}

/** The raw chunk. */
async function fetchRaw(base: URL, c: ManifestChunk, onBytes: (n: number) => void): Promise<Uint8Array> {
  const url = new URL(c.url, base).href;
  const res = await fetch(url, { priority: "low" } as RequestInit);
  const buf = await readExact(counted(res, c.url, onBytes), c.bytes, c.url);
  await checkChunk(buf, c, c.url);
  return buf;
}

/**
 * The .gz chunk through DecompressionStream("gzip"). If a server or proxy sent it with
 * Content-Encoding: gzip, the browser has decoded it already (no gzip magic): take it as is.
 * Either way the decompressed bytes must match the chunk's sha256.
 */
async function fetchGz(base: URL, c: ManifestChunk, onBytes: (n: number) => void): Promise<Uint8Array> {
  const gz = c.gz!;
  const res = await fetch(new URL(gz.url, base).href, { priority: "low" } as RequestInit);
  // Peek at the first network chunk for the gzip magic, then hand on a stream that replays it.
  const reader = counted(res, gz.url, onBytes).getReader();
  const first = await reader.read();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      if (first.value) ctrl.enqueue(first.value);
      if (first.done) ctrl.close();
    },
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) ctrl.close();
      else ctrl.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const v = first.value;
  const magic = !!v && v.byteLength >= 2 && v[0] === 0x1f && v[1] === 0x8b;
  const plain = magic ? body.pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>) : body;
  const buf = await readExact(plain, c.bytes, gz.url);
  await checkChunk(buf, c, `${gz.url} (decompressed)`);
  return buf;
}

/** DecompressionStream("gzip") exists and constructs. */
export function canGunzip(): boolean {
  try {
    if (typeof DecompressionStream === "undefined") return false;
    new DecompressionStream("gzip");
    return true;
  } catch {
    return false;
  }
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

interface Wire {
  gzip: boolean;
  onBytes: (n: number) => void;
  /** A .gz chunk failed; its raw chunk (`raw` bytes) comes next, on top of the total. */
  onFallback: (raw: number) => void;
}

async function fetchFile(base: URL, f: ManifestFile, wire: Wire): Promise<Uint8Array> {
  const parts = await Promise.all(
    f.chunks.map(async (c) => {
      if (wire.gzip && c.gz) {
        try {
          return await fetchGz(base, c, wire.onBytes);
        } catch (err) {
          console.warn(`GLiNER: ${c.gz.url} failed, fetching ${c.url}`, err);
          wire.onFallback(c.bytes);
        }
      }
      return fetchRaw(base, c, wire.onBytes);
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
      return {
        files: hits as Uint8Array[], manifest: m, fromCache: true, bytes, wireBytes: 0, gzip: false,
        downloadMs: performance.now() - t0, cacheWrite: Promise.resolve(),
      };
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
  const bytes = manifestBytes(m, keys);
  const gzip = canGunzip();
  // Progress counts bytes as they come off the network (compressed for .gz chunks).
  let total = manifestWireBytes(m, keys, gzip);
  let loaded = 0;
  let lastSent = 0;
  let fellBack = false;
  const report = () => onProgress(Math.min(loaded, total), total);
  const onBytes = (n: number) => {
    loaded += n;
    const now = performance.now();
    if (now - lastSent > 50) {
      lastSent = now;
      report();
    }
  };
  const wire: Wire = {
    gzip,
    onBytes,
    onFallback: (raw) => {
      fellBack = true;
      total += raw;
    },
  };
  onProgress(0, total);
  const fresh: [ManifestFile, Uint8Array][] = [];
  const files = await Promise.all(
    keys.map(async (k) => {
      const f = m.files[k];
      const hit = await cachedFile(cache, base, f); // e.g. the model, cached by the other backend
      if (hit) {
        total -= f.chunks.reduce((n, c) => n + wireChunkBytes(c, gzip), 0);
        report();
        return hit;
      }
      const buf = await fetchFile(base, f, wire);
      fresh.push([f, buf]);
      return buf;
    }),
  );
  const wireBytes = loaded;
  total = Math.max(total, loaded);
  onProgress(total, total);
  const downloadMs = performance.now() - t0;
  // The worker awaits this after compiling, so the write overlaps session creation.
  const cacheWrite = cache
    ? store(cache, base, m, fresh).catch((err) => console.warn("GLiNER: cache write failed", err))
    : Promise.resolve();
  const usedGz = gzip && !fellBack && keys.some((k) => m.files[k].chunks.some((c) => c.gz));
  return { files, manifest: m, fromCache: false, bytes, wireBytes, gzip: usedGz, downloadMs, cacheWrite };
}
