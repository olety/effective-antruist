import { describe, expect, test } from "bun:test";
import { judge } from "../src/engine/engine";
import { fallbackExtract } from "../src/engine/extract";
import type { JevResult, Span } from "../src/engine/types";
import { EXAMPLES } from "../src/examples";
import { CHUNK_CHARS, chunkText, extractChunked, MAX_CHUNKS } from "../src/gliner/chunks";
import { MAX_CLIENT_SPANS } from "../src/gliner/client-spans";
import { toSpans, type GlinerSpan, type RawEntity } from "../src/gliner/labels";
import { applyRules, finishSpans } from "../src/gliner/rules";
import { BIO_600, EMOJI_JA, PIGEONS, POLYCULE } from "../src/gliner/test-texts";

const [A, B, C] = EXAMPLES.map((e) => e.text);
const NO_JEV: JevResult = { ok: false, answers: {}, error: "test" };
const r = (label: string, text: string, start: number, end: number, score: number): RawEntity => ({ label, text, start, end, score });
const keys = (spans: GlinerSpan[]) => spans.map((s) => `${s.label}:${s.text}`);
const asEngine = (g: GlinerSpan[]): Span[] =>
  g.map((s) => ({ kind: s.label, text: s.text, start: s.start, end: s.end, confidence: s.score, source: s.source }));

// int8 small model on WASM, raw at threshold 0.5 (bench small_int8_wasm_raw_t05.jsonl, t001 = example A).
const RAW_A: RawEntity[] = [
  r("job title", "Staff engineer", 0, 14, 0.9930762234831203),
  r("employer or organisation", "Anthropic", 18, 27, 0.8047914396004214),
  r("AI lab", "Google Brain", 40, 52, 0.9394388360455871),
  r("charity or cause", "GiveWell and the Shrimp Welfare Project", 70, 109, 0.8968723925174081),
  r("donation amount", "10%", 63, 66, 0.9684000106044068),
  r("food eaten", "Shrimp", 87, 93, 0.794664914358273),
  r("food eaten", "Vegan", 111, 116, 0.9781955860528084),
  r("pet", "two cats", 156, 164, 0.9798374016447178),
  r("animal", "Shrimp", 87, 93, 0.5240327307169188),
  r("hobby", "ultramarathons", 123, 137, 0.9573159403073248),
  r("city or country", "SF", 148, 150, 0.9884006046783226),
];

// Browser runs (chunked, int8 WASM, 2026-09-25), and the pigeons shape the verifier found.
const at = (t: string, n: string) => [t.indexOf(n), t.indexOf(n) + n.length] as const;
// C with the model's "homeless shelter" charity (0.678) missing, as in the unchunked run.
const RAW_C: RawEntity[] = [
  r("food eaten", "chicken sandwich", ...at(C, "chicken sandwich"), 0.987),
  r("donation amount", "$20", ...at(C, "$20"), 0.979),
  r("employer or organisation", "fintech startup", ...at(C, "fintech startup"), 0.806),
  r("city or country", "Tokyo", ...at(C, "Tokyo"), 0.997),
];
const RAW_PIGEONS: RawEntity[] = [
  r("job title", "Retired nurse", ...at(PIGEONS, "Retired nurse"), 0.954),
  r("food eaten", "pigeons", ...at(PIGEONS, "pigeons"), 0.86),
  r("animal", "pigeons", ...at(PIGEONS, "pigeons"), 0.956),
  r("food eaten", "porridge", ...at(PIGEONS, "porridge"), 0.991),
];
const RAW_POLYCULE: RawEntity[] = [
  r("pet", "polycule of four", ...at(POLYCULE, "polycule of four"), 0.942),
  r("charity or cause", "GiveWell", ...at(POLYCULE, "GiveWell"), 0.981),
  r("city or country", "Berkeley", ...at(POLYCULE, "Berkeley"), 0.998),
];

