// The only copy table. Owner lines are verbatim, straight ASCII, never softened.
// JOKES comes from the tone-checked copy-final.json (keyed by the engine's jokeKeys: line + alts).
// Anything marked "// DRAFT: owner pass" was written by the integrator and still wants his read.

/** The owner's seven lines. Word for word. */
export const OWNER = {
  bugs: "BUG LIVES MATTER!",
  shrimps: "SAVE THE SHRIMPS!",
  polycule: "WAIT, YOU WANNA JOIN OUR POLYCULE?",
  date: "I ONLY DATE MEN WHO DONATE TO SHRIMP",
  ants: "IF YOU DON'T LOVE THE ANTS, THE AI GOD WILL FACTORY FARM YOU",
  trillions: "TRILLIONS MUST DIE",
  nooo: "NOOO",
} as const;
export type OwnerId = keyof typeof OWNER;
export const OWNER_LINES: string[] = Object.values(OWNER);

export interface Joke {
  line: string;
  alts: string[];
}

/** Ledger, caste, circle, total and cast lines, keyed by jokeKey. */
export const JOKES: Record<string, Joke> = {
  "base.human": { line: "> be human > get priced in flies > it's not a lot of flies", alts: ["you are a moral patient. so are the flies. there are more of the flies.", "welfare range 1.0. sounds big until you meet the denominator."] },
  "food.chicken": { line: "NOOO YOU CAN'T EAT HER, SHE HAD A WELFARE RANGE. haha nugget go brrr", alts: ["NOOO. the chicken had a welfare range. you had a coupon.", "the chicken filed a complaint. the chicken is now your creditor."] },
  "food.beef": { line: "no cow row, so your beef was billed as a pig. peer reviewed.", alts: ["the spreadsheet prefers beef to chicken. the soyjaks are furious about it.", "> eats steak > a rat smells it three blocks away > reaches for the calculator"] },
  "food.pork": { line: "we price dogs as pigs. so technically that was a bit of your dog.", alts: ["the sheet rates a pig at half a human. you had half a human with eggs.", "NOOO NOT WILBUR"] },
  "food.fish": { line: "your fish was billed as a carp. it's fine. it's extremely dead.", alts: ["pescatarian: vegan with a loophole the size of a trawler.", "sushi night. a fish died so you could post it."] },
  "food.shrimp": { line: "NOOO. you ate ten constituents. in garlic butter.", alts: ["you ate the constituency.", "the soyjakette saw your plate. she's crying into her ring light."] },
  "food.vegan": { line: "chickens spared. the bugs in the soy field are off-ledger, for morale.", alts: ["vegan credit issued. you may mention it one (1) more time."] },
  "food.other": { line: "no welfare range on file. enjoy it before a grant fixes that.", alts: ["unpriced. the shrimp council has not yet ruled on pizza.", "zero bugs. if there was honey in it, the bees want a word."] },
  "pet.cat": { line: "billed as a pig. do not tell the cat.", alts: ["the cat is a small furry negative utilitarian with a body count.", "> has two cats > checks total > the cats outweigh anon > they always did"] },
  "pet.dog": { line: "the only animal you're allowed to love without a citation.", alts: ["billed as a pig. your dog and your bacon share a welfare range.", "> has dogs > each one billed as a pig > the dogs outvote you at home"] },
  "pet.other": { line: "no row for this pet. it's a cat now, and cats are pigs.", alts: ["your hamster is legally a pig now. that's the science."] },
  "animal.mention": { line: "animal mentioned, nothing done. thoughts and prayers, but for bugs.", alts: ["you named an animal. the soldiers noticed. the soldiers always notice.", "naming an animal is not a donation. nice try."] },
  "animal.bug": { line: "debugging is genocide. the soldiers have your commit history.", alts: ["every bug you ever fixed had a family.", "you fixed a bug? the soldiers heard 'killed a bug'. BUG LIVES MATTER!"] },
  "donation.givewell": { line: "malaria nets? so 2015. the shrimp were right there.", alts: ["> saves a child > calculator soyjak: 'ok but have you considered shrimp'", "you saved a kid. in Rat World, the worst deal on the board."] },
  "donation.shrimp": { line: "SAVE THE SHRIMPS! you did. the e-whore is typing...", alts: ["I ONLY DATE MEN WHO DONATE TO SHRIMP. hi.", "SAVE THE SHRIMPS! you did. the soyjakette wants your receipt."] },
  "donation.chicken": { line: "per dollar, hens beat saving a child. Rat World is a normal place.", alts: ["cages slightly roomier. the hens send a thumbs up. they have no thumbs."] },
  "donation.fish": { line: "five fish a dollar. shrimp do 1,500. please see the shrimp desk.", alts: ["the fish are grateful. for about three seconds.", "fish helped. they will never know. you will never stop mentioning it."] },
  "donation.insect": { line: "BUG LIVES MATTER! the mosquito that bit you says thanks.", alts: ["BUG LIVES MATTER! you're the bug guy now. this is permanent.", "> funds insect welfare > maggots now have better healthcare than anon"] },
  "donation.orphan": { line: "no charity named. not effective altruism, just altruism. ew.", alts: ["unnamed giving. the soldiers assume it went in an e-whore's tip jar."] },
  "charity.unrated": { line: "local, legible, emotionally satisfying. disgusting. 0 insects.", alts: ["helped a human near you? no RCT, no bugs, no points.", "you helped real people you can see. the rats call that parochial."] },
  "charity.nodonation": { line: "moral circle: wide. wallet circle: closed.", alts: ["admired, not funded. a strong upvote is worth 0 insects.", "> name-drops the charity > gives $0 > the e-whore left you on read"] },
  "money.hoarded": { line: "I ONLY DATE MEN WHO DONATE TO SHRIMP", alts: ["all that revenue and not one (1) shrimp.", "every dollar you kept is 1,500 shrimp. keep shipping, king."] },
  "ailab.doomer": { line: "builds the god. fears the god. cashes the god's cheques.", alts: ["high p(doom), four-year vest. you priced the apocalypse after the cliff.", "IF YOU DON'T LOVE THE ANTS, THE AI GOD WILL FACTORY FARM YOU"] },
  "ailab.accel": { line: "ships models, skips the doom. the purple room saved you a seat.", alts: ["accelerating. the shrimp get uploaded in v2. ship it.", "> builds AI > doesn't cry about it > rats seething > based"] },
  "ailab.argue": { line: "p(doom): coin flip. vesting schedule: certain.", alts: ["unsure if your job ends the world. moral uncertainty, with dental.", "p(doom) between 20 and 80. that's not calibration, that's a shrug."] },
  "ailab.unknown": { line: "lab noted. please hold, the god is buffering.", alts: ["AI lab found, Jev offline. schrödinger's doomer."] },
  "employer.generic": { line: "your boss is worth zero bugs. finally, a number you agree with.", alts: ["employer: morally neutral, spiritually beige.", "your employer has no welfare range. HR tried to add one."] },
  "job.generic": { line: "nice title. the ant queen has a better one.", alts: ["80,000 hours of career and so far 0 insects.", "> has a job > the ants also have jobs > the ants don't post about it"] },
  "city.generic": { line: "city noted. a group house there is drafting a polycule charter.", alts: ["nice city. the cockroaches were there first.", "the bugs live there too. they pay no rent."] },
  "hobby.generic": { line: "hobby noted. touching grass kills bugs, btw.", alts: ["hobby logged. the e-whore sent you her kink survey. it's for science.", "every hour on this was an hour not spent on the shrimp."] },
  "jev.skittles.yes": { line: "hypothetical sainthood achieved. real Skittles unaffected.", alts: ["Skittles surrendered. taste the rainbow of astronomical stakes.", "you'd trade candy for crustaceans. the polycule is taking notes."] },
  "jev.skittles.no": { line: "keeps the Skittles. ten billion shrimp scream. anon chews.", alts: ["taste the rainbow. the shrimp taste the torture.", "refuses the trade. scope insensitive. the trollface respects it."] },
  "jev.skittles.argue": { line: "gives up the Skittles. keeps the purple ones. moral uncertainty.", alts: ["the soldiers argue over your Skittles. one is crying, one is eating them.", "> Skittles or ten billion shrimp? > anon: depends, what flavour"] },
  "soldier.bugs.yes": { line: "BUG LIVES MATTER! ONE OF US! ONE OF US!", alts: ["BUG LIVES MATTER! WAIT, YOU WANNA JOIN OUR POLYCULE?", "BUG LIVES MATTER! THE ANTS VOUCH FOR YOU."] },
  "soldier.bugs.no": { line: "BUG LIVES MATTER! NOT YOURS, THOUGH.", alts: ["BUG LIVES MATTER! AND YOU STEPPED ON ONE TODAY. WE SAW.", "BUG LIVES MATTER! THE ANTS HAVE FILED A REPORT."] },
  "soldier.bugs.argue": { line: "BUG LIVES MATTER! ...DO THEY? SARGE, DO THEY??", alts: ["BUG LIVES MATTER! ...I NOTICE I AM CONFUSED.", "BUG LIVES MATTER! UNLESS IT'S A MOSQUITO? SARGE???"] },
  "soldier.shrimps.yes": { line: "SAVE THE SHRIMPS! YOU'D DROP THE SKITTLES? MARRY US. ALL OF US.", alts: ["SAVE THE SHRIMPS! POLYCULE MATERIAL SPOTTED!", "SAVE THE SHRIMPS! A TRUE BELIEVER! GET THIS ONE A HELMET!"] },
  "soldier.shrimps.no": { line: "SAVE THE SHRIMPS! FROM YOU, SPECIFICALLY!", alts: ["SAVE THE SHRIMPS! THERE'S SKITTLES ON YOUR BREATH!", "SAVE THE SHRIMPS! HALT, CANDY-EATER!"] },
  "soldier.shrimps.argue": { line: "SAVE THE SHRIMPS! ...I'M UPDATING! I'M UPDATING! STOP!", alts: ["SAVE THE SHRIMPS! ...SOME OF THE SHRIMPS? SARGE?", "SAVE THE SHRIMPS! ...OK BUT WHICH FLAVOUR OF SKITTLES?"] },
  "soldiers.argue": { line: "they called a moral parliament. it's two guys and a shrimp.", alts: ["someone said 'steelman'. it's over.", "the soldiers argue. one of them said 'crux'. this could take a decade."] },
  "soldier.offline": { line: "lost radio contact with Jev. shouting anyway.", alts: ["no signal from Jev. the soldiers guess. so do the moral weights."] },
  "caste.ai_doomer": { line: "p(doom) 99.9%. pension fully funded.", alts: ["everyone dies. but first, a 90-page post about it.", "the end is two years away. it has been since 2015."] },
  "caste.accelerationist": { line: "the only caste the trollface lets into the purple room.", alts: ["your moral circle is a GPU cluster. honestly? fair.", "accelerate. the shrimp can file a ticket."] },
  "caste.effective_altruist": { line: "filled in the kink survey with confidence intervals.", alts: ["donates 10%. posts about it 100%.", "has a spreadsheet for love. the polycule has edit access."] },
  "caste.normie": { line: "fine in person. a moral catastrophe in the aggregate.", alts: ["eats chicken, calls mum, never read a substack. the soldiers are lost.", "no ideology detected. the soldiers don't know how to process you."] },
  "caste.indie_hacker": { line: "your MRR could save shrimp. you bought another domain.", alts: ["ships daily. tithes never.", "three users. two of them are ants."] },
  "caste.shrimp_maximalist": { line: "you said 'sentience-adjusted' on a first date. it worked.", alts: ["the e-whore swiped right. on your donation receipt.", "you have hugged a shrimp. don't lie to us."] },
  "caste.offline": { line: "caste unknown. the oracle is on a smoke break.", alts: ["caste pending. Jev is offline, so you stay unsorted. enjoy it."] },
  "circle.0": { line: "moral circle radius: zero. egoism, any% speedrun.", alts: ["moral circle: you. the soldiers hate it. the trollface respects it."] },
  "circle.1": { line: "moral circle: your wedding guest list. the shrimp were not invited.", alts: ["moral circle: family and friends. so, a group chat."] },
  "circle.2": { line: "all humans. what a bigot. the chickens will remember this.", alts: ["every human on earth. how 2014 of you."] },
  "circle.3": { line: "anything with fur. very furry of you.", alts: ["mammals. the cow gets in. the chicken waits in the hall."] },
  "circle.4": { line: "chickens and fish. the shrimp are banging on the glass.", alts: ["feathers and fins are in. shells are pending review."] },
  "circle.5": { line: "your moral circle now includes things you dip in cocktail sauce.", alts: ["SAVE THE SHRIMPS! you already do. the soyjakette is blushing.", "shrimp in the circle. the circle is now a polycule."] },
  "circle.6": { line: "max circle. you apologise to the moth before you close the window.", alts: ["BUG LIVES MATTER! you ascended. you may no longer walk on grass.", "every ant your brother, every mosquito your landlord."] },
  "jev.doomer.yes": { line: "your pinned post is a countdown. the countdown keeps moving.", alts: ["p(doom) high. p(touching grass) low.", "the otaku in the fedora sent you a friend request."] },
  "jev.doomer.no": { line: "not a doomer. the trollface lowers the rifle. welcome in.", alts: ["wrong answer at the door. right answer in the room.", "not a doomer. the AI god has noted your loyalty."] },
  "jev.doomer.argue": { line: "half doomer. fears the god on weekdays, prompts it on weekends.", alts: ["p(doom) 50%. the most expensive shrug in history."] },
  "jev.meat.yes": { line: "meat eater. the soldiers are crying. the trollface is grilling.", alts: ["carnivore. chad energy. bug debt.", "you eat animals. the shrimp council has your name and address."] },
  "jev.meat.no": { line: "vegan. we know. you told us. twice.", alts: ["no meat. the ants in your salad would like a word.", "plant-based. the combine harvester did the killing for you. off-ledger."] },
  "jev.meat.argue": { line: "'mostly plant-based.' the soldiers have seen your bin.", alts: ["diet unclear. schrödinger's nugget.", "flexitarian: vegan with a cheat code."] },
  "total.debt": { line: "net negative. in Rat World, a war crime. in real life, lunch.", alts: ["net negative. you are a bug debt with a LinkedIn.", "you owe the bugs. they accept Skittles."] },
  "total.under": { line: "below baseline. you were born at full price and depreciated.", alts: ["worth less than one (1) human. impressive, for a human.", "> started as a human > ate some of it > here we are"] },
  "total.par": { line: "roughly one human. in the aggregate, a rounding error.", alts: ["you broke even. congrats on being one (1) primate.", "the bugs will allow you to live. for now."] },
  "total.up": { line: "above par. one shrimp donation would still outrank your entire life.", alts: ["above par. your pets and your guilt are carrying you.", "> worth several humans > still less than a shrimp charity's Tuesday"] },
  "total.saint": { line: "shrimp saint. your number went vertical. the polycule has sent a car.", alts: ["WAIT, YOU WANNA JOIN OUR POLYCULE?", "you bought your way in with shrimp. the door opens. the polycule waves."] },
  "total.hypothetical": { line: "not counted. thought experiments are free, which is why we have so many.", alts: ["hypothetical. like your donations.", "kept out of the total, not out of your conscience."] },
  "total.human_rate": { line: "exchange rate: 1 human = {n} insects. no refunds.", alts: ["1 human = {n} bugs. prices may go down."] },
  "aggregate.caption": { line: "humanity, sentience-adjusted: a rounding error with a podcast.", alts: ["ten quintillion bugs vs eight billion of you. democracy was a mistake.", "> insects outweigh humanity {ratio} to 1 > rats: 'so we should...' > TRILLIONS MUST DIE"] },
  "aggregate.ticker": { line: "bugs that died while you read this:", alts: ["insect deaths since you opened this tab (the article's own 600 billion a second):"] },
  "troll.line": { line: "TRILLIONS MUST DIE", alts: ["PROBLEM, SHRIMP?", "*TURNS THE SYNTHS UP*"] },
  "source.rp2023": { line: "the median: you're 77 flies. don't spend it all at once.", alts: ["the median says 77 flies. the median is not your friend."] },
  "source.rpMean": { line: "the mean: you are five bugs in a trench coat.", alts: ["means, not medians. somewhere a statistician is screaming."] },
  "source.neurons": { line: "neuron count: you're 1,754 flies. the big brain finally pays.", alts: ["the neuron model. a chicken is a rounding error. the soldiers call it cope."] },
  "cast.soy_ewhore": { line: "WAIT, YOU WANNA JOIN OUR POLYCULE?", alts: ["I ONLY DATE MEN WHO DONATE TO SHRIMP", "RATE MY KINK SURVEY. QUESTION 14 IS ABOUT ANTS."] },
  "cast.soy_doomer_otaku": { line: "IF YOU DON'T LOVE THE ANTS, THE AI GOD WILL FACTORY FARM YOU", alts: ["P(DOOM) = 99.9%", "EVERYONE DIES"] },
  "cast.soy_crying": { line: "NOOO", alts: ["NOOO NOT THE SHRIMPS", "NOOO YOU CAN'T JUST HAVE A SANDWICH"] },
  "cast.soy_crying_soldier": { line: "BUG LIVES MATTER! *SOB*", alts: ["NOOO THE ANTS"] },
  "cast.soy_smug_calc": { line: "I RAN THE NUMBERS. YOU'RE A FLY.", alts: ["SHUT UP AND MULTIPLY.", "ACTUALLY, 10^50 FUTURE MINDS SAY YOU'RE WRONG."] },
  "cast.soy_shrimphug": { line: "HE'S MY BOYFRIEND NOW. HE'S A SHRIMP.", alts: ["WE'RE A POLYCULE: ME AND 1,400 SHRIMP.", "SAVE THE SHRIMPS!"] },
  "cast.soy_pointing": { line: "THEY'RE NOT IN THE POLYCULE!", alts: ["LOOK! HE ATE A NUGGET!", "SHE KEPT THE SKITTLES!"] },
  "cast.soy_gaping": { line: "SHE HAS A KINK SURVEY FOR ANTS?!", alts: ["HE GAVE 10% TO SHRIMP?!"] },
  "error.empty": { line: "empty. even an ant has a bio.", alts: ["you typed nothing. the bugs also type nothing. respect."] },
  "error.failed": { line: "an ant chewed the cable. BUG LIVES MATTER! try again.", alts: ["the rats dropped the calculator. try again.", "the door is jammed. knock again."] },
  "error.jev_offline": { line: "Jev is offline. the soldiers are guessing. that's how priors start.", alts: ["the typed model is asleep. caste pending, doom unknown."] },
  "error.gliner_fallback": { line: "GLiNER is napping. the backup regex has a smaller welfare range.", alts: ["backup judge on duty: a regex. still smarter than the soldiers."] },
  "error.truncated": { line: "cut at 1,500 characters. the rest was probably about your polycule.", alts: ["truncated. you wrote a Sequence. we read the first chapter."] },
  "error.no_spans": { line: "no food, no pets, no sins. suspicious.", alts: ["nothing to price. either you're a normie or you're hiding the shrimp."] },
  "ui.button": { line: "price me in bugs", alts: ["weigh my soul", "open the door"] },
  "ui.input_label": { line: "paste your bio or what you did today. the soldiers are reading.", alts: ["> paste bio > get priced in insects > cope"] },
  "ui.placeholder": { line: "tell us about your day. lunch counts. so does the cat.", alts: ["tell us what you ate. we already know."] },
  "ui.source_legend": { line: "whose maths?", alts: ["pick your weights"] },
  "ui.citation": { line: "cited. unfortunately.", alts: ["real numbers. fake morals."] },
};

