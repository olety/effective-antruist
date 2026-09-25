// Effective Antruist: one centred column over a canvas wall of meme stickers.
// The engine (types, weight sources, client-side reweigh) and the in-browser GLiNER are imported
// through their public APIs; every word on screen comes from ./copy.
import "./style.css";
import { EXAMPLE_POOL, type ExampleChip } from "./example-pool";
import { JOKES, LOADING_LINES, SITE, SOUND, STATUS, pickJoke } from "./copy";
import { reweigh } from "./engine/engine";
import { CITATIONS, WEIGHT_SOURCES, WEIGHT_SOURCE_IDS } from "./engine/sources";
import type { Judgement, WeightSourceId } from "./engine/types";
import { extract, glinerInfo, loadGliner, type GlinerProgress, type GlinerSpan } from "./gliner";
import * as audio from "./audio";
import { initShare, type ShareInfo } from "./share";
import {
  BADGES, PILL_LABEL, PROXY_NOTE, SOURCES_URL, WELFARE_RANGE, explainLine, lineLabel, unitLines, weightLines,
} from "./explain";
import { Wall } from "./wall";
import {
  BLANK, CAST_LIST, IDLE_MIX, altFor, flags, pickLines, reaction, verdictMix, type Reaction, type ReactionId,
} from "./verdict";

const STICKERS = import.meta.glob("./stickers/*.webp", { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;
const art = (name: string) => STICKERS[`./stickers/${name}.webp`];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** First-visit download of the in-browser model, as sent (gzip model chunks + zstd tokenizer and wasm; public/model/manifest.json). */
const BRAIN_MB = 45;
const stage = $("stage");
const textEl = $<HTMLTextAreaElement>("text");
const hl = $("hl");
const field = textEl.parentElement!;
const judgeBtn = $<HTMLButtonElement>("judge");
const statusEl = $("status");
const resultEl = $("result");
const tagEl = $("tag");
const numEl = $("num");
const rateEl = $("rate");
const pillsEl = $("pills");
const whoEl = $<HTMLImageElement>("who");
const lineEl = $("line");
const metaEl = $("meta");
const capEl = $("cap");
const ledgerEl = $("ledger");
const copyBtn = $<HTMLButtonElement>("copy");
const toggle = $<HTMLButtonElement>("wallToggle");

const reducedQ = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => reducedQ.matches;

let current: Judgement | null = null;
let selected: WeightSourceId = "rp2023";
let shownLines: number[] = [];
let active = -1;
let shownNum = 0;
let busy = false;
let react: Reaction | null = null;
/** Lines on screen now; no payoff line shows twice. */
let used = new Set<string>();

// ---- the wall -----------------------------------------------------------------

const wall = new Wall($<HTMLCanvasElement>("wall"), IDLE_MIX);
// The cast comes from the baked sprite manifest (src/stickers/cast.json).
const INSECTS = CAST_LIST.filter((c) => c.family === "insect").map((c) => c.id);
for (const c of CAST_LIST) if (!/^w_troll_\d$/.test(c.id) && art(c.id)) wall.add(c.id, [art(c.id)]);
wall.add("troll", [art("w_troll_1"), art("w_troll_2")]);
wall.addBlank(BLANK);

document.fonts.load("40px Meme", "BUG").finally(() => wall.renderText());
const lazy = () => {
  // Nothing but the page itself is on the critical path: stickers slap on right after load.
  wall.load(INSECTS);
  // The desktop model (45 MB on the wire) waits for the wall's stickers, at most 6 s, so it never starves them.
  setTimeout(() => void Promise.race([wall.load(), new Promise((r) => setTimeout(r, 6000))]).then(bootBrain), 40);
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 400));
  idle(() => void document.fonts.load("40px Marker", "0123456789,INSECTS"));
};
if (document.readyState === "complete") lazy();
else addEventListener("load", lazy, { once: true });

if (reduced()) toggle.hidden = true;
reducedQ.addEventListener("change", () => (toggle.hidden = reduced()));
toggle.addEventListener("click", () => {
  const on = toggle.getAttribute("aria-pressed") !== "true";
  toggle.setAttribute("aria-pressed", String(on));
  toggle.textContent = on ? SITE.playWall : SITE.pauseWall;
  wall.setPaused(on);
});

// ---- about this page ------------------------------------------------------------------
// A quiet pill by the wall toggle opens the about panel: how it works, the live model status, the
// credits. Desktop docks it as a slim drawer on the right edge (the page shifts over when they would
// overlap); phones get a bottom sheet. Second click, the close button, Escape or a click outside shuts it.

const aboutBtn = $<HTMLButtonElement>("aboutBtn");
const aboutEl = $("about");
// Out of the footer so it docks to the viewport, not to the footer's box.
document.body.appendChild(aboutEl);
function setAbout(open: boolean, refocus = false) {
  if (open === !aboutEl.hidden) return;
  aboutEl.hidden = !open;
  aboutBtn.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("about-open", open);
  // The stage may shift to make room: re-fit the number and re-aim the wall once it settles.
  requestAnimationFrame(relayout);
  setTimeout(relayout, reduced() ? 0 : 280);
  if (open) aboutEl.focus({ preventScroll: true });
  else if (refocus) aboutBtn.focus({ preventScroll: true });
}
aboutBtn.addEventListener("click", () => setAbout(Boolean(aboutEl.hidden)));
$("aboutClose").addEventListener("click", () => setAbout(false, true));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || aboutEl.hidden) return;
  e.preventDefault();
  setAbout(false, aboutEl.contains(document.activeElement));
});
document.addEventListener("pointerdown", (e) => {
  if (aboutEl.hidden) return;
  const t = e.target as Node;
  if (!aboutEl.contains(t) && !aboutBtn.contains(t)) setAbout(false);
});

