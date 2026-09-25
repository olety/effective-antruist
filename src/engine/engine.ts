// Deterministic Rat World engine: spans + Jev answers -> insect-denominated ledger.
// Pure: no I/O. Every constant comes from ./sources (VERIFIED or flagged UNVERIFIED).
import {
  ANIMALS_PER_DOLLAR, ASSUMPTIONS, GIVEWELL_USD_PER_LIFE, HUMANS_ALIVE, INSECTS_ALIVE, SKITTLES_SHRIMP,
  WEIGHT_SOURCES, WEIGHT_SOURCE_IDS,
} from "./sources";
import { dedupeSpans } from "./extract";
import type {
  Aggregate, Band, JevResult, JevVerdict, Judgement, LedgerLine, Soldiers, SourceTotal, Span, Species,
  Totals, WeightSourceId,
} from "./types";

export const ARGUE_LOW = 0.2;
export const ARGUE_HIGH = 0.8;

/** The middle band: 0.2 <= p <= 0.8 means the soldiers argue. */
export function band(p: number): Band {
  if (!Number.isFinite(p)) return "argue";
  if (p < ARGUE_LOW) return "no";
  if (p > ARGUE_HIGH) return "yes";
  return "argue";
}

/** Insect-equivalents of `count` animals of `species` under one weight source. */
export function toInsects(species: Species, count: number, sourceId: WeightSourceId): number {
  const w = WEIGHT_SOURCES[sourceId].weights;
  return (count * w[species]) / w.insect;
}

function bySource(species: Species, count: number): Record<WeightSourceId, number> {
  return Object.fromEntries(WEIGHT_SOURCE_IDS.map((id) => [id, toInsects(species, count, id)])) as Record<
    WeightSourceId,
    number
  >;
}

// ---- parsing helpers ------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, my: 1, our: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function parseCount(s: string): number {
  const d = s.match(/\d+/);
  if (d) return Number(d[0]);
  // A count word beats a leading article or possessive: "my two cats" is 2, not 1.
  const low = s.toLowerCase();
  const w = low.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\b/) ?? low.match(/\b(a|an|one|my|our)\b/);
  if (w) return NUMBER_WORDS[w[1]];
  return /s\b/i.test(s.trim()) ? 2 : 1;
}

/** Dollars in a money span. Percent -> pledge placeholder (UNVERIFIED). */
export function parseUsd(s: string): { usd: number; monthly: boolean; percent: number | null } {
  const monthly = /MRR/i.test(s);
  const pct = s.match(/(\d+(?:\.\d+)?)\s?%/);
  if (pct) {
    const percent = Number(pct[1]);
    return { usd: percent * ASSUMPTIONS.pledgeUsdPerPercentPoint, monthly: false, percent };
  }
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?/);
  if (!m) return { usd: 0, monthly, percent: null };
  let usd = Number(m[1].replace(/,/g, ""));
  if (m[2]?.toLowerCase() === "k") usd *= 1e3;
  if (m[2]?.toLowerCase() === "m") usd *= 1e6;
  return { usd, monthly, percent: null };
}

function sentenceOf(text: string, pos: number): [number, number] {
  let a = pos;
  while (a > 0 && !/[.!?;\n]/.test(text[a - 1])) a--;
  let b = pos;
  while (b < text.length && !/[.!?;\n]/.test(text[b])) b++;
  return [a, b];
}

type FoodClass = "chicken" | "beef" | "pork" | "fish" | "shrimp" | "vegan" | "other";

export function classifyFood(s: string): FoodClass {
  const t = s.toLowerCase();
  if (/\bvegan|vegetarian|plant.based\b/.test(t)) return "vegan";
  if (/chicken|nugget|wings?\b/.test(t)) return "chicken";
  if (/steak|beef|burger|brisket|veal/.test(t)) return "beef";
  if (/pork|bacon|ham\b|sausage|salami/.test(t)) return "pork";
  if (/shrimp|prawn|lobster|crab|crayfish/.test(t)) return "shrimp";
  if (/salmon|tuna|sushi|fish|cod\b|sardine/.test(t)) return "fish";
  if (/\bmeat\b/.test(t)) return "chicken";
  return "other";
}

