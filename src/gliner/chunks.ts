// Sentence chunking for the small model: it finds every span in a short passage but drops some
// in a long one (481 chars in one run lost spans; in <= 200-char chunks it found 20 of 20).
// Pure, so bun tests cover the offsets; gliner.worker.ts passes the real model as `run`.
import type { RawEntity } from "./labels";

export const CHUNK_CHARS = 200;
export const MAX_CHUNKS = 6;

export interface Chunk {
  text: string;
  /** Offset of chunk.text[0] in the full text (UTF-16 units, like String.prototype.slice). */
  start: number;
}

// A sentence ends after . ! ? … (plus closing quotes/brackets) before whitespace, after CJK
// end marks with or without whitespace, or at a newline.
const SENTENCE_END_RE = /[.!?…]+["'”’)\]]*(?=\s|$)|[。！？]+[」』）"”]*|\n+/g;

const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Where to cut a run longer than `max`: the last whitespace in it, else `max` (never inside a surrogate pair). */
function cutPoint(text: string, a: number, max: number): number {
  for (let i = a + max; i > a; i--) if (/\s/.test(text[i])) return i;
  let cut = a + max;
  if (isLowSurrogate(text.charCodeAt(cut))) cut--;
  return cut > a ? cut : a + max;
}

/** Split at sentence ends, pack sentences into chunks of at most `maxChars`, keep the first `maxChunks`. */
export function chunkText(text: string, maxChars = CHUNK_CHARS, maxChunks = MAX_CHUNKS): Chunk[] {
  const sentences: [number, number][] = [];
  let last = 0;
  const push = (a: number, b: number) => {
    while (b - a > maxChars) {
      const cut = cutPoint(text, a, maxChars);
      sentences.push([a, cut]);
      a = cut;
    }
    if (b > a) sentences.push([a, b]);
  };
  for (const m of text.matchAll(SENTENCE_END_RE)) {
    const end = m.index! + m[0].length;
    if (end > last) push(last, end);
    last = Math.max(last, end);
  }
  if (last < text.length) push(last, text.length);

  const packed: [number, number][] = [];
  for (const [a, b] of sentences) {
    const cur = packed[packed.length - 1];
    if (cur && b - cur[0] <= maxChars) cur[1] = b;
    else packed.push([a, b]);
  }

  const chunks: Chunk[] = [];
  for (let [a, b] of packed) {
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a) chunks.push({ text: text.slice(a, b), start: a });
    if (chunks.length === maxChunks) break;
  }
  return chunks;
}

/**
 * Run the model once per chunk and return entities with offsets into the full `text`.
 * The runtime may report an end one past the chunk (it appends "."), so ends are clamped to
 * the chunk first. Same label on the same range keeps the higher score.
 */
export async function extractChunked(text: string, run: (chunk: string) => Promise<RawEntity[]>): Promise<RawEntity[]> {
  const best = new Map<string, RawEntity>();
  for (const c of chunkText(text)) {
    for (const e of await run(c.text)) {
      const s = Math.max(0, Math.trunc(e.start));
      const en = Math.min(c.text.length, Math.trunc(e.end));
      if (en <= s) continue;
      const start = c.start + s, end = c.start + en;
      const key = `${e.label}\u0000${start}\u0000${end}`;
      const prev = best.get(key);
      if (!prev || e.score > prev.score) best.set(key, { label: e.label, text: text.slice(start, end), start, end, score: e.score });
    }
  }
  return [...best.values()];
}
