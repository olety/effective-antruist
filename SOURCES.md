# SOURCES

Every number the app uses, with the page it came from. Retrieval date for all: **2026-09-25**.
Status VERIFIED = the number was seen in fetched page text. UNVERIFIED = not seen; reason given.

---

## rp-welfare-ranges-2023

- **Title:** Rethink Priorities' Welfare Range Estimates
- **Author / date:** Bob Fischer, posted 2023-01-23 (EA Forum, Moral Weight Project sequence)
- **URL:** https://forum.effectivealtruism.org/posts/Qk3hd6PrFManj8K6o/rethink-priorities-welfare-range-estimates
- **Retrieved:** 2026-09-25 (post body pulled from the EA Forum GraphQL API; same content as the URL)

Quotes:

> "We offer welfare range estimates for 11 farmed species: pigs, chickens, carp, salmon, octopuses, shrimp, crayfish, crabs, bees, black soldier flies, and silkworms."

> "These estimates are, essentially, estimates of the differences in the possible intensities of these animals' pleasures and pains relative to humans' pleasures and pains."

> "What follows are some probability-of-sentience- and rate-of-subjective-experience-adjusted welfare range estimates."

> "So, if a given animal has a welfare range of 0.5 (and we assume that welfare ranges are symmetrical around the neutral point), that means something like, "The best and worst experiences that this animal can have are half as intense as the best and worst experiences that a human can have"" (so human = 1 is the baseline).

Table as published (columns: Species / 5th-percentile / 50th-percentile / 95th-percentile):

| Species | 5th | 50th | 95th | Status | Claimed | Match |
|---|---|---|---|---|---|---|
| Pigs | 0.005 | **0.515** | 1.031 | VERIFIED | 0.515 | yes |
| Chickens | 0.002 | **0.332** | 0.869 | VERIFIED | 0.332 | yes |
| Octopuses | 0.004 | **0.213** | 1.471 | VERIFIED | (bonus) | - |
| Carp | 0 | **0.089** | 0.568 | VERIFIED | 0.089 | yes |
| Bees | 0 | **0.071** | 0.461 | VERIFIED | (asked) | - |
| Salmon | 0 | **0.056** | 0.513 | VERIFIED | 0.056 | yes |
| Crayfish | 0 | **0.038** | 0.491 | VERIFIED | (bonus) | - |
| Shrimp | 0 | **0.031** | 1.149 | VERIFIED | 0.031 | yes |
| Crabs | 0 | **0.023** | 0.414 | VERIFIED | (extra) | - |
| Black Soldier Flies | 0 | **0.013** | 0.196 | VERIFIED | (asked) | - |
| Silkworms | 0 | **0.002** | 0.073 | VERIFIED | (asked) | - |

Notes:
- All five claimed values match exactly.
- The table says "Bees", not "honey bees". The post text says "bees are really impressive" and cites bee-cognition books; it does not say "honey bee" next to the table.
- These are medians that are already adjusted for probability of sentience. That is why they are far below the Clatterbuck means below.
- The post opens with "For updates, please see this book." The numbers above are the 2023 post's numbers.
- Humans are not a row in the table. Human = 1 is the implied baseline from "relative to humans".

---

## rp-moral-parliament-2025

- **Title:** A Moral Parliament Tool for Distributing Resources across Farmed Animal Recipients
- **Author / date:** Hayley Clatterbuck (Rethink Priorities, Worldview Investigation Team), posted 2025-10-15
- **URL:** https://forum.effectivealtruism.org/posts/QjaBLHytFF82YDwxj/a-moral-parliament-tool-for-distributing-resources-across
- **Mirror:** https://rethinkpriorities.org/research-area/distributing-resources-across-farmed-animal-recipients/ (dated 2025-10-17)
- **Retrieved:** 2026-09-25 (via Exa fetch and EA Forum GraphQL; both agree)

Quotes (Scale):

> "We determined the scale of projects by estimating the number of animals affected by top-level charities per $1 million invested. When the range of estimates was wide, we chose roughly the mean estimate."

> "Chickens: 50 million" / "Fish: 5 million" / "Shrimp: 1.5 billion" / "Insects: 1 billion"

Quotes (Moral weights):

> "First, we used RP's mean welfare ranges. These were not weighted by the probability of sentience, since that was already accounted for in the risk dimension. Second, we used RP's estimated welfare ranges based purely on neurophysiological proxies (such as neuron count), which give much lower estimates of welfare ranges"

| Animal Type | RP welfare range | Neuro welfare range |
|---|---|---|
| Chickens | 0.46 | 0.037 |
| Fish | 0.34 | 0.00084 |
| Shrimp | 0.2 | 0.00088 |
| Insects | 0.2 | 0.00057 |

Footnote 2: > "We use carp as a stand-in for all farmed fish and black soldier flies as a stand-in for all insects. Both of these assumptions are questionable, with the latter striking us as particularly tendentious."

