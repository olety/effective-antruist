// Smoke: start the GLiNER service + `wrangler dev` (unless already up), post the three examples, print ledgers.
// Usage: bun scripts/smoke.ts            (GLiNER + Jev, per .dev.vars)
//        SMOKE_NO_GLINER=1 bun scripts/smoke.ts   (skip the Python service; worker falls back to the lexicon)
import { spawn, type Subprocess } from "bun";
import { EXAMPLES } from "../src/examples";

const ROOT = new URL("..", import.meta.url).pathname;
const WORKER = "http://127.0.0.1:8787";
const GLINER = "http://127.0.0.1:8765";
const kids: Subprocess[] = [];

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string, secs: number) {
  for (let i = 0; i < secs * 2; i++) {
    if (await up(url)) return;
    await Bun.sleep(500);
  }
  throw new Error(`${label} not up after ${secs}s (${url})`);
}

function fmt(n: number) {
  const a = Math.abs(n);
  if (a === 0) return "0";
  return a >= 1e6 || a < 0.01 ? n.toExponential(2) : n.toFixed(a < 10 ? 2 : 0);
}

async function main() {
  if (!process.env.SMOKE_NO_GLINER && !(await up(`${GLINER}/health`))) {
    console.log("starting GLiNER service…");
    kids.push(spawn([`${ROOT}service/.venv/bin/python`, "app.py"], { cwd: `${ROOT}service`, stdout: "ignore", stderr: "ignore" }));
    await waitFor(`${GLINER}/health`, "GLiNER", 120);
  }
  if (!(await up(`${WORKER}/api/health`))) {
    console.log("building + starting wrangler dev…");
    const b = spawn(["bun", "run", "build"], { cwd: ROOT, stdout: "ignore" });
    await b.exited;
    kids.push(spawn(["bunx", "wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1"], { cwd: ROOT, stdout: "ignore", stderr: "ignore" }));
    await waitFor(`${WORKER}/api/health`, "wrangler dev", 60);
  }
  console.log("health:", await (await fetch(`${WORKER}/api/health`)).text());

  for (const ex of EXAMPLES) {
    const res = await fetch(`${WORKER}/api/judge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: ex.text }),
    });
    const j = (await res.json()) as any;
    console.log(`\n=== ${ex.label} (${j.ms} ms, spans: ${j.extractor}${j.extractorNote ? ` [${j.extractorNote}]` : ""}, jev: ${j.jev.ok ? j.jev.model : `OFF ${j.jev.error}`})`);
    console.log(`caste: ${j.caste} | soldier A (bugs): ${j.soldiers.bugs.band} ${j.soldiers.bugs.detail} | soldier B (shrimps): ${j.soldiers.shrimps.band} ${j.soldiers.shrimps.detail}${j.soldiers.argue ? " | THE SOLDIERS ARGUE" : ""}`);
    for (const l of j.ledger) {
      const span = l.spanStart >= 0 ? `"${ex.text.slice(l.spanStart, l.spanEnd)}"@${l.spanStart}` : "(no span)";
      console.log(`  ${fmt(l.insects).padStart(10)}  ${l.countsInTotal ? " " : "~"} ${l.label}  ${span}  [${l.citationId}] {${l.jokeKey}}`);
    }
    for (const [id, t] of Object.entries(j.totals.bySource) as [string, any][]) {
      console.log(`  total ${id.padEnd(8)} worth ${fmt(t.worth)} insects (1 human = ${fmt(t.humanInInsects)}), hypothetical ${fmt(t.hypothetical)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("SMOKE FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => kids.forEach((k) => k.kill()));
