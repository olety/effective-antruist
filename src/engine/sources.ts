// Every number here is either VERIFIED in SOURCES.md (retrieved 2026-09-25)
// or listed in ASSUMPTIONS with status UNVERIFIED. Nothing else.
import type { Species, WeightSource, WeightSourceId } from "./types";

export interface Citation {
  id: string;
  title: string;
  url: string;
  status: "VERIFIED" | "UNVERIFIED";
  note: string;
}

export const CITATIONS: Record<string, Citation> = {
  "rp-welfare-ranges-2023": {
    id: "rp-welfare-ranges-2023",
    title: "Rethink Priorities' Welfare Range Estimates (Fischer, 2023), 50th percentile",
    url: "https://forum.effectivealtruism.org/posts/Qk3hd6PrFManj8K6o/rethink-priorities-welfare-range-estimates",
    status: "VERIFIED",
    note: "Sentience-adjusted medians: pigs 0.515, chickens 0.332, carp 0.089, shrimp 0.031, black soldier flies 0.013.",
  },
  "rp-moral-parliament-2025": {
    id: "rp-moral-parliament-2025",
    title: "A Moral Parliament Tool for Distributing Resources across Farmed Animal Recipients (Clatterbuck, 2025-10-15)",
    url: "https://forum.effectivealtruism.org/posts/QjaBLHytFF82YDwxj/a-moral-parliament-tool-for-distributing-resources-across",
    status: "VERIFIED",
    note: "RP mean ranges (not sentience-adjusted), neuron-proxy ranges, animals affected per $1M. Insects = black soldier flies; fish = carp.",
  },
  "insects-alive": {
    id: "insects-alive",
    title: "Smithsonian BugInfo: Numbers of Insects",
    url: "https://www.si.edu/spotlight/buginfo/bugnos",
    status: "VERIFIED",
    note: "\"some 10 quintillion (10,000,000,000,000,000,000) individual insects are alive\"",
  },
  "world-population": {
    id: "world-population",
    title: "Worldometer world population clock",
    url: "https://www.worldometers.info/world-population/",
    status: "VERIFIED",
    note: "8,317,003,377 on 2026-09-25.",
  },
  "benthams-bulldog-2026": {
    id: "benthams-bulldog-2026",
    title: "Insects Matter More Than People (in the aggregate), Bentham's Bulldog, 2026-09-18",
    url: "https://benthams.substack.com/p/insects-matter-more-than-people",
    status: "VERIFIED",
    note: "\"insects matter more in the aggregate than humans.\"",
  },
  "givewell-cost-per-life": {
    id: "givewell-cost-per-life",
    title: "GiveWell: How much does it cost to save a life?",
    url: "https://www.givewell.org/how-much-does-it-cost-to-save-a-life",
    status: "VERIFIED",
    note: "$3,000-$5,500 per life at top charities; the engine uses $5,500 (AMF).",
  },
  "swp-per-dollar": {
    id: "swp-per-dollar",
    title: "Shrimp Welfare Project homepage",
    url: "https://www.shrimpwelfareproject.org/",
    status: "VERIFIED",
    note: "~1,400 shrimps helped per dollar per year. Shown for context; the engine uses the Moral Parliament 1.5B per $1M.",
  },
  "jev-skittles": {
    id: "jev-skittles",
    title: "The Skittles question (the thought experiment's own numbers: 10^10 shrimp, ten minutes)",
    url: "",
    status: "VERIFIED",
    note: "Not an empirical claim: the count is part of the question put to Jev.",
  },
  assumptions: {
    id: "assumptions",
    title: "Placeholder assumptions (see ASSUMPTIONS in src/engine/sources.ts)",
    url: "",
    status: "UNVERIFIED",
    note: "Serving sizes, pledge size and species proxies. Owner to source or cut before launch.",
  },
  unpriced: {
    id: "unpriced",
    title: "Unpriced in Rat World",
    url: "",
    status: "VERIFIED",
    note: "No number: the line is shown at 0 insects.",
  },
};

// ---- moral weights (human = 1) -------------------------------------------

