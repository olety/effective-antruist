// The /api/judge contract for spans found in the browser (src/gliner). Lives outside
// worker/index.ts because a Worker entry module may only export handlers.
import type { Span, SpanKind } from "../engine/types";

/** A longer array is rejected (the server extracts instead); the browser caps its own output here. */
export const MAX_CLIENT_SPANS = 60;

const SPAN_KINDS: ReadonlySet<string> = new Set<SpanKind>([
  "food", "animal", "pet", "donation", "money", "employer", "ai_lab", "charity", "city", "hobby", "job",
]);

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Spans sent by the browser -> engine spans, or null when the array is not well-formed
 * (then the caller extracts on the server). Accepts the src/gliner shape
 * {label, start, end, score, source} and the engine shape {kind, start, end, confidence}.
 * The span text is re-read from `text`; spans with offsets outside `text`, empty spans and
 * unknown kinds are dropped (never clamped: a clamped span would highlight the wrong words).
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
    const start = Math.trunc(r.start);
    const end = Math.trunc(r.end);
    if (start < 0 || end > text.length || end <= start) continue;
    out.push({
      kind: kind as SpanKind,
      text: text.slice(start, end),
      start,
      end,
      confidence: clamp(conf, 0, 1),
      source: r.source === "regex" || r.source === "lexicon" ? r.source : "gliner",
    });
  }
  return out;
}
