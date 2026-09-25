import { afterEach, describe, expect, test } from "bun:test";
import worker, { type Env } from "../worker/index";
import { MAX_CLIENT_SPANS, parseClientSpans } from "../src/gliner/client-spans";
import { JEV_URL } from "../src/engine/jev";
import { EXAMPLES } from "../src/examples";
import { clearJevMemo } from "../worker/jev-memo";

const [A, B, C] = EXAMPLES.map((e) => e.text);
const ASSETS = { fetch: async () => new Response("asset") } as unknown as Fetcher;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function judge(body: unknown, env: Partial<Env> = {}) {
  const req = new Request("http://x/api/judge", { method: "POST", body: JSON.stringify(body) });
  const res = await worker.fetch(req, { ASSETS, ...env } as Env);
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

// What src/gliner returns for example B (browser run, 2026-09-25).
const at = (text: string, needle: string) => text.indexOf(needle);
const browserSpansB = [
  { label: "job", text: "indie hacker", start: 0, end: 12, score: 0.994, source: "gliner" },
  { label: "city", text: "Lisbon", start: at(B, "Lisbon"), end: at(B, "Lisbon") + 6, score: 0.879, source: "gliner" },
  { label: "money", text: "$4k MRR", start: at(B, "$4k MRR"), end: at(B, "$4k MRR") + 7, score: 1, source: "regex" },
  { label: "food", text: "steak", start: at(B, "steak"), end: at(B, "steak") + 5, score: 0.963, source: "gliner" },
  { label: "pet", text: "3 dogs", start: at(B, "3 dogs"), end: at(B, "3 dogs") + 6, score: 0.833, source: "gliner" },
];

describe("parseClientSpans", () => {
  test("accepts the src/gliner shape and re-reads text from the offsets", () => {
    const out = parseClientSpans([{ label: "food", text: "WRONG", start: at(B, "steak"), end: at(B, "steak") + 5, score: 0.9, source: "gliner" }], B)!;
    expect(out).toEqual([{ kind: "food", text: "steak", start: at(B, "steak"), end: at(B, "steak") + 5, confidence: 0.9, source: "gliner" }]);
  });

  test("accepts the engine shape", () => {
    const out = parseClientSpans([{ kind: "city", start: 0, end: 5, confidence: 0.8, source: "regex" }], "Tokyo rocks")!;
    expect(out[0]).toMatchObject({ kind: "city", text: "Tokyo", source: "regex" });
  });

  test("drops out-of-range, empty and unknown-kind spans instead of clamping", () => {
    const out = parseClientSpans([
      { label: "city", start: -5, end: 3, score: 0.9 },
      { label: "food", start: 9, end: 999, score: 0.9 },
      { label: "food", start: 50, end: 60, score: 0.9 },
      { label: "wizard", start: 0, end: 3, score: 0.9 },
      { label: "food", start: 4, end: 2, score: 0.9 },
      { label: "city", start: 0, end: 3, score: 2 },
      { label: "food", start: 9, end: 12, score: -1, source: "lexicon" },
    ], "abcdefghijkl")!;
    expect(out).toEqual([
      { kind: "city", text: "abc", start: 0, end: 3, confidence: 1, source: "gliner" },
      { kind: "food", text: "jkl", start: 9, end: 12, confidence: 0, source: "lexicon" },
    ]);
  });

  test("accepts up to MAX_CLIENT_SPANS (60) spans", () => {
    expect(MAX_CLIENT_SPANS).toBe(60);
    const ok = Array.from({ length: MAX_CLIENT_SPANS }, () => ({ label: "food", start: 0, end: 1, score: 1 }));
    expect(parseClientSpans(ok, "some text")).toHaveLength(MAX_CLIENT_SPANS);
  });

  test("rejects malformed input", () => {
    for (const bad of [
      "spans", 42, {}, [null], ["x"],
      [{ label: 3, start: 0, end: 1, score: 1 }],
      [{ label: "food", start: "0", end: 1, score: 1 }],
      [{ label: "food", start: 0, end: Number.NaN, score: 1 }],
      [{ label: "food", start: 0, end: 1 }],
      Array.from({ length: MAX_CLIENT_SPANS + 1 }, () => ({ label: "food", start: 0, end: 1, score: 1 })),
    ]) {
      expect(parseClientSpans(bad, "some text")).toBeNull();
    }
  });

  test("an empty array is well-formed", () => {
    expect(parseClientSpans([], "x")).toEqual([]);
  });
});

describe("POST /api/judge with browser spans", () => {
  test("uses the spans and never calls GLINER_URL", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (u: string | URL | Request) => {
      calls.push(String(u));
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    const { status, json } = await judge({ text: B, spans: browserSpansB }, { GLINER_URL: "http://gliner.invalid" });
    expect(status).toBe(200);
    expect(calls).toEqual([]);
    expect(json.extractor).toBe("gliner");
    expect(json.extractorNote).toBe("spans from the browser");
    expect(json.spans.map((s: any) => `${s.kind}:${s.text}`)).toEqual(["job:indie hacker", "city:Lisbon", "money:$4k MRR", "food:steak", "pet:3 dogs"]);
    expect(json.ledger.some((l: any) => l.spanStart === at(B, "steak"))).toBe(true);
  });

  test("malformed spans fall back to the server path (GLINER_URL, then lexicon)", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (u: string | URL | Request) => {
      calls.push(String(u));
      return new Response("nope", { status: 503 });
    }) as typeof fetch;
    const { json } = await judge({ text: B, spans: [{ label: "food", start: "x" }] }, { GLINER_URL: "http://gliner.invalid" });
    expect(calls).toEqual(["http://gliner.invalid/extract"]);
    expect(json.extractor).toBe("fallback");
    expect(json.extractorNote).toStartWith("browser spans rejected; GLiNER failed");
  });

  test("no spans keeps the old behaviour", async () => {
    const { json } = await judge({ text: A });
    expect(json.extractor).toBe("fallback");
    expect(json.extractorNote).toBe("GLINER_URL unset");
  });

  test("the response shape does not change", async () => {
    const withSpans = await judge({ text: B, spans: browserSpansB });
    const without = await judge({ text: B });
    expect(Object.keys(withSpans.json).sort()).toEqual(Object.keys(without.json).sort());
    for (const k of Object.keys(without.json)) {
      expect([k, typeof withSpans.json[k]]).toEqual([k, typeof without.json[k]]);
    }
  });

  test("spans past the 1500-char cap are dropped, not clamped", async () => {
    const text = "steak ".repeat(400); // 2400 chars
    const { json } = await judge({ text, spans: [{ label: "food", start: 1497, end: 1600, score: 0.9 }, { label: "food", start: 0, end: 5, score: 0.9 }] });
    expect(json.truncated).toBe(true);
    expect(json.spans).toEqual([{ kind: "food", text: "steak", start: 0, end: 5, confidence: 0.9, source: "gliner" }]);
  });

  test("a stale client's merged charity span still prices A like the server", async () => {
    // Old browser output (flat 0.7, no rules): Anthropic as employer, both charities in one span.
    const stale = [
      { label: "job", start: 0, end: 14, score: 0.993, source: "gliner" },
      { label: "employer", start: 18, end: 27, score: 0.805, source: "gliner" },
      { label: "ai_lab", start: 40, end: 52, score: 0.939, source: "gliner" },
      { label: "donation", start: 63, end: 66, score: 0.968, source: "gliner" },
      { label: "charity", start: 70, end: 109, score: 0.897, source: "gliner" },
      { label: "food", start: 87, end: 93, score: 0.795, source: "gliner" },
      { label: "food", start: 111, end: 116, score: 0.978, source: "gliner" },
      { label: "hobby", start: 123, end: 137, score: 0.957, source: "gliner" },
      { label: "city", start: 148, end: 150, score: 0.988, source: "gliner" },
      { label: "pet", start: 156, end: 164, score: 0.98, source: "gliner" },
    ];
    const browser = await judge({ text: A, spans: stale });
    const server = await judge({ text: A });
    const k = browser.json.spans.map((s: any) => `${s.kind}:${s.text}`);
    expect(k).toEqual(expect.arrayContaining(["ai_lab:Anthropic", "charity:GiveWell", "charity:Shrimp Welfare Project"]));
    expect(browser.json.totals.bySource.rp2023.worth).toBeCloseTo(server.json.totals.bySource.rp2023.worth, 3);
    expect(browser.json.totals.bySource.rp2023.worth).toBeGreaterThan(1.78e7);
    expect(browser.json.totals.bySource.rp2023.worth).toBeLessThan(1.8e7);
    expect(browser.json.ledger.some((l: any) => l.jokeKey === "donation.givewell")).toBe(true);
  });

  test("C with no model charity span gets its homeless shelter from the lexicon pass", async () => {
    const at = (n: string) => [C.indexOf(n), C.indexOf(n) + n.length];
    const [s1, e1] = at("chicken sandwich"), [s2, e2] = at("$20");
    const { json } = await judge({ text: C, spans: [
      { label: "food", start: s1, end: e1, score: 0.987, source: "gliner" },
      { label: "donation", start: s2, end: e2, score: 0.979, source: "gliner" },
    ] });
    expect(json.spans.map((s: any) => `${s.kind}:${s.text}`)).toContain("charity:homeless shelter");
    expect(json.ledger.some((l: any) => l.jokeKey === "charity.unrated")).toBe(true);
  });
});