describe("example A (browser spans price like the server)", () => {
  const spans = finishSpans(RAW_A, A);

  test("labs are ai_lab, the merged charity span is split into GiveWell and SWP", () => {
    const k = keys(spans);
    for (const want of ["ai_lab:Anthropic", "ai_lab:Google Brain", "charity:GiveWell", "charity:Shrimp Welfare Project",
      "donation:10%", "food:Vegan", "pet:two cats", "city:SF", "job:Staff engineer", "hobby:ultramarathons"]) {
      expect(k).toContain(want);
    }
    expect(k).not.toContain("employer:Anthropic");
    expect(k.some((x) => x.startsWith("charity:GiveWell and"))).toBe(false);
    expect(k.some((x) => x.startsWith("food:"))).toBe(true);
    expect(k).not.toContain("food:Shrimp");
    for (const s of spans) expect(A.slice(s.start, s.end)).toBe(s.text);
  });

  test("total matches the server (lexicon) path: ~1.79e7 insects under RP 2023, with a GiveWell line", () => {
    const browser = judge({ text: A, spans: asEngine(spans), extractor: "gliner", jev: NO_JEV });
    const server = judge({ text: A, spans: fallbackExtract(A), extractor: "fallback", jev: NO_JEV });
    const worth = browser.totals.bySource.rp2023.worth;
    expect(worth).toBeCloseTo(server.totals.bySource.rp2023.worth, 3);
    expect(worth).toBeGreaterThan(1.78e7);
    expect(worth).toBeLessThan(1.8e7);
    expect(browser.ledger.some((l) => l.jokeKey === "donation.givewell" && l.label.includes("GiveWell: lives saved"))).toBe(true);
    expect(browser.ledger.filter((l) => l.jokeKey === "donation.shrimp")).toHaveLength(1);
  });

  test("the rules are idempotent (the Worker runs them again)", () => {
    const once = asEngine(spans);
    expect(applyRules(A, once)).toEqual(once);
  });
});

describe("span rules", () => {
  test("example C gets its homeless shelter charity and keeps fintech startup (lexicon employer at 0.806)", () => {
    const k = keys(finishSpans(RAW_C, C));
    expect(k).toContain("charity:homeless shelter");
    expect(k).toContain("employer:fintech startup");
    const j = judge({ text: C, spans: asEngine(finishSpans(RAW_C, C)), extractor: "gliner", jev: NO_JEV });
    expect(j.ledger.some((l) => l.jokeKey === "charity.unrated" && l.label.includes("homeless shelter"))).toBe(true);
  });

  test("feeding the pigeons is not eating pigeons (higher-score animal twin wins)", () => {
    const k = keys(finishSpans(RAW_PIGEONS, PIGEONS));
    expect(k).toContain("animal:pigeons");
    expect(k).not.toContain("food:pigeons");
    expect(k).toContain("food:porridge");
  });

  test("the food twin loses even when the pet twin is under its own threshold (0.85)", () => {
    const raw = [r("food eaten", "pigeons", ...at(PIGEONS, "pigeons"), 0.82), r("pet", "pigeons", ...at(PIGEONS, "pigeons"), 0.84)];
    expect(keys(toSpans(raw, PIGEONS))).toEqual([]);
    const lower = [r("food eaten", "pigeons", ...at(PIGEONS, "pigeons"), 0.82), r("pet", "pigeons", ...at(PIGEONS, "pigeons"), 0.81)];
    expect(keys(toSpans(lower, PIGEONS))).toEqual(["food:pigeons"]);
  });

  test("my polycule of four is not four cats", () => {
    const spans = finishSpans(RAW_POLYCULE, POLYCULE);
    expect(spans.some((s) => s.label === "pet")).toBe(false);
    expect(keys(spans)).toEqual(expect.arrayContaining(["charity:GiveWell", "city:Berkeley"]));
  });

  test("pets need an animal noun, or a name after 'named'", () => {
    const t = "I have two rats, a parrot named Mango and a Birder badge.";
    const raw = [r("pet", "two rats", ...at(t, "two rats"), 0.9), r("pet", "Mango", ...at(t, "Mango"), 0.9), r("pet", "Birder", ...at(t, "Birder"), 0.9)];
    expect(keys(finishSpans(raw, t))).toEqual(["pet:two rats", "pet:Mango"]);
  });

  test("3 dogs passes at 0.833 (pet phrase), an odd pet word needs 0.85", () => {
    const raw = [r("pet", "3 dogs", ...at(B, "3 dogs"), 0.833)];
    expect(keys(finishSpans(raw, B))).toEqual(expect.arrayContaining(["pet:3 dogs"]));
    const t = "we keep bees on the roof";
    expect(keys(finishSpans([r("pet", "bees", ...at(t, "bees"), 0.84)], t))).toEqual([]);
  });

  test("ai_lab beats employer on the same range whatever the scores; unknown 'labs' are dropped", () => {
    const t = "ex Google Brain, now building a Chrome extension";
    const raw = [
      r("employer or organisation", "Google Brain", ...at(t, "Google Brain"), 0.99),
      r("AI lab", "Google Brain", ...at(t, "Google Brain"), 0.81),
      r("AI lab", "Chrome", ...at(t, "Chrome"), 0.95),
    ];
    expect(keys(finishSpans(raw, t))).toEqual(["ai_lab:Google Brain"]);
  });

  test("lowercase labs are found, English-word labs only in their own case", () => {
    const t = "building agents @ openai. that's fair, the mistral wind is cold";
    expect(keys(finishSpans([], t))).toEqual(["ai_lab:openai"]);
  });

  test("a charity span outside a giving sentence that looks like nothing is dropped (R5)", () => {
    const t = "I read Rest of World every day.";
    expect(keys(finishSpans([r("charity or cause", "Rest of World", ...at(t, "Rest of World"), 0.9)], t))).toEqual([]);
  });

  test("output is capped at MAX_CLIENT_SPANS", () => {
    const t = Array.from({ length: 100 }, (_, i) => `${i}%`).join(" ");
    const spans = finishSpans([], t);
    expect(spans.length).toBe(MAX_CLIENT_SPANS);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThan(spans[i - 1].start);
  });
});

