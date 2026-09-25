// Turn a Judgement into (a) one reaction character + bubble line + caption, (b) 3-6 ledger lines
// worth showing, (c) the sticker mix the wall flips to. Pure functions over the engine's types.
import type { Judgement, LedgerLine, WeightSourceId } from "./engine/types";
import { JOKES, REACTION, ownerLinesIn, pickJoke } from "./copy";
import CAST from "./stickers/cast.json";

export type ReactionId =
  | "net_negative" | "saint" | "ewhore_selfie" | "soy_shrimphug" | "soy_doomer_otaku" | "doomer_girl" | "troll"
  | "soy_crying" | "sjette_crying" | "soy_smug_calc" | "soldierA" | "soldierB";

export interface Reaction {
  who: ReactionId;
  line: string; // what the character shouts (owner lines verbatim where one fits)
  caption: string; // the total / Jev line under the shout
  meta: string; // the Jev probabilities, small print
  /** Sound cue for this verdict (see audio.ts). */
  cue: string;
}

export interface Flags {
  ea: boolean;
  shrimpy: boolean;
  doomer: boolean;
  accel: boolean;
  normie: boolean;
  hacker: boolean;
  negative: boolean;
  argue: boolean;
  bugsYes: boolean;
  troll: boolean;
  netNegative: boolean;
  saint: boolean;
}

export interface CastEntry {
  id: string;
  family: string;
  gender: "m" | "f" | "group" | "none";
  mood: string | null;
  note: string;
}
export const CAST_LIST = CAST as CastEntry[];

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function noul(j: Judgement, id: string): number {
  const a = j.jev.answers[id];
  return a?.type === "noul" ? a.noul : NaN;
}

const worthOf = (j: Judgement, s: WeightSourceId = j.totals.selected) => j.totals.bySource[s].worth;
const humanOf = (j: Judgement, s: WeightSourceId = j.totals.selected) => j.totals.bySource[s].humanInInsects;

/** The total's band, for the caption: debt / under / par / up / saint. */
export function totalKey(j: Judgement): string {
  const w = worthOf(j);
  const h = humanOf(j);
  if (w <= 0) return "total.debt";
  if (w < h * 0.999) return "total.under";
  if (w < h * 1.5) return "total.par";
  if (w < h * 100) return "total.up";
  return "total.saint";
}

/**
 * Jev says: not a doomer, and eats meat. The purple room wants you. A normie never gets in:
 * their lunch goes to the crying soyjaks and the arguing soldiers instead.
 */
const trollish = (j: Judgement) => noul(j, "doomer") < 0.2 && noul(j, "meat") > 0.8 && j.caste !== "normie";

export function flags(j: Judgement): Flags {
  const caste = j.caste ?? "";
  const skittles = noul(j, "skittles");
  const doomerP = noul(j, "doomer");
  const shrimpGift = j.ledger.some((l) => l.jokeKey === "donation.shrimp" || l.jokeKey === "donation.insect");
  return {
    ea: caste === "effective altruist",
    shrimpy: caste === "shrimp maximalist" || shrimpGift || skittles > 0.8,
    doomer: caste === "AI doomer" || doomerP > 0.8,
    accel: caste === "accelerationist",
    normie: caste === "normie",
    hacker: caste === "indie hacker",
    negative: worstLine(j) !== null,
    argue: j.soldiers.argue,
    bugsYes: j.soldiers.bugs.band === "yes",
    troll: caste === "accelerationist" || trollish(j),
    netNegative: worthOf(j) <= 0,
    saint: totalKey(j) === "total.saint",
  };
}

/** The counted line that cost the most insects, if any cost anything. */
export function worstLine(j: Judgement): LedgerLine | null {
  let worst: LedgerLine | null = null;
  for (const l of j.ledger) if (l.countsInTotal && l.insects < 0 && (!worst || l.insects < worst.insects)) worst = l;
  return worst;
}

const cleanFood = (label: string) => label.replace(/\s*\((once|a year)\)\s*$/i, "").trim();

/** Stable coin flip per text, so the cast alternates men and women across inputs. */
function coin(text: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) & 1) === 1;
}

/**
 * Who reacts, and what they shout. `used` collects the lines now on screen, so the ledger that
 * renders after this never repeats the payoff.
 */
