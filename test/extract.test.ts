import { describe, expect, test } from "bun:test";
import { dedupeSpans, fallbackExtract, nearGive } from "../src/engine/extract";
import { EXAMPLES } from "../src/examples";

const [A, B, C] = EXAMPLES.map((e) => e.text);
const kinds = (t: string) => fallbackExtract(t).map((s) => `${s.kind}:${s.text}`);

describe("fallback extractor", () => {
  test("offsets match the text", () => {
    for (const t of [A, B, C]) for (const s of fallbackExtract(t)) expect(t.slice(s.start, s.end)).toBe(s.text);
  });

  test("example A: labs, charities, diet, pets, city", () => {
    const k = kinds(A);
    for (const want of ["ai_lab:Anthropic", "ai_lab:Google Brain", "donation:10%", "charity:GiveWell",
      "charity:Shrimp Welfare Project", "food:Vegan", "hobby:ultramarathons", "city:SF", "pet:two cats"]) {
      expect(k).toContain(want);
    }
    // "Shrimp" inside the charity name is not a separate animal span.
    expect(k).not.toContain("animal:Shrimp");
  });

  test("example B: $4k MRR is money, not a donation", () => {
    const k = kinds(B);
    expect(k).toContain("money:$4k MRR");
    expect(k.some((x) => x.startsWith("donation:"))).toBe(false);
    expect(k).toContain("food:steak");
    expect(k).toContain("pet:3 dogs");
    expect(k).toContain("city:Lisbon");
  });

  test("example C: $20 given is a donation; chicken sandwich is one food span", () => {
    const k = kinds(C);
    expect(k).toContain("donation:$20");
    expect(k).toContain("food:chicken sandwich");
    expect(k).not.toContain("food:chicken");
    expect(k).toContain("charity:homeless shelter");
    expect(k).toContain("city:Tokyo");
  });

  test("input is capped at 1500 chars", () => {
    const long = "steak ".repeat(1000);
    expect(Math.max(...fallbackExtract(long).map((s) => s.end))).toBeLessThanOrEqual(1500);
  });

  test("nearGive window", () => {
    expect(nearGive("I donate 10% to X", 9, 12)).toBe(true);
    expect(nearGive("we make $4k MRR", 8, 15)).toBe(false);
  });

  test("dedupe keeps the higher-priority span", () => {
    const out = dedupeSpans([
      { kind: "employer", text: "Google Brain", start: 0, end: 12, confidence: 1, source: "gliner" },
      { kind: "ai_lab", text: "Google Brain", start: 0, end: 12, confidence: 1, source: "gliner" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("ai_lab");
  });
});