type CharityClass = { kind: "human"; } | { kind: "animal"; species: Species } | { kind: "unrated" };

export function classifyCharity(s: string): CharityClass {
  const t = s.toLowerCase();
  if (/shrimp/.test(t)) return { kind: "animal", species: "shrimp" };
  if (/insect|bug/.test(t)) return { kind: "animal", species: "insect" };
  if (/fish/.test(t)) return { kind: "animal", species: "fish" };
  if (/humane league|animal charity evaluators|good food institute|chicken/.test(t)) return { kind: "animal", species: "chicken" };
  if (/givewell|against malaria|\bamf\b|malaria consortium|helen keller|new incentives/.test(t)) return { kind: "human" };
  return { kind: "unrated" };
}

const DAILY_RE = /^[^.!?;\n]{0,25}\b(every ?day|daily|each day|every night|every meal)\b/i;

// ---- ledger ---------------------------------------------------------------

interface Draft {
  label: string;
  span: Span | null;
  species: Species;
  count: number; // signed: negative = debit
  note: string;
  citationId: string;
  jokeKey: string;
  countsInTotal?: boolean;
}

function zero(label: string, span: Span, jokeKey: string, citationId = "unpriced"): Draft {
  return { label, span, species: "insect", count: 0, note: "unpriced", citationId, jokeKey };
}

