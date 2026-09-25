// Plain-English explanations for a normal person: the unit, the weight buttons, the badges and one
// short "what this means" per ledger line. Approved copy: temp/yard3-20260925/copy/explainers.md.
// Every {brace} is filled from the line's own data and the ACTIVE weights, so the numbers follow the pills.
import { ANIMALS_PER_DOLLAR, ASSUMPTIONS, GIVEWELL_USD_PER_LIFE, SKITTLES_SHRIMP, WEIGHT_SOURCES } from "./engine/sources";
import type { LedgerLine, Species, WeightSourceId } from "./engine/types";

export const PILL_LABEL: Record<WeightSourceId, string> = { rp2023: "RP median", rpMean: "RP mean", neurons: "Neurons" };
export const SOURCES_URL = "https://github.com/olety/effective-antruist/blob/main/SOURCES.md";

/** The two badges, one line each (tooltips, the drawer, the ⓘ). */
export const BADGES = {
  notInTotal: { label: "not in total", meaning: "A what-if. Shown for fun, not added to your score." },
  unverified: { label: "unverified", meaning: "Our own guess. No source says this number." },
} as const;

// ---- numbers ------------------------------------------------------------------

/** A plain number: 76.92, 39.62, 1,754, 0.91. */
export function num(n: number): string {
  const a = Math.abs(n);
  if (!Number.isFinite(n)) return "?";
  if (a === 0) return "0";
  if (a >= 100) return Math.round(n).toLocaleString("en-US");
  if (a >= 0.01) return n.toFixed(2).replace(/\.?0+$/, "");
  return String(Number(n.toPrecision(2)));
}

/** "a 38%" but "an 86%" (and "an 11%", "an 18%"). */
const aPct = (p: number) => `${/^(8|11$|18$)/.test(String(p)) ? "an" : "a"} ${p}%`;