// ---- numbers --------------------------------------------------------------------

const MINUS = "−";

/** The hero number: full digits, the way a person writes on a name tag. */
export function big(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  if (a >= 1e15) return sign + a.toExponential(2).replace("e+", "E");
  if (a >= 100) return sign + Math.round(a).toLocaleString("en-US");
  if (a >= 1) return sign + a.toFixed(2).replace(/\.?0+$/, "");
  if (a === 0) return "0";
  return sign + a.toPrecision(2);
}

/** Ledger amounts: signed and short. */
export function short(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  const sign = n < 0 ? MINUS : "+";
  const unit = (d: number, u: string) => sign + (a / d).toFixed(a / d >= 100 ? 0 : 1).replace(/\.0$/, "") + u;
  if (a >= 1e12) return unit(1e12, "T");
  if (a >= 1e9) return unit(1e9, "B");
  if (a >= 1e6) return unit(1e6, "M");
  if (a >= 1e4) return unit(1e3, "K");
  if (a >= 100) return sign + Math.round(a).toLocaleString("en-US");
  if (a >= 10) return sign + a.toFixed(1);
  if (a >= 0.01) return sign + a.toFixed(2);
  return sign + a.toPrecision(1);
}

const plain = (n: number) => big(n).replace(MINUS, "-");
const unsigned = (n: number) => short(Math.abs(n)).replace(/^[+−]/, "");

// ---- text field -----------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- explainers: the "?" by the exchange rate, the ⓘ by the pills, the drawer block ------------
// Small sticker popovers anchored under their button. Second click, Escape or a click outside shuts
// them; focus moves in on open (so the SOURCES link is reachable) and back to the button on Escape.

interface Pop {
  btn: HTMLButtonElement;
  el: HTMLElement;
  close: (refocus?: boolean) => void;
  place: () => void;
  refresh: () => void;
}
const pops: Pop[] = [];

function makePop(btn: HTMLButtonElement, id: string, label: string, render: () => string): Pop {
  const el = document.createElement("div");
  el.className = "pop";
  el.id = id;
  el.hidden = true;
  el.tabIndex = -1;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", label);
  document.body.appendChild(el);
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", id);
  btn.setAttribute("aria-haspopup", "dialog");
  const place = () => {
    if (el.hidden) return;
    const r = btn.getBoundingClientRect();
    el.style.maxHeight = "";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    const roomBelow = innerHeight - r.bottom - 12 - 8;
    const roomAbove = r.top - 12 - 8;
    // Below when it fits (or when below has more room); tall content scrolls inside the sticker.
    const up = h > roomBelow && roomAbove > roomBelow;
    const room = up ? roomAbove : roomBelow;
    // Phones scroll the page, so there the popover keeps its full height below the button.
    const cap = innerWidth >= 900 && h > room ? room : 0;
    if (cap) el.style.maxHeight = `${Math.max(160, cap)}px`;
    const hh = cap ? Math.max(160, cap) : h;
    const top = up ? r.top - 12 - hh : r.bottom + 12;
    el.style.left = `${left + scrollX}px`;
    el.style.top = `${top + scrollY}px`;
    el.style.setProperty("--ax", `${r.left + r.width / 2 - left}px`);
    el.classList.toggle("above", up);
  };
  const refresh = () => {
    if (el.hidden) return;
    el.innerHTML = render();
    place();
  };
  const close = (refocus = false) => {
    if (el.hidden) return;
    el.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus({ preventScroll: true });
  };
  const open = () => {
    for (const p of pops) if (p.btn !== btn) p.close();
    el.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    el.innerHTML = render();
    place();
    el.focus({ preventScroll: true });
  };
  btn.addEventListener("click", () => (el.hidden ? open() : close()));
  el.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !el.contains(to) && to !== btn) close();
  });
  const pop = { btn, el, close, place, refresh };
  pops.push(pop);
  return pop;
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const p = pops.find((x) => !x.el.hidden);
  if (!p) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  p.close(true);
});
document.addEventListener("pointerdown", (e) => {
  const t = e.target as Node;
  for (const p of pops) if (!p.el.hidden && !p.el.contains(t) && !p.btn.contains(t)) p.close();
});

const sourcesLink = `<a href="${SOURCES_URL}" target="_blank" rel="noopener">SOURCES.md</a>`;
const popTitle = (s: string) => `<p class="pop-title">${esc(s)}</p>`;

