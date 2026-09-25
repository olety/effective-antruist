// Span rules for the small in-browser model, ported from the 200-text bench
// (finetune-prep/bench/rules.py, R1-R5) plus the lexicon pass. Pure: the browser runs them on
// its own spans (finishSpans) and the Worker runs them again on client spans (applyRules), so
// a stale client still prices right. Running them twice gives the same spans.
//
//   R4  same-range twins where one side is food/hobby/job: the higher score wins
//       (pet/animal and employer/ai_lab keep the engine priority, so ai_lab beats employer).
//   R1  AI labs are a closed set: every lexicon lab becomes an ai_lab span (overriding employer,
//       job, hobby, food, and charity unless it is a nonprofit lab the model called a charity);
//       a model ai_lab span with no lexicon lab in it is dropped (Chrome, wagmi, "AI").
//   split  a charity span holding two or more lexicon charities becomes those charities
//       ("GiveWell and the Shrimp Welfare Project" would otherwise price the whole 10% as shrimp).
//   R2  lexicon charities no charity span covers are added (C's "homeless shelter").
//   R3  a model pet/animal span must contain an animal noun; a pet may also be a capitalised
//       name right after "named"/"called"/an animal noun.
//   R5  a model charity span stays only if it is a known charity, looks like one, or sits in a
//       giving sentence.
import { ANIMAL_NOUN_RE, LEXICON, PET_NAME_BEFORE_RE } from "../engine/extract";
import type { Span, SpanKind } from "../engine/types";
import { MAX_CLIENT_SPANS } from "./client-spans";
import { spanThreshold, toSpans, type GlinerSpan, type RawEntity } from "./labels";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lab names that are also English words: match them only in this exact case. */
const CASE_SENSITIVE = new Set(["FAIR", "SSI", "METR", "MIRI", "xAI", "Mistral", "Cohere", "Inflection", "Conjecture"]);
const NONPROFIT_LABS = new Set(["miri", "redwood research", "apollo research", "metr", "conjecture", "epoch ai"]);

type Hit = [start: number, end: number];

function lexMatcher(words: string[]) {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const canon = new Map(sorted.map((w) => [w.toLowerCase(), w]));
  const re = new RegExp(`(?<![\\w-])(?:${sorted.map(esc).join("|")})(?![\\w-])`, "gi");
  return (text: string): Hit[] => {
    const out: Hit[] = [];
    for (const m of text.matchAll(re)) {
      const w = canon.get(m[0].toLowerCase());
      if (w && CASE_SENSITIVE.has(w) && m[0] !== w) continue;
      out.push([m.index!, m.index! + m[0].length]);
    }
    return out;
  };
}

export const labHits = lexMatcher(LEXICON.ai_lab);
export const charityHits = lexMatcher(LEXICON.charity);

const TWIN_KINDS: ReadonlySet<SpanKind> = new Set(["food", "hobby", "job"]);
const LAB_KILLS: ReadonlySet<SpanKind> = new Set(["employer", "job", "ai_lab", "hobby", "food"]);
const LAB_KILLS_CHARITY: ReadonlySet<SpanKind> = new Set([...LAB_KILLS, "charity"]);
const CHARITY_KILLS: ReadonlySet<SpanKind> = new Set(["employer", "food", "animal", "hobby", "job", "city"]);

const CHARITY_WORD_RE =
  /\b(foundation|fund|trust|society|league|project|institute|initiative|shelter|bank|nonprofit|charit\w*|welfare|relief|aid|cancer|children|humane|animals?|rescue|sanctuary|hospital|church|mission|army|cross|unicef|oxfam|spca|rspca|aclu|frontières|frontieres|borders|jude|purse|water|pledge|priorities|evaluators|equality|legion)\b/i;
const GIVE_CTX_RE = /\b(give|gives|gave|giving|donat\w*|donor|pledg\w*|tith\w*|contribut\w*|volunteer\w*|support\w*|fundrais\w*)\b/i;

const overlaps = (x: Span, [s, e]: Hit) => x.start < e && s < x.end;
const lex = (kind: SpanKind, text: string, [s, e]: Hit): Span => ({
  kind, text: text.slice(s, e), start: s, end: e, confidence: 1, source: "lexicon",
});

