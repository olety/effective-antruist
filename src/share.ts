// SHARE: a sticker button beside COPY RESULT. Phones get the native share sheet with a 1200x630
// result card; everything else gets a small popover of intent links plus copy / save the card.
// The card is drawn on a canvas from same-origin stickers, so it stays exportable.
import { OWNER_LINES, SHARE, SITE, ownerLinesIn } from "./copy";

export interface ShareInfo {
  /** The hero number as the tag shows it (may carry U+2212). */
  num: string;
  /** The same number with an ASCII minus, for text. */
  plainNum: string;
  caste: string | null;
  /** The reaction sticker's shout. */
  line: string;
  /** URL of the reaction sticker (hero size). */
  hero: string;
}

export interface ShareDeps {
  /** The row that holds COPY RESULT; SHARE is appended to it. */
  row: HTMLElement;
  get(): ShareInfo | null;
  /** Wall sticker URLs for the card's background. */
  stickers: string[];
  sound(kind: ShareSound): void;
}

export type ShareSound = "sent" | "link" | "card" | "open" | "close" | "fail";

// ---- text -------------------------------------------------------------------------------------

/** One line: the number, the caste, the reaction's payoff when it is an owner line, the question. */
export function shareLine(i: ShareInfo): string {
  const parts = [SHARE.lead(i.plainNum)];
  if (i.caste) parts.push(SHARE.caste(i.caste));
  const payoff = OWNER_LINES.includes(i.line) ? i.line : ownerLinesIn(i.line)[0];
  if (payoff) parts.push(/[.!?]$/.test(payoff) ? payoff : `${payoff}.`);
  parts.push(SHARE.ask);
  return parts.join(" ");
}

export function shareLinks(i: ShareInfo): { id: string; label: string; href: string }[] {
  const e = encodeURIComponent;
  const t = shareLine(i);
  const u = SITE.url;
  const tu = `${t} ${u}`;
  return [
    { id: "x", label: SHARE.x, href: `https://x.com/intent/post?text=${e(t)}&url=${e(u)}` },
    { id: "bluesky", label: SHARE.bluesky, href: `https://bsky.app/intent/compose?text=${e(tu)}` },
    { id: "threads", label: SHARE.threads, href: `https://www.threads.net/intent/post?text=${e(tu)}` },
    { id: "reddit", label: SHARE.reddit, href: `https://www.reddit.com/submit?url=${e(u)}&title=${e(t)}` },
    { id: "linkedin", label: SHARE.linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}` },
    { id: "whatsapp", label: SHARE.whatsapp, href: `https://wa.me/?text=${e(tu)}` },
    { id: "telegram", label: SHARE.telegram, href: `https://t.me/share/url?url=${e(u)}&text=${e(t)}` },
  ];
}

const fileNum = (i: ShareInfo) => i.plainNum.replace(/,/g, "").replace(/[^0-9A-Za-z.-]/g, "") || "unknown";

// ---- the card -----------------------------------------------------------------------------------

const W = 1200;
const H = 630;
const INK = "#141116";
const RED = "#e8202a";
const MEME = "Meme, Impact, Anton, 'Arial Narrow', sans-serif";
const MARKER = "Marker, 'Permanent Marker', 'Marker Felt', 'Comic Sans MS', cursive";
const BODY = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

/** Background stickers: centre x, centre y, longest side, rotation (deg). Peeking in from the edges. */
const SPOTS: [number, number, number, number][] = [
  [78, 92, 168, -12],
  [1122, 96, 170, 11],
  [66, 560, 170, 9],
  [1150, 420, 150, -9],
  [420, 612, 140, 13],
  [820, 606, 150, -11],
  [44, 318, 128, -6],
  [604, 36, 120, 7],
];

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(src);
  if (!p) {
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    p = im.decode().then(() => im, () => null);
    imgCache.set(src, p);
  }
  return p;
}

function rr(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(l + r, t);
  x.arcTo(l + w, t, l + w, t + h, r);
  x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r);
  x.arcTo(l, t, l + w, t, r);
  x.closePath();
}

/** A sticker panel: soft lift, white vinyl rim, ink outline, fill. */
function panel(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number, fill: string, rim = 8) {
  x.save();
  x.shadowColor = "rgba(24, 8, 44, 0.55)";
  x.shadowBlur = 26;
  x.shadowOffsetY = 12;
  x.fillStyle = "#fff";
  rr(x, l - rim, t - rim, w + rim * 2, h + rim * 2, r + rim);
  x.fill();
  x.restore();
  x.fillStyle = INK;
  rr(x, l, t, w, h, r);
  x.fill();
  x.fillStyle = fill;
  rr(x, l + 3.5, t + 3.5, w - 7, h - 7, Math.max(2, r - 3.5));
  x.fill();
}

