// Labels, threshold and money rule for in-browser GLiNER. Mirrors service/app.py exactly;
// change both together.
import { MAX_CHARS, MONEY_RE, nearGive } from "../engine/extract";
import type { SpanKind } from "../engine/types";

export { MAX_CHARS };

export const THRESHOLD = 0.7;

/** GLiNER label -> [kind used by the engine, description the model sees]. Order matters: it is the prompt order. */
export const LABELS: Record<string, readonly [SpanKind, string]> = {
  "job title": ["job", "The person's role or occupation, e.g. staff engineer, indie hacker, nurse"],
  "employer or organisation": ["employer", "A company, startup or organisation the person works or worked for"],
  "AI lab": ["ai_lab", "An AI research lab such as OpenAI, Anthropic, DeepMind, Google Brain"],
  "charity or cause": ["charity", "A charity, nonprofit or cause the person gives to"],
  "donation amount": ["donation", "Money or share of income given away, e.g. 10%, $20"],
  "food eaten": ["food", "Food or diet the person eats, e.g. steak, vegan, chicken sandwich"],
  pet: ["pet", "Animals the person keeps as pets, e.g. two cats, 3 dogs"],
  animal: ["animal", "Other animals mentioned, e.g. shrimp, insects, bees"],
  hobby: ["hobby", "Leisure activities, sports or pastimes"],
  "city or country": ["city", "A city, region or country"],
};

export const LABEL_NAMES = Object.keys(LABELS);
export const DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(LABELS).map(([label, [, desc]]) => [label, desc]),
);

/** Same warm-up sentence as service/app.py; also compiles the WebGPU shaders. */
export const WARMUP_TEXT = "Warm-up: I had a chicken sandwich in Tokyo.";

/** What the vendored runtime returns: offsets are into the text it was given. */
export interface RawEntity {
  label: string;
  text: string;
  start: number;
  end: number;
  score: number;
}

/** One span found in the browser. `label` is the engine kind; POST these to /api/judge as `spans`. */
export interface GlinerSpan {
  label: SpanKind;
  text: string;
  start: number;
  end: number;
  score: number;
  source: "gliner" | "regex";
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Raw model entities -> engine spans, the service/app.py way:
 * map labels to kinds, keep a model "donation" only near give/donate/pledge,
 * then add every money regex hit (donation near a give word, else money) that no
 * donation/money span covers yet, and sort by (start, -end).
 */
export function toSpans(raw: RawEntity[], text: string): GlinerSpan[] {
  const ents: GlinerSpan[] = [];
  for (const r of raw) {
    const kind = LABELS[r.label]?.[0];
    if (!kind) continue;
    // The runtime may append "." to the text; clamp to the caller's string and re-trim.
    let s = Math.max(0, Math.min(text.length, Math.trunc(r.start)));
    let e = Math.max(0, Math.min(text.length, Math.trunc(r.end)));
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e <= s) continue;
    ents.push({ label: kind, text: text.slice(s, e), start: s, end: e, score: round3(r.score), source: "gliner" });
  }
  const out = ents.filter((x) => x.label !== "donation" || nearGive(text, x.start, x.end));
  for (const m of text.matchAll(MONEY_RE)) {
    const s = m.index!, e = s + m[0].length;
    if (out.some((x) => x.start < e && s < x.end && (x.label === "donation" || x.label === "money"))) continue;
    out.push({ label: nearGive(text, s, e) ? "donation" : "money", text: m[0], start: s, end: e, score: 1, source: "regex" });
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
