// Shared types for the Rat World pipeline: spans -> Jev -> ledger -> screen.

export type SpanKind =
  | "food" | "animal" | "pet" | "donation" | "money" | "employer" | "ai_lab"
  | "charity" | "city" | "hobby" | "job";

export interface Span {
  kind: SpanKind;
  text: string;
  start: number; // char offset, inclusive
  end: number; // char offset, exclusive
  confidence: number;
  source: "gliner" | "regex" | "lexicon";
}

export type Species = "human" | "chicken" | "pig" | "cow" | "fish" | "shrimp" | "insect" | "cat" | "dog";

export type WeightSourceId = "rp2023" | "rpMean" | "neurons";

export interface WeightSource {
  id: WeightSourceId;
  name: string;
  citationId: string;
  /** Welfare range relative to a human (human = 1). */
  weights: Record<Species, number>;
  /** Species whose weight is borrowed from another species in this source. */
  proxies: Partial<Record<Species, string>>;
}

export type Band = "yes" | "no" | "argue";

export interface JevNoul { type: "noul"; noul: number }
export interface JevChoice { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
export interface JevScore { type: "score"; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> }
export type JevAnswer = JevNoul | JevChoice | JevScore;

export interface JevResult {
  ok: boolean;
  model?: string;
  answers: Record<string, JevAnswer>;
  ms?: number;
  error?: string;
}

export interface JevVerdict {
  id: string;
  p: number; // the probability-like value that picks the band
  band: Band;
  detail: string;
}

export interface LedgerLine {
  label: string;
  spanStart: number; // -1 when the line has no span (base worth, Jev-only lines)
  spanEnd: number;
  /** Insect-equivalents under the selected weight source. Positive = credit. */
  insects: number;
  insectsBySource: Record<WeightSourceId, number>;
  citationId: string;
  jokeKey: string;
  /** Hypothetical lines are shown but kept out of the total. */
  countsInTotal: boolean;
  /** Species-level working, so the screen can show the maths. */
  working: { species: Species; count: number; note: string };
}

export interface SourceTotal {
  sourceId: WeightSourceId;
  humanInInsects: number; // 1 / insect weight
  worth: number; // sum of countsInTotal lines
  hypothetical: number; // sum of the rest
}

export interface Aggregate {
  sourceId: WeightSourceId;
  insectsAlive: number;
  humansAlive: number;
  insectWeight: number;
  insectMoralMass: number; // insectsAlive * insectWeight (human-equivalents)
  ratio: number; // insectMoralMass / humansAlive
}

export interface Totals {
  selected: WeightSourceId;
  bySource: Record<WeightSourceId, SourceTotal>;
  aggregate: Record<WeightSourceId, Aggregate>;
}

export interface Soldiers {
  bugs: JevVerdict; // soldier A: "BUG LIVES MATTER!"
  shrimps: JevVerdict; // soldier B: "SAVE THE SHRIMPS!"
  argue: boolean; // true when either soldier sits in the middle band
}

export interface Judgement {
  text: string;
  spans: Span[];
  extractor: "gliner" | "fallback";
  jev: JevResult;
  verdicts: JevVerdict[];
  soldiers: Soldiers;
  caste: string | null;
  ledger: LedgerLine[];
  totals: Totals;
}