// The exchange-rate line on the tag: its text, a small "?", then the weights line.
rateEl.innerHTML = "";
const rateText = document.createElement("span");
const rateWeights = document.createElement("span");
const rateQ = document.createElement("button");
rateQ.type = "button";
rateQ.className = "qbtn";
rateQ.textContent = "?";
rateQ.setAttribute("aria-label", "what is an insect here?");
rateQ.title = "what is an insect here?";
const rateLast = document.createElement("span");
const rateKeep = document.createElement("span");
rateKeep.className = "nw";
for (const n of [rateLast, document.createTextNode(" "), rateQ]) rateKeep.appendChild(n);
for (const n of [rateText, rateKeep, document.createElement("br"), rateWeights]) rateEl.appendChild(n);
makePop(rateQ, "popUnit", "the unit", () =>
  popTitle("COUNTED IN INSECTS") + unitLines(selected).map((s) => `<p>${esc(s)}</p>`).join(""),
);

// The ⓘ beside the three weight pills (outside the radiogroup, in one row with it).
const pillsRow = document.createElement("div");
pillsRow.className = "pills-row";
pillsEl.replaceWith(pillsRow);
pillsRow.appendChild(pillsEl);
const infoBtn = document.createElement("button");
infoBtn.type = "button";
infoBtn.className = "ibtn";
infoBtn.textContent = "i";
infoBtn.setAttribute("aria-label", "how are the weights calculated?");
infoBtn.title = "how are the weights calculated?";
pillsRow.appendChild(infoBtn);
const weightsHtml = (withRange: boolean) =>
  (withRange ? `<p>${esc(WELFARE_RANGE)}</p>` : "") +
  `<ul class="wl">${weightLines()
    .map((w) => `<li${w.id === selected ? ' class="on"' : ""}><b>${esc(w.head)}:</b> ${esc(w.body)}</li>`)
    .join("")}</ul>` +
  `<p>${esc(PROXY_NOTE)}</p><p>Every figure, with quotes and links: ${sourcesLink}</p>`;
makePop(infoBtn, "popWeights", "the weights", () => popTitle("THE WEIGHTS") + weightsHtml(true));

// "How the score works" in the about drawer, after how the page works.
const scoreEl = document.createElement("div");
scoreEl.className = "about-score";
aboutEl.querySelector(".about-how")!.insertAdjacentElement("afterend", scoreEl);
function renderScore() {
  const badge = (b: { label: string; meaning: string }) =>
    `<li><span class="flag${b === BADGES.unverified ? " unv" : ""}">${esc(b.label)}</span> ${esc(b.meaning)}</li>`;
  scoreEl.innerHTML =
    `<h3>HOW THE SCORE WORKS</h3><p>${esc(unitLines(selected).join(" "))}</p>` +
    weightsHtml(false) +
    `<ul class="bl">${badge(BADGES.notInTotal)}${badge(BADGES.unverified)}</ul>`;
}
renderScore();


function autosize() {
  // With a result on screen the box hugs its text (rows=1 lets it shrink below four rows), so the
  // whole result fits one view on a 1280x720 laptop. The empty page keeps its four-row box.
  textEl.rows = stage.dataset.state === "result" ? 1 : 4;
  textEl.style.height = "auto";
  textEl.style.height = `${Math.min(textEl.scrollHeight + 2, innerHeight * 0.4)}px`;
}

function renderMarks() {
  const t = textEl.value;
  if (!current || t !== current.text) {
    hl.textContent = "";
    return;
  }
  const line = active >= 0 ? current.ledger[active] : null;
  const neg = new Set<number>();
  for (const l of current.ledger) if (l.insects < 0 && l.spanStart >= 0) neg.add(l.spanStart);
  const cuts = new Set<number>([0, t.length]);
  for (const s of current.spans) cuts.add(s.start).add(s.end);
  const pts = [...cuts].filter((p) => p >= 0 && p <= t.length).sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const chunk = esc(t.slice(a, b));
    const span = current.spans.find((s) => s.start <= a && b <= s.end);
    if (!span) {
      html += chunk;
      continue;
    }
    const on = line && line.spanStart >= 0 && line.spanStart <= a && b <= line.spanEnd;
    const cls = [on ? "on" : "", neg.has(span.start) ? "neg" : ""].filter(Boolean).join(" ");
    html += `<mark${cls ? ` class="${cls}"` : ""}>${chunk}</mark>`;
  }
  hl.innerHTML = html + "\n";
  hl.scrollTop = textEl.scrollTop;
}

textEl.addEventListener("input", () => {
  autosize();
  renderMarks();
  syncChips();
  if (current && !busy) judgeBtn.textContent = SITE.buttonAgain;
});
textEl.addEventListener("scroll", () => (hl.scrollTop = textEl.scrollTop));
textEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void judgeNow();
  }
});