export function reaction(j: Judgement, fmt: (n: number) => string, used: Set<string>): Reaction {
  const f = flags(j);
  const caste = j.jev.answers.caste;
  const circle = j.jev.answers.circle;
  const sk = noul(j, "skittles");
  const bits: string[] = [];
  if (caste?.type === "choice") bits.push(`caste: ${caste.choice}, ${pct(caste.probabilities?.[caste.choice] ?? caste.confidence)}`);
  if (circle?.type === "score") bits.push(`moral circle: ${circle.legend?.[String(Math.round(circle.score))] ?? circle.score}`);
  if (Number.isFinite(sk)) bits.push(`Skittles for shrimp: ${pct(sk)}`);
  const meta = j.jev.ok ? bits.join(" · ") : JOKES["error.jev_offline"].line;
  // The shout claims its owner lines too: "NOOO! THE ... COST" keeps "NOOO" out of the ledger jokes.
  const shout = (s: string) => {
    used.add(s);
    for (const o of ownerLinesIn(s)) used.add(o);
    return s;
  };
  const cap = (key: string) => pickJoke(key, used);

  const make = (who: ReactionId, line: string, captionKey: string, cue: string): Reaction => {
    const l = shout(line);
    return { who, line: l, caption: cap(captionKey), meta, cue };
  };

  if (f.netNegative) return make("net_negative", REACTION.net_negative, "total.debt", "net_negative");
  if (f.saint) return make("saint", REACTION.saint, "total.saint", "saint");
  if (f.ea) return make("ewhore_selfie", REACTION.ewhore_selfie, "caste.effective_altruist", "ea");
  if (j.caste === "shrimp maximalist") return make("soy_shrimphug", REACTION.soy_shrimphug, "caste.shrimp_maximalist", "shrimp");
  if (f.doomer) {
    const who = coin(j.text) ? "doomer_girl" : "soy_doomer_otaku";
    return make(who, REACTION[who], "caste.ai_doomer", "doomer");
  }
  if (f.accel) return make("troll", REACTION.troll, "caste.accelerationist", "troll");
  if (f.troll) return make("troll", REACTION.troll, "jev.doomer.no", "troll");
  const worst = worstLine(j);
  if (worst) {
    const what = cleanFood(worst.label).toUpperCase();
    const who = coin(j.text) ? "sjette_crying" : "soy_crying";
    return make(who, REACTION.worst(what, fmt(Math.abs(worst.insects))), totalKey(j), "worst");
  }
  if (f.hacker) return make("soy_smug_calc", REACTION.soy_smug_calc, "caste.indie_hacker", "hacker");
  if (f.normie) return make("soldierB", REACTION.soldierB, "caste.normie", "bugs");
  return make("soldierA", REACTION.soldierA, totalKey(j), "shrimps");
}

/** 3-6 ledger lines: the biggest priced lines, the funny zeros (unpriced charity), up to two hypotheticals. */
export function pickLines(j: Judgement): number[] {
  const idx = j.ledger.map((l, i) => ({ l, i }));
  const counted = idx.filter((x) => x.l.countsInTotal);
  const priced = counted
    .filter((x) => x.l.insects !== 0)
    .sort((a, b) => Math.abs(b.l.insects) - Math.abs(a.l.insects));
  const zeroGifts = counted.filter((x) => x.l.insects === 0 && /^(donation|charity)\./.test(x.l.jokeKey));
  const hypo = idx.filter((x) => !x.l.countsInTotal);
  const rest = counted.filter((x) => x.l.insects === 0 && !/^(donation|charity)\./.test(x.l.jokeKey));
  const out: number[] = [];
  const add = (xs: { i: number }[], cap: number) => {
    for (const x of xs) if (out.length < cap && !out.includes(x.i)) out.push(x.i);
  };
  add(priced, 4);
  add(zeroGifts, 5);
  add(priced, 5);
  add(hypo.slice(0, 2), 6);
  add(rest, 3);
  return out;
}

// ---- wall mix --------------------------------------------------------------

export type WallMix = Record<string, number>;

/** Wall id for a cast entry: the two purple-room frames are one animated sticker. */
const wallId = (id: string) => (/^w_troll_\d$/.test(id) ? "troll" : id);

/** Alt text from the manifest note: the description, not the production notes. */
export function altFor(id: string): string {
  const e = CAST_LIST.find((c) => c.id === id || c.id === id.replace(/^h_/, "w_"));
  if (!e) return "";
  const s = e.note
    .replace(/!?;\s*mouth-(open|closed) frame\.?/i, "!")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^Detailed-style /, "")
    .split(/(?<=\.)\s+/)
    .filter((x) => !/KNOWN FLAW|frame|opaque|\bpx\b|bbox|lives in HTML|anchor|cropped|render|retry|replaces|version|Superseded/i.test(x))
    .join(" ")
    .trim();
  return s || [e.mood, e.family === "ewhore" ? "e-whore" : e.family].filter(Boolean).join(" ");
}

