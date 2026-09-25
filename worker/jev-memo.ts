// Jev answers memoised per SHA-256 of the cut text, so every demo take of the same text shows the
// same caste %, Skittles p and verdicts. Two levels: this isolate's Map (also shares one in-flight
// call between concurrent requests) and caches.default (shared by isolates in a colo). Only ok
// answers are kept, so a Jev outage never sticks. The key also hashes the question set, so an
// edit to JEV_QUESTIONS starts fresh.
import { callJev, JEV_QUESTIONS, RAT_WORLD } from "../src/engine/jev";
import type { JevResult } from "../src/engine/types";

const MEMO_MAX = 500;
const CACHE_TTL_S = 30 * 24 * 3600;
const memo = new Map<string, Promise<JevResult>>();

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let questionsHash: Promise<string> | null = null;
const questionSet = () => (questionsHash ??= sha256Hex(JSON.stringify([RAT_WORLD, JEV_QUESTIONS])).then((h) => h.slice(0, 12)));

/** The memo key for `text` (already cut to MAX_CHARS). */
export async function jevKey(text: string): Promise<string> {
  return `${await questionSet()}/${await sha256Hex(text)}`;
}

type EdgeCache = { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> };
function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

export interface MemoOpts {
  /** Origin the cache key URL lives on (the request's own; the Cache API is per zone). */
  origin: string;
  waitUntil?: (p: Promise<unknown>) => void;
  fetchImpl?: typeof fetch;
}

/** callJev, memoised. Without a key it just reports "JEV_KEY unset". */
export async function memoJev(text: string, key: string | undefined, opts: MemoOpts): Promise<JevResult> {
  if (!key) return callJev(text, key, { fetchImpl: opts.fetchImpl });
  const k = await jevKey(text);
  const hit = memo.get(k);
  if (hit) return hit;
  const cacheUrl = `${opts.origin}/__jev-memo/${k}`;
  const p = (async (): Promise<JevResult> => {
    const cache = edgeCache();
    if (cache) {
      try {
        const r = await cache.match(cacheUrl);
        if (r) return (await r.json()) as JevResult;
      } catch {
        // cache miss or unavailable: ask Jev
      }
    }
    const jev = await callJev(text, key, { fetchImpl: opts.fetchImpl });
    if (jev.ok && cache) {
      const res = new Response(JSON.stringify(jev), {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_TTL_S}` },
      });
      const put = cache.put(cacheUrl, res).catch(() => undefined);
      if (opts.waitUntil) opts.waitUntil(put);
    }
    return jev;
  })();
  memo.set(k, p);
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value!);
  p.then(
    (j) => {
      if (!j.ok) memo.delete(k);
    },
    () => memo.delete(k),
  );
  return p;
}

/** Tests only: forget every memoised answer in this isolate. */
export function clearJevMemo(): void {
  memo.clear();
}
