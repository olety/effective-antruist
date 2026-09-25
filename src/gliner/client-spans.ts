// The /api/judge contract for spans found in the browser (src/gliner). Lives outside
// worker/index.ts because a Worker entry module may only export handlers.
import type { Span, SpanKind } from "../engine/types";

export const MAX_CLIENT_SPANS = 300;

const SPAN_KINDS: ReadonlySet<string> = new Set<SpanKind>([
  "food", "animal", "pet", "donation", "money", "employer", "ai_lab", "charity", "city", "hobby", "job",
]);

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Spans sent by the browser -> engine spans, or null when the array is not well-formed
 * (then the caller extracts on the server). Accepts the src/gliner shape
 * {label, start, end, score, source} and the engine shape {kind, start, end, confidence}.
 * Offsets are clamped to `text` and the span text is re-read from it; unknown kinds and
 * empty spans are dropped.
 */
export function parseClientSpans(raw: unknown, text: string): Span[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CLIENT_SPANS) return null;
  const out: Span[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    const kind = r.kind ?? r.label;
    const conf = r.confidence ?? r.score;
    if (typeof kind !== "string" || !isNum(r.start) || !isNum(r.end) || !isNum(conf)) return null;
    if (!SPAN_KINDS.has(kind)) continue;
    const start = clamp(Math.trunc(r.start), 0, text.length);
    const end = clamp(Math.trunc(r.end), 0, text.length);
    if (end <= start) continue;
    out.push({
      kind: kind as SpanKind,
      text: text.slice(start, end),
      start,
      end,
      confidence: clamp(conf, 0, 1),
      source: r.source === "regex" ? "regex" : "gliner",
    });
  }
  return out;
}