export function draftLedger(text: string, rawSpans: Span[], jev: JevResult): Draft[] {
  const spans = dedupeSpans(rawSpans);
  const drafts: Draft[] = [];
  drafts.push({
    label: "Being one human", span: null, species: "human", count: 1, note: "1 human",
    citationId: "weights", jokeKey: "base.human",
  });

  const doomerP = jev.answers.doomer?.type === "noul" ? jev.answers.doomer.noul : NaN;
  const charities = spans.filter((s) => s.kind === "charity");
  const funded = new Set<Span>();

  for (const s of spans) {
    switch (s.kind) {
      case "food": {
        const cls = classifyFood(s.text);
        const daily = DAILY_RE.test(text.slice(s.end));
        const mult = daily ? 365 : 1;
        const per = daily ? "a year" : "once";
        if (cls === "vegan") {
          const n = ASSUMPTIONS.veganServingsPerYear * ASSUMPTIONS.servings.chicken.count;
          drafts.push({
            label: `${s.text}: chickens spared`, span: s, species: "chicken", count: n,
            note: `${ASSUMPTIONS.veganServingsPerYear} chicken servings a year x ${ASSUMPTIONS.servings.chicken.count} chicken`,
            citationId: "assumptions", jokeKey: "food.vegan",
          });
        } else if (cls === "other") {
          drafts.push(zero(s.text, s, "food.other"));
        } else {
          const sv = ASSUMPTIONS.servings[cls];
          drafts.push({
            label: `${s.text} (${per})`, span: s, species: sv.species, count: -sv.count * mult,
            note: `${mult} serving(s) x ${sv.count} ${sv.species}`, citationId: "assumptions", jokeKey: `food.${cls}`,
          });
        }
        break;
      }
      case "pet": {
        const n = parseCount(s.text);
        const species: Species = /dog|pupp/i.test(s.text) ? "dog" : "cat";
        drafts.push({
          label: `${s.text}: dependants`, span: s, species, count: n, note: `${n} ${species}`,
          citationId: "weights", jokeKey: /cat|dog|pupp|kitt/i.test(s.text) ? `pet.${species}` : "pet.other",
        });
        break;
      }
      case "donation": {
        const { usd, percent } = parseUsd(s.text);
        const [a, b] = sentenceOf(text, s.start);
        const targets = charities.filter((c) => c.start >= a && c.end <= b);
        if (!targets.length) {
          drafts.push(zero(`${s.text} to nobody we can price`, s, "donation.orphan"));
          break;
        }
        const share = usd / targets.length;
        const amount = percent !== null ? `${percent}% (≈$${share.toLocaleString("en-US")}/yr, UNVERIFIED)` : `$${share.toLocaleString("en-US")}`;
        for (const c of targets) {
          funded.add(c);
          const cls = classifyCharity(c.text);
          if (cls.kind === "human") {
            const lives = share / GIVEWELL_USD_PER_LIFE;
            drafts.push({
              label: `${amount} to ${c.text}: lives saved`, span: c, species: "human", count: lives,
              note: `$${share} / $${GIVEWELL_USD_PER_LIFE} per life`, citationId: "givewell-cost-per-life",
              jokeKey: "donation.givewell",
            });
          } else if (cls.kind === "animal") {
            const per = ANIMALS_PER_DOLLAR[cls.species] ?? 0;
            drafts.push({
              label: `${amount} to ${c.text}: ${cls.species} helped`, span: c, species: cls.species, count: share * per,
              note: `$${share} x ${per} ${cls.species} per $`, citationId: "rp-moral-parliament-2025",
              jokeKey: `donation.${cls.species}`,
            });
          } else {
            drafts.push(zero(`${amount} to ${c.text}: not on the list`, c, "charity.unrated"));
          }
        }
        break;
      }
      case "money": {
        const { usd, monthly } = parseUsd(s.text);
        const yearly = monthly ? usd * 12 : usd;
        const per = ANIMALS_PER_DOLLAR.shrimp ?? 0;
        drafts.push({
          label: `${s.text}: shrimp not saved`, span: s, species: "shrimp", count: -yearly * per,
          note: `$${yearly.toLocaleString("en-US")}${monthly ? "/yr" : ""} x ${per} shrimp per $`,
          citationId: "rp-moral-parliament-2025", jokeKey: "money.hoarded", countsInTotal: false,
        });
        break;
      }
      case "ai_lab": {
        const b = band(doomerP);
        const key = Number.isFinite(doomerP) ? (b === "yes" ? "ailab.doomer" : b === "no" ? "ailab.accel" : "ailab.argue") : "ailab.unknown";
        drafts.push(zero(s.text, s, key));
        break;
      }
      case "employer": drafts.push(zero(s.text, s, "employer.generic")); break;
      case "job": drafts.push(zero(s.text, s, "job.generic")); break;
      case "city": drafts.push(zero(s.text, s, "city.generic")); break;
      case "hobby": drafts.push(zero(s.text, s, "hobby.generic")); break;
      case "animal": drafts.push(zero(s.text, s, "animal.mention")); break;
      case "charity": break; // handled after the loop
    }
  }
  for (const c of charities) {
    if (!funded.has(c)) drafts.push(zero(`${c.text}: admired, not funded`, c, "charity.nodonation"));
  }

  const sk = jev.answers.skittles;
  if (sk?.type === "noul") {
    drafts.push({
      label: `Skittles test: p=${sk.noul.toFixed(2)} of sparing 10^10 shrimp`, span: null, species: "shrimp",
      count: sk.noul * SKITTLES_SHRIMP, note: `${sk.noul} x 10^10 shrimp`, citationId: "jev-skittles",
      jokeKey: `jev.skittles.${band(sk.noul)}`, countsInTotal: false,
    });
  }
  return drafts.sort((x, y) => (x.span?.start ?? -1) - (y.span?.start ?? -1));
}

function finalize(d: Draft, selected: WeightSourceId): LedgerLine {
  const all = bySource(d.species, d.count);
  return {
    label: d.label,
    spanStart: d.span?.start ?? -1,
    spanEnd: d.span?.end ?? -1,
    insects: all[selected],
    insectsBySource: all,
    citationId: d.citationId === "weights" ? WEIGHT_SOURCES[selected].citationId : d.citationId,
    jokeKey: d.jokeKey,
    countsInTotal: d.countsInTotal ?? true,
    working: { species: d.species, count: d.count, note: d.note },
  };
}