// TRY chips: up to six, each holding several prewritten bios. A click fills the box with a random
// one of that chip's texts (never the one it showed last) and hands focus to the button.
const chips = $("chips");
const pool = EXAMPLE_POOL.filter((c) => c.texts.length > 0).slice(0, 6);
const chipBtns: { btn: HTMLButtonElement; chip: ExampleChip; last: number }[] = [];
/** Even rows: one row when it fits, else two (desktop) or pairs (phone). Read by style.css. */
const n = pool.length;
chips.style.setProperty("--cols", String(n <= 4 ? Math.max(n, 1) : Math.ceil(n / 2)));
chips.style.setProperty("--cols-phone", String(n <= 3 ? Math.max(n, 1) : 2));
function pickText(c: (typeof chipBtns)[number]): string {
  const len = c.chip.texts.length;
  let i = Math.floor(Math.random() * len);
  if (len > 1 && i === c.last) i = (i + 1 + Math.floor(Math.random() * (len - 1))) % len;
  c.last = i;
  return c.chip.texts[i];
}
function syncChips() {
  for (const c of chipBtns) c.btn.setAttribute("aria-pressed", String(c.last >= 0 && c.chip.texts[c.last] === textEl.value));
}
for (const chip of pool) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = chip.label;
  b.setAttribute("aria-pressed", "false");
  const c = { btn: b, chip, last: -1 };
  b.addEventListener("click", () => {
    textEl.value = pickText(c);
    textEl.dispatchEvent(new Event("input"));
    judgeBtn.focus({ preventScroll: true });
  });
  chips.appendChild(b);
  chipBtns.push(c);
}

// ---- result -----------------------------------------------------------------------

const pillBtns = WEIGHT_SOURCE_IDS.map((id) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pill";
  b.setAttribute("role", "radio");
  b.title = WEIGHT_SOURCES[id].name;
  b.textContent = PILL_LABEL[id];
  b.addEventListener("click", () => choose(id));
  b.addEventListener("keydown", (e) => {
    const i = WEIGHT_SOURCE_IDS.indexOf(id);
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = WEIGHT_SOURCE_IDS[(i + d + WEIGHT_SOURCE_IDS.length) % WEIGHT_SOURCE_IDS.length];
    choose(next);
    pillBtns[WEIGHT_SOURCE_IDS.indexOf(next)].focus();
  });
  pillsEl.appendChild(b);
  return b;
});

function syncPills() {
  WEIGHT_SOURCE_IDS.forEach((id, i) => {
    pillBtns[i].setAttribute("aria-checked", String(id === selected));
    pillBtns[i].tabIndex = id === selected ? 0 : -1;
  });
}
syncPills();

function choose(id: WeightSourceId) {
  if (id === selected) return;
  selected = id;
  syncPills();
  if (!current) return;
  current = reweigh(current, selected);
  const was = react?.who;
  if (react) {
    used = new Set();
    react = reaction(current, unsigned, used);
  }
  renderNumbers(460);
  if (react && react.who !== was) renderReaction();
  else renderReactionText();
  renderLedger(true);
  syncActive();
  renderScore();
  pops.forEach((p) => p.refresh());
  void audio.play("sfx-blub", 0.5);
  // The insects on the wall follow the worth under the new weights.
  const r = tagRect();
  wall.setMix(verdictMix(flags(current), current.totals.bySource[selected].worth), { x: r.x + r.w / 2, y: r.y + r.h / 2 }, true);
  share.refresh();
}

const measure = document.createElement("canvas").getContext("2d")!;
function fitNumber(str: string) {
  const box = numEl.parentElement!.clientWidth - 24;
  const max = innerWidth <= 560 ? 54 : innerWidth >= 1000 && innerHeight <= 860 ? 56 : 66;
  measure.font = "100px Marker, 'Permanent Marker', cursive";
  const w100 = measure.measureText(str).width || str.length * 60;
  numEl.style.fontSize = `${Math.max(26, Math.min(max, (box * 100) / w100))}px`;
}