| Number | Value | Status | Claimed | Match |
|---|---|---|---|---|
| RP mean welfare range, chickens | 0.46 | VERIFIED | 0.46 | yes |
| RP mean welfare range, fish | 0.34 | VERIFIED | 0.34 | yes |
| RP mean welfare range, shrimp | 0.2 | VERIFIED | 0.2 | yes |
| RP mean welfare range, insects | 0.2 | VERIFIED | 0.2 | yes |
| Neuro proxy range, chickens | 0.037 | VERIFIED | (asked) | - |
| Neuro proxy range, fish | 0.00084 | VERIFIED | (asked) | - |
| Neuro proxy range, shrimp | 0.00088 | VERIFIED | 0.00088 | yes |
| Neuro proxy range, insects | 0.00057 | VERIFIED | 0.00057 | yes |
| Animals affected per $1M, chickens | 50,000,000 | VERIFIED | (asked) | - |
| Animals affected per $1M, fish | 5,000,000 | VERIFIED | (asked) | - |
| Animals affected per $1M, shrimp | 1,500,000,000 | VERIFIED | 1.5 billion | yes |
| Animals affected per $1M, insects | 1,000,000,000 | VERIFIED | 1 billion | yes |

Notes:
- All claimed values match exactly.
- "Insects" here means black soldier flies (footnote 2). "Fish" means carp.
- The means (0.46, 0.34, 0.2, 0.2) are NOT sentience-adjusted. The 2023 medians (0.332, 0.089, 0.031, 0.013) ARE. Do not mix the two sets in one comparison without saying so.
- The sentience probabilities used in the risk dimension (from Fischer et al. 2024, p. 224) were in an image; not captured as text. Not used here.

---

## insects-alive

- **Title:** Numbers of Insects (Species and Individuals), Smithsonian Institution (BugInfo)
- **URL:** https://www.si.edu/spotlight/buginfo/bugnos
- **Retrieved:** 2026-09-25 (WebFetch got HTTP 403; Exa fetch returned the full page text)

Quote:

> "At any time, it is estimated that there are some 10 quintillion (10,000,000,000,000,000,000) individual insects alive."

The same page, last paragraph (cut off in the fetch): > "Recent figures indicate that there are more than 200 million insects for each huma[n]..."