/** A big count in words: 7.5 million, 11.9 billion, 72 million. */
export function words(n: number): string {
  const a = Math.abs(n);
  const unit = (d: number, u: string) => `${(a / d).toFixed(a / d >= 100 ? 0 : 1).replace(/\.0$/, "")} ${u}`;
  if (a >= 1e15) return a.toExponential(1).replace("e+", " x 10^");
  if (a >= 1e12) return unit(1e12, "trillion");
  if (a >= 1e9) return unit(1e9, "billion");
  if (a >= 1e6) return unit(1e6, "million");
  return num(a);
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Insects one human is worth under these weights (1 / insect weight). */
export const rate = (sel: WeightSourceId) => 1 / WEIGHT_SOURCES[sel].weights.insect;
/** Insects one animal of this species is worth under these weights. */
export const perSpecies = (sp: Species, sel: WeightSourceId) =>
  WEIGHT_SOURCES[sel].weights[sp] / WEIGHT_SOURCES[sel].weights.insect;

const NAME: Record<Species, [string, string]> = {
  human: ["human", "humans"], chicken: ["chicken", "chickens"], pig: ["pig", "pigs"], cow: ["cow", "cows"],
  fish: ["fish", "fish"], shrimp: ["shrimp", "shrimp"], insect: ["insect", "insects"], cat: ["cat", "cats"], dog: ["dog", "dogs"],
};
const nm = (sp: Species, n = 1) => NAME[sp][n > 1 ? 1 : 0];
const insects = (n: number) => `${num(n)} ${Math.abs(n) === 1 ? "insect" : "insects"}`;

/** The animal a borrowed species is priced as, in these weights ("pig", "chicken"), or null. */
function borrowed(sp: Species, sel: WeightSourceId): string | null {
  const p = WEIGHT_SOURCES[sel].proxies[sp];
  if (!p || !["cow", "pig", "cat", "dog"].includes(sp)) return null;
  return p.replace(/\s*\(.*\)$/, "");
}

/** "There is no cow row, so a cow is priced as a pig." Only when the active weights borrow one. */
function proxyLine(sp: Species, sel: WeightSourceId): string {
  const as = borrowed(sp, sel);
  if (!as) return "";
  if (as === sp) return `There is no ${sp} row in this table, so we use the 2023 ${sp} median.`;
  return `There is no ${sp} row, so a ${sp} is priced as a ${as}.`;
}

// ---- the unit (the "?" by the name tag, and the drawer) -------------------------------

export function unitLines(sel: WeightSourceId): string[] {
  return [
    "Everything is counted in insects (one insect = one black soldier fly).",
    "Rethink Priorities estimates how much each animal can feel, next to a human.",
    "We use those estimates to turn you, your lunch, your pets and your gifts into insects.",
    `Right now 1 human = ${num(rate(sel))} insects (${PILL_LABEL[sel]}).`,
  ];
}

// ---- the weight buttons (the ⓘ, and the drawer) -----------------------------------------

export const WELFARE_RANGE =
  'What is a welfare range? How intense an animal\'s best and worst feelings can be, next to a human\'s. Human = 1. A range of 0.5 means "half as intense".';

export function weightLines(): { id: WeightSourceId; head: string; body: string }[] {
  const w = (id: WeightSourceId) => WEIGHT_SOURCES[id].weights;
  return [
    {
      id: "rp2023",
      head: "RP median (default)",
      body:
        "Rethink Priorities, 2023 (Bob Fischer, Moral Weight Project). The middle estimate for each species, already adjusted for two things: " +
        "the chance the animal feels anything at all, and how fast it experiences time. " +
        `Shrimp ${w("rp2023").shrimp}, black soldier fly ${w("rp2023").insect}. So 1 human = ${num(rate("rp2023"))} insects.`,
    },
    {
      id: "rpMean",
      head: "RP mean",
      body:
        "Rethink Priorities, 2025 (Hayley Clatterbuck, Moral Parliament tool). The average estimate, not lowered for the chance of feeling. " +
        `Averages pull toward the uncertain high end, so bugs count far more: shrimp ${w("rpMean").shrimp}, insects ${w("rpMean").insect}. ` +
        `So 1 human = ${num(rate("rpMean"))} insects.`,
    },
    {
      id: "neurons",
      head: "Neurons",
      body:
        "The same 2025 tool, using brain-based signs only, such as neuron counts. " +
        `Bugs count far less: insects ${w("neurons").insect}. So 1 human = about ${num(rate("neurons"))} insects.`,
    },
  ];
}

export const PROXY_NOTE =
  `Cats, dogs and cows have no row in these tables, so we price them as pigs (${WEIGHT_SOURCES.rp2023.weights.pig}). ` +
  `Neurons has no pig either, so there they are priced as chickens (${WEIGHT_SOURCES.neurons.weights.chicken}).`;

// ---- ledger lines ----------------------------------------------------------------------

/** The label the ledger shows (the Skittles line reads as a question). */
export function lineLabel(l: LedgerLine): string {
  if (l.jokeKey.startsWith("jev.skittles.")) {
    const p = Math.round((l.working.count / SKITTLES_SHRIMP) * 100);
    return `Skittles test: would you trade your candy for 10 billion shrimp? ${p}%`;
  }
  return l.label;
}

const UNVERIFIED = "UNVERIFIED";

/** What the span said, without the engine's suffixes: "chicken sandwich (once)" -> "chicken sandwich". */
const spanText = (l: LedgerLine) =>
  l.label.replace(/\s*\((once|a year)\)\s*$/i, "").replace(/:\s[^:]*$/, "").replace(/\s*\(≈[^)]*\)/g, "").trim();

const percentGift = (l: LedgerLine) => /\d%/.test(l.label);
/** The percent pledge in words; a pledge shared by several named charities says so, with each one's cut. */
function pledgeLine(l: LedgerLine, share: number): string {
  const pct = Number(/(\d+(?:\.\d+)?)%/.exec(l.label)?.[1] ?? NaN);
  const total = pct * ASSUMPTIONS.pledgeUsdPerPercentPoint;
  const head = `You gave a percent, not an amount. We assume each 1% is ${usd(ASSUMPTIONS.pledgeUsdPerPercentPoint)} a year (${UNVERIFIED})`;
  if (!Number.isFinite(total) || share <= 0) return `${head}.`;
  const ways = Math.round(total / share);
  return ways > 1
    ? `${head}, so ${pct}% is ${usd(total)}. You named ${ways} charities, so each gets ${usd(share)}.`
    : `${head}, so ${pct}% is ${usd(total)}.`;
}

/**
 * The plain explanation of one ledger line under the active weights. Plain text; the page turns the
 * word UNVERIFIED into a badge.
 */
