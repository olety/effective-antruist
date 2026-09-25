// Dev-only driver for gliner-test.html (not part of the main page or its build).
import { EXAMPLES } from "../examples";
import { EXTRA_TEXTS } from "./test-texts";
import { extractTimed, loadGliner, type GlinerLoadInfo } from "./index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
const text = $<HTMLTextAreaElement>("text");
const out = $<HTMLPreElement>("out");
const bar = $<HTMLProgressElement>("bar");
const readout = $<HTMLSpanElement>("progress");
const gpuBox = $<HTMLInputElement>("webgpu");
gpuBox.checked = q.get("ep") === "webgpu";

interface TestState {
  done: boolean;
  error: string | null;
  info: GlinerLoadInfo | null;
  pageToReadyMs: number | null;
  runs: { id: string; chars: number; roundTripMs: number; inferMs: number; offsetsOk: boolean; spans: unknown[]; raw?: unknown[] }[];
}
const state: TestState = { done: false, error: null, info: null, pageToReadyMs: null, runs: [] };
(window as unknown as { __glinerTest: TestState }).__glinerTest = state;

const show = (v: unknown) => (out.textContent = JSON.stringify(v, null, 2));
const mb = (n: number) => (n / 1e6).toFixed(1);

for (const ex of EXAMPLES) {
  const b = document.createElement("button");
  b.textContent = ex.label;
  b.onclick = () => (text.value = ex.text);
  $<HTMLParagraphElement>("examples").appendChild(b);
}
text.value = EXAMPLES[0].text;

async function load(): Promise<GlinerLoadInfo> {
  gpuBox.disabled = true;
  const info = await loadGliner({
    backend: gpuBox.checked ? "webgpu" : "wasm",
    onProgress: ({ loadedBytes, totalBytes, phase }) => {
      bar.value = totalBytes ? loadedBytes / totalBytes : 0;
      readout.textContent = `${phase}: ${mb(loadedBytes)} / ${mb(totalBytes)} MB`;
    },
  });
  state.info = info;
  (state as TestState & { crossOriginIsolated: boolean }).crossOriginIsolated = self.crossOriginIsolated;
  state.pageToReadyMs ??= Math.round(performance.now());
  readout.textContent = `ready: ${info.backend}${info.fromCache ? " (from cache)" : ""}, ${info.totalMs} ms`;
  return info;
}

async function run(id: string, t: string) {
  const t0 = performance.now();
  const r = await extractTimed(t, { raw: q.get("raw") === "1" });
  const offsetsOk = r.spans.every((s) => t.slice(s.start, s.end) === s.text);
  const row = { id, chars: t.length, roundTripMs: Math.round(performance.now() - t0), inferMs: r.inferMs, offsetsOk, spans: r.spans, raw: r.raw };
  state.runs.push(row);
  return row;
}

$("load").onclick = () => load().then((i) => show(i), (e) => show({ error: String(e) }));
$("run").onclick = async () => {
  try {
    const info = await load();
    show({ info, result: await run("textarea", text.value) });
  } catch (e) {
    show({ error: String(e) });
  }
};
async function all() {
  const info = await load();
  const results = [];
  for (const ex of EXAMPLES) results.push(await run(ex.id, ex.text));
  if (q.get("extra") === "1") for (const ex of EXTRA_TEXTS) results.push(await run(ex.id, ex.text));
  show({ info, pageToReadyMs: state.pageToReadyMs, results });
}
$("all").onclick = () => all().catch((e) => show({ error: String(e) }));

if (q.get("auto") === "1") {
  all()
    .catch((e) => {
      state.error = String(e?.stack ?? e);
      show({ error: state.error });
    })
    .finally(() => (state.done = true));
}
