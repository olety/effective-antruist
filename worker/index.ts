// Cloudflare Worker: POST /api/judge {text, source?, spans?} -> {spans, jev, ledger, totals, ...}.
// Static assets serve the rest. `spans` comes from in-browser GLiNER (src/gliner); when it is
// well-formed the server skips GLINER_URL and re-runs the browser's thresholds and span rules on
// it (so a stale client still prices right), otherwise it extracts as before. Jev answers are
// memoised per SHA-256 of the cut text (worker/jev-memo.ts): every take of a text reads the same.
import { fallbackExtract, MAX_CHARS } from "../src/engine/extract";
import { judge } from "../src/engine/engine";
import { parseClientSpans } from "../src/gliner/client-spans";
import { applyRules, applyThresholds } from "../src/gliner/rules";
import { memoJev } from "./jev-memo";
import type { Span, WeightSourceId } from "../src/engine/types";

export interface Env {
  ASSETS: Fetcher;
  GLINER_URL?: string;
  JEV_KEY?: string;
}

const GLINER_TIMEOUT_MS = 2000;

async function extractSpans(text: string, env: Env): Promise<{ spans: Span[]; extractor: "gliner" | "fallback"; note?: string }> {
  if (!env.GLINER_URL) return { spans: fallbackExtract(text), extractor: "fallback", note: "GLINER_URL unset" };
  try {
    const res = await fetch(`${env.GLINER_URL.replace(/\/$/, "")}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(GLINER_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { entities: Span[] };
    return { spans: json.entities, extractor: "gliner" };
  } catch (err) {
    return { spans: fallbackExtract(text), extractor: "fallback", note: `GLiNER failed: ${String(err)}` };
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/judge") {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      let body: { text?: unknown; source?: unknown; spans?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: "body must be JSON {text}" }, 400);
      }
      if (typeof body.text !== "string" || !body.text.trim()) return json({ error: "text required" }, 400);
      const text = body.text.slice(0, MAX_CHARS);
      const selected = (["rp2023", "rpMean", "neurons"] as const).includes(body.source as WeightSourceId)
        ? (body.source as WeightSourceId)
        : "rp2023";
      const t0 = Date.now();
      const parsed = body.spans === undefined ? null : parseClientSpans(body.spans, text);
      const clientSpans = parsed && applyRules(text, applyThresholds(parsed));
      const rejected = body.spans !== undefined && !clientSpans;
      const extraction = clientSpans
        ? Promise.resolve({ spans: clientSpans, extractor: "gliner" as const, note: "spans from the browser" })
        : extractSpans(text, env).then((ex) => (rejected ? { ...ex, note: `browser spans rejected; ${ex.note ?? "server GLiNER"}` } : ex));
      const jevCall = memoJev(text, env.JEV_KEY, { origin: url.origin, waitUntil: ctx ? (p) => ctx.waitUntil(p) : undefined });
      const [ex, jev] = await Promise.all([extraction, jevCall]);
      const j = judge({ text, spans: ex.spans, extractor: ex.extractor, jev, selected });
      return json({ ...j, truncated: body.text.length > MAX_CHARS, extractorNote: ex.note ?? null, ms: Date.now() - t0 });
    }
    if (url.pathname === "/api/health") return json({ ok: true, gliner: Boolean(env.GLINER_URL), jev: Boolean(env.JEV_KEY) });
    return env.ASSETS.fetch(req);
  },
};
