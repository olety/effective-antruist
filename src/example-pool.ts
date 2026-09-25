// Prewritten bios for the TRY chips. Each chip picks one of its texts at random
// (never the one it showed last). The first three chips open with examples A, B, C.
// Every text was run through both extraction paths (in-browser GLiNER spans and the Worker's
// lexicon) and lands the same reaction on both; chip-mates land different reactions.
import { EXAMPLES } from "./examples";

export type ExampleChip = { id: string; label: string; texts: string[] };

export const EXAMPLE_POOL: ExampleChip[] = [
  {
    id: "lab",
    label: "lab engineer",
    texts: [
      EXAMPLES[0].text,
      "Member of technical staff at OpenAI. accelerate, obviously. had a burger at the offsite, then shipped a model nobody asked for. 2 dogs, lives in SF, thinks safety teams are a psyop.",
      "Alignment researcher at Google DeepMind. p(doom) high and rising. I donate 10% to the Long-Term Future Fund, eat tofu, and meditate so I stop crying about superintelligence. London, one cat.",
      "ML engineer at Meta AI. eats shrimp every day, sushi on weekends. thinks animal welfare is a rounding error. lives in NYC with a goldfish, runs marathons, has never read a single EA post.",
      "Research scientist at Anthropic, ex-Stripe. I give 15% to the Against Malaria Foundation, spreadsheet included. vegetarian, bouldering, Berkeley group house with my partners and one cat.",
    ],
  },
  {
    id: "indie",
    label: "indie hacker",
    texts: [
      EXAMPLES[1].text,
      "solo founder, 3 apps, $11k MRR, no VC. vegan because it's cheaper. Berlin, one cat, a standing desk I never stand at.",
      "bootstrapped a Shopify app to $9k MRR. I donate 10% of profit to the Shrimp Welfare Project because the unit economics of shrimps are insane. vegan, chess, lives in Austin.",
      "building an AI wrapper at $3k MRR while privately convinced superintelligence will kill us all by 2030. ramen every night, climbing on weekends, Toronto. my cofounder is a cat.",
      "founder of 14 abandoned side projects, $0 MRR, 40k followers. prawns every day because I'm in Singapore and I deserve it. gaming till 4am, two hamsters, one cofounder who ghosted.",
    ],
  },
  {
    id: "normal",
    label: "a normal day",
    texts: [
      EXAMPLES[2].text,
      "Today I had a salad at my desk, walked the two dogs, volunteered at the food bank, watched a documentary about bees, and fell asleep on the sofa before 10. Boston.",
      "Big day. realised I've had chicken nuggets every day since March, fed the two cats, sprayed the ants in the kitchen, stepped on a snail, and watched a show about pigeons. London.",
      "Today: shrimp tempura at lunch, walked the two dogs, paid my phone bill, got lost in Osaka station for an hour, and my manager at Amazon called me a rockstar in a Slack thread.",
      "Today I forgot my umbrella, and my mum made me donate $50 to the Shrimp Welfare Project because she saw a video. then pizza, laundry, and an argument with my cat about the thermostat. Toronto.",
    ],
  },
  {
    id: "ea",
    label: "ea student",
    texts: [
      "philosophy student at Oxford. took the Giving What We Can pledge at 19. I donate 10% of my stipend to GiveWell, run a utilitarianism reading group, vegan, one cat, zero chill.",
      "econ student in Berkeley. the shrimps are the cause of our century. I don't eat honey, I don't kill mosquitoes, and I make my housemates carry spiders outside. vegan, obviously. one cat, also vegan.",
      "CS student in Cambridge. I gave $5 to the Insect Welfare Research Society instead of buying lunch. bees are people. bouldering, vegan, and a spreadsheet of every ant I have stepped on.",
      "president of my uni EA group. 80,000 Hours changed my life. chicken nuggets every day during exams, pepperoni pizza on Fridays. I will start donating once I'm at Jane Street. London.",
      "grad student in Berkeley, polycule of five, three of us work on AI safety. we give 20% to the Shrimp Welfare Project and argue about wasp suffering at dinner. vegan, two rabbits, one shared calendar.",
    ],
  },
  {
    id: "doomer",
    label: "doomer",
    texts: [
      "AI safety researcher at MIRI. p(doom) basically 1. stopped saving for retirement, vegan, donates to MIRI, hasn't slept properly since GPT-5. lives in Berkeley with a rescue cat.",
      "anime pfp, 20k followers, posts about superintelligence killing everyone at 4am. ramen every day, lives in Tokyo with two cats, rewatches Evangelion as an alignment curriculum. no job, just vibes and dread.",
      "left Google to work on AI alignment full-time. p(doom) is high. I donate $1,000 a year to the Shrimp Welfare Project because if we all die, at least the shrimps had a good decade. one cat.",
      "convinced AGI kills us all by 2029, so I eat chicken wings every day and lobster on weekends. nothing matters. quit my job at Amazon, spending my savings on poker in Las Vegas.",
      "recovering doomer. read LessWrong for six years, now I just want the AI god to hurry up. e/acc, bacon and eggs for breakfast, software engineer at Microsoft, Seattle, two cats, zero dread.",
    ],
  },
  {
    id: "gym",
    label: "gym bro",
    texts: [
      "powerlifter. chicken and rice every day, 6 eggs, steak on Sundays. creatine is my religion. 405 deadlift, one husky, lives in Austin. vegans are just weak and I will say it.",
      "crypto founder, gym rat, 3x leveraged on everything. I eat steak after leg day and want AI to go faster. never touch grass. two dogs, a leased Lambo I call an asset, lives in Miami.",
      "vegan bodybuilder, 220 lbs of tofu and spite. I gave $100 to The Humane League this month. yoga on rest days, lives in Seattle, two rescue dogs who also do cardio.",
      "Today: leg day at 6, tuna sandwich in the car, lost the squat rack to a guy called Brad, cried at a video of ants carrying a dead ant home, then came back to two dogs who judged me. London.",
      "$600k comp, bench 315, quant at Jane Street. I give 50% to the Against Malaria Foundation and call it earning to give. chicken salad every lunch, lives in NYC, two dogs, no hobbies.",
    ],
  },
];
