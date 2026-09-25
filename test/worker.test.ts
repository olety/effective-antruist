import { afterEach, describe, expect, test } from "bun:test";
import worker, { type Env } from "../worker/index";
import { MAX_CLIENT_SPANS, parseClientSpans } from "../src/gliner/client-spans";
import { EXAMPLES } from "../src/examples";

const [A, B] = EXAMPLES.map((e) => e.text);
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

  test("clamps offsets to the text and drops empty or unknown-kind spans", () => {
    const out = parseClientSpans([
      { label: "city", start: -5, end: 3, score: 2 },
      { label: "food", start: 9, end: 999, score: -1 },
      { label: "food", start: 50, end: 60, score: 0.9 },
      { label: "wizard", start: 0, end: 3, score: 0.9 },
      { label: "food", start: 4, end: 2, score: 0.9 },
    ], "abcdefghijkl")!;
    expect(out).toEqual([
      { kind: "city", text: "abc", start: 0, end: 3, confidence: 1, source: "gliner" },
      { kind: "food", text: "jkl", start: 9, end: 12, confidence: 0, source: "gliner" },
    ]);
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

  test("spans past the 1500-char cap are clamped to the truncated text", async () => {
    const text = "steak ".repeat(400); // 2400 chars
    const { json } = await judge({ text, spans: [{ label: "food", start: 1497, end: 1600, score: 0.9 }] });
    expect(json.truncated).toBe(true);
    expect(json.spans).toEqual([{ kind: "food", text: text.slice(1497, 1500), start: 1497, end: 1500, confidence: 0.9, source: "gliner" }]);
  });
});
