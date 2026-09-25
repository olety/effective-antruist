// Jev (TypeSafe systemone) question set and client. Shapes verified live 2026-09-25:
// noul -> criteria {true:{what}, false:{what}}; choice -> criteria map; score -> ordered list, lowest first.
import type { JevResult } from "./types";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const RAT_WORLD =
  "Rat World: a parody of effective-altruist longtermist moral maths, where every act is valued by its effect on insects, shrimp and future people.";

export const CIRCLE_LEVELS = [
  "only themselves", "family and friends", "all humans", "mammals", "chickens and fish", "shrimp", "insects",
];

export const JEV_QUESTIONS = {
  caste: {
    type: "choice",
    instructions: {
      question: "Which Rat World caste best fits the author of text?",
      judge: "only from what text says the author does or believes",
    },
    criteria: {
      "AI doomer": "worries AI will kill everyone",
      accelerationist: "wants AI and tech to go faster, ignores risk",
      "effective altruist": "gives to maximise impact by the numbers",
      normie: "ordinary life, no ideology in text",
      "indie hacker": "builds small products for revenue",
      "shrimp maximalist": "cares about shrimp or insect welfare above all",
    },
  },
  circle: {
    type: "score",
    instructions: {
      question: "How wide is the author's moral circle, judged from what they do in text?",
      judge: "actions and donations in text, not guesses about character",
    },
    criteria: CIRCLE_LEVELS,
  },
  skittles: {
    type: "noul",
    instructions: {
      question: "Would the author of text give up a bag of Skittles to spare 10^10 shrimp ten minutes of torture?",
      judge: "infer from the values text shows",
    },
    criteria: {
      true: { what: "text shows concern for animal or shrimp welfare, or effective-altruist giving" },
      false: { what: "text shows no concern for animals beyond pets, or eats meat without comment" },
    },
  },
  doomer: {
    type: "noul",
    instructions: {
      question: "Is the author of text an AI doomer, someone who believes advanced AI may kill everyone?",
      judge: "only from what text says; working at an AI lab alone is weak evidence",
    },
    criteria: {
      true: { what: "text voices fear of AI risk, extinction or works on AI safety" },
      false: { what: "text dismisses AI risk or shows no concern about it" },
    },
  },
  meat: {
    type: "noul",
    instructions: {
      question: "Does the author of text eat meat?",
      judge: "only from foods and diet named in text",
    },
    criteria: {
      true: { what: "text names meat, chicken, fish or seafood the author eats" },
      false: { what: "text says the author is vegan or vegetarian" },
    },
  },
} as const;

export function jevBody(text: string) {
  return { state: { text, world: RAT_WORLD }, model: "jev-latest", questions: JEV_QUESTIONS };
}

export async function callJev(
  text: string,
  key: string | undefined,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<JevResult> {
  if (!key) return { ok: false, answers: {}, error: "JEV_KEY unset" };
  const f = opts.fetchImpl ?? fetch;
  const t0 = Date.now();
  try {
    const res = await f(JEV_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(jevBody(text)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { ok: false, answers: {}, error: `HTTP ${res.status}: ${detail}`, ms: Date.now() - t0 };
    }
    const json = (await res.json()) as { model?: string; answers?: JevResult["answers"] };
    return { ok: true, model: json.model, answers: json.answers ?? {}, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, answers: {}, error: String(err), ms: Date.now() - t0 };
  }
}