function fitFont(x: CanvasRenderingContext2D, text: string, family: string, max: number, maxW: number, weight = "400") {
  let size = max;
  x.font = `${weight} ${size}px ${family}`;
  const w = x.measureText(text).width;
  if (w > maxW) size = Math.max(12, Math.floor((size * maxW) / w));
  x.font = `${weight} ${size}px ${family}`;
  return size;
}

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (x.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function fontsReady() {
  await Promise.all([
    document.fonts.load(`80px ${MEME}`, "ARE YOU AN EFFECTIVE ANTRUIST? HELLO"),
    document.fonts.load(`100px ${MARKER}`, "0123456789,.-INSECTS"),
  ]).catch(() => {});
  await document.fonts.ready;
}

export async function drawCard(i: ShareInfo, stickers: string[]): Promise<Blob> {
  await fontsReady();
  const imgs = await Promise.all([...stickers.slice(0, SPOTS.length), i.hero].map(loadImg));
  const hero = imgs.pop() ?? null;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.textBaseline = "alphabetic";

  // The purple wall with a few real stickers, then the page's vignette.
  x.fillStyle = "#7d2fe0";
  x.fillRect(0, 0, W, H);
  imgs.forEach((im, n) => {
    if (!im) return;
    const [cx, cy, size, rot] = SPOTS[n];
    const s = size / Math.max(im.naturalWidth, im.naturalHeight);
    x.save();
    x.translate(cx, cy);
    x.rotate((rot * Math.PI) / 180);
    x.shadowColor = "rgba(24, 8, 44, 0.5)";
    x.shadowBlur = 14;
    x.shadowOffsetY = 6;
    x.drawImage(im, (-im.naturalWidth * s) / 2, (-im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    x.restore();
  });
  const g = x.createRadialGradient(W / 2, H * 0.5, 60, W / 2, H * 0.5, W * 0.62);
  g.addColorStop(0, "rgba(22, 6, 42, 0.62)");
  g.addColorStop(0.6, "rgba(22, 6, 42, 0.42)");
  g.addColorStop(1, "rgba(22, 6, 42, 0.05)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // Headline: white meme caps with an ink outline and a drop.
  const hs = fitFont(x, SITE.headline, MEME, 76, 1090);
  x.textAlign = "center";
  x.lineJoin = "round";
  x.lineWidth = hs * 0.16;
  x.strokeStyle = INK;
  x.strokeText(SITE.headline, W / 2, 96 + hs * 0.07);
  x.strokeText(SITE.headline, W / 2, 96);
  x.fillStyle = "#fff";
  x.fillText(SITE.headline, W / 2, 96);

  // The red HELLO name tag, tilted like the page's.
  const tw = 450;
  const th = 300;
  const tx = 88;
  const ty = 150;
  x.save();
  x.translate(tx + tw / 2, ty + th / 2);
  x.rotate((-2 * Math.PI) / 180);
  x.translate(-tw / 2, -th / 2);
  panel(x, 0, 0, tw, th, 26, RED);
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.font = `400 66px ${MEME}`;
  x.fillText("HELLO", tw / 2, 72);
  x.font = `700 23px ${BODY}`;
  x.fillText("my worth is", tw / 2, 104);
  const bx = 20;
  const by = 120;
  const bw = tw - 40;
  const bh = 160;
  x.fillStyle = "#fff";
  rr(x, bx, by, bw, bh, 14);
  x.fill();
  x.fillStyle = INK;
  const ns = fitFont(x, i.num, MARKER, 92, bw - 36);
  x.fillText(i.num, tw / 2, by + 30 + ns * 0.72);
  x.font = `400 38px ${MARKER}`;
  x.fillText("INSECTS", tw / 2, by + bh - 18);
  x.restore();

  // The caste, on an ink strip under the tag.
  const caste = SHARE.cardCaste(i.caste);
  x.save();
  x.translate(tx + tw / 2, 520);
  x.rotate((-1.2 * Math.PI) / 180);
  const cs = fitFont(x, caste, BODY, 24, tw + 20, "700");
  const cw = x.measureText(caste).width + 32;
  const ch = cs + 22;
  x.fillStyle = "#fff";
  rr(x, -cw / 2 - 5, -ch / 2 - 5, cw + 10, ch + 10, 12);
  x.fill();
  x.fillStyle = INK;
  rr(x, -cw / 2, -ch / 2, cw, ch, 8);
  x.fill();
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.fillText(caste, 0, cs * 0.36);
  x.restore();

  // The reaction sticker and its speech bubble.
  let heroW = 0;
  const heroX = 590;
  const heroCy = 340;
  if (hero) {
    const s = Math.min(270 / hero.naturalHeight, 290 / hero.naturalWidth);
    heroW = hero.naturalWidth * s;
    const hh = hero.naturalHeight * s;
    x.save();
    x.shadowColor = "rgba(24, 8, 44, 0.55)";
    x.shadowBlur = 22;
    x.shadowOffsetY = 10;
    x.drawImage(hero, heroX, heroCy - hh / 2, heroW, hh);
    x.restore();
  }
  const bl = heroX + heroW + 34;
  const bwid = W - 48 - bl;
  let ls = 38;
  let lines: string[] = [];
  const shout = i.line.toUpperCase();
  for (; ls >= 22; ls -= 2) {
    x.font = `400 ${ls}px ${MEME}`;
    lines = wrap(x, shout, bwid - 40);
    if (lines.length <= 5 && lines.every((l) => x.measureText(l).width <= bwid - 40)) break;
  }
  const lh = ls * 1.06;
  const bhgt = lines.length * lh + 38;
  const bt = Math.max(150, heroCy - 40 - bhgt / 2);
  panel(x, bl, bt, bwid, bhgt, 24, "#fff", 6);
  // tail toward the sticker
  x.fillStyle = INK;
  x.beginPath();
  x.moveTo(bl + 2, bt + 30);
  x.lineTo(bl - 26, bt + 44);
  x.lineTo(bl + 2, bt + 60);
  x.fill();
  x.fillStyle = "#fff";
  x.beginPath();
  x.moveTo(bl + 4, bt + 34);
  x.lineTo(bl - 17, bt + 44);
  x.lineTo(bl + 4, bt + 56);
  x.fill();
  x.fillStyle = INK;
  x.textAlign = "left";
  x.font = `400 ${ls}px ${MEME}`;
  lines.forEach((l, n) => x.fillText(l, bl + 20, bt + 19 + ls * 0.86 + n * lh));

  // The site, on a white pill bottom right.
  x.font = `700 26px ${BODY}`;
  const site = SHARE.cardSite;
  const sw = x.measureText(site).width + 36;
  const sx = W - 44 - sw;
  const sy = H - 44 - 44;
  panel(x, sx, sy, sw, 44, 22, "#fff", 5);
  x.fillStyle = INK;
  x.textAlign = "center";
  x.fillText(site, sx + sw / 2, sy + 31);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

// ---- the button and the popover --------------------------------------------------------------------

const canCopyImage = () =>
  typeof ClipboardItem !== "undefined" &&
  typeof navigator.clipboard?.write === "function" &&
  (typeof (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports !== "function" ||
    (ClipboardItem as unknown as { supports: (t: string) => boolean }).supports("image/png"));

export function initShare(d: ShareDeps) {
  const wrapEl = document.createElement("span");
  wrapEl.className = "share-wrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "share";
  btn.className = "copy share-btn";
  btn.textContent = SHARE.button;
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "shareMenu");

  const menu = document.createElement("div");
  menu.className = "share-pop";
  menu.id = "shareMenu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", SHARE.menuLabel);
  menu.hidden = true;
  const title = document.createElement("p");
  title.className = "share-title";
  title.setAttribute("aria-hidden", "true");
  title.textContent = SHARE.menuTitle;
  const grid = document.createElement("div");
  grid.className = "share-grid";
  menu.appendChild(title);
  menu.appendChild(grid);

  const links = new Map<string, HTMLAnchorElement>();
  for (const l of shareLinks({ num: "0", plainNum: "0", caste: null, line: "", hero: "" })) {
    const a = document.createElement("a");
    a.className = `share-it net-${l.id}`;
    a.setAttribute("role", "menuitem");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = l.label;
    a.addEventListener("click", () => {
      d.sound("sent");
      close(true, true);
    });
    links.set(l.id, a);
    grid.appendChild(a);
  }
  const action = (label: string, kind: ShareSound, fn: () => Promise<string | null>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "share-it share-act";
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    b.addEventListener("click", async () => {
      close(true, true);
      let msg: string | null = SHARE.failed;
      try {
        msg = await fn();
      } catch {
        msg = SHARE.failed;
      }
      if (msg) flash(msg, msg !== SHARE.failed ? kind : "fail");
    });
    grid.appendChild(b);
    return b;
  };
  action(SHARE.copyLink, "link", async () => {
    await navigator.clipboard.writeText(SITE.url);
    return SHARE.linkCopied;
  });
  const copyCardBtn = action(SHARE.copyCard, "card", async () => {
    const i = d.get();
    if (!i) return null;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": card(i) })]);
    return SHARE.cardCopied;
  });
  copyCardBtn.hidden = !canCopyImage();
  action(SHARE.saveCard, "card", async () => {
    const i = d.get();
    if (!i) return null;
    const url = URL.createObjectURL(await card(i));
    const a = document.createElement("a");
    a.href = url;
    a.download = SHARE.file(fileNum(i));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return SHARE.cardSaved;
  });

  wrapEl.appendChild(btn);
  wrapEl.appendChild(menu);
  d.row.appendChild(wrapEl);

  // ---- the card, drawn once per result and reused (the native sheet needs it at click time)
  let cache: { key: string; blob: Promise<Blob>; file: File | null } | null = null;
  const keyOf = (i: ShareInfo) => [i.num, i.caste, i.line, i.hero].join("|");
  function card(i: ShareInfo): Promise<Blob> {
    const key = keyOf(i);
    if (cache?.key === key) return cache.blob;
    const entry: { key: string; blob: Promise<Blob>; file: File | null } = { key, blob: drawCard(i, d.stickers), file: null };
    entry.blob.then(
      (b) => (entry.file = new File([b], SHARE.file(fileNum(i)), { type: "image/png" })),
      () => cache === entry && (cache = null),
    );
    cache = entry;
    return entry.blob;
  }
  let idle = 0;
  function refresh() {
    cache = null;
    clearTimeout(idle);
    // Draw the card when the page is quiet, so a phone's share sheet opens straight from the tap.
    idle = window.setTimeout(() => {
      const i = d.get();
      if (i) void card(i).catch(() => {});
    }, 1600);
  }

  // ---- popover
  let flashT = 0;
  function flash(msg: string, kind: ShareSound) {
    btn.textContent = msg;
    d.sound(kind);
    clearTimeout(flashT);
    flashT = window.setTimeout(() => (btn.textContent = SHARE.button), 1600);
  }
  const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((el) => !el.hidden);
  function open() {
    const i = d.get();
    if (!i) return;
    for (const l of shareLinks(i)) links.get(l.id)!.href = l.href;
    menu.classList.remove("below");
    menu.style.removeProperty("--dx");
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    // Keep it on screen: flip under the button when there is no room above, nudge in from the sides.
    const r = menu.getBoundingClientRect();
    if (r.top < 8) menu.classList.add("below");
    const dx = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
    if (dx) menu.style.setProperty("--dx", `${Math.round(dx)}px`);
    items()[0]?.focus({ preventScroll: true });
    void card(i).catch(() => {});
    d.sound("open");
  }
  function close(refocus: boolean, quiet = false) {
    if (menu.hidden) return;
    if (!quiet) d.sound("close");
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus({ preventScroll: true });
  }

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const coarse = matchMedia("(pointer: coarse)");
  btn.addEventListener("click", async () => {
    const i = d.get();
    if (!i) return;
    if (!menu.hidden) return close(false);
    if (coarse.matches && typeof nav.canShare === "function" && typeof nav.share === "function") {
      if (cache?.key !== keyOf(i) || !cache.file) await card(i).catch(() => null);
      const file = cache?.key === keyOf(i) ? cache.file : null;
      if (file && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: SITE.title, text: shareLine(i), url: SITE.url });
          d.sound("sent");
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") return;
        }
      }
    }
    open();
  });
  menu.addEventListener("keydown", (e) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") close(false, true);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || menu.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close(true);
  });
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    // A press on another popup's button closes the menu quietly: that popup's open sound covers both.
    if (!menu.hidden && !wrapEl.contains(t)) close(false, t instanceof Element && t.closest("[aria-haspopup]") !== null);
  });

  return { refresh, close: () => close(false, true), card: (i: ShareInfo) => card(i) };
}