describe("Jev memo", () => {
  const jevAnswer = (n: number) => ({
    model: "jev-test",
    answers: {
      caste: { type: "choice", choice: "normie", confidence: n, probabilities: { normie: n } },
      skittles: { type: "noul", noul: n },
    },
  });

  test("the same text gets the same answers from one Jev call; other text calls again", async () => {
    clearJevMemo();
    let calls = 0;
    globalThis.fetch = (async (u: string | URL | Request) => {
      if (String(u) !== JEV_URL) return new Response("{}", { status: 404 });
      calls++;
      return Response.json(jevAnswer(calls / 10));
    }) as typeof fetch;
    const env = { JEV_KEY: "test-key" };
    const first = await judge({ text: B }, env);
    const again = await judge({ text: B, spans: browserSpansB }, env);
    expect(calls).toBe(1);
    expect(again.json.jev.answers).toEqual(first.json.jev.answers);
    expect(again.json.caste).toBe("normie");
    expect(again.json.ledger.find((l: any) => l.jokeKey.startsWith("jev.skittles")).label).toBe(
      first.json.ledger.find((l: any) => l.jokeKey.startsWith("jev.skittles")).label,
    );
    // The memo key is the cut text: anything past 1500 chars does not change it.
    const long = "a".repeat(1500);
    await judge({ text: long }, env);
    await judge({ text: `${long}tail` }, env);
    expect(calls).toBe(2);
    const [x, y] = await Promise.all([judge({ text: "concurrent" }, env), judge({ text: "concurrent" }, env)]);
    expect(calls).toBe(3);
    expect(x.json.jev.answers).toEqual(y.json.jev.answers);
  });

  test("a failed Jev call is not memoised", async () => {
    clearJevMemo();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? new Response("down", { status: 503 }) : Response.json(jevAnswer(0.5));
    }) as unknown as typeof fetch;
    const env = { JEV_KEY: "test-key" };
    expect((await judge({ text: C }, env)).json.jev.ok).toBe(false);
    expect((await judge({ text: C }, env)).json.jev.ok).toBe(true);
    expect((await judge({ text: C }, env)).json.jev.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
