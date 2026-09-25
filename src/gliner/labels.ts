// Labels, thresholds and money rule for in-browser GLiNER. Labels, descriptions and the money
// rule mirror service/app.py; change both together. The per-kind thresholds are the small int8
// model's, tuned on the 200-text bench (finetune-prep/bench/rules.py); the base service keeps 0.7.
import { LEXICON, MAX_CHARS, MONEY_RE, nearGive, PET_PHRASE_RE } from "../engine/extract";
import type { SpanKind } from "../engine/types";

export { MAX_CHARS };

/** Default threshold, the service's GLINER_THRESHOLD; kinds in KIND_THRESHOLDS use their own. */
export const THRESHOLD = 0.7;

/** Per-kind thresholds from the bench (int8 small on WASM: absurd lines 48 -> 10 per 200 texts with the rules). */
export const KIND_THRESHOLDS: Partial<Record<SpanKind, number>> = {
  employer: 0.9, ai_lab: 0.8, charity: 0.6, food: 0.8, pet: 0.85, animal: 0.8, hobby: 0.65,
};

/** The runtime decodes at this score; toSpans then applies the per-kind thresholds (as the bench did). */
export const RAW_THRESHOLD = 0.5;

export const thresholdFor = (kind: SpanKind): number => KIND_THRESHOLDS[kind] ?? THRESHOLD;

const EMPLOYER_WORDS = new Set(LEXICON.employer.map((w) => w.toLowerCase()));

/**
 * The threshold one span must reach: its kind's, or the default 0.7 when the lexicon agrees
 * (an employer span that is a lexicon employer, a pet span like "3 dogs"). On the bench this
 * keeps the absurd-line count at 10 and raises F1; it keeps B's "3 dogs" (0.833) and C's
 * "fintech startup".
 */
export function spanThreshold(kind: SpanKind, text: string): number {
  const t = thresholdFor(kind);
  const agrees = (kind === "pet" && PET_PHRASE_RE.test(text.trim())) || (kind === "employer" && EMPLOYER_WORDS.has(text.trim().toLowerCase()));
  return agrees ? Math.min(t, THRESHOLD) : t;
}

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
  /** "lexicon": added or relabelled by the lexicon pass (src/gliner/rules.ts). */
  source: "gliner" | "regex" | "lexicon";
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Raw model entities -> engine spans: map labels to kinds, clamp and trim offsets, drop spans
 * under their threshold (spanThreshold), drop a food span when a same-range animal/pet span scores higher
 * ("feeds the pigeons" is not eating pigeons), keep a model "donation" only near
 * give/donate/pledge, then add every money regex hit (donation near a give word, else money)
 * that no donation/money span covers yet, and sort by (start, -end).
 */
export function toSpans(raw: RawEntity[], text: string): GlinerSpan[] {
  const all: GlinerSpan[] = [];
  for (const r of raw) {
    const kind = LABELS[r.label]?.[0];
    if (!kind) continue;
    // The runtime may append "." to the text; clamp to the caller's string and re-trim.
    let s = Math.max(0, Math.min(text.length, Math.trunc(r.start)));
    let e = Math.max(0, Math.min(text.length, Math.trunc(r.end)));
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e <= s) continue;
    all.push({ label: kind, text: text.slice(s, e), start: s, end: e, score: r.score, source: "gliner" });
  }
  const eatenAnimal = (f: GlinerSpan) =>
    all.some((y) => (y.label === "animal" || y.label === "pet") && y.start === f.start && y.end === f.end && y.score > f.score);
  const out = all
    .filter((x) => x.score >= spanThreshold(x.label, x.text))
    .filter((x) => x.label !== "food" || !eatenAnimal(x))
    .filter((x) => x.label !== "donation" || nearGive(text, x.start, x.end))
    .map((x) => ({ ...x, score: round3(x.score) }));
  for (const m of text.matchAll(MONEY_RE)) {
    const s = m.index!, e = s + m[0].length;
    if (out.some((x) => x.start < e && s < x.end && (x.label === "donation" || x.label === "money"))) continue;
    out.push({ label: nearGive(text, s, e) ? "donation" : "money", text: m[0], start: s, end: e, score: 1, source: "regex" });
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