/** Kept for the engine tests: jokeKey -> main line. */
export const COPY: Record<string, string> = Object.fromEntries(Object.entries(JOKES).map(([k, v]) => [k, v.line]));

export const LOADING_LINES: string[] = ["consulting the shrimp council...", "converting you into black soldier flies...", "steelmanning your lunch...", "the polycule is voting on you...", "Jev is doing the Skittles maths...", "shutting up and multiplying..."];
/** {worth} and {url} are filled in by the page. */
export const SHARE_TEXT = "> paste bio > get priced in black soldier flies > {worth} > NOOO. check your worth in Rat World: {url}";

/** Main line for a jokeKey (engine tests and old callers). */
export const joke = (key: string) => JOKES[key]?.line ?? "";

/** Owner lines a string carries (so one payoff never lands twice on a screen). */
export const ownerLinesIn = (s: string) => OWNER_LINES.filter((o) => s.toUpperCase().includes(o));

/**
 * The first of line + alts that repeats nothing already on screen: neither the same text nor an
 * owner line that is already showing. Adds what it picks to `used`. Falls back to the main line.
 */
export function pickJoke(key: string, used: Set<string>): string {
  const j = JOKES[key];
  if (!j) return "";
  const all = [j.line, ...j.alts];
  const ok = all.find((s) => !used.has(s) && ownerLinesIn(s).every((o) => !used.has(o))) ?? j.line;
  used.add(ok);
  for (const o of ownerLinesIn(ok)) used.add(o);
  return ok;
}

