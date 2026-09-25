// Lexicon + regex fallback extractor. Used when GLINER_URL is unset or slow.
import type { Span, SpanKind } from "./types";

export const MAX_CHARS = 1500;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const LEXICON: Record<Exclude<SpanKind, "donation" | "money" | "pet">, string[]> = {
  ai_lab: [
    "Anthropic", "OpenAI", "Google DeepMind", "DeepMind", "Google Brain", "Meta AI", "FAIR", "xAI", "Mistral",
    "Cohere", "Inflection", "Character.AI", "Hugging Face", "Stability AI", "Safe Superintelligence", "SSI",
    "Thinking Machines", "MIRI", "Redwood Research", "Apollo Research", "METR", "Conjecture", "Reflection AI",
  ],
  charity: [
    "Shrimp Welfare Project", "GiveWell", "Against Malaria Foundation", "AMF", "GiveDirectly", "Malaria Consortium",
    "Helen Keller Intl", "New Incentives", "Open Philanthropy", "Coefficient Giving", "Rethink Priorities",
    "The Humane League", "Humane League", "Animal Charity Evaluators", "Good Food Institute", "Fish Welfare Initiative",
    "Wild Animal Initiative", "Insect Welfare Research Society", "80,000 Hours", "Giving What We Can",
    "Centre for Effective Altruism", "Longview Philanthropy", "Long-Term Future Fund", "LTFF", "EA Funds",
    "homeless shelter", "food bank", "Red Cross", "animal shelter", "church",
  ],
  food: [
    "chicken sandwich", "chicken nuggets", "fried chicken", "chicken", "steak", "beef", "burger", "burgers",
    "cheeseburger", "pork", "bacon", "ham", "sausage", "sausages", "salmon", "tuna", "sushi", "fish", "shrimp",
    "prawns", "prawn", "lobster", "crab", "eggs", "egg", "honey", "cheese", "milk", "vegan", "vegetarian",
    "tofu", "salad", "ramen", "pizza", "meat",
  ],
  animal: [
    "insects", "insect", "bugs", "bug", "bees", "bee", "ants", "ant", "crickets", "mosquitoes", "mosquito",
    "flies", "shrimps", "shrimp", "chickens", "cows", "pigs", "fish", "octopus", "beetle", "beetles",
  ],
  city: [
    "San Francisco", "SF", "Bay Area", "Berkeley", "Oakland", "New York", "NYC", "London", "Oxford", "Cambridge",
    "Tokyo", "Lisbon", "Berlin", "Paris", "Austin", "Seattle", "Boston", "Toronto", "Singapore", "Kyoto", "Osaka",
  ],
  hobby: [
    "ultramarathons", "ultramarathon", "marathons", "marathon", "running", "climbing", "bouldering", "chess",
    "poker", "surfing", "yoga", "cycling", "hiking", "gaming", "meditation", "jiu-jitsu", "BJJ", "piano", "synths",
  ],
  employer: ["Google", "Meta", "Microsoft", "Apple", "Amazon", "Stripe", "LinkedIn", "fintech startup", "startup"],
  job: [
    "staff engineer", "software engineer", "engineer", "indie hacker", "founder", "researcher", "designer",
    "product manager", "student", "nurse", "teacher", "doctor", "lawyer", "philosopher",
  ],
};

const PET_WORDS = "cats?|dogs?|kittens?|puppies|puppy|hamsters?|rabbits?|parrots?|goldfish|ferrets?";
const NUM_WORDS = "a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|my|our";
const PET_RE = new RegExp(`\\b(?:(?:${NUM_WORDS})\\s+)(?:\\w+\\s+)?(?:${PET_WORDS})\\b`, "gi");
export const MONEY_RE = /(?:[$£€¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?(?:\s?(?:MRR|ARR)\b)?|\b\d+(?:\.\d+)?\s?%)/g;
const GIVE_RE = /\b(give|gives|gave|giving|donat\w*|pledg\w*|tith\w*|contribut\w*)\b/i;

export function nearGive(text: string, start: number, end: number, window = 30): boolean {
  return GIVE_RE.test(text.slice(Math.max(0, start - window), end + 8));
}

/** Higher = wins an overlap. */
export const KIND_PRIORITY: Record<SpanKind, number> = {
  charity: 10, ai_lab: 9, donation: 8, money: 7, pet: 6, food: 5, animal: 4, employer: 3, job: 2, city: 1, hobby: 0,
};

/** Drop spans that overlap a higher-priority (or longer, same-kind) span. */
export function dedupeSpans(spans: Span[]): Span[] {
  const ranked = [...spans].sort(
    (a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Span[] = [];
  for (const s of ranked) {
    if (!kept.some((k) => k.start < s.end && s.start < k.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function fallbackExtract(input: string): Span[] {
  const text = input.slice(0, MAX_CHARS);
  const out: Span[] = [];
  for (const [kind, words] of Object.entries(LEXICON) as [SpanKind, string[]][]) {
    // Longest first so "chicken sandwich" beats "chicken".
    const sorted = [...words].sort((a, b) => b.length - a.length);
    const caseSensitive = kind === "ai_lab" || kind === "employer" || kind === "city";
    const re = new RegExp(`(?<![\\w-])(?:${sorted.map(esc).join("|")})(?![\\w-])`, caseSensitive ? "g" : "gi");
    for (const m of text.matchAll(re)) {
      out.push({ kind, text: m[0], start: m.index!, end: m.index! + m[0].length, confidence: 0.6, source: "lexicon" });
    }
  }
  for (const m of text.matchAll(PET_RE)) {
    out.push({ kind: "pet", text: m[0], start: m.index!, end: m.index! + m[0].length, confidence: 0.6, source: "regex" });
  }
  for (const m of text.matchAll(MONEY_RE)) {
    const s = m.index!, e = s + m[0].length;
    out.push({ kind: nearGive(text, s, e) ? "donation" : "money", text: m[0], start: s, end: e, confidence: 1, source: "regex" });
  }
  return dedupeSpans(out);
}