let tween = 0;
function renderNumbers(ms: number) {
  const j = current!;
  const t = j.totals.bySource[selected];
  const to = t.worth;
  fitNumber(big(to));
  const rt = JOKES["total.human_rate"].line.replace("{n}", big(t.humanInInsects));
  const cut = rt.lastIndexOf(" ");
  rateText.textContent = rt.slice(0, cut + 1);
  rateLast.textContent = rt.slice(cut + 1);
  rateWeights.textContent = `weights: ${WEIGHT_SOURCES[selected].name}`;
  cancelAnimationFrame(tween);
  if (reduced() || ms <= 0) {
    shownNum = to;
    numEl.textContent = big(to);
    return;
  }
  const from = shownNum;
  const t0 = performance.now();
  // Tween in log space so a jump from 0 to 17 million still reads as counting.
  const lf = Math.sign(from) * Math.log10(1 + Math.abs(from));
  const lt = Math.sign(to) * Math.log10(1 + Math.abs(to));
  const step = (now: number) => {
    const q = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - q, 4);
    const l = lf + (lt - lf) * e;
    const v = q >= 1 ? to : Math.sign(l) * (Math.pow(10, Math.abs(l)) - 1);
    shownNum = v;
    numEl.textContent = big(v);
    if (q < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

const cleanLabel = (s: string) => s.replace(/\s*\(≈[^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();

function renderLedger(fresh: boolean) {
  const j = current!;
  if (fresh) {
    ledgerEl.innerHTML = "";
    shownLines.forEach((idx, n) => {
      const l = j.ledger[idx];
      const li = document.createElement("li");
      li.style.setProperty("--i", String(n));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ln";
      btn.dataset.idx = String(idx);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", `more-${n}`);
      const c = CITATIONS[l.citationId];
      btn.innerHTML =
        `<span class="amt"></span><span class="lbl">${esc(cleanLabel(lineLabel(l)))}` +
        `${l.countsInTotal ? "" : `<span class="flag" title="${esc(BADGES.notInTotal.meaning)}">${esc(SITE.notInTotal)}</span>`}</span>`;
      const more = document.createElement("p");
      more.className = "more";
      more.id = `more-${n}`;
      more.hidden = true;
      const src = c
        ? c.url
          ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>`
          : esc(c.title)
        : esc(l.citationId);
      const jk = pickJoke(l.jokeKey, used);
      const ex = explainLine(l, selected);
      more.innerHTML =
        `${ex ? `<span class="ex">${withBadges(ex)}</span>` : ""}` +
        `${jk ? `<span class="jk">${esc(jk)}</span>` : ""}Maths: ${esc(l.working.note)}. Source: ${src}` +
        `${c?.status === "UNVERIFIED" ? ` ${UNV_BADGE}` : ""}.`;
      btn.addEventListener("click", () => {
        active = active === idx ? -1 : idx;
        syncActive();
        if (active === idx) {
          const v = current!.ledger[idx].insects;
          void audio.play(v > 0 ? "sfx-cha-ching" : v < 0 ? "sfx-squish" : "bark-welfare-zero", 0.6);
        }
      });
      li.appendChild(btn);
      li.appendChild(more);
      ledgerEl.appendChild(li);
    });
  }
  for (const btn of ledgerEl.querySelectorAll<HTMLButtonElement>(".ln")) {
    const l = j.ledger[Number(btn.dataset.idx)];
    const amt = btn.querySelector(".amt")!;
    amt.textContent = short(l.insects);
    amt.className = `amt${l.insects < 0 ? " neg" : l.insects === 0 ? " zero" : ""}`;
  }
}

const UNV_BADGE = `<span class="flag unv" title="${esc(BADGES.unverified.meaning)}">${esc(BADGES.unverified.label)}</span>`;
/** Escaped explanation text with every UNVERIFIED turned into the badge. */
const withBadges = (s: string) => esc(s).replace(/\(UNVERIFIED\)|UNVERIFIED/g, UNV_BADGE);

/**
 * Desktop keeps the result on one screen: when an open line would push the page past the fold, the
 * ledger caps its height and scrolls inside. Phones scroll the page as usual.
 */
function fitLedger() {
  ledgerEl.style.maxHeight = "";
  ledgerEl.classList.remove("capped");
  if (!current || innerWidth < 1000 || stage.dataset.state !== "result") return;
  const over = document.documentElement.scrollHeight - innerHeight;
  if (over <= 0) return;
  ledgerEl.style.maxHeight = `${Math.max(120, ledgerEl.clientHeight - over - 2)}px`;
  ledgerEl.classList.add("capped");
  const open = ledgerEl.querySelector<HTMLElement>(".ln[aria-pressed='true']")?.parentElement;
  if (open) {
    const top = open.offsetTop - ledgerEl.offsetTop;
    if (top < ledgerEl.scrollTop || top + open.offsetHeight > ledgerEl.scrollTop + ledgerEl.clientHeight)
      ledgerEl.scrollTop = Math.max(0, top + open.offsetHeight - ledgerEl.clientHeight);
    if (open.offsetHeight > ledgerEl.clientHeight) ledgerEl.scrollTop = top;
  }
}

function syncActive() {
  for (const btn of ledgerEl.querySelectorAll<HTMLButtonElement>(".ln")) {
    const on = Number(btn.dataset.idx) === active;
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-expanded", String(on));
    (btn.nextElementSibling as HTMLElement).hidden = !on;
  }
  fitLedger();
  renderMarks();
  const l = current && active >= 0 ? current.ledger[active] : null;
  if (l && l.spanStart >= 0) {
    // Bring the marked span into view inside the textarea.
    const mark = hl.querySelector<HTMLElement>("mark.on");
    if (mark) {
      const top = mark.offsetTop - textEl.clientHeight / 3;
      if (mark.offsetTop < textEl.scrollTop || mark.offsetTop > textEl.scrollTop + textEl.clientHeight - 24) {
        textEl.scrollTop = Math.max(0, top);
        hl.scrollTop = textEl.scrollTop;
      }
    }
    if (innerWidth < 1000) {
      const r = field.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) field.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    }
  }
}

interface Who {
  hero: string;
  wall: string;
  /** Mouth-closed frame (the soldiers talk) or a second pose (the purple room head-bobs). */
  alt2?: string;
  bob?: boolean;
  wide?: boolean;
}
const WHO: Record<ReactionId, Who> = {
  net_negative: { hero: "h_soy_crying_ant", wall: "w_soy_crying_ant" },
  saint: { hero: "h_soy_ewhore", wall: "w_soy_ewhore" },
  ewhore_selfie: { hero: "h_ewhore_selfie", wall: "w_ewhore_selfie" },
  doomer_girl: { hero: "h_doomer_girl", wall: "w_doomer_girl" },
  sjette_crying: { hero: "h_sjette_crying", wall: "w_sjette_crying" },
  soy_shrimphug: { hero: "h_soy_shrimphug", wall: "w_soy_shrimphug" },
  soy_doomer_otaku: { hero: "h_soy_doomer_otaku", wall: "w_soy_doomer_otaku" },
  troll: { hero: "h_troll_1", wall: "w_troll_1", alt2: "h_troll_2", bob: true, wide: true },
  soy_crying: { hero: "h_soy_crying", wall: "w_soy_crying" },
  soy_smug_calc: { hero: "h_soy_smug_calc", wall: "w_soy_smug_calc" },
  soldierA: { hero: "h_soldierA", wall: "w_soldierA", alt2: "h_soldierA_closed" },
  soldierB: { hero: "h_soldierB", wall: "w_soldierB", alt2: "h_soldierB_closed" },
};

let talk = 0;
function renderReaction() {
  const r = react!;
  const w = WHO[r.who];
  whoEl.alt = altFor(w.wall);
  whoEl.classList.toggle("wide", Boolean(w.wide));
  const hero = art(w.hero);
  if (whoEl.dataset.src !== hero) {
    whoEl.src = art(w.wall); // already decoded for the wall
    whoEl.dataset.src = hero;
    const im = new Image();
    im.src = hero;
    im.decode().then(() => whoEl.dataset.src === hero && (whoEl.src = hero)).catch(() => {});
  }
  clearInterval(talk);
  if (w.alt2 && !reduced()) {
    const other = art(w.alt2);
    new Image().src = other;
    let n = 0;
    // Soldiers flap their mouths for a moment; the purple room bobs on the song's beat (153 bpm).
    talk = window.setInterval(
      () => {
        n++;
        if (whoEl.dataset.src !== hero) return clearInterval(talk);
        whoEl.src = n % 2 ? other : hero;
        if (!w.bob && n >= 12) {
          clearInterval(talk);
          whoEl.src = hero;
        }
      },
      w.bob ? 392 : 130,
    );
  }
  renderReactionText();
}

function renderReactionText() {
  if (!react) return;
  lineEl.textContent = react.line;
  capEl.textContent = react.caption;
  metaEl.textContent = react.meta;
}

/** The tag's layout box in viewport px, ignoring its entrance transform. */
function tagRect() {
  let x = 0;
  let y = 0;
  for (let el: HTMLElement | null = tagEl; el; el = el.offsetParent as HTMLElement | null) {
    x += el.offsetLeft;
    y += el.offsetTop;
  }
  return { x: x - scrollX, y: y - scrollY, w: tagEl.offsetWidth, h: tagEl.offsetHeight };
}

function showResult() {
  const j = current!;
  const first = stage.dataset.state !== "result";
  const before = first ? $("inputCard").getBoundingClientRect() : null;
  stage.dataset.state = "result";
  resultEl.hidden = false;
  judgeBtn.textContent = SITE.buttonAgain;
  used = new Set();
  react = reaction(j, unsigned, used);
  shownLines = pickLines(j);
  active = -1;
  renderReaction();
  renderLedger(true);
  renderMarks();
  autosize();
  renderScore();
  pops.forEach((p) => p.close());
  shownNum = 0;
  renderNumbers(first ? 1100 : 800);

  stage.classList.remove("in");
  void stage.offsetWidth;
  stage.classList.add("in");
  if (before && !reduced()) {
    const card = $("inputCard");
    const after = card.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 480,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
    $("hero").animate([{ opacity: 0, transform: "scale(1.15) rotate(-3deg)" }, { opacity: 1, transform: "none" }], {
      duration: 380,
      easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)",
    });
  }

  // On a phone the tag sits below the fold: bring it up, then start the wave from where it lands.
  let r = tagRect();
  let scrollBy = 0;
  const narrow = innerWidth < 1000;
  if ((narrow && r.y > 80) || r.y + r.h > innerHeight - 20 || r.y < 0) {
    scrollBy = Math.min(r.y - 16, document.documentElement.scrollHeight - innerHeight - scrollY);
    scrollTo({ top: scrollY + scrollBy, behavior: reduced() ? "auto" : "smooth" });
  }
  r = { ...r, y: r.y - scrollBy };
  wall.setTarget(r);
  wall.setMix(verdictMix(flags(j), j.totals.bySource[selected].worth), { x: r.x + r.w / 2, y: r.y + r.h / 2 }, true);
  $("announce").textContent = `You are worth ${plain(j.totals.bySource[selected].worth)} insects. ${react!.line} ${react!.caption}`;
  void revealSound(j, first ? 1100 : 800);
  share.close();
  share.refresh();
}

/** Boom, the counter, then the verdict's voice; the soldiers argue after it in Jev's 0.2-0.8 band. */
async function revealSound(j: Judgement, countMs: number) {
  audio.stopLoop("loop-swarm");
  void audio.play("sfx-boom", 0.9);
  if (!reduced()) void audio.play("sfx-slot-count", 0.45, countMs);
  const cue = react!.cue;
  await new Promise((r) => setTimeout(r, reduced() ? 250 : countMs + 80));
  if (current !== j) return;
  const done = await audio.sequence(audio.VERDICT[cue] ?? []);
  if (done && current === j && j.soldiers.argue) {
    void audio.loop("loop-chant", 0.28, 5200);
    await audio.sequence(["vo-bug-lives", "vo-save-shrimps", "bark-ackshually"], 60);
  }
}

let rq = 0;
const retarget = () => {
  if (rq || !current) return;
  rq = requestAnimationFrame(() => {
    rq = 0;
    wall.setTarget(tagRect());
  });
};
addEventListener("scroll", retarget, { passive: true });
function relayout() {
  retarget();
  if (current) fitNumber(big(current.totals.bySource[selected].worth));
  autosize();
  fitLedger();
  pops.forEach((p) => p.place());
}
addEventListener("resize", relayout);

// ---- judging -------------------------------------------------------------------------

let loadingTimer = 0;
function startLoadingLines() {
  let n = Math.floor(Math.random() * LOADING_LINES.length);
  setStatus(LOADING_LINES[n]);
  clearInterval(loadingTimer);
  loadingTimer = window.setInterval(() => setStatus(LOADING_LINES[++n % LOADING_LINES.length]), 900);
}

/** Spans from the in-browser GLiNER when it is ready (or nearly), else undefined: the Worker's lexicon answers. */
async function browserSpans(text: string): Promise<GlinerSpan[] | undefined> {
  if (brain === "loading" && brainPct >= 60) {
    // Nearly there: wait up to ~8 s, with the progress on the button.
    const show = () => (judgeBtn.textContent = STATUS.buttonWaiting(brainPct));
    show();
    const tick = window.setInterval(show, 200);
    await Promise.race([loadGliner().catch(() => null), new Promise((r) => setTimeout(r, 8000))]);
    clearInterval(tick);
    judgeBtn.textContent = SITE.buttonAgain === judgeBtn.textContent ? judgeBtn.textContent : BUSY;
  }
  if (!glinerInfo()) return undefined;
  try {
    return await extract(text);
  } catch {
    return undefined;
  }
}

const BUSY = "WEIGHING YOU…";

async function judgeNow() {
  const text = textEl.value.trim();
  if (busy) return;
  if (!text) {
    field.classList.remove("shake");
    void field.offsetWidth;
    field.classList.add("shake");
    setStatus(STATUS.empty, true);
    void audio.play("sfx-nerd-gasp", 0.7);
    textEl.focus();
    return;
  }
  busy = true;
  audio.cancelSequence();
  void audio.play(current ? "sfx-scratch" : "sfx-keysmash", 0.8);
  void audio.loop("loop-swarm", 0.22);
  judgeBtn.setAttribute("aria-busy", "true");
  judgeBtn.textContent = BUSY;
  startLoadingLines();
  wall.setBusy(true);
  const t0 = performance.now();
  try {
    const spans = await browserSpans(text);
    judgeBtn.textContent = BUSY;
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spans ? { text, source: selected, spans } : { text, source: selected }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as Judgement & { ms?: number; truncated?: boolean; extractorNote?: string | null };
    // Let the wall churn for a beat even when the judge is instant.
    const wait = 450 - (performance.now() - t0);
    if (wait > 0 && !reduced()) await new Promise((r) => setTimeout(r, wait));
    clearInterval(loadingTimer);
    current = j.totals.selected === selected ? j : reweigh(j, selected);
    textEl.value = current.text;
    showResult();
    const fromBrowser = j.extractor === "gliner" && /browser/.test(j.extractorNote ?? "") && !/rejected/.test(j.extractorNote ?? "");
    // Who found the spans and who gave the verdicts lives in the about panel; the card keeps only
    // what the visitor must act on.
    setLast(
      [
        j.extractor === "gliner" ? (fromBrowser ? STATUS.spansBrowser : STATUS.spansGliner) : STATUS.spansFallback,
        j.jev.ok ? STATUS.jev(j.jev.model ?? "jev", j.jev.ms ?? 0) : STATUS.jevOffline,
      ].join(" "),
    );
    setStatus([j.truncated ? STATUS.truncated : "", j.spans.length === 0 ? STATUS.noSpans : ""].filter(Boolean).join(" "));
  } catch (err) {
    clearInterval(loadingTimer);
    audio.stopLoop("loop-swarm");
    void audio.play("sfx-sad-trombone", 0.7);
    setStatus(`${STATUS.failed} (${String((err as Error).message ?? err)})`, true);
    judgeBtn.textContent = current ? SITE.buttonAgain : SITE.button;
  } finally {
    busy = false;
    judgeBtn.removeAttribute("aria-busy");
    if (current && judgeBtn.textContent === BUSY) judgeBtn.textContent = SITE.buttonAgain;
    wall.setBusy(false);
  }
}

function setStatus(s: string, err = false) {
  statusEl.textContent = s;
  statusEl.classList.toggle("err", err);
}

const lastRow = $("lastRow");
/** The last judgement's spans-and-verdicts line, shown in the about panel. */
function setLast(s: string) {
  $("lastText").textContent = s;
  lastRow.hidden = !s;
}

judgeBtn.addEventListener("click", () => void judgeNow());

// ---- copy -----------------------------------------------------------------------------------

/** A greentext summary: >be me, >worth N insects under X, the top 3 ledger lines, the link. */
function greentext(): string {
  const j = current!;
  const t = j.totals.bySource[selected];
  const top = j.ledger
    .filter((l) => l.countsInTotal && l.insects !== 0)
    .sort((a, b) => Math.abs(b.insects) - Math.abs(a.insects))
    .slice(0, 3)
    .map((l) => `>${short(l.insects).replace(MINUS, "-")} ${cleanLabel(l.label)}`);
  return [
    ">be me",
    `>worth ${plain(t.worth)} insects under ${WEIGHT_SOURCES[selected].name}`,
    ...top,
    react ? `>${react.line}` : "",
    SITE.url,
  ]
    .filter(Boolean)
    .join("\n");
}

copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const txt = greentext();
  let ok = false;
  try {
    await navigator.clipboard.writeText(txt);
    ok = true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
  }
  copyBtn.textContent = ok ? SITE.copied : SITE.copyFailed;
  if (ok) void audio.play("sfx-airhorn", 0.6);
  setTimeout(() => (copyBtn.textContent = SITE.copy), 1600);
});

// ---- share ----------------------------------------------------------------------------------
// SHARE sits beside COPY RESULT in one row (main.ts builds it; index.html only has the copy button).

const actions = document.createElement("div");
actions.className = "actions";
actions.id = "actions";
copyBtn.parentElement!.insertBefore(actions, copyBtn);
actions.appendChild(copyBtn);
/** A few wall stickers for the result card's background (same-origin, so the canvas stays clean). */
const CARD_STICKERS = ["w_bug_shrimp", "w_bug_ant", "w_bug_bee", "w_polycule", "w_bug_bsf", "w_trollface_head", "w_soldierA", "w_bug_mealworm"];
function shareInfo(): ShareInfo | null {
  if (!current || !react) return null;
  const w = current.totals.bySource[selected].worth;
  return { num: big(w), plainNum: plain(w), caste: current.caste, line: react.line, hero: art(WHO[react.who].hero) };
}
const share = initShare({
  row: actions,
  get: shareInfo,
  stickers: CARD_STICKERS.map(art).filter(Boolean),
  sound: (ok) => void audio.play(ok ? "sfx-airhorn" : "sfx-sad-trombone", 0.6),
});

autosize();

// ---- the bug brain: GLiNER2.5 in the browser -------------------------------------------------
// Desktop: loads itself on idle after the page's load event and never blocks a judgement.
// Phones, Save-Data and low-memory devices: the Worker's lexicon answers, unless they opt in.

type Brain = "idle" | "loading" | "ready" | "failed";
let brain: Brain = "idle";
let brainPct = 0;
const brainText = $("brainText");
const brainGo = $<HTMLButtonElement>("brainGo");
const brainMeter = $("brainMeter");
const brainBar = $("brainBar");
const meter = (pct: number | null) => {
  brainMeter.hidden = pct === null;
  if (pct !== null) brainBar.style.width = `${pct}%`;
};

const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, innerWidth) < 760;
const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
const skipAuto = phone || nav.connection?.saveData === true || lowMemory;

const brainEl = $("brain");
const setBrain = (b: Brain) => {
  brain = b;
  brainEl.dataset.brain = b;
};

function onBrain(p: GlinerProgress) {
  if (p.phase === "download") {
    brainPct = p.totalBytes ? Math.min(99, Math.floor((p.loadedBytes / p.totalBytes) * 100)) : 0;
    brainText.textContent = STATUS.brainLoading(brainPct);
    meter(brainPct);
  } else if (p.phase === "compile") {
    brainPct = Math.max(brainPct, 99);
    brainText.textContent = STATUS.brainCompiling;
    meter(brainPct);
  }
}

function startBrain() {
  if (brain === "loading" || brain === "ready") return;
  setBrain("loading");
  brainGo.hidden = true;
  brainText.textContent = STATUS.brainLoading(0);
  meter(0);
  loadGliner({ onProgress: onBrain }).then(
    () => {
      setBrain("ready");
      brainPct = 100;
      brainText.textContent = STATUS.brainReady;
      meter(null);
    },
    () => {
      setBrain("failed");
      brainText.textContent = STATUS.brainFailed;
      meter(null);
    },
  );
}

brainGo.textContent = STATUS.brainOptIn(BRAIN_MB);
brainGo.addEventListener("click", startBrain);
const idleThen = (cb: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 1200);
const bootBrain = () =>
  idleThen(() => {
    if (!skipAuto) startBrain();
    else {
      brainText.textContent = STATUS.brainSkipped;
      brainGo.hidden = false;
    }
  });
textEl.addEventListener("focus", bootBrain, { once: true });

// ---- sound ------------------------------------------------------------------------------------

const sfxBtn = $<HTMLButtonElement>("sfxToggle");
const musicBtn = $<HTMLButtonElement>("musicToggle");
function syncSound() {
  const s = audio.state();
  const sfx = s.sfx;
  sfxBtn.setAttribute("aria-pressed", String(sfx));
  sfxBtn.title = sfx ? SOUND.sfxOn : SOUND.sfxOff;
  $("sfxLabel").textContent = sfxBtn.title;
  musicBtn.setAttribute("aria-pressed", String(s.music));
  musicBtn.title = s.music ? SOUND.musicOn : SOUND.musicOff;
  $("musicLabel").textContent = musicBtn.title;
}
audio.onChange(syncSound);
syncSound();
sfxBtn.addEventListener("click", () => audio.setSfx(!audio.state().sfx));
musicBtn.addEventListener("click", () => audio.setMusic(!audio.state().music));
// Nothing loads or plays before the first gesture.
const firstGesture = () => audio.unlock();
addEventListener("pointerdown", firstGesture, { once: true, capture: true });
addEventListener("keydown", firstGesture, { once: true, capture: true });