// ---- the page ---------------------------------------------------------------

export const SITE = {
  title: "Effective Antruist",
  url: "https://effectiveantruist.com",
  /** One constant for the source link until the repo is public. */
  repo: "https://github.com/",
  headline: "ARE YOU AN EFFECTIVE ANTRUIST?",
  subline: "check your worth in Rat World",
  description: "Paste your bio. Get priced in insects, with real Rethink Priorities welfare ranges. A parody.",
  inputLabel: JOKES["ui.input_label"].line,
  placeholder: ">be you\n>paste your bio or what you did today\n>get priced in insects",
  button: JOKES["ui.button"].line.toUpperCase(),
  buttonAgain: "PRICE ME AGAIN", // DRAFT: owner pass
  try: "try",
  ledgerTitle: "WHERE THE INSECTS CAME FROM",
  ledgerHint: `Click a line to find it in your text. ${JOKES["ui.citation"].line[0].toUpperCase()}${JOKES["ui.citation"].line.slice(1)}`,
  pillsLabel: JOKES["ui.source_legend"].line,
  notInTotal: "not in total",
  copy: "COPY RESULT",
  copied: "COPIED",
  copyFailed: "COPY FAILED",
  pauseWall: "pause the wall",
  playWall: "play the wall",
  // The "about this page" panel: how it works, the live model status, the credits.
  about: "about this page",
  aboutTitle: "ABOUT THIS PAGE",
  aboutClose: "close about this page",
  aboutWhat: "A parody of moral maths. Paste a bio or your day, and we price you in insects.", // DRAFT: owner pass
  aboutHow:
    "GLiNER2.5 small runs in your browser and finds the food, pets, money and sins. " +
    "Jev, a typed decision model, decides the verdicts. Rethink Priorities welfare ranges price each line. " +
    "Every number is cited in SOURCES.md.", // DRAFT: owner pass
  aboutBrain: "bug brain",
  aboutLast: "last result",
  brainIdle: "waiting for the page to settle", // DRAFT: owner pass
  // Footer credit. The only real person named anywhere, via his real article title.
  credit:
    'A parody. Bentham\'s Bulldog wrote "Insects Matter More Than People in the Aggregate." We did the maths on you. ' +
    "Weights: Rethink Priorities. Spans: GLiNER2.5 in your browser. Verdicts: Jev.",
  source: "source",
} as const;