| Number | Value | Status |
|---|---|---|
| Insects alive at any time | 10 quintillion = 1e19 | VERIFIED |
| Insects per human (Smithsonian's own line) | "more than 200 million" | VERIFIED (text cut mid-word, number seen) |

Notes:
- The page is internally inconsistent: 1e19 / 8.3e9 people is about 1.2 billion per person, not 200 million.
- Bentham's Bulldog uses ~1e18 total, "about 100 million insects per person". That is 10x lower than Smithsonian's 1e19. Pick one and cite it.

---

## world-population

- **Title:** World Population Clock (Worldometer, based on UN World Population Prospects)
- **URL:** https://www.worldometers.info/world-population/
- **Retrieved:** 2026-09-25 ~08:36 UTC

Quotes:
- Live counter (server-rendered fragment at 2026-09-25 08:36 UTC): **8,317,003,377**, dated "Friday, September 25, 2026".
- Static page text (stale cache): "The current world population is 8,305,224,076 as of Saturday, July 25, 2026 according to the most recent United Nations estimates [1] elaborated by Worldometer."
- Table row: "Year (July 1) ... 2026 8,300,678,395 0.84% 69,065,325"

| Number | Value | Status |
|---|---|---|
| World population, live, 2026-09-25 | 8,317,003,377 | VERIFIED |
| World population, UN mid-year 2026 (July 1) | 8,300,678,395 | VERIFIED |
| Growth | 0.84%/yr, ~69 million/yr | VERIFIED |

Notes:
- US Census popclock (https://www.census.gov/popclock/) returned HTTP 403 / Cloudflare challenge. Not used.
- For a stable citation, use the UN-based mid-2026 figure 8,300,678,395 ("about 8.3 billion").

---

## benthams-bulldog-2026

- **Title:** "Insects Matter More Than People" (subtitle: "In the aggregate"). On X it ran as the X article "Insects Matter More Than People in the Aggregate" (marked "Crosspost").
- **Author / date:** Bentham's Bulldog (Matthew Adelstein), Sep 18, 2026 (byline date on Substack; Exa indexed it as 2026-09-19 08:35 UTC; the X post embeds in press coverage are dated September 18, 2026)
- **URL (Substack):** https://benthams.substack.com/p/insects-matter-more-than-people
- **X:** posted by @Benthamsbulldog as an x.com/i/article (exact article URL not captured; the t.co link seen in press embeds is https://t.co/XjLohZPn8J)
- **Retrieved:** 2026-09-25

Quotes:

> "Here, I will explain why I think in total the welfare of insects matters more, in expectation, than the welfare of humans."

> "Given that there are about 100 million insects per person—and about 600 billion of them die every second—they feel way more expected pain than humans."

> "Given any reasonable tradeoff between insect welfare and human welfare, insects matter more in the aggregate than humans."

> "About 600 billion insects die every second. Maybe more."

| Number | Value | Status |
|---|---|---|
| Insects per person (his figure) | ~100 million | VERIFIED |
| Insect deaths per second (his figure) | ~600 billion | VERIFIED |
| Insect-death hours per human second (his figure) | ~75 hours | VERIFIED |
| His pain-intensity assumption | 1/10,000 of a human | VERIFIED |

Notes:
- The title on Substack is "Insects Matter More Than People" with the dek "In the aggregate". "...in the Aggregate" is the X article title.
- Follow-up post: "Taking Ideas Seriously", https://benthams.substack.com/p/taking-ideas-seriously (2026-09-21): "My article on insects has now been seen 1.5 million times on Twitter".

---

## givewell-cost-per-life

- **Title:** How Much Does It Cost To Save a Life? (GiveWell)
- **URL:** https://www.givewell.org/how-much-does-it-cost-to-save-a-life
- **Also:** https://www.givewell.org/charities/top-charities
- **Retrieved:** 2026-09-25

Quotes:

> "Over the past several years, our models for grants to our Top Charities have typically estimated an average cost between $3,000 and $5,500."

> "Below we'll explain our 2024 estimate for how $3,000 could save a life in Nigeria by funding the distribution of preventive malaria treatments through Malaria Consortium."

Top charities page: > "In 2022-2024, we directed funding to the Against Malaria Foundation to support this program at an estimated average cost-effectiveness of $5,500 per life saved."

| Number | Value | Status |
|---|---|---|
| Cost to save a life, top charities, range | $3,000 to $5,500 | VERIFIED |
| Malaria Consortium SMC, Nigeria (2024 est.) | $3,000 per life | VERIFIED |
| Against Malaria Foundation (2022-2024) | $5,500 per life | VERIFIED |

---

## swp-per-dollar

- **Title:** Shrimp Welfare Project (home page)
- **URL:** https://www.shrimpwelfareproject.org/
- **Retrieved:** 2026-09-25

Quotes:

> "Each dollar you donate helps improve the lives of ~1,400 shrimps per year – your support makes a profound impact!"

> "~440 billion shrimps are farmed each year. That's more than 5x the total number of all farmed land animals combined."

| Number | Value | Status |
|---|---|---|
| Shrimps helped per $1 | ~1,400 per year | VERIFIED |
| Shrimps farmed per year | ~440 billion | VERIFIED |

Notes:
- The SWP figure is "per year" per dollar. RP's parliament scale (1.5 billion per $1M = 1,500 per $1) is close but is a different, one-off "animals affected" measure.

---

## What the engine uses (src/engine/sources.ts)

| Constant | Value | Source id | Status |
|---|---|---|---|
| rp2023 weights: chicken, pig, fish (carp), shrimp, insect (black soldier fly) | 0.332, 0.515, 0.089, 0.031, 0.013 | rp-welfare-ranges-2023 | VERIFIED |
| rpMean weights: chicken, fish, shrimp, insect | 0.46, 0.34, 0.2, 0.2 | rp-moral-parliament-2025 | VERIFIED |
| neurons weights: chicken, fish, shrimp, insect | 0.037, 0.00084, 0.00088, 0.00057 | rp-moral-parliament-2025 | VERIFIED |
| Animals per $1: chicken, fish, shrimp, insect | 50, 5, 1,500, 1,000 | rp-moral-parliament-2025 | VERIFIED |
| GiveWell cost per life | $5,500 (AMF, top of range) | givewell-cost-per-life | VERIFIED |
| Insects alive | 1e19 | insects-alive | VERIFIED |
| Humans alive | 8,317,003,377 (live, 2026-09-25) | world-population | VERIFIED |
| Skittles shrimp | 1e10 | jev-skittles (the question's own number) | n/a |

## ASSUMPTIONS — UNVERIFIED placeholders (owner to source or cut)

| Assumption | Value | Status |
|---|---|---|
| Chickens per chicken serving | 0.1 | UNVERIFIED |
| Cows per beef/steak serving | 0.001 | UNVERIFIED |
| Pigs per pork serving | 0.002 | UNVERIFIED |
| Fish per fish serving | 1 | UNVERIFIED |
| Shrimp per shrimp serving | 10 | UNVERIFIED |
| Chicken servings spared per vegan-year | 365 | UNVERIFIED |
| Dollars per percentage point of an "I donate N%" pledge | $1,000/yr | UNVERIFIED |
| Mammals with no weight in a table (cow, cat, dog; pig in the 2025 tables) | proxy: pig 0.515 (rp2023, rpMean); chicken 0.037 (neurons) | UNVERIFIED proxy |
| "every day" / "daily" after a food | x365 servings a year | rule, not a statistic |
| MRR | x12 for a year | rule, not a statistic |

Mixing note: rp2023 medians are sentience-adjusted; the 2025 means and neuron proxies are not. The switch shows them as three separate lenses and never mixes them in one total, except the mammal proxies above.