const RP2023 = { pig: 0.515, chicken: 0.332, carp: 0.089, shrimp: 0.031, bsf: 0.013 }; // VERIFIED
const RP_MEAN = { chicken: 0.46, fish: 0.34, shrimp: 0.2, insect: 0.2 }; // VERIFIED
const NEURONS = { chicken: 0.037, fish: 0.00084, shrimp: 0.00088, insect: 0.00057 }; // VERIFIED

export const WEIGHT_SOURCES: Record<WeightSourceId, WeightSource> = {
  rp2023: {
    id: "rp2023",
    name: "Rethink Priorities 2023 (median)",
    citationId: "rp-welfare-ranges-2023",
    weights: {
      human: 1, chicken: RP2023.chicken, pig: RP2023.pig, fish: RP2023.carp, shrimp: RP2023.shrimp, insect: RP2023.bsf,
      cow: RP2023.pig, cat: RP2023.pig, dog: RP2023.pig,
    },
    proxies: { cow: "pig", cat: "pig", dog: "pig", fish: "carp", insect: "black soldier fly" },
  },
  rpMean: {
    id: "rpMean",
    name: "Rethink Priorities mean (Moral Parliament 2025)",
    citationId: "rp-moral-parliament-2025",
    weights: {
      human: 1, chicken: RP_MEAN.chicken, fish: RP_MEAN.fish, shrimp: RP_MEAN.shrimp, insect: RP_MEAN.insect,
      // No mammal in this table: borrow the 2023 pig median (UNVERIFIED as a mean).
      pig: RP2023.pig, cow: RP2023.pig, cat: RP2023.pig, dog: RP2023.pig,
    },
    proxies: { pig: "pig (2023 median)", cow: "pig (2023 median)", cat: "pig (2023 median)", dog: "pig (2023 median)" },
  },
  neurons: {
    id: "neurons",
    name: "Neuron count (Moral Parliament 2025)",
    citationId: "rp-moral-parliament-2025",
    weights: {
      human: 1, chicken: NEURONS.chicken, fish: NEURONS.fish, shrimp: NEURONS.shrimp, insect: NEURONS.insect,
      // No mammal in this table: borrow chicken (UNVERIFIED; a lower bound).
      pig: NEURONS.chicken, cow: NEURONS.chicken, cat: NEURONS.chicken, dog: NEURONS.chicken,
    },
    proxies: { pig: "chicken", cow: "chicken", cat: "chicken", dog: "chicken" },
  },
};

export const WEIGHT_SOURCE_IDS: WeightSourceId[] = ["rp2023", "rpMean", "neurons"];

// ---- scale and world numbers (VERIFIED) -----------------------------------

/** Animals affected per $1 at top charities (Moral Parliament, per $1M / 1e6). */
export const ANIMALS_PER_DOLLAR: Partial<Record<Species, number>> = {
  chicken: 50_000_000 / 1e6,
  fish: 5_000_000 / 1e6,
  shrimp: 1_500_000_000 / 1e6,
  insect: 1_000_000_000 / 1e6,
};
export const GIVEWELL_USD_PER_LIFE = 5_500;
export const INSECTS_ALIVE = 1e19;
export const HUMANS_ALIVE = 8_317_003_377;
export const SKITTLES_SHRIMP = 1e10;

// ---- assumptions (UNVERIFIED placeholders) --------------------------------

export const ASSUMPTIONS = {
  /** Animals per one serving of each food. UNVERIFIED. */
  servings: {
    chicken: { species: "chicken", count: 0.1 },
    beef: { species: "cow", count: 0.001 },
    pork: { species: "pig", count: 0.002 },
    fish: { species: "fish", count: 1 },
    shrimp: { species: "shrimp", count: 10 },
  } as Record<string, { species: Species; count: number }>,
  /** A vegan-year spares this many chicken servings. UNVERIFIED. */
  veganServingsPerYear: 365,
  /** "I donate 10%" gives this many dollars a year, split across named charities. UNVERIFIED. */
  pledgeUsdPerPercentPoint: 1_000,
} as const;