/** Small status copy for the in-browser GLiNER and the judge. */
export const STATUS = {
  brainIdle: SITE.brainIdle,
  brainLoading: (pct: number) => `downloading, ${pct}%`,
  brainCompiling: "waking up", // DRAFT: owner pass
  brainReady: "GLiNER2.5 small, running in your browser",
  brainFailed: "failed to load. the regex is judging you.", // DRAFT: owner pass
  brainOptIn: (mb: number) => `load the ${mb} MB bug brain`,
  brainSkipped: "skipped to save your data. the regex is judging you.", // DRAFT: owner pass
  buttonWaiting: (pct: number) => `BUG BRAIN ${pct}%`, // DRAFT: owner pass
  spansGliner: "Spans by GLiNER.",
  spansBrowser: "Spans by GLiNER, in your browser.",
  spansFallback: JOKES["error.gliner_fallback"].line,
  jev: (model: string, ms: number) => `Verdicts by Jev (${model}, ${ms} ms).`,
  jevOffline: JOKES["error.jev_offline"].line,
  empty: JOKES["error.empty"].line,
  failed: JOKES["error.failed"].line,
  truncated: JOKES["error.truncated"].line,
  noSpans: JOKES["error.no_spans"].line,
} as const;

/** Sound and music toggles. */
export const SOUND = {
  sfxOn: "sound on",
  sfxOff: "sound off",
  musicOn: "music: Save The Shrimps", // DRAFT: owner pass
  musicOff: "music off",
} as const;