export function explainLine(l: LedgerLine, sel: WeightSourceId): string {
  const k = l.jokeKey;
  const sp = l.working.species;
  const n = Math.abs(l.working.count);
  const out: string[] = [];

  if (k === "base.human") {
    out.push(`You start as one human. That is ${num(rate(sel))} insects on these weights.`);
  } else if (/^food\.(chicken|beef|pork|fish|shrimp)$/.test(k)) {
    const cls = k.slice(5);
    const daily = /\(a year\)\s*$/i.test(l.label);
    const per = ASSUMPTIONS.servings[cls]?.count ?? n / (daily ? 365 : 1);
    out.push(
      `${cap(spanText(l))} costs you. One serving is about ${num(per)} ${nm(sp, per)}, and one ${nm(sp)} is worth ${insects(perSpecies(sp, sel))}.`,
    );
    if (daily) out.push("You said every day, so we count 365 servings a year.");
    const px = proxyLine(sp, sel);
    if (px) out.push(px);
    out.push(`The serving sizes are our guess (${UNVERIFIED}).`);
  } else if (k === "food.vegan") {
    out.push(
      `Not eating meat spares chickens. We assume ${ASSUMPTIONS.veganServingsPerYear} chicken meals a year, about ${ASSUMPTIONS.servings.chicken.count} chicken each. That is our guess (${UNVERIFIED}).`,
    );
  } else if (k === "food.other") {
    out.push("We found food, but no animal in it. It counts zero.");
  } else if (k.startsWith("pet.")) {
    const as = borrowed(sp, sel) ?? "pig";
    out.push(
      `Pets count in your favour. You look after ${n === 1 ? "one" : `${num(n)} of them`}. ` +
        `There is no cat or dog row, so each one is priced as a ${as}: ${insects(perSpecies(sp, sel))}.`,
    );
  } else if (k === "donation.givewell") {
    out.push(
      `Your gift saves about ${num(n)} ${n === 1 ? "life" : "lives"}, at GiveWell's ${usd(GIVEWELL_USD_PER_LIFE)} per life. Each life is worth ${num(rate(sel))} insects.`,
    );
    if (percentGift(l)) out.push(pledgeLine(l, n * GIVEWELL_USD_PER_LIFE));
  } else if (/^donation\.(shrimp|insect|fish|chicken)$/.test(k)) {
    const perDollar = ANIMALS_PER_DOLLAR[sp] ?? 0;
    out.push(
      `Your gift helps about ${words(n)} ${nm(sp, n)}. Rethink Priorities estimates ${num(perDollar)} ${nm(sp, perDollar)} per dollar at top charities. ` +
        `One ${nm(sp)} is worth ${insects(perSpecies(sp, sel))}.`,
    );
    if (percentGift(l)) out.push(pledgeLine(l, perDollar > 0 ? n / perDollar : 0));
  } else if (k === "donation.orphan") {
    out.push("You gave money, but we could not tell to whom. It counts zero.");
  } else if (k === "charity.unrated") {
    out.push("We have no numbers for this charity. It counts zero.");
  } else if (k === "charity.nodonation") {
    out.push("You named this charity but did not say you gave. It counts zero.");
  } else if (k === "money.hoarded") {
    const perDollar = ANIMALS_PER_DOLLAR.shrimp ?? 1;
    out.push(
      `This is money you kept (${usd(n / perDollar)} a year). Given to a shrimp charity, it would help ${words(n)} shrimp. It is a what-if, so it is not in your total.`,
    );
  } else if (k.startsWith("jev.skittles.")) {
    const p = Math.round((l.working.count / SKITTLES_SHRIMP) * 100);
    out.push(
      `The Skittles test is a thought experiment: give up one bag of Skittles to save 10 billion shrimp? ` +
        `Jev, our AI judge, guesses there is ${aPct(p)} chance you would. Saving them would be worth ${words(l.insectsBySource[sel])} insects. ` +
        "It is a what-if, so it is not in your total.",
    );
  } else if (k.startsWith("ailab.")) {
    out.push("An AI lab. It counts zero. The joke depends on whether Jev thinks you fear AI.");
  } else if (/^(employer|job|city|hobby)\./.test(k)) {
    out.push("Noted, but it has no insect price. It counts zero.");
  } else if (k.startsWith("animal.")) {
    out.push("You mentioned an animal, but you did not eat, keep or fund it. It counts zero.");
  }
  return out.join(" ");
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
