import { describe, expect, test } from "bun:test";
import { judge } from "../src/engine/engine";
import { fallbackExtract } from "../src/engine/extract";
import type { JevResult } from "../src/engine/types";
import { EXAMPLES } from "../src/examples";
import { JOKES, OWNER_LINES, ownerLinesIn, pickJoke } from "../src/copy";
import { pickLines, reaction } from "../src/verdict";

// Jev's live answers for example C and the net-negative shrimp text, captured 2026-09-25 (jev-1.13.0).
const jev = (caste: string, circle: number, skittles: number, doomer: number, meat: number): JevResult => ({
  ok: true,
  model: "jev-1.13.0",
  answers: {
    caste: { type: "choice", choice: caste, confidence: 0.8, probabilities: { [caste]: 0.8 } },
    circle: { type: "score", score: circle, confidence: 0.9, legend: {}, probabilities: {} },
    skittles: { type: "noul", noul: skittles },
    doomer: { type: "noul", noul: doomer },
    meat: { type: "noul", noul: meat },
  },
});

const C = EXAMPLES[2].text;
const NEG = "I eat shrimp every day and I think AI will kill us all. I work on AI safety.";

/** Every line one screen shows: the shout, its caption and each shown ledger line's joke. */
function screen(text: string, j: JevResult): string[] {
  const res = judge({ text, spans: fallbackExtract(text), extractor: "fallback", jev: j, selected: "rp2023" });
  const used = new Set<string>();
  const r = reaction(res, (n) => String(Math.round(n)), used);
  const jokes = pickLines(res).map((i) => pickJoke(res.ledger[i].jokeKey, used));
  return [r.line, r.caption, ...jokes].filter(Boolean);
}

describe("one payoff per screen", () => {
  for (const [name, text, j] of [
    ["example C (NOOO, the chicken sandwich)", C, jev("normie", 2.35, 0.38, 0.1, 0.97)],
    ["net negative (NOOO, shrimp every day)", NEG, jev("AI doomer", 1.97, 0.38, 0.95, 0.94)],
  ] as const) {
    test(name, () => {
      const lines = screen(text, j);
      expect(new Set(lines).size).toBe(lines.length);
      for (const o of OWNER_LINES) expect(lines.filter((l) => ownerLinesIn(l).includes(o)).length).toBeLessThanOrEqual(1);
      expect(lines[0].startsWith("NOOO")).toBe(true);
    });
  }
  test("the jokes table still carries a NOOO-free alt for chicken and shrimp", () => {
    for (const k of ["food.chicken", "food.shrimp"]) expect([JOKES[k].line, ...JOKES[k].alts].some((s) => !ownerLinesIn(s).length)).toBe(true);
  });
});
