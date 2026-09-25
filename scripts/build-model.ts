// Build the in-browser GLiNER2.5-small bundle into public/model/ (gitignored).
//
//   1. download the fp32 ONNX graph + tokenizer from Hugging Face at a pinned revision
//   2. quantise the graph to int8 (onnxruntime dynamic quantisation, uv venv)
//   3. split the int8 graph and the onnxruntime-web wasm binaries into <= 24 MiB chunks
//   4. gzip -9 each model chunk to <chunk>.gz (Cloudflare sends .bin uncompressed; .json and
//      .wasm already get zstd on the wire, so they stay as they are)
//   5. write public/model/manifest.json with the sha256 and bytes of every file and chunk, plus
//      each .gz name, size and sha256 (the chunk sha256 is always of the decompressed bytes)
//
// Idempotent: each step checks hashes and skips work that is already done.
// Usage: bun run model        (FORCE=1 to redo every step)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHUNK_BYTES, MODEL_DIR, MODEL_REPO, MODEL_REVISION, QUANT_ID, keysFor, manifestBytes,
  manifestWireBytes, type Manifest, type ManifestFile, type ManifestGz,
} from "../src/gliner/model-info";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache", "gliner");
const OUT = join(ROOT, MODEL_DIR);
const VENV = join(CACHE, "venv");
const PY = join(VENV, "bin", "python");
const FORCE = process.env.FORCE === "1";
const PY_DEPS = ["onnxruntime==1.30.0", "onnx==1.23.0"];

// Source files at MODEL_REVISION, with their sha256 (the ONNX one is the Hugging Face LFS oid).
const SOURCES = {
  "onnx/model.onnx": "12dda5cf4b0e9ed3af17596cef1cdbd22185a32fcc230af4f476353b5e4ade1f",
  "tokenizer.json": "cbc8ae6037812709c9c26f2a160f8dc48b0440bcb79c8141804259ae2d6adac3",
  "tokenizer_config.json": "fd4a31dc2f1f17e31638c5f0e783b81cdb2fbe6bddd116a8d9e5d50d78148cf1",
} as const;

const ORT_PKG = join(ROOT, "node_modules", "onnxruntime-web");
// `onnxruntime-web/wasm` loads the plain binary (default, CPU); `onnxruntime-web/webgpu` loads the
// asyncify one (runs the WebGPU and CPU EPs; opt-in, see src/gliner/index.ts).
const ORT_WASM = "ort-wasm-simd-threaded.wasm";
const ORT_WASM_WEBGPU = "ort-wasm-simd-threaded.asyncify.wasm";

const log = (...a: unknown[]) => console.log("[build-model]", ...a);
const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of Bun.file(path).stream()) h.update(chunk);
  return h.digest("hex");
}

