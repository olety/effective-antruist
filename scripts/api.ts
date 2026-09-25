// Local stand-in for `wrangler dev` when :8787 is down: serves the real worker's /api routes with Bun.
// Env comes from the repo's .dev.vars (never printed). Usage: bun scripts/api.ts [port]
// Then run Vite with API=http://127.0.0.1:<port>.
import worker, { type Env } from "../worker/index";

const vars = await Bun.file(new URL("../.dev.vars", import.meta.url)).text().catch(() => "");
const env: Record<string, string> = {};
for (const line of vars.split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const port = Number(process.argv[2] ?? 8773);
const assets = { fetch: async () => new Response("not found", { status: 404 }) } as unknown as Fetcher;
Bun.serve({ port, hostname: "127.0.0.1", fetch: (req) => worker.fetch(req, { ...env, ASSETS: assets } as Env) });
console.log(`api on http://127.0.0.1:${port} (gliner: ${Boolean(env.GLINER_URL)}, jev: ${Boolean(env.JEV_KEY)})`);