/** The sentence around `i` (bench `sentence`: split on . ! ? and newlines). */
function sentence(text: string, i: number): string {
  const a = Math.max(text.lastIndexOf(".", i - 1), text.lastIndexOf("!", i - 1), text.lastIndexOf("?", i - 1), text.lastIndexOf("\n", i - 1)) + 1;
  const ends = [".", "!", "?", "\n"].map((c) => text.indexOf(c, i)).filter((j) => j !== -1);
  return text.slice(a, ends.length ? Math.min(...ends) : text.length);
}

/** R1-R5 and the lexicon pass over engine spans; returns new spans sorted by (start, -end). */
export function applyRules(text: string, input: Span[]): Span[] {
  const orig = input.map((s) => ({ ...s }));

  // R4: same-range twins involving food/hobby/job keep the more confident kind.
  let spans = orig.filter(
    (x) =>
      !orig.some(
        (y) =>
          y !== x && y.start === x.start && y.end === x.end && y.kind !== x.kind && x.source === "gliner" && y.source === "gliner" &&
          (TWIN_KINDS.has(x.kind) || TWIN_KINDS.has(y.kind)) && y.confidence > x.confidence,
      ),
  );

  // R1: AI labs are a closed set.
  const labs = labHits(text);
  spans = spans.filter((x) => x.kind !== "ai_lab" || labs.some(([s, e]) => x.start <= s && e <= x.end + 1));
  for (const hit of labs) {
    const nonprofit = NONPROFIT_LABS.has(text.slice(hit[0], hit[1]).toLowerCase());
    if (nonprofit && spans.some((x) => x.kind === "charity" && overlaps(x, hit))) continue;
    const kills = nonprofit ? LAB_KILLS : LAB_KILLS_CHARITY;
    spans = spans.filter((x) => !(overlaps(x, hit) && kills.has(x.kind)));
    spans.push(lex("ai_lab", text, hit));
  }

  // Split: one charity span holding two or more lexicon charities becomes those charities.
  const charities = charityHits(text);
  spans = spans.flatMap((x) => {
    if (x.kind !== "charity") return [x];
    const inside = charities.filter(([s, e]) => x.start <= s && e <= x.end);
    return inside.length >= 2 ? inside.map((h) => lex("charity", text, h)) : [x];
  });

  // R2: lexicon charities that no charity span covers are added.
  for (const hit of charities) {
    if (spans.some((x) => x.kind === "charity" && overlaps(x, hit))) continue;
    spans = spans.filter((x) => !(overlaps(x, hit) && CHARITY_KILLS.has(x.kind)));
    spans.push(lex("charity", text, hit));
  }

  spans = spans.filter((x) => {
    if (x.source !== "gliner") return true;
    // R3: a model pet/animal span needs an animal noun (or is a pet's name).
    if (x.kind === "pet" || x.kind === "animal") {
      const named = x.kind === "pet" && /^\p{Lu}/u.test(x.text) && PET_NAME_BEFORE_RE.test(text.slice(Math.max(0, x.start - 30), x.start));
      return ANIMAL_NOUN_RE.test(x.text) || named;
    }
    // R5: a model charity span must look like a charity or sit in a giving sentence.
    if (x.kind === "charity") {
      return charityHits(x.text).length > 0 || CHARITY_WORD_RE.test(x.text) || GIVE_CTX_RE.test(sentence(text, x.start));
    }
    return true;
  });

  return spans.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Drop model spans under their kind's threshold (a stale client sent everything over a flat 0.7). */
export function applyThresholds(spans: Span[]): Span[] {
  return spans.filter((s) => s.source !== "gliner" || s.confidence >= spanThreshold(s.kind, s.text));
}

const toEngine = (g: GlinerSpan): Span => ({ kind: g.label, text: g.text, start: g.start, end: g.end, confidence: g.score, source: g.source });
const fromEngine = (s: Span): GlinerSpan => ({ label: s.kind, text: s.text, start: s.start, end: s.end, score: s.confidence, source: s.source });

/** Raw model entities (offsets into `text`) -> the spans the browser POSTs: toSpans, the rules, the size cap. */
export function finishSpans(raw: RawEntity[], text: string): GlinerSpan[] {
  let spans = applyRules(text, toSpans(raw, text).map(toEngine));
  if (spans.length > MAX_CLIENT_SPANS) {
    // Keep the surest spans so the Worker never rejects the array for its size.
    spans = [...spans].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_CLIENT_SPANS);
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
  }
  return spans.map(fromEngine);
}