/** Before any result: every sticker. Women and men carry equal total weight. */
export const IDLE_MIX: WallMix = (() => {
  const m: WallMix = {};
  const PEOPLE = 22; // total weight shared by the men and the women
  const men = CAST_LIST.filter((c) => c.gender === "m");
  const women = CAST_LIST.filter((c) => c.gender === "f");
  for (const c of men) m[c.id] = PEOPLE / 2 / men.length;
  for (const c of women) m[c.id] = PEOPLE / 2 / women.length;
  for (const c of CAST_LIST) {
    if (c.gender === "group") m[c.id] = 1.1;
    else if (c.gender === "none") m[wallId(c.id)] = c.family === "insect" ? (c.id === "w_bug_shrimp" ? 1.6 : 1.1) : 1.2;
  }
  Object.assign(m, {
    t_bugs: 0.8, t_shrimps: 0.8, t_trillions: 0.7, t_nooo: 0.6, t_date: 0.7, t_polycule: 0.7, t_ants: 0.6,
    t_ratworld: 0.5, t_antruist: 0.6,
  });
  return m;
})();

export const BLANK = "blank";

/**
 * After a result: the characters that match the verdict take over the wall. Insect stickers scale
 * with the worth (log10(1 + worth) / 3); a net negative leaves the wall mostly bare.
 */
export function verdictMix(f: Flags, worth: number): WallMix {
  const bugs = worth <= 0 ? 0 : Math.max(0.15, Math.min(4, Math.log10(1 + worth) / 3));
  const m: WallMix = {
    w_bug_ant: 0.8 * bugs, w_bug_bee: 0.8 * bugs, w_bug_bsf: 0.6 * bugs, w_bug_mealworm: 0.6 * bugs, w_bug_shrimp: 1 * bugs,
  };
  const add = (k: string, w: number) => (m[k] = (m[k] ?? 0) + w);
  if (f.netNegative) {
    // Mostly bare purple, a few crying soyjaks and one NOOO.
    add(BLANK, 30); add("w_soy_crying_ant", 2.5); add("w_soy_crying", 1); add("w_sjette_crying", 1.5); add("t_nooo", 1.2);
    return m;
  }
  if (f.negative) {
    add("w_soy_crying", 4); add("w_sjette_crying", 4); add("w_soy_crying_ant", 2); add("w_soy_crying_soldier", 1.5);
    add("t_nooo", 1.4);
  }
  if (f.saint) {
    add("w_soy_ewhore", 3); add("w_ewhore_delighted", 3); add("w_ewhore_selfie", 2); add("w_polycule", 4);
    add("w_soy_shrimphug", 2); add("t_polycule", 1.4); add("t_shrimps", 0.6);
  }
  if (f.ea) {
    add("w_soy_ewhore", 2); add("w_ewhore_delighted", 2); add("w_ewhore_selfie", 3); add("w_polycule", 2);
    add("w_soy_smug_calc", 2); add("t_date", 0.9); add("t_polycule", 0.6);
  }
  if (f.shrimpy) { add("w_soy_shrimphug", 3); add("w_bug_shrimp", 2 * Math.max(bugs, 0.3)); add("w_soldierA", 1.5); add("t_shrimps", 0.8); }
  if (f.doomer) { add("w_soy_doomer_otaku", 4); add("w_doomer_girl", 4); add("t_ants", 1.4); }
  if (f.troll) { add("troll", 5); add("w_trollface_head", 4); add("w_chad_yes", 2); add("t_trillions", 1.4); }
  if (f.hacker) { add("w_soy_smug_calc", 3); add("w_chad_yes", 1.5); add("w_soy_gaping", 1); add("w_npc_wojak", 1); }
  if (f.normie) { add("w_npc_wojak", 4); add("w_soy_gaping", 2); add("w_sjette_pointing", 1.5); add("w_soldierB", 2); add("t_bugs", 0.8); }
  if (f.argue) { add("w_soldierA", 1.5); add("w_soldierB", 1.5); add("t_shrimps", 0.5); add("t_bugs", 0.5); }
  if (f.bugsYes) { add("w_soldierB", 1.5); add("w_soy_crying_ant", 1.5); add("t_bugs", 0.6); }
  const any = f.negative || f.ea || f.saint || f.shrimpy || f.doomer || f.troll || f.hacker || f.normie;
  if (!any) { add("w_soldierA", 3); add("w_soldierB", 3); add("t_bugs", 2); add("t_shrimps", 2); }
  return m;
}