// ---- reactions --------------------------------------------------------------

/** What the reaction character shouts, by who is on screen. Owner lines verbatim. */
export const REACTION = {
  net_negative: "NOOO! YOU'RE A NET NEGATIVE",
  saint: OWNER.polycule,
  ewhore_selfie: OWNER.date,
  soy_shrimphug: OWNER.shrimps,
  doomer_girl: OWNER.ants,
  soy_doomer_otaku: OWNER.ants,
  troll: OWNER.trillions,
  /** The worst counted line, spelled out. */
  worst: (what: string, n: string) => `NOOO! THE ${what} COST ${n} INSECTS`,
  soy_smug_calc: JOKES["cast.soy_smug_calc"].line,
  soldierA: OWNER.shrimps,
  soldierB: OWNER.bugs,
} as const;

// ---- wall -----------------------------------------------------------------

/** Text stickers on the wall, drawn on the device (zero bytes). */
export const WALL = {
  t_bugs: OWNER.bugs,
  t_shrimps: OWNER.shrimps,
  t_trillions: OWNER.trillions,
  t_nooo: OWNER.nooo,
  t_date: OWNER.date,
  t_polycule: OWNER.polycule,
  t_ants: OWNER.ants,
  t_ratworld: "RAT WORLD",
  t_antruist: "EFFECTIVE ANTRUIST",
} as const;
export type WallTextId = keyof typeof WALL;