describe("sentence chunks", () => {
  test("chunks are <= 200 chars, <= 6, cut at sentence ends and slice back to the text", () => {
    for (const t of [A, B, C, BIO_600, EMOJI_JA, "word ".repeat(400), "猫".repeat(700), "🐈".repeat(300)]) {
      const chunks = chunkText(t);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.length).toBeLessThanOrEqual(MAX_CHUNKS);
      for (const c of chunks) {
        expect(c.text.length).toBeLessThanOrEqual(CHUNK_CHARS);
        expect(t.slice(c.start, c.start + c.text.length)).toBe(c.text);
        expect(c.text).toBe(c.text.trim());
        // never a lone surrogate at either end
        expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(c.text)).toBe(false);
      }
    }
    expect(chunkText(A)).toEqual([{ text: A, start: 0 }]);
    const bio = chunkText(BIO_600);
    expect(bio.length).toBe(4);
    for (const c of bio.slice(0, -1)) expect(c.text).toMatch(/[.!?]$/);
  });

  test("entity offsets shift back into the full text, with emoji and Japanese", async () => {
    const needles = ["ラーメン", "Red Cross", "two cats", "🐈🐈", "猫", "Kyoto", "Google", "greyhound", "bees", "Biscuit"];
    const run = async (chunk: string): Promise<RawEntity[]> => {
      const out: RawEntity[] = [];
      for (const n of needles) {
        const i = chunk.indexOf(n);
        if (i >= 0) out.push(r("animal", n, i, i + n.length, 0.9));
      }
      // The runtime appends "." to a chunk and may report an end one past it.
      out.push(r("city or country", chunk.slice(-3) + ".", chunk.length - 3, chunk.length + 1, 0.9));
      return out;
    };
    for (const t of [EMOJI_JA, BIO_600]) {
      const raw = await extractChunked(t, run);
      expect(raw.length).toBeGreaterThan(2);
      for (const e of raw) {
        expect(t.slice(e.start, e.end)).toBe(e.text);
        expect(e.end).toBeLessThanOrEqual(t.length);
      }
      for (const n of needles.filter((n) => t.includes(n))) expect(raw.some((e) => e.text === n && e.start === t.indexOf(n))).toBe(true);
      for (const s of finishSpans(raw, t)) expect(t.slice(s.start, s.end)).toBe(s.text);
    }
  });

  test("the same label on the same range keeps the higher score", async () => {
    const t = "Tokyo.";
    const raw = await extractChunked(t, async () => [r("city or country", "Tokyo", 0, 5, 0.8), r("city or country", "Tokyo", 0, 5, 0.9)]);
    expect(raw).toEqual([r("city or country", "Tokyo", 0, 5, 0.9)]);
  });
});
