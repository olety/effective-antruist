import { describe, expect, test } from "bun:test";
import { band, judge, parseCount, parseUsd, reweigh, toInsects } from "../src/engine/engine";
import { fallbackExtract } from "../src/engine/extract";
import { WEIGHT_SOURCES } from "../src/engine/sources";
import type { JevResult } from "../src/engine/types";
import { EXAMPLES } from "../src/examples";
import { COPY } from "../src/copy";

const [A, B, C] = EXAMPLES.map((e) => e.text);
const NO_JEV: JevResult = { ok: false, answers: {}, error: "test" };

// Live Jev answer for example A, captured 2026-09-25 (jev-1.13.0).
const JEV_A: JevResult = {
  ok: true,
  model: "jev-1.13.0",
  answers: {
    caste: { type: "choice", choice: "effective altruist", confidence: 0.89, probabilities: { "effective altruist": 0.91, "shrimp maximalist": 0.09 } },
    circle: { type: "score", score: 4.95, confidence: 0.96, legend: { "5": "shrimp" }, probabilities: { "5": 0.97 } },
    skittles: { type: "noul", noul: 0.88 },
    doomer: { type: "noul", noul: 0.5 },
  },
};

describe("band", () => {
  test("middle band is 0.2..0.8 inclusive", () => {
    expect(band(0.19)).toBe("no");
    expect(band(0.2)).toBe("argue");
    expect(band(0.5)).toBe("argue");
    expect(band(0.8)).toBe("argue");
    expect(band(0.81)).toBe("yes");
    expect(band(NaN)).toBe("argue");
  });
});

describe("parsers", () => {
  test("parseCount", () => {
    expect(parseCount("two cats")).toBe(2);
    expect(parseCount("3 dogs")).toBe(3);
    expect(parseCount("my cat")).toBe(1);
    expect(parseCount("my two cats")).toBe(2);
    expect(parseCount("our three dogs")).toBe(3);
  });
  test("parseUsd", () => {
    expect(parseUsd("$20").usd).toBe(20);
    expect(parseUsd("$4k MRR")).toMatchObject({ usd: 4000, monthly: true });
    expect(parseUsd("10%").percent).toBe(10);
  });
});

describe("weights", () => {
  test("a human in insects is 1 / insect weight", () => {
    expect(toInsects("human", 1, "rp2023")).toBeCloseTo(1 / 0.013);
    expect(toInsects("human", 1, "rpMean")).toBeCloseTo(5);
    expect(toInsects("human", 1, "neurons")).toBeCloseTo(1 / 0.00057);
  });
  test("verified values are wired", () => {
    expect(WEIGHT_SOURCES.rp2023.weights.shrimp).toBe(0.031);
    expect(WEIGHT_SOURCES.rpMean.weights.chicken).toBe(0.46);
    expect(WEIGHT_SOURCES.neurons.weights.shrimp).toBe(0.00088);
  });
});

describe("ledger", () => {
  test("every line with a span points at real text, has a citation and a joke", () => {
    for (const t of [A, B, C]) {
      const j = judge({ text: t, spans: fallbackExtract(t), extractor: "fallback", jev: NO_JEV });
      expect(j.ledger.length).toBeGreaterThan(3);
      for (const l of j.ledger) {
        expect(l.citationId).toBeTruthy();
        expect(COPY[l.jokeKey] ?? l.jokeKey.startsWith("jev.")).toBeTruthy();
        if (l.spanStart >= 0) expect(l.spanEnd).toBeGreaterThan(l.spanStart);
        expect(Number.isFinite(l.insects)).toBe(true);
      }
    }
  });

  test("example A: 10% split across GiveWell and SWP", () => {
    const j = judge({ text: A, spans: fallbackExtract(A), extractor: "fallback", jev: JEV_A });
    const swp = j.ledger.find((l) => l.jokeKey === "donation.shrimp")!;
    const gw = j.ledger.find((l) => l.jokeKey === "donation.givewell")!;
    // $10,000 placeholder pledge / 2 = $5,000 each.
    expect(swp.working.count).toBe(5000 * 1500);
    expect(gw.working.count).toBeCloseTo(5000 / 5500);
    expect(A.slice(swp.spanStart, swp.spanEnd)).toBe("Shrimp Welfare Project");
    expect(j.caste).toBe("effective altruist");
    expect(j.soldiers.shrimps.band).toBe("yes");
    expect(j.soldiers.bugs.band).toBe("yes"); // 4.95 / 6 = 0.825
    const lab = j.ledger.find((l) => l.label === "Anthropic")!;
    expect(lab.jokeKey).toBe("ailab.argue"); // doomer p = 0.5 -> the soldiers argue
    const sk = j.ledger.find((l) => l.jokeKey.startsWith("jev.skittles"))!;
    expect(sk.countsInTotal).toBe(false);
  });

  test("example B: daily steak is a debit x365, MRR is hypothetical", () => {
    const j = judge({ text: B, spans: fallbackExtract(B), extractor: "fallback", jev: NO_JEV });
    const steak = j.ledger.find((l) => l.jokeKey === "food.beef")!;
    expect(steak.working.count).toBeCloseTo(-0.001 * 365);
    expect(steak.insects).toBeLessThan(0);
    const mrr = j.ledger.find((l) => l.jokeKey === "money.hoarded")!;
    expect(mrr.countsInTotal).toBe(false);
    expect(mrr.working.count).toBe(-4000 * 12 * 1500);
    expect(j.soldiers.argue).toBe(true); // Jev offline -> soldiers argue
  });

  test("example C: $20 to a homeless shelter is unrated (0 insects)", () => {
    const j = judge({ text: C, spans: fallbackExtract(C), extractor: "fallback", jev: NO_JEV });
    const shelter = j.ledger.find((l) => l.jokeKey === "charity.unrated")!;
    expect(shelter.insects).toBe(0);
    expect(j.ledger.find((l) => l.jokeKey === "food.chicken")!.insects).toBeLessThan(0);
  });

  test("totals: worth excludes hypotheticals; reweigh switches source", () => {
    const j = judge({ text: A, spans: fallbackExtract(A), extractor: "fallback", jev: JEV_A });
    const sum = j.ledger.filter((l) => l.countsInTotal).reduce((a, l) => a + l.insects, 0);
    expect(j.totals.bySource.rp2023.worth).toBeCloseTo(sum);
    const r = reweigh(j, "neurons");
    expect(r.totals.selected).toBe("neurons");
    expect(r.ledger[0].insects).toBeCloseTo(1 / 0.00057);
  });

  test("aggregate: insects outweigh humans under every source", () => {
    const j = judge({ text: C, spans: [], extractor: "fallback", jev: NO_JEV });
    for (const a of Object.values(j.totals.aggregate)) expect(a.ratio).toBeGreaterThan(1);
    expect(j.totals.aggregate.neurons.insectMoralMass).toBeCloseTo(1e19 * 0.00057);
  });
});