// ---- Jev verdicts ---------------------------------------------------------

export function verdicts(jev: JevResult): JevVerdict[] {
  const out: JevVerdict[] = [];
  for (const [id, a] of Object.entries(jev.answers)) {
    if (a.type === "noul") out.push({ id, p: a.noul, band: band(a.noul), detail: `p(true)=${a.noul}` });
    else if (a.type === "choice") {
      const p = a.probabilities?.[a.choice] ?? a.confidence;
      out.push({ id, p, band: band(p), detail: `${a.choice} (${p})` });
    } else if (a.type === "score") {
      out.push({ id, p: a.confidence, band: band(a.confidence), detail: `score ${a.score} (${a.legend?.[String(Math.round(a.score))] ?? "?"})` });
    }
  }
  return out;
}

export function soldiers(jev: JevResult): Soldiers {
  const circle = jev.answers.circle;
  const bugsP = circle?.type === "score" ? Math.max(0, Math.min(1, circle.score / 6)) : NaN;
  const sk = jev.answers.skittles;
  const shrimpP = sk?.type === "noul" ? sk.noul : NaN;
  const bugs: JevVerdict = {
    id: "bugs", p: bugsP, band: band(bugsP),
    detail: Number.isFinite(bugsP) ? `moral circle ${circle?.type === "score" ? circle.score : "?"}/6` : "Jev offline",
  };
  const shrimps: JevVerdict = {
    id: "shrimps", p: shrimpP, band: band(shrimpP),
    detail: Number.isFinite(shrimpP) ? `Skittles p=${shrimpP}` : "Jev offline",
  };
  return { bugs, shrimps, argue: bugs.band === "argue" || shrimps.band === "argue" };
}

// ---- totals ---------------------------------------------------------------

export function totals(lines: LedgerLine[], selected: WeightSourceId): Totals {
  const bySrc = {} as Record<WeightSourceId, SourceTotal>;
  const agg = {} as Record<WeightSourceId, Aggregate>;
  for (const id of WEIGHT_SOURCE_IDS) {
    const w = WEIGHT_SOURCES[id].weights.insect;
    let worth = 0, hypothetical = 0;
    for (const l of lines) (l.countsInTotal ? (worth += l.insectsBySource[id]) : (hypothetical += l.insectsBySource[id]));
    bySrc[id] = { sourceId: id, humanInInsects: 1 / w, worth, hypothetical };
    const mass = INSECTS_ALIVE * w;
    agg[id] = { sourceId: id, insectsAlive: INSECTS_ALIVE, humansAlive: HUMANS_ALIVE, insectWeight: w, insectMoralMass: mass, ratio: mass / HUMANS_ALIVE };
  }
  return { selected, bySource: bySrc, aggregate: agg };
}

export function judge(args: {
  text: string;
  spans: Span[];
  extractor: "gliner" | "fallback";
  jev: JevResult;
  selected?: WeightSourceId;
}): Judgement {
  const selected = args.selected ?? "rp2023";
  const ledger = draftLedger(args.text, args.spans, args.jev).map((d) => finalize(d, selected));
  const caste = args.jev.answers.caste?.type === "choice" ? args.jev.answers.caste.choice : null;
  return {
    text: args.text,
    spans: dedupeSpans(args.spans),
    extractor: args.extractor,
    jev: args.jev,
    verdicts: verdicts(args.jev),
    soldiers: soldiers(args.jev),
    caste,
    ledger,
    totals: totals(ledger, selected),
  };
}

/** Re-point an existing judgement at another weight source (client-side switch, no refetch). */
export function reweigh(j: Judgement, selected: WeightSourceId): Judgement {
  const ledger = j.ledger.map((l) => ({
    ...l,
    insects: l.insectsBySource[selected],
    citationId: l.jokeKey === "base.human" || l.jokeKey.startsWith("pet.") ? WEIGHT_SOURCES[selected].citationId : l.citationId,
  }));
  return { ...j, ledger, totals: totals(ledger, selected) };
}