async function download(file: keyof typeof SOURCES): Promise<string> {
  const dest = join(CACHE, "src", MODEL_REVISION, file);
  const want = SOURCES[file];
  if (!FORCE && existsSync(dest) && (await sha256File(dest)) === want) {
    log(`have ${file}`);
    return dest;
  }
  const url = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${file}`;
  log(`download ${url}`);
  const t = performance.now();
  mkdirSync(join(dest, ".."), { recursive: true });
  const tmp = `${dest}.part`;
  // curl, not fetch: Bun's fetch spins on the 288 MB Xet redirect body.
  run(["curl", "-fsSL", "--retry", "3", "-o", tmp, url]);
  const got = await sha256File(tmp);
  if (got !== want) throw new Error(`sha256 mismatch for ${file}: got ${got}, want ${want}`);
  renameSync(tmp, dest);
  log(`  ${mb(statSync(dest).size)} in ${((performance.now() - t) / 1000).toFixed(1)}s`);
  return dest;
}

function run(cmd: string[]) {
  const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) throw new Error(`command failed (${p.exitCode}): ${cmd.join(" ")}`);
}

function ensureVenv() {
  const want = PY_DEPS.map((d) => d.split("==")[1]).join(" ");
  if (existsSync(PY)) {
    const probe = Bun.spawnSync([PY, "-c", "import onnxruntime, onnx; print(onnxruntime.__version__, onnx.__version__)"]);
    if (probe.exitCode === 0 && probe.stdout.toString().trim() === want) return;
  }
  log("create uv venv", VENV);
  run(["uv", "venv", "--quiet", "--python", "3.12", VENV]);
  run(["uv", "pip", "install", "--quiet", "--python", PY, ...PY_DEPS]);
}

async function quantise(fp32: string): Promise<string> {
  const dest = join(CACHE, "int8", MODEL_REVISION, "model_int8.onnx");
  const stampPath = `${dest}.stamp.json`;
  const srcSha = SOURCES["onnx/model.onnx"];
  if (!FORCE && existsSync(dest) && existsSync(stampPath)) {
    const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
    if (stamp.src === srcSha && stamp.quant === QUANT_ID && (await sha256File(dest)) === stamp.out) {
      log(`have model_int8.onnx (${mb(statSync(dest).size)})`);
      return dest;
    }
  }
  ensureVenv();
  mkdirSync(join(dest, ".."), { recursive: true });
  log("quantise to int8");
  run([PY, join(ROOT, "scripts", "quantize-int8.py"), fp32, dest]);
  writeFileSync(stampPath, JSON.stringify({ src: srcSha, quant: QUANT_ID, out: await sha256File(dest) }, null, 2) + "\n");
  log(`  model_int8.onnx ${mb(statSync(dest).size)}`);
  return dest;
}

/** .gz entries of the previous build, keyed by "<chunk url> <chunk sha256>". */
function previousGz(): Map<string, ManifestGz> {
  const out = new Map<string, ManifestGz>();
  try {
    const old = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")) as Manifest;
    for (const f of Object.values(old.files ?? {})) for (const c of f.chunks) if (c.gz) out.set(`${c.url} ${c.sha256}`, c.gz);
  } catch {
    /* no previous manifest */
  }
  return out;
}

/** Write `<url>.gz` (gzip -9) unless the previous build left the same file. */
function writeGz(url: string, part: Uint8Array, hash: string, prev: Map<string, ManifestGz>, written: Set<string>): ManifestGz {
  const gzUrl = `${url}.gz`;
  const path = join(OUT, gzUrl);
  written.add(gzUrl);
  const old = prev.get(`${url} ${hash}`);
  if (!FORCE && old && old.url === gzUrl && existsSync(path) && statSync(path).size === old.bytes && sha256(readFileSync(path)) === old.sha256) {
    return old;
  }
  const gz = Bun.gzipSync(part as Uint8Array<ArrayBuffer>, { level: 9 });
  if (gz.length > CHUNK_BYTES) throw new Error(`gz chunk too big: ${gzUrl}`);
  writeFileSync(path, gz);
  log(`  gzip ${url}: ${mb(part.length)} -> ${mb(gz.length)}`);
  return { url: gzUrl, bytes: gz.length, sha256: sha256(gz) };
}

/** Split `buf` into chunk files in OUT; rewrite a chunk only when its bytes differ. */
function writeChunks(
  name: string, buf: Uint8Array, ext: string, written: Set<string>, gzPrev: Map<string, ManifestGz> | null = null,
): ManifestFile {
  const chunks = [];
  const n = Math.max(1, Math.ceil(buf.length / CHUNK_BYTES));
  for (let i = 0; i < n; i++) {
    const part = buf.subarray(i * CHUNK_BYTES, Math.min(buf.length, (i + 1) * CHUNK_BYTES));
    const url = n === 1 ? name : `${name}.part${String(i).padStart(2, "0")}${ext}`;
    const path = join(OUT, url);
    const hash = sha256(part);
    const same = existsSync(path) && statSync(path).size === part.length && sha256(readFileSync(path)) === hash;
    if (FORCE || !same) writeFileSync(path, part);
    written.add(url);
    chunks.push({ url, bytes: part.length, sha256: hash, ...(gzPrev ? { gz: writeGz(url, part, hash, gzPrev, written) } : {}) });
  }
  return { name, bytes: buf.length, sha256: sha256(buf), chunks };
}

async function main() {
  const t0 = performance.now();
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const [fp32, tokenizer, tokenizerConfig] = [
    await download("onnx/model.onnx"),
    await download("tokenizer.json"),
    await download("tokenizer_config.json"),
  ];
  const int8 = await quantise(fp32);

  const ortVersion = JSON.parse(readFileSync(join(ORT_PKG, "package.json"), "utf8")).version as string;
  const ortFile = (f: string) => {
    const path = join(ORT_PKG, "dist", f);
    if (!existsSync(path)) throw new Error(`missing ${path}; run bun install`);
    return readFileSync(path);
  };

  const written = new Set<string>(["manifest.json"]);
  const gzPrev = previousGz();
  const manifest: Manifest = {
    format: 1,
    repo: MODEL_REPO,
    revision: MODEL_REVISION,
    quant: QUANT_ID,
    ort: ortVersion,
    chunkBytes: CHUNK_BYTES,
    files: {
      model: writeChunks("model_int8.onnx", readFileSync(int8), ".bin", written, gzPrev),
      tokenizer: writeChunks("tokenizer.json", readFileSync(tokenizer), ".json", written),
      tokenizerConfig: writeChunks("tokenizer_config.json", readFileSync(tokenizerConfig), ".json", written),
      ortWasm: writeChunks(ORT_WASM, ortFile(ORT_WASM), ".wasm", written),
      ortWasmWebgpu: writeChunks(ORT_WASM_WEBGPU, ortFile(ORT_WASM_WEBGPU), ".wasm", written),
    },
  };
  for (const f of Object.values(manifest.files)) {
    for (const c of f.chunks) if (c.bytes > CHUNK_BYTES) throw new Error(`chunk too big: ${c.url}`);
  }

  // Drop files an older build left behind.
  for (const f of readdirSync(OUT)) {
    if (!written.has(f)) {
      log(`remove stale ${f}`);
      rmSync(join(OUT, f), { recursive: true, force: true });
    }
  }

  const manifestPath = join(OUT, "manifest.json");
  const text = JSON.stringify(manifest, null, 2) + "\n";
  if (!existsSync(manifestPath) || readFileSync(manifestPath, "utf8") !== text) writeFileSync(manifestPath, text);

  const chunks = Object.values(manifest.files).reduce((n, f) => n + f.chunks.length, 0);
  const total = Object.values(manifest.files).reduce((n, f) => n + f.bytes, 0);
  log(`model ${mb(manifest.files.model.bytes)} in ${manifest.files.model.chunks.length} chunks; ` +
    `${chunks} files, ${mb(total)} on disk; onnxruntime-web ${ortVersion}`);
  log(`a visitor downloads ${mb(manifestWireBytes(manifest, keysFor("wasm"), true))} (wasm) or ` +
    `${mb(manifestWireBytes(manifest, keysFor("webgpu"), true))} (webgpu) before zstd, once ` +
    `(${mb(manifestBytes(manifest, keysFor("wasm")))} / ${mb(manifestBytes(manifest, keysFor("webgpu")))} decompressed)`);
  log(`done in ${((performance.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
}

await main();
