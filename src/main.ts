import "./style.css";
import { EXAMPLES } from "./examples";
import { joke } from "./copy";
import { reweigh } from "./engine/engine";
import { CITATIONS, WEIGHT_SOURCES, WEIGHT_SOURCE_IDS } from "./engine/sources";
import type { Judgement, JevVerdict, WeightSourceId } from "./engine/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const textEl = $<HTMLTextAreaElement>("text");
const echoEl = $("echo");
const ledgerEl = $("ledger");
const statusEl = $("status");

let current: Judgement | null = null;
let selected: WeightSourceId = "rp2023";
let active = -1;

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a >= 1e6 || a < 0.01) return n.toExponential(2).replace("e+", "e");
  return n.toLocaleString("en-US", { maximumFractionDigits: a < 10 ? 2 : 0 });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderEcho() {
  if (!current) return (echoEl.textContent = "");
  const t = current.text;
  const line = active >= 0 ? current.ledger[active] : null;
  const cuts = new Set<number>([0, t.length]);
  for (const s of current.spans) cuts.add(s.start).add(s.end);
  const pts = [...cuts].sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const chunk = escapeHtml(t.slice(a, b));
    const inSpan = current.spans.some((s) => s.start <= a && b <= s.end);
    const hit = line && line.spanStart >= 0 && line.spanStart <= a && b <= line.spanEnd;
    html += hit ? `<mark>${chunk}</mark>` : inSpan ? `<span class="sp">${chunk}</span>` : chunk;
  }
  echoEl.innerHTML = html;
}

function renderSoldier(el: string, meta: string, v: JevVerdict, who: "bugs" | "shrimps") {
  $(el).parentElement!.dataset.band = v.band;
  $(el).textContent = joke(`soldier.${who}.${v.band}`);
  $(meta).textContent = `${v.band} · ${v.detail}`;
}

function render() {
  if (!current) return;
  const j = current;
  $("caste").textContent = j.caste ? `caste: ${j.caste}` : "caste: (Jev offline)";
  renderSoldier("bubbleA", "metaA", j.soldiers.bugs, "bugs");
  renderSoldier("bubbleB", "metaB", j.soldiers.shrimps, "shrimps");
  $("argue").hidden = !j.soldiers.argue;

  const t = j.totals.bySource[selected];
  $("total").textContent = `${fmt(t.worth)} insects`;
  $("totalNote").textContent =
    `worth in insects under ${WEIGHT_SOURCES[selected].name}. 1 human = ${fmt(t.humanInInsects)} insects. ` +
    `Hypothetical lines (not in total): ${fmt(t.hypothetical)}.`;
  const ag = j.totals.aggregate[selected];
  $("aggregate").textContent =
    `World: ${fmt(ag.insectsAlive)} insects x ${ag.insectWeight} = ${fmt(ag.insectMoralMass)} human-equivalents ` +
    `vs ${fmt(ag.humansAlive)} humans. Insects outweigh humans ${fmt(ag.ratio)} to 1.`;

  ledgerEl.innerHTML = "";
  j.ledger.forEach((l, i) => {
    const li = document.createElement("li");
    if (!l.countsInTotal) li.classList.add("hyp");
    if (i === active) li.setAttribute("aria-current", "true");
    const c = CITATIONS[l.citationId];
    li.innerHTML =
      `<span class="n">${l.insects > 0 ? "+" : ""}${fmt(l.insects)}</span> ${escapeHtml(l.label)}` +
      `${l.countsInTotal ? "" : " (hypothetical)"}` +
      `<span class="j">${escapeHtml(joke(l.jokeKey))}</span>` +
      `<span class="c">[${escapeHtml(l.citationId)}${c?.status === "UNVERIFIED" ? " · UNVERIFIED" : ""}] ${escapeHtml(l.working.note)}</span>`;
    li.addEventListener("click", () => {
      active = active === i ? -1 : i;
      render();
    });
    ledgerEl.appendChild(li);
  });
  renderEcho();
  statusEl.textContent =
    `spans: ${j.extractor}` + (j.jev.ok ? ` · Jev ${j.jev.model} ${j.jev.ms}ms` : ` · Jev offline (${j.jev.error ?? "?"})`);
}

async function judgeNow() {
  const text = textEl.value.trim();
  if (!text) return;
  statusEl.textContent = "judging…";
  try {
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, source: selected }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    current = (await res.json()) as Judgement;
    active = -1;
    render();
  } catch (err) {
    statusEl.textContent = `failed: ${String(err)}`;
  }
}

// ---- wiring ---------------------------------------------------------------

const sw = $("switch");
for (const id of WEIGHT_SOURCE_IDS) {
  const lab = document.createElement("label");
  lab.innerHTML = `<input type="radio" name="src" value="${id}" ${id === selected ? "checked" : ""}/> ${WEIGHT_SOURCES[id].name}`;
  lab.querySelector("input")!.addEventListener("change", () => {
    selected = id;
    if (current) current = reweigh(current, selected);
    render();
  });
  sw.appendChild(lab);
}

const exEl = $("examples");
for (const ex of EXAMPLES) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = ex.id;
  b.title = ex.label;
  b.addEventListener("click", () => {
    textEl.value = ex.text;
    textEl.dispatchEvent(new Event("input"));
  });
  exEl.appendChild(b);
}
textEl.addEventListener("input", () => ($("count").textContent = `${textEl.value.length} / 1500`));
$("judge").addEventListener("click", judgeNow);
textEl.value = EXAMPLES[0].text;
textEl.dispatchEvent(new Event("input"));
