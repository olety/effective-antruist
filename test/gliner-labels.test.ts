import { describe, expect, test } from "bun:test";
import { DESCRIPTIONS, LABEL_NAMES, LABELS, THRESHOLD, toSpans, type RawEntity } from "../src/gliner/labels";
import { EXAMPLES } from "../src/examples";

const [A, B, C] = EXAMPLES.map((e) => e.text);
const raw = (text: string, label: string, needle: string, score = 0.9): RawEntity => {
  const start = text.indexOf(needle);
  return { label, text: needle, start, end: start + needle.length, score };
};
const keys = (spans: { label: string; text: string; source: string }[]) => spans.map((s) => `${s.label}:${s.text}:${s.source}`);

describe("labels match service/app.py", () => {
  test("same labels, descriptions, kinds and threshold", async () => {
    const py = await Bun.file(new URL("../service/app.py", import.meta.url).pathname).text();
    const block = py.slice(py.indexOf("LABELS = {"), py.indexOf("}\n", py.indexOf("LABELS = {")));
    const pyLabels = [...block.matchAll(/"([^"]+)": \("(\w+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2], m[3]]);
    expect(pyLabels.length).toBe(10);
    expect(LABEL_NAMES.map((l) => [l, LABELS[l][0], DESCRIPTIONS[l]])).toEqual(pyLabels);
    expect(py).toContain(`"GLINER_THRESHOLD", "${THRESHOLD}"`);
  });
});

describe("toSpans (the money rule)", () => {
  test("$4k MRR is money, never a donation", () => {
    const out = toSpans([raw(B, "donation amount", "$4k MRR", 0.8)], B);
    expect(keys(out)).toEqual(["money:$4k MRR:regex"]);
  });

  test("a donation near 'gave' / 'donate' stays a donation", () => {
    expect(keys(toSpans([raw(C, "donation amount", "$20", 0.98)], C))).toEqual(["donation:$20:gliner"]);
    expect(keys(toSpans([raw(A, "donation amount", "10%", 0.97)], A))).toEqual(["donation:10%:gliner"]);
  });

  test("the regex adds amounts the model missed", () => {
    expect(keys(toSpans([], C))).toEqual(["donation:$20:regex"]);
  });

  test("maps labels to kinds, rounds scores, sorts by start then longest", () => {
    const out = toSpans([raw(A, "city or country", "SF", 0.98765), raw(A, "job title", "Staff engineer"), raw(A, "AI lab", "Google Brain")], A);
    expect(out.map((s) => s.label)).toEqual(["job", "ai_lab", "donation", "city"]);
    expect(out.find((s) => s.label === "city")!.score).toBe(0.988);
  });

  test("clamps offsets past the text (the runtime appends a '.')", () => {
    const text = "I live in Tokyo";
    const out = toSpans([{ label: "city or country", text: "Tokyo.", start: 10, end: 16, score: 0.9 }], text);
    expect(out).toEqual([{ label: "city", text: "Tokyo", start: 10, end: 15, score: 0.9, source: "gliner" }]);
  });

  test("drops unknown labels and offsets that match the text", () => {
    const out = toSpans([{ label: "planet", text: "Mars", start: 0, end: 4, score: 1 }, raw(B, "food eaten", "steak")], B);
    for (const s of out) expect(B.slice(s.start, s.end)).toBe(s.text);
    expect(out.some((s) => s.text === "Mars")).toBe(false);
  });
});
