// Renders the link-preview card and the icon set from scripts/og-card.html in headless Chrome.
//   bun scripts/make-og.ts
// Writes public/og.png (1200x630), public/apple-touch-icon.png (180), public/icon-192.png,
// public/icon-512.png, public/favicon-32.png and public/favicon.ico (16/32/48, PNG entries).
// Serves the repo on a free local port so fonts and stickers load over http (Chrome blocks
// file:// fonts). Big PNGs are palette-quantised with sharp when it is installed (it ships with
// wrangler's miniflare); without it the Chrome PNG is written as is.
import { chromium } from "playwright-core";
import { join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "public");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MAX_OG_BYTES = 300 * 1024;

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (!/^\/(scripts\/og-card\.html|src\/(stickers|fonts)\/[\w.-]+)$/.test(path)) return new Response("no", { status: 404 });
    const file = Bun.file(join(ROOT, path));
    return file.exists().then((ok) => (ok ? new Response(file) : new Response("missing", { status: 404 })));
  },
});
const base = `http://127.0.0.1:${server.port}/scripts/og-card.html`;

type Sharp = (input: Buffer) => { png(o: object): { toBuffer(): Promise<Buffer> } };
let sharp: Sharp | null = null;
try {
  sharp = (await import("sharp")).default as unknown as Sharp;
} catch {
  console.warn("sharp not found: PNGs are written unquantised");
}

const browser = await chromium.launch({ executablePath: CHROME });

async function shot(query: string, w: number, h: number, transparent = false): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}${query}`, { waitUntil: "load" });
  await page.evaluate(() => (window as unknown as { ready: Promise<boolean> }).ready);
  if (errors.length) throw new Error(errors.join("\n"));
  const buf = await page.screenshot({ type: "png", omitBackground: transparent });
  await page.close();
  return buf;
}

async function write(name: string, buf: Buffer) {
  await Bun.write(join(OUT, name), buf);
  console.log(`${name.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
}

// 1. The card. Quantise to a palette when the raw PNG is over budget.
let og = await shot("", 1200, 630);
if (og.length > MAX_OG_BYTES && sharp) og = await sharp(og).png({ palette: true, quality: 90, effort: 10 }).toBuffer();
if (og.length > MAX_OG_BYTES && sharp) og = await sharp(og).png({ palette: true, quality: 80, effort: 10, colours: 192 }).toBuffer();
await write("og.png", og);
if (og.length > MAX_OG_BYTES) console.warn(`og.png is ${og.length} bytes, over the ${MAX_OG_BYTES} budget`);

// 2. Icons: the full-bleed tile for Apple and the manifest, the transparent badge for favicons.
const tile = (s: number) => shot(`?icon=tile&size=${s}`, s, s);
const badge = (s: number) => shot(`?icon=badge&size=${s}`, s, s, true);
await write("apple-touch-icon.png", await tile(180));
await write("icon-192.png", await tile(192));
await write("icon-512.png", await tile(512));
const fav = { 16: await badge(16), 32: await badge(32), 48: await badge(48) };
await write("favicon-32.png", fav[32]);

// favicon.ico: an ICONDIR with PNG-encoded entries (supported by every current browser).
function ico(images: [number, Buffer][]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(([, png]) => png)]);
}
await write("favicon.ico", ico([[16, fav[16]], [32, fav[32]], [48, fav[48]]]));

await browser.close();
server.stop(true);
